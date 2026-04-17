import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';

/**
 * GET /api/payroll/export?monthId=xxx&system=E-나라도움
 * 정산시스템별 엑셀 데이터 JSON 내보내기
 *
 * system: 'E-나라도움' | 'RCMS' | '보탬e' | '운영비 계좌(기업은행)' | '계좌이체(기업은행)' | 'all'
 */
export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const { searchParams } = new URL(req.url);
  const monthId = searchParams.get('monthId');
  const system = searchParams.get('system') || 'all';

  if (!monthId) {
    return NextResponse.json({ error: 'monthId 필요' }, { status: 400 });
  }

  // 월 정보
  const { data: month } = await supabase
    .from('payroll_months')
    .select('*')
    .eq('id', monthId)
    .single();

  // 사업별 지출
  let query = supabase
    .from('project_expenditures')
    .select('*, projects(*)')
    .eq('payroll_month_id', monthId)
    .order('total', { ascending: false });

  if (system !== 'all') {
    // projects 테이블의 fund_source로 필터
    const { data: matchProjects } = await supabase
      .from('projects')
      .select('id')
      .eq('fund_source', system);
    const projectIds = (matchProjects || []).map(p => p.id);
    if (projectIds.length > 0) {
      query = query.in('project_id', projectIds);
    } else {
      // 해당 정산시스템에 사업이 없으면 빈 결과 반환
      return NextResponse.json({ month, system, summary: [], assignments: [], payrolls: [], deductions: [], employer: [] });
    }
  }

  const { data: expenditures } = await query;

  // 사업별 상세 (인원별)
  const projectIds = (expenditures || []).map(e => e.project_id);
  const { data: assignments } = await supabase
    .from('project_assignments')
    .select('*, employees(name), projects(name)')
    .eq('payroll_month_id', monthId)
    .in('project_id', projectIds)
    .order('project_id');

  // 직원별 급여상세
  const { data: payrolls } = await supabase
    .from('payroll_details')
    .select('*, employees(name)')
    .eq('payroll_month_id', monthId);

  // 개인공제
  const { data: deductions } = await supabase
    .from('personal_deductions')
    .select('*, employees(name)')
    .eq('payroll_month_id', monthId);

  // 기관부담
  const { data: employer } = await supabase
    .from('employer_contributions')
    .select('*, employees(name)')
    .eq('payroll_month_id', monthId);

  return NextResponse.json({
    month,
    system,
    summary: expenditures,
    assignments: assignments || [],
    payrolls: payrolls || [],
    deductions: deductions || [],
    employer: employer || [],
  });
}
