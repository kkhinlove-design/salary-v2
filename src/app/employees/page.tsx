'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatKRW, formatDate } from '@/lib/format';
import type { Employee } from '@/lib/types';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .order('name');
      if (data) setEmployees(data);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = employees.filter(e =>
    e.name.includes(search)
  );

  const activeCount = employees.filter(e => e.is_active).length;

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">직원관리</h1>
          <p className="text-gray-500 text-sm mt-1">전체 {employees.length}명 | 재직 {activeCount}명</p>
        </div>
        <input
          type="text"
          placeholder="이름 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded-lg px-4 py-2 text-sm w-60"
        />
      </div>

      <div className="stat-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>이름</th>
              <th>입사일</th>
              <th>기산일</th>
              <th>연봉월액</th>
              <th>부양가족</th>
              <th>세율</th>
              <th>과기공제</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((emp, i) => (
              <tr key={emp.id}>
                <td>{i + 1}</td>
                <td>{emp.name}</td>
                <td style={{ textAlign: 'center' }}>{formatDate(emp.hire_date)}</td>
                <td style={{ textAlign: 'center' }}>{formatDate(emp.base_date)}</td>
                <td>{formatKRW(emp.annual_salary)}</td>
                <td style={{ textAlign: 'center' }}>{emp.dependents || '-'}</td>
                <td style={{ textAlign: 'center' }}>{emp.tax_rate}%</td>
                <td>{formatKRW(emp.science_fund)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${emp.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {emp.is_active ? '재직' : '퇴사'}
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
