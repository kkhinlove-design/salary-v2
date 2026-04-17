'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW, formatDate } from '@/lib/format';
import type { EmployerContribution } from '@/lib/types';

export default function EmployerPage() {
  const [data, setData] = useState<(EmployerContribution & { employees?: { name: string; hire_date: string; base_date: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      const { data: months } = await supabase.from('payroll_months').select('id').order('year_month', { ascending: false }).limit(1);
      if (months && months.length > 0) {
        const { data: contribs } = await supabase
          .from('employer_contributions')
          .select('*, employees(name, hire_date, base_date)')
          .eq('payroll_month_id', months[0].id)
          .order('total', { ascending: false });
        if (contribs) setData(contribs);
      }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = data.filter(d => d.employees?.name?.includes(search));
  const sum = (key: keyof EmployerContribution) => filtered.reduce((s, d) => s + (Number(d[key]) || 0), 0);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">기관부담액</h1>
          <p className="text-gray-500 text-sm mt-1">
            보험료 합계: {formatKRW(sum('insurance_subtotal'))}원 | 퇴직연금: {formatKRW(sum('retirement_pension'))}���
          </p>
        </div>
        <input type="text" placeholder="이름 검색..." value={search} onChange={e => setSearch(e.target.value)} className="border rounded-lg px-4 py-2 text-sm w-60" />
      </div>

      <div className="stat-card overflow-x-auto max-h-[calc(100vh-200px)]">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>이름</th>
              <th>국민연금</th>
              <th>���강보험</th>
              <th>장기요양</th>
              <th>고용보험</th>
              <th>산재보험</th>
              <th>보험소계</th>
              <th>퇴직연금</th>
              <th>합계</th>
              <th>입사일자</th>
              <th>기산일자</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={d.id}>
                <td>{i + 1}</td>
                <td>{d.employees?.name || '-'}</td>
                <td>{formatKRW(d.national_pension)}</td>
                <td>{formatKRW(d.health_insurance)}</td>
                <td>{formatKRW(d.long_term_care)}</td>
                <td>{formatKRW(d.employment_insurance)}</td>
                <td>{formatKRW(d.industrial_accident)}</td>
                <td className="font-semibold">{formatKRW(d.insurance_subtotal)}</td>
                <td>{formatKRW(d.retirement_pension)}</td>
                <td className="font-bold">{formatKRW(d.total)}</td>
                <td style={{ textAlign: 'center' }}>{formatDate(d.employees?.hire_date || null)}</td>
                <td style={{ textAlign: 'center' }}>{formatDate(d.employees?.base_date || null)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td></td>
              <td style={{ textAlign: 'left' }}>합계</td>
              <td>{formatKRW(sum('national_pension'))}</td>
              <td>{formatKRW(sum('health_insurance'))}</td>
              <td>{formatKRW(sum('long_term_care'))}</td>
              <td>{formatKRW(sum('employment_insurance'))}</td>
              <td>{formatKRW(sum('industrial_accident'))}</td>
              <td>{formatKRW(sum('insurance_subtotal'))}</td>
              <td>{formatKRW(sum('retirement_pension'))}</td>
              <td className="font-bold">{formatKRW(sum('total'))}</td>
              <td></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
