'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW, formatYearMonth } from '@/lib/format';
import type { PayrollMonth, ProjectExpenditure } from '@/lib/types';
import {
  Users, Receipt, Building2, Clock, PieChart, TrendingUp,
  Plus, RefreshCw, Download, ChevronDown,
} from 'lucide-react';

export default function Dashboard() {
  const [months, setMonths] = useState<PayrollMonth[]>([]);
  const [month, setMonth] = useState<PayrollMonth | null>(null);
  const [expenditures, setExpenditures] = useState<ProjectExpenditure[]>([]);
  const [projCount, setProjCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [showNewMonth, setShowNewMonth] = useState(false);
  const [newYM, setNewYM] = useState('');
  const [newPayDate, setNewPayDate] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [message, setMessage] = useState('');

  async function loadMonth(m: PayrollMonth) {
    setMonth(m);
    const { data: exps } = await supabase
      .from('project_expenditures')
      .select('*, projects(*)')
      .eq('payroll_month_id', m.id)
      .order('total', { ascending: false });
    if (exps) setExpenditures(exps);
  }

  useEffect(() => {
    async function load() {
      const { data: allMonths } = await supabase
        .from('payroll_months')
        .select('*')
        .order('year_month', { ascending: false });
      if (allMonths && allMonths.length > 0) {
        setMonths(allMonths);
        await loadMonth(allMonths[0]);
      }
      const { count: pc } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('is_active', true);
      setProjCount(pc || 0);
      setLoading(false);
    }
    load();
  }, []);

  // 새 월 생성
  async function handleCreateMonth() {
    if (!newYM) return;
    setActionLoading('create');
    setMessage('');
    try {
      const res = await fetch('/api/payroll/create-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearMonth: newYM, payDate: newPayDate || null }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`${newYM} 생성 완료! 직원 ${data.employees}명, 배치 ${data.assignments}건`);
        // 새로고침
        const { data: allMonths } = await supabase.from('payroll_months').select('*').order('year_month', { ascending: false });
        if (allMonths && allMonths.length > 0) {
          setMonths(allMonths);
          await loadMonth(allMonths[0]);
        }
        setShowNewMonth(false);
      } else {
        setMessage(`오류: ${data.error}`);
      }
    } catch (e: any) {
      setMessage(`오류: ${e.message}`);
    }
    setActionLoading('');
  }

  // 재계산
  async function handleRecalculate() {
    if (!month) return;
    if (!confirm(`${formatYearMonth(month.year_month)} 보험료/소득세/배분을 재계산하시겠습니까?`)) return;
    setActionLoading('calc');
    setMessage('');
    try {
      const res = await fetch('/api/payroll/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthId: month.id }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`재계산 완료! 공제 ${data.deductions}건, 기관부담 ${data.employer}건, 배치 ${data.assignments}건`);
        await loadMonth(month);
        // 총괄 새로고침
        const { data: updated } = await supabase.from('payroll_months').select('*').eq('id', month.id).single();
        if (updated) {
          setMonth(updated);
          setMonths(prev => prev.map(m => m.id === updated.id ? updated : m));
        }
      } else {
        setMessage(`오류: ${data.error}`);
      }
    } catch (e: any) {
      setMessage(`오류: ${e.message}`);
    }
    setActionLoading('');
  }

  // 엑셀 내보내기
  async function handleExport(system: string) {
    if (!month) return;
    setActionLoading('export');
    try {
      const res = await fetch(`/api/payroll/export?monthId=${month.id}&system=${encodeURIComponent(system)}`);
      const data = await res.json();

      // JSON → CSV 변환 (사업별 지출 요약)
      const headers = ['사업명', '급여', '초과수당', '과기공제', '사회보험', '원천세', '실지급액', '기관보험료', '퇴직연금', '기관소계', '합계', '비고'];
      const rows = (data.summary || []).map((e: any) => [
        e.projects?.name || '', e.salary, e.overtime, e.science_fund,
        e.insurance_personal, e.withholding_tax, e.net_pay,
        e.employer_insurance, e.employer_retirement, e.employer_subtotal, e.total, e.note || ''
      ]);

      // BOM + CSV
      const bom = '\uFEFF';
      const csv = bom + [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `인건비_${month.year_month}_${system === 'all' ? '전체' : system}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`${system === 'all' ? '전체' : system} 내보내기 완료`);
    } catch (e: any) {
      setMessage(`오류: ${e.message}`);
    }
    setActionLoading('');
    setShowExport(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  if (!month) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold mb-4">데이터가 없습니다</h2>
        <p className="text-gray-500 mb-6">새 월을 생성하거나 엑셀 데이터를 업로드해주세요.</p>
        <button onClick={() => setShowNewMonth(true)} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium">
          <Plus size={18} className="inline mr-2" />새 월 생성
        </button>
        {showNewMonth && <NewMonthModal />}
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

  function NewMonthModal() {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewMonth(false)}>
        <div className="bg-white rounded-xl p-6 w-96 shadow-xl" onClick={e => e.stopPropagation()}>
          <h3 className="text-lg font-bold mb-4">새 급여월 생성</h3>
          <p className="text-sm text-gray-500 mb-4">전월 데이터를 복제하고 보험료/소득세를 자동 계산합니다.</p>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">급여월 (YYYY-MM)</label>
              <input type="month" value={newYM} onChange={e => setNewYM(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">지급일자</label>
              <input type="date" value={newPayDate} onChange={e => setNewPayDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mt-1" />
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={() => setShowNewMonth(false)} className="flex-1 border rounded-lg py-2 text-sm">취소</button>
            <button onClick={handleCreateMonth} disabled={!newYM || actionLoading === 'create'}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm disabled:opacity-50">
              {actionLoading === 'create' ? '생성 중...' : '생성'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const exportSystems = ['all', 'E-나라도움', 'RCMS', '보탬e', '운영비 계좌(기업은행)', '계좌이체(기업은행)'];

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{formatYearMonth(month.year_month)} 급여 대시보드</h1>
              {months.length > 1 && (
                <select
                  value={month.id}
                  onChange={async (e) => {
                    const m = months.find(m => m.id === e.target.value);
                    if (m) await loadMonth(m);
                  }}
                  className="text-sm border rounded px-2 py-1"
                >
                  {months.map(m => (
                    <option key={m.id} value={m.id}>{formatYearMonth(m.year_month)}</option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-gray-500 text-sm mt-1">
              지급일자: {month.pay_date || '-'} | 상태:
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                month.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                month.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {month.status === 'draft' ? '작성중' : month.status === 'confirmed' ? '확정' : '마감'}
              </span>
            </p>
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNewMonth(true)}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus size={16} />새 월 생성
          </button>
          <button onClick={handleRecalculate} disabled={actionLoading === 'calc'}
            className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            <RefreshCw size={16} className={actionLoading === 'calc' ? 'animate-spin' : ''} />
            {actionLoading === 'calc' ? '계산중...' : '자동 재계산'}
          </button>
          <div className="relative">
            <button onClick={() => setShowExport(!showExport)}
              className="flex items-center gap-1.5 bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800">
              <Download size={16} />내보내기 <ChevronDown size={14} />
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg py-1 w-56 z-50">
                {exportSystems.map(sys => (
                  <button key={sys} onClick={() => handleExport(sys)}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100">
                    {sys === 'all' ? '전체 내보내기' : sys}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 알림 메시지 */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.includes('오류') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message}
          <button onClick={() => setMessage('')} className="ml-2 underline">닫기</button>
        </div>
      )}

      {/* 총 인건비 */}
      <div className="stat-card text-center mb-6">
        <div className="text-sm text-gray-500">총 인건비 지출</div>
        <div className="text-3xl font-bold text-blue-600">{formatKRW(grandTotal)}원</div>
      </div>

      {/* 통계 카드 */}
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

      {/* 사업별 지출 테이블 */}
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

      {/* 모달 */}
      {showNewMonth && <NewMonthModal />}
    </div>
  );
}
