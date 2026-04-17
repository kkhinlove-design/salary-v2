'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW } from '@/lib/format';
import type { ProjectExpenditure, ProjectAssignment } from '@/lib/types';
import EditableCell from '@/components/EditableCell';
import DeleteButton from '@/components/DeleteButton';
import { Plus } from 'lucide-react';

export default function ExpendituresPage() {
  const [expenditures, setExpenditures] = useState<ProjectExpenditure[]>([]);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [monthId, setMonthId] = useState('');
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [showAddAssign, setShowAddAssign] = useState(false);
  const [newAssign, setNewAssign] = useState({ employee_id: '', participation_rate: '1', work_days: '31' });

  useEffect(() => {
    async function load() {
      const { data: months } = await supabase.from('payroll_months').select('id').order('year_month', { ascending: false }).limit(1);
      if (months && months.length > 0) {
        const mid = months[0].id;
        setMonthId(mid);
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

        const { data: emps } = await supabase.from('employees').select('id, name').eq('is_active', true).order('name');
        if (emps) setEmployees(emps);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function updateAssignment(id: string, field: string, value: number) {
    const { error } = await supabase.from('project_assignments').update({ [field]: value }).eq('id', id);
    if (error) { setMsg(`오류: ${error.message}`); return; }
    setAssignments(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
    setMsg('저장됨 (대시보드에서 [자동 재계산] 실행 필요)');
    setTimeout(() => setMsg(''), 3000);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  const sum = (key: keyof ProjectExpenditure) => expenditures.reduce((s, e) => s + (Number(e[key]) || 0), 0);
  const selectedAssignments = selectedProject ? assignments.filter(a => a.project_id === selectedProject) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">사업별 인건비 지출내역</h1>
          <p className="text-gray-500 text-sm mt-1">
            {expenditures.length}개 사업 | 총 지출: {formatKRW(sum('total'))}원
            <span className="ml-2 text-blue-500 text-xs">(사업 클릭 → 참여율/참여일수 더블클릭 수정)</span>
          </p>
        </div>
        {msg && <span className={`text-xs px-3 py-1 rounded ${msg.includes('오류') ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>{msg}</span>}
      </div>

      {/* 사업별 요약 테이블 */}
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

      {/* 선택된 사업의 인원별 상세 (편집 가능) */}
      {selectedProject && (
        <div className="stat-card overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold">
              {expenditures.find(e => e.project_id === selectedProject)?.projects?.name} - 인원별 상세
            </h3>
            <button onClick={() => setShowAddAssign(true)} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs">
              <Plus size={14} />직원 배치 추가
            </button>
          </div>
          {selectedAssignments.length === 0 && <p className="text-gray-400 text-sm py-4 text-center">배치된 직원이 없습니다. [직원 배치 추가]로 추가하세요.</p>}
          {selectedAssignments.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>이름</th>
                <th style={{ background: '#1e40af' }}>참여율</th>
                <th style={{ background: '#1e40af' }}>참여일수</th>
                <th></th>
                <th>급여</th>
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
                  <td style={{ textAlign: 'left', fontWeight: 500 }}>{a.employees?.name || '-'}</td>
                  <EditableCell
                    value={a.participation_rate}
                    onSave={v => updateAssignment(a.id, 'participation_rate', Number(v))}
                    type="number"
                    align="center"
                    format={v => `${(Number(v) * 100).toFixed(0)}%`}
                    className="!bg-blue-50"
                  />
                  <EditableCell
                    value={a.work_days}
                    onSave={v => updateAssignment(a.id, 'work_days', Number(v))}
                    type="number"
                    align="center"
                    format={v => `${v}일`}
                    className="!bg-blue-50"
                  />
                  <td>{formatKRW(a.salary_amount)}</td>
                  <td>{formatKRW(a.overtime_amount)}</td>
                  <td>{formatKRW(a.science_fund)}</td>
                  <td>{formatKRW(a.insurance_deduction)}</td>
                  <td>{formatKRW(a.tax_subtotal)}</td>
                  <td>{formatKRW(a.net_pay)}</td>
                  <td>{formatKRW(a.employer_insurance)}</td>
                  <td>{formatKRW(a.employer_retirement)}</td>
                  <td className="font-bold">{formatKRW(a.total_cost)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <DeleteButton
                      onDelete={async () => {
                        const { error } = await supabase.from('project_assignments').delete().eq('id', a.id);
                        if (error) { setMsg(`오류: ${error.message}`); return; }
                        setAssignments(prev => prev.filter(x => x.id !== a.id));
                        setMsg('배치 해제됨 (재계산 필요)');
                        setTimeout(() => setMsg(''), 3000);
                      }}
                      confirmMessage={`"${a.employees?.name}"의 이 사업 배치를 해제하시겠습니까?`}
                    />
                  </td>
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
          )}
        </div>
      )}

      {/* 직원 배치 추가 모달 */}
      {showAddAssign && selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddAssign(false)}>
          <div className="bg-white rounded-xl p-6 w-[420px] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">직원 배치 추가</h3>
            <p className="text-sm text-gray-500 mb-4">{expenditures.find(e => e.project_id === selectedProject)?.projects?.name}</p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">직원 *</label>
                <select value={newAssign.employee_id} onChange={e => setNewAssign(p => ({ ...p, employee_id: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1">
                  <option value="">선택</option>
                  {employees.filter(e => !selectedAssignments.find(a => a.employee_id === e.id)).map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">참여율 (0~1)</label>
                  <input type="number" step="0.01" min="0" max="1" value={newAssign.participation_rate} onChange={e => setNewAssign(p => ({ ...p, participation_rate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">참여일수</label>
                  <input type="number" value={newAssign.work_days} onChange={e => setNewAssign(p => ({ ...p, work_days: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowAddAssign(false)} className="flex-1 border rounded-lg py-2 text-sm">취소</button>
              <button
                disabled={!newAssign.employee_id}
                onClick={async () => {
                  const { error } = await supabase.from('project_assignments').insert({
                    payroll_month_id: monthId,
                    project_id: selectedProject,
                    employee_id: newAssign.employee_id,
                    participation_rate: Number(newAssign.participation_rate),
                    work_days: Number(newAssign.work_days),
                    salary_amount: 0, overtime_amount: 0, science_fund: 0,
                    insurance_deduction: 0, income_tax: 0, resident_tax: 0,
                    tax_subtotal: 0, net_pay: 0, employer_insurance: 0,
                    employer_retirement: 0, total_cost: 0,
                  });
                  if (error) { setMsg(`오류: ${error.message}`); return; }
                  const { data: assigns } = await supabase.from('project_assignments').select('*, employees(*), projects(*)').eq('payroll_month_id', monthId);
                  if (assigns) setAssignments(assigns);
                  setShowAddAssign(false);
                  setNewAssign({ employee_id: '', participation_rate: '1', work_days: '31' });
                  setMsg('배치 추가 완료 (재계산 필요)');
                  setTimeout(() => setMsg(''), 3000);
                }}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm disabled:opacity-50"
              >추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
