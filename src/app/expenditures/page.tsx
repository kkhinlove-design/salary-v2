'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW } from '@/lib/format';
import type { ProjectExpenditure, ProjectAssignment } from '@/lib/types';

export default function ExpendituresPage() {
  const [expenditures, setExpenditures] = useState<ProjectExpenditure[]>([]);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: months } = await supabase.from('payroll_months').select('id').order('year_month', { ascending: false }).limit(1);
      if (months && months.length > 0) {
        const mid = months[0].id;
        const { data: exps } = await supabase
          .from('project_expenditures')
          .select('*, projects(*)')
          .eq('payroll_month_id', mid)
          .order('total', { ascending: false });
        if (exps) setExpenditures(exps);

        const { data: assigns } = await supabase
          .from('project_assignments')
          .select('*, employees(*), projects(*)')
          .eq('payroll_month_id', mid);
        if (assigns) setAssignments(assigns);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  const sum = (key: keyof ProjectExpenditure) => expenditures.reduce((s, e) => s + (Number(e[key]) || 0), 0);
  const selectedAssignments = selectedProject
    ? assignments.filter(a => a.project_id === selectedProject)
    : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">사업별 인건비 지출내역</h1>
        <p className="text-gray-500 text-sm mt-1">
          {expenditures.length}개 사업 | 총 지출: {formatKRW(sum('total'))}원
        </p>
      </div>

      <div className="stat-card overflow-x-auto mb-6">
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
              <th>기관소계</th>
              <th>합계</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {expenditures.map((e, i) => (
              <tr
                key={e.id}
                onClick={() => setSelectedProject(e.project_id === selectedProject ? null : e.project_id)}
                className={`cursor-pointer ${e.project_id === selectedProject ? '!bg-blue-50' : ''}`}
              >
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
                <td>{formatKRW(e.employer_subtotal)}</td>
                <td className="font-bold">{formatKRW(e.total)}</td>
                <td className="text-xs">{e.note || ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td></td>
              <td style={{ textAlign: 'left' }}>합계</td>
              <td>{formatKRW(sum('salary'))}</td>
              <td>{formatKRW(sum('overtime'))}</td>
              <td>{formatKRW(sum('science_fund'))}</td>
              <td>{formatKRW(sum('insurance_personal'))}</td>
              <td>{formatKRW(sum('withholding_tax'))}</td>
              <td>{formatKRW(sum('net_pay'))}</td>
              <td>{formatKRW(sum('employer_insurance'))}</td>
              <td>{formatKRW(sum('employer_retirement'))}</td>
              <td>{formatKRW(sum('employer_subtotal'))}</td>
              <td className="font-bold">{formatKRW(sum('total'))}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {selectedProject && selectedAssignments.length > 0 && (
        <div className="stat-card overflow-x-auto">
          <h3 className="text-lg font-bold mb-3">
            {expenditures.find(e => e.project_id === selectedProject)?.projects?.name} - 인원별 상세
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>이름</th>
                <th>참여율</th>
                <th>참여일수</th>
                <th>���여</th>
                <th>초과수당</th>
                <th>과기공제</th>
                <th>사회보험</th>
                <th>원천세</th>
                <th>실지급액</th>
                <th>기관보험</th>
                <th>퇴직연금</th>
                <th>총부담액</th>
              </tr>
            </thead>
            <tbody>
              {selectedAssignments.map((a, i) => (
                <tr key={a.id}>
                  <td>{i + 1}</td>
                  <td>{a.employees?.name || '-'}</td>
                  <td style={{ textAlign: 'center' }}>{(a.participation_rate * 100).toFixed(0)}%</td>
                  <td style={{ textAlign: 'center' }}>{a.work_days}일</td>
                  <td>{formatKRW(a.salary_amount)}</td>
                  <td>{formatKRW(a.overtime_amount)}</td>
                  <td>{formatKRW(a.science_fund)}</td>
                  <td>{formatKRW(a.insurance_deduction)}</td>
                  <td>{formatKRW(a.tax_subtotal)}</td>
                  <td>{formatKRW(a.net_pay)}</td>
                  <td>{formatKRW(a.employer_insurance)}</td>
                  <td>{formatKRW(a.employer_retirement)}</td>
                  <td className="font-bold">{formatKRW(a.total_cost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td></td>
                <td style={{ textAlign: 'left' }}>합계</td>
                <td></td>
                <td></td>
                <td>{formatKRW(selectedAssignments.reduce((s, a) => s + a.salary_amount, 0))}</td>
                <td>{formatKRW(selectedAssignments.reduce((s, a) => s + a.overtime_amount, 0))}</td>
                <td>{formatKRW(selectedAssignments.reduce((s, a) => s + a.science_fund, 0))}</td>
                <td>{formatKRW(selectedAssignments.reduce((s, a) => s + a.insurance_deduction, 0))}</td>
                <td>{formatKRW(selectedAssignments.reduce((s, a) => s + a.tax_subtotal, 0))}</td>
                <td>{formatKRW(selectedAssignments.reduce((s, a) => s + a.net_pay, 0))}</td>
                <td>{formatKRW(selectedAssignments.reduce((s, a) => s + a.employer_insurance, 0))}</td>
                <td>{formatKRW(selectedAssignments.reduce((s, a) => s + a.employer_retirement, 0))}</td>
                <td className="font-bold">{formatKRW(selectedAssignments.reduce((s, a) => s + a.total_cost, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
