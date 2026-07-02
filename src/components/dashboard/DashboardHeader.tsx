import { useEffect, useRef, useState } from 'react';
import { Plus, CheckSquare, Search, Building2, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission } from '../../lib/permissions';
import { ViewType } from '../Layout';
import { MODULES } from './modules';
import { QuickSearchModal } from './QuickSearchModal';
import { cn } from '../../lib/utils';

interface DashboardHeaderProps {
  onViewChange?: (view: ViewType) => void;
}

export function DashboardHeader({ onViewChange }: DashboardHeaderProps) {
  const { profile, permissions } = useAuth();
  const [now, setNow] = useState(new Date());
  const [openMenu, setOpenMenu] = useState<'new' | 'approvals' | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const requestModules = MODULES.filter((m) => hasPermission(permissions, m.requestPermission));
  const approvalModules = MODULES.filter((m) => hasPermission(permissions, m.approvalPermission));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Welcome back, {profile?.full_name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs sm:text-sm text-slate-600">
            <span className="capitalize font-medium text-slate-700">{profile?.role}</span>
            {profile?.company_name && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {profile.company_name}
              </span>
            )}
            <span className="tabular-nums">
              {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              {' · '}
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2" ref={menuRef}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === 'new' ? null : 'new')}
              disabled={requestModules.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Plus className="w-4 h-4" />
              New Request
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {openMenu === 'new' && (
              <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
                {requestModules.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      onViewChange?.(m.requestView);
                      setOpenMenu(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 text-left"
                  >
                    <m.icon className="w-4 h-4 text-slate-500" />
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === 'approvals' ? null : 'approvals')}
              disabled={approvalModules.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 text-xs sm:text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <CheckSquare className="w-4 h-4" />
              View Approvals
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {openMenu === 'approvals' && (
              <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
                {approvalModules.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      onViewChange?.(m.approvalView);
                      setOpenMenu(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 text-left"
                  >
                    <m.icon className="w-4 h-4 text-slate-500" />
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowSearch(true)}
            title="Search Records"
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 text-xs sm:text-sm font-medium rounded-lg hover:bg-slate-50 transition'
            )}
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search</span>
          </button>
        </div>
      </div>

      {showSearch && <QuickSearchModal onClose={() => setShowSearch(false)} onViewChange={onViewChange} />}
    </div>
  );
}
