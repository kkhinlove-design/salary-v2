'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW, formatDate } from '@/lib/format';
import type { Employee } from '@/lib/types';
import EditableCell from '@/components/EditableCell';
import { Plus } from 'lucide-react';
import DeleteButton from '@/components/DeleteButton';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newEmp, setNewEmp] = useState({ name: '', annual_salary: 0, hire_date: '', dependents: '1', tax_rate: 100 });
  const [msg, setMsg] = useState('');

  async function load() {
    const { data } = await supabase.from('employees').select('*').order('name');
    if (data) setEmployees(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function updateField(id: string, field: string, value: any) {
    const { error } = await supabase.from('employees').update({ [field]: value }).eq('id', id);
    if (error) { setMsg(`오류: ${error.message}`); return; }
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    setMsg('저장됨');
    setTimeout(() => setMsg(''), 2000);
  }

  async function handleAdd() {
    if (!newEmp.name.trim()) return;
    const { error } = await supabase.from('employees').insert({
      name: newEmp.name.trim(),
      annual_salary: newEmp.annual_salary,
      hire_date: newEmp.hire_date || null,
      dependents: newEmp.dependents,
      tax_rate: newEmp.tax_rate,
      is_active: true,
    });
    if (error) { setMsg(`오류: ${error.message}`); return; }
    setShowAdd(false);
    setNewEmp({ name: '', annual_salary: 0, hire_date: '', dependents: '1', tax_rate: 100 });
    await load();
    setMsg('직원 추가 완료');
    setTimeout(() => setMsg(''), 2000);
  }

  const filtered = employees.filter(e => e.name.includes(search));
  const activeCount = employees.filter(e => e.is_active).length;

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">직원관리</h1>
          <p className="text-gray-500 text-sm mt-1">전체 {employees.length}명 | 재직 {activeCount}명
            <span className="ml-2 text-blue-500 text-xs">(더블클릭으로 수정)</span>
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {msg && <span className={`text-xs px-3 py-1 rounded ${msg.includes('오류') ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>{msg}</span>}
          <input type="text" placeholder="이름 검색..." value={search} onChange={e => setSearch(e.target.value)} className="border rounded-lg px-4 py-2 text-sm w-48" />
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
            <Plus size={16} />직원 추가
          </button>
        </div>
      </div>

      <div className="stat-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>이름</th>
              <th>입사일</th>
              <th>연봉월액</th>
              <th>부양가족</th>
              <th>세율</th>
              <th>과기공제</th>
              <th>상태</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((emp, i) => (
              <tr key={emp.id}>
                <td>{i + 1}</td>
                <EditableCell
                  value={emp.name}
                  onSave={v => updateField(emp.id, 'name', v)}
                  type="text"
                  align="left"
                />
                <EditableCell
                  value={emp.hire_date || ''}
                  onSave={v => updateField(emp.id, 'hire_date', v || null)}
                  type="text"
                  align="center"
                  format={v => formatDate(v)}
                />
                <EditableCell
                  value={emp.annual_salary}
                  onSave={v => updateField(emp.id, 'annual_salary', Number(v))}
                  type="number"
                  format={v => formatKRW(v)}
                />
                <EditableCell
                  value={emp.dependents || '1'}
                  onSave={v => updateField(emp.id, 'dependents', String(v))}
                  type="text"
                  align="center"
                />
                <EditableCell
                  value={emp.tax_rate}
                  onSave={v => updateField(emp.id, 'tax_rate', Number(v))}
                  type="select"
                  options={[{ value: '100', label: '100%' }, { value: '120', label: '120%' }]}
                  align="center"
                  format={v => `${v}%`}
                />
                <EditableCell
                  value={emp.science_fund}
                  onSave={v => updateField(emp.id, 'science_fund', Number(v))}
                  type="number"
                  format={v => formatKRW(v)}
                />
                <EditableCell
                  value={emp.is_active ? 1 : 0}
                  onSave={v => updateField(emp.id, 'is_active', !!v)}
                  type="boolean"
                />
                <td style={{ textAlign: 'center' }}>
                  <DeleteButton
                    onDelete={async () => {
                      const { error } = await supabase.from('employees').delete().eq('id', emp.id);
                      if (error) { setMsg(`오류: ${error.message}`); return; }
                      setEmployees(prev => prev.filter(e => e.id !== emp.id));
                      setMsg('삭제됨');
                      setTimeout(() => setMsg(''), 2000);
                    }}
                    confirmMessage={`"${emp.name}" 직원을 삭제하시겠습니까? 관련 급여/배치 데이터도 함께 삭제됩니다.`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl p-6 w-[420px] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">신규 직원 추가</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">이름 *</label>
                <input type="text" value={newEmp.name} onChange={e => setNewEmp(p => ({ ...p, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">연봉월액</label>
                <input type="number" value={newEmp.annual_salary} onChange={e => setNewEmp(p => ({ ...p, annual_salary: Number(e.target.value) }))} className="w-full border rounded-lg px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">입사일</label>
                <input type="date" value={newEmp.hire_date} onChange={e => setNewEmp(p => ({ ...p, hire_date: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">부양가족수</label>
                  <input type="text" value={newEmp.dependents} onChange={e => setNewEmp(p => ({ ...p, dependents: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" placeholder="예: 3, 4(2)" />
                </div>
                <div>
                  <label className="text-sm font-medium">세율(%)</label>
                  <select value={newEmp.tax_rate} onChange={e => setNewEmp(p => ({ ...p, tax_rate: Number(e.target.value) }))} className="w-full border rounded-lg px-3 py-2 mt-1">
                    <option value={100}>100%</option>
                    <option value={120}>120%</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowAdd(false)} className="flex-1 border rounded-lg py-2 text-sm">취소</button>
              <button onClick={handleAdd} disabled={!newEmp.name.trim()} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm disabled:opacity-50">추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
