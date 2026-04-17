'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW } from '@/lib/format';
import type { PayrollDetail } from '@/lib/types';
import EditableCell from '@/components/EditableCell';

export default function PayrollPage() {
  const [data, setData] = useState<PayrollDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');

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

  async function updateField(id: string, field: string, value: number) {
    // 연관 필드 자동 계산
    const row = data.find(d => d.id === id);
    if (!row) return;
    const updates: any = { [field]: value };

    if (['position_allowance', 'transport', 'meal', 'childcare'].includes(field)) {
      const t = field === 'transport' ? value : row.transport;
      const m = field === 'meal' ? value : row.meal;
      const c = field === 'childcare' ? value : row.childcare;
      updates.nontax_subtotal = t + m + c;
    }
    if (field === 'overtime_pay' || field === 'other_pay') {
      const ot = field === 'overtime_pay' ? value : row.overtime_pay;
      const oth = field === 'other_pay' ? value : row.other_pay;
      updates.pay_total = row.monthly_salary + ot + oth;
    }

    const { error } = await supabase.from('payroll_details').update(updates).eq('id', id);
    if (error) { setMsg(`오류: ${error.message}`); return; }
    setData(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    setMsg('저장됨');
    setTimeout(() => setMsg(''), 2000);
  }

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
          <p className="text-gray-500 text-sm mt-1">{data.length}명
            <span className="ml-2 text-blue-500 text-xs">(더블클릭으로 수정 / 수정 후 대시보드에서 [자동 재계산] 실행)</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className={`text-xs px-3 py-1 rounded ${msg.includes('오류') ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>{msg}</span>}
          <input type="text" placeholder="이름 검색..." value={search} onChange={e => setSearch(e.target.value)} className="border rounded-lg px-4 py-2 text-sm w-48" />
        </div>
      </div>

      <div className="stat-card overflow-x-auto max-h-[calc(100vh-200px)]">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>이름</th>
              <th>연봉월액</th>
              <th>직책수당</th>
              <th>교통비</th>
              <th>식비</th>
              <th>보육수당</th>
              <th>비과세소계</th>
              <th>초과수당</th>
              <th>기타</th>
              <th>지급총액</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={d.id}>
                <td>{i + 1}</td>
                <td style={{ textAlign: 'left', fontWeight: 500 }}>{d.employees?.name || '-'}</td>
                <td>{formatKRW(d.monthly_salary)}</td>
                <EditableCell value={d.position_allowance} onSave={v => updateField(d.id, 'position_allowance', Number(v))} type="number" format={v => formatKRW(v)} />
                <EditableCell value={d.transport} onSave={v => updateField(d.id, 'transport', Number(v))} type="number" format={v => formatKRW(v)} />
                <EditableCell value={d.meal} onSave={v => updateField(d.id, 'meal', Number(v))} type="number" format={v => formatKRW(v)} />
                <EditableCell value={d.childcare} onSave={v => updateField(d.id, 'childcare', Number(v))} type="number" format={v => formatKRW(v)} />
                <td>{formatKRW(d.nontax_subtotal)}</td>
                <EditableCell value={d.overtime_pay} onSave={v => updateField(d.id, 'overtime_pay', Number(v))} type="number" format={v => formatKRW(v)} className="!bg-yellow-50" />
                <EditableCell value={d.other_pay} onSave={v => updateField(d.id, 'other_pay', Number(v))} type="number" format={v => formatKRW(v)} />
                <td className="font-bold">{formatKRW(d.pay_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td></td>
              <td style={{ textAlign: 'left' }}>합계</td>
              <td>{formatKRW(sum('monthly_salary'))}</td>
              <td>{formatKRW(sum('position_allowance'))}</td>
              <td>{formatKRW(sum('transport'))}</td>
              <td>{formatKRW(sum('meal'))}</td>
              <td>{formatKRW(sum('childcare'))}</td>
              <td>{formatKRW(sum('nontax_subtotal'))}</td>
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
