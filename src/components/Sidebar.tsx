'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Receipt,
  Shield,
  Building2,
  Clock,
  PieChart,
} from 'lucide-react';

const nav = [
  { href: '/', label: '대시보드', icon: LayoutDashboard },
  { href: '/employees', label: '직원관리', icon: Users },
  { href: '/projects', label: '사업관리', icon: FolderKanban },
  { href: '/payroll', label: '급여총괄', icon: Receipt },
  { href: '/deductions', label: '개인공제', icon: Shield },
  { href: '/employer', label: '기관부담', icon: Building2 },
  { href: '/overtime', label: '초과근무', icon: Clock },
  { href: '/expenditures', label: '사업별 지출', icon: PieChart },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-slate-900 text-white flex flex-col z-50">
      <div className="p-5 border-b border-slate-700">
        <h1 className="text-lg font-bold">인건비 관리 v2</h1>
        <p className="text-xs text-slate-400 mt-1">산학융합원 경영관리</p>
      </div>
      <nav className="flex-1 py-4 overflow-y-auto">
        {nav.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-700 text-xs text-slate-500">
        2026년 3월분
      </div>
    </aside>
  );
}
