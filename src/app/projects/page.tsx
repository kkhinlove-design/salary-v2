'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW } from '@/lib/format';
import type { Project, ProjectExpenditure } from '@/lib/types';
import EditableCell from '@/components/EditableCell';
import { Plus } from 'lucide-react';
import DeleteButton from '@/components/DeleteButton';

const FUND_TYPES = [
  { value: '', label: '-' },
  { value: '국비', label: '국비' },
  { value: '도비', label: '도비' },
  { value: '군비', label: '군비' },
  { value: '시비', label: '시비' },
  { value: '운영비', label: '운영비' },
];

const FUND_SOURCES = [
  { value: '', label: '-' },
  { value: 'E-나라도움', label: 'E-나라도움' },
  { value: 'RCMS', label: 'RCMS' },
  { value: '보탬e', label: '보탬e' },
  { value: '운영비 계좌(기업은행)', label: '운영비 계좌(기업은행)' },
  { value: '계좌이체(기업은행)', label: '계좌이체(기업은행)' },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<(Project & { expenditure?: ProjectExpenditure })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newProj, setNewProj] = useState({ name: '', fund_type: '', fund_source: '', is_substitute: false });
  const [msg, setMsg] = useState('');

  async function load() {
    const { data: projs } = await supabase.from('projects').select('*').order('name');
    const { data: months } = await supabase.from('payroll_months').select('id').order('year_month', { ascending: false }).limit(1);

    if (projs && months && months.length > 0) {
      const { data: exps } = await supabase
        .from('project_expenditures')
        .select('*')
        .eq('payroll_month_id', months[0].id);
      const expMap = new Map((exps || []).map(e => [e.project_id, e]));
      setProjects(projs.map(p => ({ ...p, expenditure: expMap.get(p.id) })));
    } else if (projs) {
      setProjects(projs);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function updateField(id: string, field: string, value: any) {
    const { error } = await supabase.from('projects').update({ [field]: value }).eq('id', id);
    if (error) { setMsg(`오류: ${error.message}`); return; }
    setProjects(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    setMsg('저장됨');
    setTimeout(() => setMsg(''), 2000);
  }

  async function handleAdd() {
    if (!newProj.name.trim()) return;
    const { error } = await supabase.from('projects').insert({
      name: newProj.name.trim(),
      fund_type: newProj.fund_type || null,
      fund_source: newProj.fund_source || null,
      is_substitute: newProj.is_substitute,
      is_active: true,
    });
    if (error) { setMsg(`오류: ${error.message}`); return; }
    setShowAdd(false);
    setNewProj({ name: '', fund_type: '', fund_source: '', is_substitute: false });
    await load();
    setMsg('사업 추가 완료');
    setTimeout(() => setMsg(''), 2000);
  }

  const filtered = projects.filter(p => p.name.includes(search));
  const activeCount = projects.filter(p => p.is_active).length;

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">사업관리</h1>
          <p className="text-gray-500 text-sm mt-1">전체 {projects.length}개 | 활성 {activeCount}개
            <span className="ml-2 text-blue-500 text-xs">(더블클릭으로 수정)</span>
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {msg && <span className={`text-xs px-3 py-1 rounded ${msg.includes('오류') ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>{msg}</span>}
          <input type="text" placeholder="사업명 검색..." value={search} onChange={e => setSearch(e.target.value)} className="border rounded-lg px-4 py-2 text-sm w-48" />
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
            <Plus size={16} />사업 추가
          </button>
        </div>
      </div>

      <div className="stat-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>사업명</th>
              <th>재원구분</th>
              <th>정산시스템</th>
              <th>대체집행</th>
              <th>이번달 급여</th>
              <th>이번달 총지출</th>
              <th>상태</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={p.id}>
                <td>{i + 1}</td>
                <EditableCell
                  value={p.name}
                  onSave={v => updateField(p.id, 'name', v)}
                  type="text"
                  align="left"
                />
                <EditableCell
                  value={p.fund_type || ''}
                  onSave={v => updateField(p.id, 'fund_type', v || null)}
                  type="select"
                  options={FUND_TYPES}
                  align="center"
                  format={v => v || '-'}
                />
                <EditableCell
                  value={p.fund_source || ''}
                  onSave={v => updateField(p.id, 'fund_source', v || null)}
                  type="select"
                  options={FUND_SOURCES}
                  align="center"
                  format={v => v || '-'}
                />
                <EditableCell
                  value={p.is_substitute ? 1 : 0}
                  onSave={v => updateField(p.id, 'is_substitute', !!v)}
                  type="boolean"
                />
                <td>{p.expenditure ? formatKRW(p.expenditure.salary) : '-'}</td>
                <td className="font-bold">{p.expenditure ? formatKRW(p.expenditure.total) : '-'}</td>
                <EditableCell
                  value={p.is_active ? 1 : 0}
                  onSave={v => updateField(p.id, 'is_active', !!v)}
                  type="boolean"
                />
                <td style={{ textAlign: 'center' }}>
                  <DeleteButton
                    onDelete={async () => {
                      const { error } = await supabase.from('projects').delete().eq('id', p.id);
                      if (error) { setMsg(`오류: ${error.message}`); return; }
                      setProjects(prev => prev.filter(x => x.id !== p.id));
                      setMsg('삭제됨');
                      setTimeout(() => setMsg(''), 2000);
                    }}
                    confirmMessage={`"${p.name}" 사업을 삭제하시겠습니까? 관련 배치/지출 데이터도 함께 삭제됩니다.`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl p-6 w-[460px] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">신규 사업 추가</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">사업명 *</label>
                <input type="text" value={newProj.name} onChange={e => setNewProj(p => ({ ...p, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" placeholder="예: 전북 스마트제조 사업" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">재원구분</label>
                  <select value={newProj.fund_type} onChange={e => setNewProj(p => ({ ...p, fund_type: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1">
                    {FUND_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">정산시스템</label>
                  <select value={newProj.fund_source} onChange={e => setNewProj(p => ({ ...p, fund_source: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1">
                    {FUND_SOURCES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="checkbox" checked={newProj.is_substitute} onChange={e => setNewProj(p => ({ ...p, is_substitute: e.target.checked }))} className="rounded" />
                  대체집행 사업
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowAdd(false)} className="flex-1 border rounded-lg py-2 text-sm">취소</button>
              <button onClick={handleAdd} disabled={!newProj.name.trim()} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm disabled:opacity-50">추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
