'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW } from '@/lib/format';
import type { PayrollDetail } from '@/lib/types';

export default function PayrollPage() {
  const [data, setData] = useState<PayrollDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      const { data: months } = await supabase.from('payroll_months').select('id').order('year_month', { ascending: false }).limit(1);
      if (months && months.length > 0) {
        const { data: details } = await supabase
          .from('payroll_details')
          .select('*, employees(*)')
          .eq('payroll_month_id', months[0].id)
          .order('monthly_salary', { ascending: false });
        if (details) setData(details);
      }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = data.filter(d => d.employees?.name?.includes(search));
  const sum = (key: keyof PayrollDetail) => filtered.reduce((s, d) => s + (Number(d[key]) || 0), 0);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">급여총괄</h1>
          <p className="text-gray-500 text-sm mt-1">{data.length}명</p>
        </div>
        <input type="text" placeholder="이름 검색..." value={search} onChange={e => setSearch(e.target.value)} className="border rounded-lg px-4 py-2 text-sm w-60" />
      </div>

      <div className="stat-card overflow-x-auto max-h-[calc(100vh-200px)]">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>이름</th>
              <th>연봉월액</th>
              <th>월급여(과세)</th>
              <th>직책수당</th>
              <th>교통비</th>
              <th>식비</th>
              <th>보육수당</th>
              <th>비과세소계</th>
              <th>사업총계</th>
              <th>초과수당</th>
              <th>기타</th>
              <th>지급총액</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={d.id}>
                <td>{i + 1}</td>
                <td>{d.employees?.name || '-'}</td>
                <td>{formatKRW(d.monthly_salary)}</td>
                <td>{formatKRW(d.base_pay)}</td>
                <td>{formatKRW(d.position_allowance)}</td>
                <td>{formatKRW(d.transport)}</td>
                <td>{formatKRW(d.meal)}</td>
                <td>{formatKRW(d.childcare)}</td>
                <td>{formatKRW(d.nontax_subtotal)}</td>
                <td>{formatKRW(d.gross_total)}</td>
                <td>{formatKRW(d.overtime_pay)}</td>
                <td>{formatKRW(d.other_pay)}</td>
                <td className="font-bold">{formatKRW(d.pay_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td></td>
              <td style={{ textAlign: 'left' }}>합계</td>
              <td>{formatKRW(sum('monthly_salary'))}</td>
              <td>{formatKRW(sum('base_pay'))}</td>
              <td>{formatKRW(sum('position_allowance'))}</td>
              <td>{formatKRW(sum('transport'))}</td>
              <td>{formatKRW(sum('meal'))}</td>
              <td>{formatKRW(sum('childcare'))}</td>
              <td>{formatKRW(sum('nontax_subtotal'))}</td>
              <td>{formatKRW(sum('gross_total'))}</td>
              <td>{formatKRW(sum('overtime_pay'))}</td>
              <td>{formatKRW(sum('other_pay'))}</td>
              <td className="font-bold">{formatKRW(sum('pay_total'))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
