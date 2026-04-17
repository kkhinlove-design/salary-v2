'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW } from '@/lib/format';
import type { OvertimeSummary, OvertimeRecord } from '@/lib/types';

export default function OvertimePage() {
  const [summary, setSummary] = useState<OvertimeSummary[]>([]);
  const [records, setRecords] = useState<OvertimeRecord[]>([]);
  const [tab, setTab] = useState<'summary' | 'detail'>('summary');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      const { data: months } = await supabase.from('payroll_months').select('id').order('year_month', { ascending: false }).limit(1);
      if (months && months.length > 0) {
        const mid = months[0].id;
        const [{ data: s }, { data: r }] = await Promise.all([
          supabase.from('overtime_summary').select('*, employees(name)').eq('payroll_month_id', mid).order('overtime_pay', { ascending: false }),
          supabase.from('overtime_records').select('*, employees(name)').eq('payroll_month_id', mid).order('work_date'),
        ]);
        if (s) setSummary(s);
        if (r) setRecords(r);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  const filteredSummary = summary.filter(s => s.employees?.name?.includes(search));
  const filteredRecords = records.filter(r => r.employees?.name?.includes(search));
  const totalOvertime = summary.reduce((s, d) => s + d.overtime_pay, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">초과근무 관리</h1>
          <p className="text-gray-500 text-sm mt-1">총 초과수당: {formatKRW(totalOvertime)}원</p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="text" placeholder="이름 검색..." value={search} onChange={e => setSearch(e.target.value)} className="border rounded-lg px-4 py-2 text-sm w-48" />
          <button onClick={() => setTab('summary')} className={`px-4 py-2 rounded-lg text-sm ${tab === 'summary' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>수당내역</button>
          <button onClick={() => setTab('detail')} className={`px-4 py-2 rounded-lg text-sm ${tab === 'detail' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>근무대장</button>
        </div>
      </div>

      {tab === 'summary' ? (
        <div className="stat-card overflow-x-auto max-h-[calc(100vh-200px)]">
          <table className="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>이름</th>
                <th>소속사업</th>
                <th>지급단가</th>
                <th>통상시급</th>
                <th>인정시간</th>
                <th>초과수당</th>
              </tr>
            </thead>
            <tbody>
              {filteredSummary.map((d, i) => (
                <tr key={d.id}>
                  <td>{i + 1}</td>
                  <td>{d.employees?.name || '-'}</td>
                  <td style={{ textAlign: 'left' }}>{d.project_name || '-'}</td>
                  <td>{formatKRW(d.hourly_rate)}</td>
                  <td>{formatKRW(d.base_hourly_rate)}</td>
                  <td style={{ textAlign: 'center' }}>{d.approved_hours}시간</td>
                  <td className="font-bold">{formatKRW(d.overtime_pay)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td></td>
                <td style={{ textAlign: 'left' }}>합계</td>
                <td></td>
                <td></td>
                <td></td>
                <td style={{ textAlign: 'center' }}>{filteredSummary.reduce((s, d) => s + d.approved_hours, 0)}시간</td>
                <td className="font-bold">{formatKRW(filteredSummary.reduce((s, d) => s + d.overtime_pay, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="stat-card overflow-x-auto max-h-[calc(100vh-200px)]">
          <table className="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>이름</th>
                <th>근무일</th>
                <th>출근시간</th>
                <th>퇴근시간</th>
                <th>출근판정</th>
                <th>퇴근판정</th>
                <th>연장근무</th>
                <th>인정시간</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td>{r.employees?.name || '-'}</td>
                  <td style={{ textAlign: 'center' }}>{r.work_date}</td>
                  <td style={{ textAlign: 'center' }}>{r.clock_in ? new Date(r.clock_in).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td style={{ textAlign: 'center' }}>{r.clock_out ? new Date(r.clock_out).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td style={{ textAlign: 'center' }}>{r.in_type || '-'}</td>
                  <td style={{ textAlign: 'center' }}>{r.out_type || '-'}</td>
                  <td style={{ textAlign: 'center' }}>{r.overtime_duration || '-'}</td>
                  <td style={{ textAlign: 'center' }}>{r.approved_duration || '-'}</td>
                  <td style={{ textAlign: 'left' }} className="text-xs">{r.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
