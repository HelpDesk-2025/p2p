import { useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ViewType } from '../Layout';
import { MODULES } from './modules';
import { resolveCompanyIds } from './companyScope';

interface SearchResult {
  moduleKey: string;
  moduleLabel: string;
  icon: any;
  id: string;
  docNumber: string;
  status: string;
  department: string | null;
  amount: number | null;
  approvalView: ViewType;
}

interface QuickSearchModalProps {
  onClose: () => void;
  onViewChange?: (view: ViewType) => void;
}

export function QuickSearchModal({ onClose, onViewChange }: QuickSearchModalProps) {
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const runSearch = async (value: string) => {
    setQuery(value);
    if (value.trim().length < 2 || !profile?.company_id) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    try {
      const companyIds = resolveCompanyIds(profile);
      const perModule = await Promise.all(
        MODULES.map(async (m) => {
          const { data } = await supabase
            .from(m.table)
            .select(`id, status, department, ${m.docNumberColumn}, ${m.amountColumn}`)
            .in('company_id', companyIds)
            .ilike(m.docNumberColumn, `%${value.trim()}%`)
            .limit(10);

          return (data || []).map((row: any) => ({
            moduleKey: m.key,
            moduleLabel: m.label,
            icon: m.icon,
            id: row.id,
            docNumber: row[m.docNumberColumn],
            status: row.status,
            department: row.department,
            amount: Number(row[m.amountColumn]) || null,
            approvalView: m.requestView,
          }));
        })
      );
      setResults(perModule.flat());
      setSearched(true);
    } catch (error) {
      console.error('Error running quick search:', error);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search by document number (e.g. PR000000721)..."
            className="flex-1 outline-none text-sm text-slate-900 placeholder:text-slate-400"
          />
          {searching && <Loader2 className="w-4 h-4 text-slate-400 animate-spin flex-shrink-0" />}
          <button onClick={onClose} aria-label="Close search" className="p-1 rounded-md hover:bg-slate-100 flex-shrink-0">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {!searched && (
            <p className="text-sm text-slate-400 text-center py-8">Type at least 2 characters to search</p>
          )}
          {searched && results.length === 0 && !searching && (
            <p className="text-sm text-slate-400 text-center py-8">No matching records found</p>
          )}
          {results.map((r) => (
            <button
              key={`${r.moduleKey}-${r.id}`}
              type="button"
              onClick={() => {
                onViewChange?.(r.approvalView);
                onClose();
              }}
              className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition border-b border-slate-100 last:border-0"
            >
              <r.icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">{r.docNumber}</p>
                <p className="text-xs text-slate-500 truncate">
                  {r.moduleLabel} · {r.department || 'No department'}
                </p>
              </div>
              <span className="text-xs font-medium text-slate-600 capitalize flex-shrink-0">{r.status}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
