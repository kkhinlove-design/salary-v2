import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';
import * as XLSX from 'xlsx';

/**
 * POST /api/overtime/upload
 * 수당조정 엑셀 파일 업로드 → 파싱 → DB 저장
 *
 * FormData: file (xlsx), monthId
 */
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const monthId = formData.get('monthId') as string;

  if (!file || !monthId) {
    return NextResponse.json({ error: '파일과 monthId가 필요합니다' }, { status: 400 });
  }

  // 엑셀 파싱
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  // 직원 이름 → ID 매핑
  const { data: employees } = await supabase.from('employees').select('id, name');
  const empMap = new Map((employees || []).map(e => [e.name, e.id]));

  const results = { summary: 0, records: 0, skipped: [] as string[] };

  // ===== 1. 수당조정 요약 시트 → overtime_summary =====
  const summarySheet = wb.Sheets['수당조정 요약'];
  if (summarySheet) {
    // 기존 데이터 삭제
    await supabase.from('overtime_summary').delete().eq('payroll_month_id', monthId);

    const summaryRows: any[] = [];
    const range = XLSX.utils.decode_range(summarySheet['!ref'] || 'A1');

    for (let r = 1; r <= range.e.r; r++) {
      const name = summarySheet[XLSX.utils.encode_cell({ r, c: 0 })]?.v;
      if (!name) continue;

      const eid = empMap.get(String(name).trim());
      if (!eid) {
        results.skipped.push(`요약: ${name} (직원 미등록)`);
        continue;
      }

      const dept = summarySheet[XLSX.utils.encode_cell({ r, c: 1 })]?.v || '';
      const hourlyRate = Number(summarySheet[XLSX.utils.encode_cell({ r, c: 3 })]?.v) || 0;

      // 인정시간: "6:00" or Date 형태
      const rawHours = summarySheet[XLSX.utils.encode_cell({ r, c: 4 })]?.v;
      let approvedHours = 0;
      if (rawHours instanceof Date) {
        approvedHours = rawHours.getHours() + rawHours.getMinutes() / 60;
      } else if (typeof rawHours === 'string') {
        const m = rawHours.match(/(\d+):(\d+)/);
        if (m) approvedHours = parseInt(m[1]) + parseInt(m[2]) / 60;
      } else if (typeof rawHours === 'number') {
        // Excel serial time (fraction of day)
        approvedHours = Math.round(rawHours * 24 * 100) / 100;
      }

      const overtimePay = Number(summarySheet[XLSX.utils.encode_cell({ r, c: 7 })]?.v) || 0; // H열: 최종금액

      summaryRows.push({
        payroll_month_id: monthId,
        employee_id: eid,
        project_name: dept,
        hourly_rate: hourlyRate,
        base_hourly_rate: Math.round(hourlyRate / 1.5),
        total_hours: approvedHours,
        approved_hours: approvedHours,
        overtime_pay: overtimePay,
      });
    }

    if (summaryRows.length > 0) {
      for (let i = 0; i < summaryRows.length; i += 50) {
        const { error } = await supabase.from('overtime_summary').insert(summaryRows.slice(i, i + 50));
        if (error) console.error('summary insert:', error.message);
      }
      results.summary = summaryRows.length;
    }
  }

  // ===== 2. 일별 상세 시트 → overtime_records =====
  const detailSheet = wb.Sheets['일별 상세'];
  if (detailSheet) {
    // 기존 데이터 삭제
    await supabase.from('overtime_records').delete().eq('payroll_month_id', monthId);

    const recordRows: any[] = [];
    const range = XLSX.utils.decode_range(detailSheet['!ref'] || 'A1');

    for (let r = 1; r <= range.e.r; r++) {
      const name = detailSheet[XLSX.utils.encode_cell({ r, c: 0 })]?.v;
      if (!name) continue;

      const eid = empMap.get(String(name).trim());
      if (!eid) continue;

      // 날짜
      const rawDate = detailSheet[XLSX.utils.encode_cell({ r, c: 3 })]?.v;
      let dateStr: string | null = null;
      if (rawDate instanceof Date) {
        dateStr = rawDate.toISOString().split('T')[0];
      } else if (typeof rawDate === 'string') {
        const m = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (m) dateStr = `${m[1]}-${m[2]}-${m[3]}`;
      }
      if (!dateStr) continue;

      // 연차/출장
      const isLeave = detailSheet[XLSX.utils.encode_cell({ r, c: 4 })]?.v;
      const isTravel = detailSheet[XLSX.utils.encode_cell({ r, c: 5 })]?.v;

      // 인정시간
      const rawApproved = detailSheet[XLSX.utils.encode_cell({ r, c: 6 })]?.v;
      let approvedStr = '0:00';
      if (rawApproved instanceof Date) {
        approvedStr = `${rawApproved.getHours()}:${String(rawApproved.getMinutes()).padStart(2, '0')}`;
      } else if (typeof rawApproved === 'string') {
        approvedStr = rawApproved;
      } else if (typeof rawApproved === 'number') {
        const totalMin = Math.round(rawApproved * 24 * 60);
        approvedStr = `${Math.floor(totalMin / 60)}:${String(totalMin % 60).padStart(2, '0')}`;
      }

      // 비고 생성
      const notes: string[] = [];
      if (isLeave) notes.push('연차');
      if (isTravel) notes.push('출장');

      recordRows.push({
        payroll_month_id: monthId,
        employee_id: eid,
        work_date: dateStr,
        in_type: isLeave ? '연차' : isTravel ? '출장' : '정상출근',
        out_type: approvedStr !== '0:00' ? '연장근무' : '정상퇴근',
        approved_duration: approvedStr,
        note: notes.length > 0 ? notes.join(', ') : null,
      });
    }

    if (recordRows.length > 0) {
      for (let i = 0; i < recordRows.length; i += 50) {
        const { error } = await supabase.from('overtime_records').insert(recordRows.slice(i, i + 50));
        if (error) console.error('records insert:', error.message);
      }
      results.records = recordRows.length;
    }
  }

  // ===== 3. 급여총괄의 초과수당도 업데이트 =====
  if (results.summary > 0) {
    const { data: summaries } = await supabase
      .from('overtime_summary')
      .select('employee_id, overtime_pay')
      .eq('payroll_month_id', monthId);

    if (summaries) {
      for (const s of summaries) {
        // pay_total 직접 업데이트
        const { data: pd } = await supabase
          .from('payroll_details')
          .select('monthly_salary, other_pay')
          .eq('payroll_month_id', monthId)
          .eq('employee_id', s.employee_id)
          .single();

        if (pd) {
          await supabase
            .from('payroll_details')
            .update({
              overtime_pay: s.overtime_pay,
              pay_total: pd.monthly_salary + s.overtime_pay + (pd.other_pay || 0),
            })
            .eq('payroll_month_id', monthId)
            .eq('employee_id', s.employee_id);
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `업로드 완료: 수당요약 ${results.summary}건, 일별상세 ${results.records}건`,
    ...results,
  });
}
