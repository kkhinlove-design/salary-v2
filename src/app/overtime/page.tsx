'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW } from '@/lib/format';
import type { OvertimeSummary, OvertimeRecord } from '@/lib/types';
import EditableCell from '@/components/EditableCell';
import DeleteButton from '@/components/DeleteButton';
import { Plus, Upload } from 'lucide-react';

export default function OvertimePage() {
  const [summary, setSummary] = useState<OvertimeSummary[]>([]);
  const [records, setRecords] = useState<OvertimeRecord[]>([]);
  const [tab, setTab] = useState<'summary' | 'detail'>('summary');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [monthId, setMonthId] = useState('');
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [newRec, setNewRec] = useState({ employee_id: '', work_date: '', clock_in: '', clock_out: '', in_type: '정상출근', out_type: '연장근무', note: '' });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: months } = await supabase.from('payroll_months').select('id').order('year_month', { ascending: false }).limit(1);
      if (months && months.length > 0) {
        const mid = months[0].id;
        setMonthId(mid);
        const [{ data: s }, { data: r }, { data: emps }] = await Promise.all([
          supabase.from('overtime_summary').select('*, employees(name)').eq('payroll_month_id', mid).order('overtime_pay', { ascending: false }),
          supabase.from('overtime_records').select('*, employees(name)').eq('payroll_month_id', mid).order('work_date'),
          supabase.from('employees').select('id, name').eq('is_active', true).order('name'),
        ]);
        if (s) setSummary(s);
        if (r) setRecords(r);
        if (emps) setEmployees(emps);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function updateSummary(id: string, field: string, value: any) {
    const row = summary.find(s => s.id === id);
    if (!row) return;
    const updates: any = { [field]: value };

    // 초과수당 자동 재계산
    if (field === 'approved_hours') {
      const pay = Math.min(row.hourly_rate * Number(value), 350000);
      updates.overtime_pay = Math.floor(pay / 10) * 10;
    }

    const { error } = await supabase.from('overtime_summary').update(updates).eq('id', id);
    if (error) { setMsg(`오류: ${error.message}`); return; }
    setSummary(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    setMsg('저장됨');
    setTimeout(() => setMsg(''), 2000);
  }

  async function updateRecord(id: string, field: string, value: any) {
    const { error } = await supabase.from('overtime_records').update({ [field]: value }).eq('id', id);
    if (error) { setMsg(`오류: ${error.message}`); return; }
    setRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    setMsg('저장됨');
    setTimeout(() => setMsg(''), 2000);
  }

  async function handleAddRecord() {
    if (!newRec.employee_id || !newRec.work_date) return;
    const { error } = await supabase.from('overtime_records').insert({
      payroll_month_id: monthId,
      employee_id: newRec.employee_id,
      work_date: newRec.work_date,
      clock_in: newRec.clock_in ? `${newRec.work_date}T${newRec.clock_in}:00+09:00` : null,
      clock_out: newRec.clock_out ? `${newRec.work_date}T${newRec.clock_out}:00+09:00` : null,
      in_type: newRec.in_type,
      out_type: newRec.out_type,
      note: newRec.note || null,
    }).select('*, employees(name)');
    if (error) { setMsg(`오류: ${error.message}`); return; }
    // 새로고침
    const { data: r } = await supabase.from('overtime_records').select('*, employees(name)').eq('payroll_month_id', monthId).order('work_date');
    if (r) setRecords(r);
    setShowAddRecord(false);
    setNewRec({ employee_id: '', work_date: '', clock_in: '', clock_out: '', in_type: '정상출근', out_type: '연장근무', note: '' });
    setMsg('근무기록 추가 완료');
    setTimeout(() => setMsg(''), 2000);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !monthId) return;
    setUploading(true);
    setMsg('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('monthId', monthId);
      const res = await fetch('/api/overtime/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setMsg(data.message + (data.skipped?.length ? ` (건너뜀: ${data.skipped.join(', ')})` : ''));
        // 새로고침
        const [{ data: s }, { data: r }] = await Promise.all([
          supabase.from('overtime_summary').select('*, employees(name)').eq('payroll_month_id', monthId).order('overtime_pay', { ascending: false }),
          supabase.from('overtime_records').select('*, employees(name)').eq('payroll_month_id', monthId).order('work_date'),
        ]);
        if (s) setSummary(s);
        if (r) setRecords(r);
      } else {
        setMsg(`오류: ${data.error}`);
      }
    } catch (err: any) {
      setMsg(`오류: ${err.message}`);
    }
    setUploading(false);
    e.target.value = '';
  }

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
          <p className="text-gray-500 text-sm mt-1">총 초과수당: {formatKRW(totalOvertime)}원
            <span className="ml-2 text-blue-500 text-xs">(더블클릭으로 수정)</span>
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {msg && <span className="text-xs px-3 py-1 rounded bg-green-100 text-green-600">{msg}</span>}
          <label className={`flex items-center gap-1.5 bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload size={16} />
            {uploading ? '업로드 중...' : '수당조정 엑셀 업로드'}
            <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" />
          </label>
          <input type="text" placeholder="이름 검색..." value={search} onChange={e => setSearch(e.target.value)} className="border rounded-lg px-4 py-2 text-sm w-40" />
          <button onClick={() => setTab('summary')} className={`px-4 py-2 rounded-lg text-sm ${tab === 'summary' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>수당내역</button>
          <button onClick={() => setTab('detail')} className={`px-4 py-2 rounded-lg text-sm ${tab === 'detail' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>근무대장</button>
          {tab === 'detail' && (
            <button onClick={() => setShowAddRecord(true)} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">
              <Plus size={16} />기록 추가
            </button>
          )}
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSummary.map((d, i) => (
                <tr key={d.id}>
                  <td>{i + 1}</td>
                  <td style={{ textAlign: 'left', fontWeight: 500 }}>{d.employees?.name || '-'}</td>
                  <EditableCell value={d.project_name || ''} onSave={v => updateSummary(d.id, 'project_name', v)} type="text" align="left" />
                  <td>{formatKRW(d.hourly_rate)}</td>
                  <td>{formatKRW(d.base_hourly_rate)}</td>
                  <EditableCell value={d.approved_hours} onSave={v => updateSummary(d.id, 'approved_hours', Number(v))} type="number" align="center" format={v => `${v}시간`} className="!bg-yellow-50" />
                  <EditableCell value={d.overtime_pay} onSave={v => updateSummary(d.id, 'overtime_pay', Number(v))} type="number" format={v => formatKRW(v)} className="font-bold" />
                  <td style={{ textAlign: 'center' }}>
                    <DeleteButton onDelete={async () => {
                      await supabase.from('overtime_summary').delete().eq('id', d.id);
                      setSummary(prev => prev.filter(x => x.id !== d.id));
                    }} confirmMessage={`"${d.employees?.name}" 초과근무 수당을 삭제하시겠습니까?`} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td></td>
                <td style={{ textAlign: 'left' }}>합계</td>
                <td></td><td></td><td></td>
                <td style={{ textAlign: 'center' }}>{filteredSummary.reduce((s, d) => s + d.approved_hours, 0)}시간</td>
                <td className="font-bold">{formatKRW(filteredSummary.reduce((s, d) => s + d.overtime_pay, 0))}</td>
                <td></td>
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
                <th>인정시간</th>
                <th>비고</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td style={{ textAlign: 'left', fontWeight: 500 }}>{r.employees?.name || '-'}</td>
                  <EditableCell value={r.work_date || ''} onSave={v => updateRecord(r.id, 'work_date', v)} type="text" align="center" />
                  <td style={{ textAlign: 'center' }}>{r.clock_in ? new Date(r.clock_in).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td style={{ textAlign: 'center' }}>{r.clock_out ? new Date(r.clock_out).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <EditableCell value={r.in_type || ''} onSave={v => updateRecord(r.id, 'in_type', v)} type="select" options={[
                    { value: '정상출근', label: '정상출근' }, { value: '휴일출근', label: '휴일출근' }, { value: '조기출근', label: '조기출근' },
                  ]} align="center" />
                  <EditableCell value={r.out_type || ''} onSave={v => updateRecord(r.id, 'out_type', v)} type="select" options={[
                    { value: '연장근무', label: '연장근무' }, { value: '휴일퇴근', label: '휴일퇴근' }, { value: '정상퇴근', label: '정상퇴근' },
                  ]} align="center" />
                  <EditableCell value={r.approved_duration || ''} onSave={v => updateRecord(r.id, 'approved_duration', v)} type="text" align="center" />
                  <EditableCell value={r.note || ''} onSave={v => updateRecord(r.id, 'note', v || null)} type="text" align="left" />
                  <td style={{ textAlign: 'center' }}>
                    <DeleteButton onDelete={async () => {
                      await supabase.from('overtime_records').delete().eq('id', r.id);
                      setRecords(prev => prev.filter(x => x.id !== r.id));
                    }} confirmMessage="이 근무기록을 삭제하시겠습니까?" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 근무기록 추가 모달 */}
      {showAddRecord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddRecord(false)}>
          <div className="bg-white rounded-xl p-6 w-[460px] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">초과근무 기록 추가</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">직원 *</label>
                <select value={newRec.employee_id} onChange={e => setNewRec(p => ({ ...p, employee_id: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1">
                  <option value="">선택</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">근무일 *</label>
                <input type="date" value={newRec.work_date} onChange={e => setNewRec(p => ({ ...p, work_date: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">출근시간</label>
                  <input type="time" value={newRec.clock_in} onChange={e => setNewRec(p => ({ ...p, clock_in: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">퇴근시간</label>
                  <input type="time" value={newRec.clock_out} onChange={e => setNewRec(p => ({ ...p, clock_out: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">출근판정</label>
                  <select value={newRec.in_type} onChange={e => setNewRec(p => ({ ...p, in_type: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1">
                    <option>정상출근</option><option>휴일출근</option><option>조기출근</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">퇴근판정</label>
                  <select value={newRec.out_type} onChange={e => setNewRec(p => ({ ...p, out_type: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1">
                    <option>연장근무</option><option>휴일퇴근</option><option>정상퇴근</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">비고</label>
                <input type="text" value={newRec.note} onChange={e => setNewRec(p => ({ ...p, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" placeholder="예: 주12시간 초과분 제외" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowAddRecord(false)} className="flex-1 border rounded-lg py-2 text-sm">취소</button>
              <button onClick={handleAddRecord} disabled={!newRec.employee_id || !newRec.work_date} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm disabled:opacity-50">추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
