'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW } from '@/lib/format';
import type { Project, ProjectExpenditure } from '@/lib/types';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<(Project & { expenditure?: ProjectExpenditure })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    load();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">사업관리</h1>
        <p className="text-gray-500 text-sm mt-1">전체 {projects.length}개 사업</p>
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
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => (
              <tr key={p.id}>
                <td>{i + 1}</td>
                <td>{p.name}</td>
                <td style={{ textAlign: 'center' }}>{p.fund_type || '-'}</td>
                <td style={{ textAlign: 'center' }}>{p.fund_source || '-'}</td>
                <td style={{ textAlign: 'center' }}>{p.is_substitute ? 'O' : '-'}</td>
                <td>{p.expenditure ? formatKRW(p.expenditure.salary) : '-'}</td>
                <td className="font-bold">{p.expenditure ? formatKRW(p.expenditure.total) : '-'}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.is_active ? '활성' : '종료'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
