'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW } from '@/lib/format';
import type { PersonalDeduction } from '@/lib/types';
import EditableCell from '@/components/EditableCell';

export default function DeductionsPage() {
  const [data, setData] = useState<PersonalDeduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    async function load() {
      const { data: months } = await supabase.from('payroll_months').select('id').order('year_month', { ascending: false }).limit(1);
      if (months && months.length > 0) {
        const { data: deds } = await supabase
          .from('personal_deductions')
          .select('*, employees(*)')
          .eq('payroll_month_id', months[0].id)
          .order('net_pay', { ascending: false });
        if (deds) setData(deds);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function updateField(id: string, field: string, value: number) {
    const row = data.find(d => d.id === id);
    if (!row) return;
    const updates: any = { [field]: value };

    // 소계/합계 자동 재계산
    const np = field === 'national_pension' ? value : row.national_pension;
    const hi = field === 'health_insurance' ? value : row.health_insurance;
    const ltc = field === 'long_term_care' ? value : row.long_term_care;
    const ei = field === 'employment_insurance' ? value : row.employment_insurance;
    updates.insurance_subtotal = np + hi + ltc + ei;

    const it = field === 'income_tax' ? value : row.income_tax;
    const rt = field === 'resident_tax' ? value : row.resident_tax;
    updates.tax_subtotal = it + rt;

    const sf = field === 'science_fund' ? value : row.science_fund;
    updates.total_deduction = updates.insurance_subtotal + updates.tax_subtotal + sf;

    // 실지급액은 payroll_details의 pay_total에서 공제를 빼야 하지만, 여기선 역산
    // net_pay = (기존 net_pay + 기존 total_deduction) - 새 total_deduction
    const grossPay = row.net_pay + row.total_deduction;
    updates.net_pay = grossPay - updates.total_deduction;

    const { error } = await supabase.from('personal_deductions').update(updates).eq('id', id);
    if (error) { setMsg(`오류: ${error.message}`); return; }
    setData(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    setMsg('저장됨');
    setTimeout(() => setMsg(''), 2000);
  }

  const filtered = data.filter(d => d.employees?.name?.includes(search));
  const sum = (key: keyof PersonalDeduction) => filtered.reduce((s, d) => s + (Number(d[key]) || 0), 0);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">개인공제 내역</h1>
          <p className="text-gray-500 text-sm mt-1">
            보험료 합계: {formatKRW(sum('insurance_subtotal'))}원 | 원천세 합계: {formatKRW(sum('tax_subtotal'))}원
            <span className="ml-2 text-blue-500 text-xs">(더블클릭으로 보정 / 소계·합계·실지급액 자동 반영)</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs px-3 py-1 rounded bg-green-100 text-green-600">{msg}</span>}
          <input type="text" placeholder="이름 검색..." value={search} onChange={e => setSearch(e.target.value)} className="border rounded-lg px-4 py-2 text-sm w-48" />
        </div>
      </div>

      <div className="stat-card overflow-x-auto max-h-[calc(100vh-200px)]">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>이름</th>
              <th>국민연금</th>
              <th>건강보험</th>
              <th>장기요양</th>
              <th>고용보험</th>
              <th>보험소계</th>
              <th>소득세</th>
              <th>주민세</th>
              <th>세금소계</th>
              <th>과기공제</th>
              <th>공제합계</th>
              <th>실지급액</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={d.id}>
                <td>{i + 1}</td>
                <td style={{ textAlign: 'left', fontWeight: 500 }}>{d.employees?.name || '-'}</td>
                <EditableCell value={d.national_pension} onSave={v => updateField(d.id, 'national_pension', Number(v))} type="number" format={v => formatKRW(v)} />
                <EditableCell value={d.health_insurance} onSave={v => updateField(d.id, 'health_insurance', Number(v))} type="number" format={v => formatKRW(v)} />
                <EditableCell value={d.long_term_care} onSave={v => updateField(d.id, 'long_term_care', Number(v))} type="number" format={v => formatKRW(v)} />
                <EditableCell value={d.employment_insurance} onSave={v => updateField(d.id, 'employment_insurance', Number(v))} type="number" format={v => formatKRW(v)} />
                <td className="font-semibold">{formatKRW(d.insurance_subtotal)}</td>
                <EditableCell value={d.income_tax} onSave={v => updateField(d.id, 'income_tax', Number(v))} type="number" format={v => formatKRW(v)} />
                <EditableCell value={d.resident_tax} onSave={v => updateField(d.id, 'resident_tax', Number(v))} type="number" format={v => formatKRW(v)} />
                <td className="font-semibold">{formatKRW(d.tax_subtotal)}</td>
                <EditableCell value={d.science_fund} onSave={v => updateField(d.id, 'science_fund', Number(v))} type="number" format={v => formatKRW(v)} />
                <td className="font-semibold">{formatKRW(d.total_deduction)}</td>
                <td className="font-bold text-blue-600">{formatKRW(d.net_pay)}</td>
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
              <td>{formatKRW(sum('insurance_subtotal'))}</td>
              <td>{formatKRW(sum('income_tax'))}</td>
              <td>{formatKRW(sum('resident_tax'))}</td>
              <td>{formatKRW(sum('tax_subtotal'))}</td>
              <td>{formatKRW(sum('science_fund'))}</td>
              <td>{formatKRW(sum('total_deduction'))}</td>
              <td className="font-bold">{formatKRW(sum('net_pay'))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
