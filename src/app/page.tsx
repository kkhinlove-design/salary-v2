'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW, formatYearMonth } from '@/lib/format';
import type { PayrollMonth, ProjectExpenditure } from '@/lib/types';
import {
  Users, Receipt, Building2, Clock, PieChart, TrendingUp,
} from 'lucide-react';

export default function Dashboard() {
  const [month, setMonth] = useState<PayrollMonth | null>(null);
  const [expenditures, setExpenditures] = useState<ProjectExpenditure[]>([]);
  const [projCount, setProjCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: months } = await supabase
        .from('payroll_months')
        .select('*')
        .order('year_month', { ascending: false })
        .limit(1);

      if (months && months.length > 0) {
        setMonth(months[0]);

        const { data: exps } = await supabase
          .from('project_expenditures')
          .select('*, projects(*)')
          .eq('payroll_month_id', months[0].id)
          .order('total', { ascending: false });
        if (exps) setExpenditures(exps);
      }

      const { count: pc } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('is_active', true);
      setProjCount(pc || 0);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!month) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold mb-4">데이터가 없습니다</h2>
        <p className="text-gray-500">엑셀 데이터를 먼저 업로드해주세요.</p>
      </div>
    );
  }

  const stats = [
    { label: '지급대상', value: `${month.total_employees}명`, icon: Users, color: 'bg-blue-500' },
    { label: '급여총액', value: `${formatKRW(month.total_salary)}원`, icon: Receipt, color: 'bg-emerald-500' },
    { label: '초과수당총액', value: `${formatKRW(month.total_overtime)}원`, icon: Clock, color: 'bg-amber-500' },
    { label: '기관부담보험료', value: `${formatKRW(month.total_employer_insurance)}원`, icon: Building2, color: 'bg-purple-500' },
    { label: '퇴직연금총액', value: `${formatKRW(month.total_retirement)}원`, icon: TrendingUp, color: 'bg-rose-500' },
    { label: '활성사업수', value: `${projCount}개`, icon: PieChart, color: 'bg-cyan-500' },
  ];

  const grandTotal = month.total_salary + month.total_overtime + month.total_employer_insurance + month.total_retirement;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{formatYearMonth(month.year_month)} 급여 대시보드</h1>
          <p className="text-gray-500 text-sm mt-1">
            지급일자: {month.pay_date || '-'} | 상태: {month.status === 'draft' ? '작성중' : month.status === 'confirmed' ? '확정' : '마감'}
          </p>
        </div>
        <div className="stat-card text-center">
          <div className="text-xs text-gray-500">총 인건비 지출</div>
          <div className="text-xl font-bold text-blue-600">{formatKRW(grandTotal)}원</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <div className={`${s.color} p-1.5 rounded-lg`}>
                <s.icon size={14} className="text-white" />
              </div>
              <span className="text-xs text-gray-500">{s.label}</span>
            </div>
            <div className="text-sm font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="stat-card">
        <h2 className="text-lg font-bold mb-4">사업별 인건비 지출 현황</h2>
        <div className="overflow-x-auto max-h-[600px]">
          <table className="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>사업명</th>
                <th>급여</th>
                <th>초과수당</th>
                <th>과기공제</th>
                <th>사회보험</th>
                <th>원천세</th>
                <th>실지급액</th>
                <th>기관보험료</th>
                <th>퇴직연금</th>
                <th>합계</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {expenditures.map((e, i) => (
                <tr key={e.id}>
                  <td>{i + 1}</td>
                  <td>{e.projects?.name || '-'}</td>
                  <td>{formatKRW(e.salary)}</td>
                  <td>{formatKRW(e.overtime)}</td>
                  <td>{formatKRW(e.science_fund)}</td>
                  <td>{formatKRW(e.insurance_personal)}</td>
                  <td>{formatKRW(e.withholding_tax)}</td>
                  <td>{formatKRW(e.net_pay)}</td>
                  <td>{formatKRW(e.employer_insurance)}</td>
                  <td>{formatKRW(e.employer_retirement)}</td>
                  <td className="font-bold">{formatKRW(e.total)}</td>
                  <td className="text-xs">{e.note || ''}</td>
                </tr>
              ))}
            </tbody>
            {expenditures.length > 0 && (
              <tfoot>
                <tr>
                  <td></td>
                  <td style={{ textAlign: 'left' }}>합계</td>
                  <td>{formatKRW(expenditures.reduce((s, e) => s + e.salary, 0))}</td>
                  <td>{formatKRW(expenditures.reduce((s, e) => s + e.overtime, 0))}</td>
                  <td>{formatKRW(expenditures.reduce((s, e) => s + e.science_fund, 0))}</td>
                  <td>{formatKRW(expenditures.reduce((s, e) => s + e.insurance_personal, 0))}</td>
                  <td>{formatKRW(expenditures.reduce((s, e) => s + e.withholding_tax, 0))}</td>
                  <td>{formatKRW(expenditures.reduce((s, e) => s + e.net_pay, 0))}</td>
                  <td>{formatKRW(expenditures.reduce((s, e) => s + e.employer_insurance, 0))}</td>
                  <td>{formatKRW(expenditures.reduce((s, e) => s + e.employer_retirement, 0))}</td>
                  <td className="font-bold">{formatKRW(expenditures.reduce((s, e) => s + e.total, 0))}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
