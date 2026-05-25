import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Search, Filter, Clock, User, FileText, ChevronDown, ChevronUp, RefreshCw, ArrowRight } from 'lucide-react';
import Pagination from '../Pagination';

interface CompanyOption {
  id: string;
  name: string;
}

interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  module: string;
  description: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  performed_by: string;
  performed_by_name: string;
  company_id: string | null;
  created_at: string;
}

export function AuditTrailConfig() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterTable, setFilterTable] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [distinctTables, setDistinctTables] = useState<string[]>([]);
  const [distinctUsers, setDistinctUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadCompanies();
    loadDistinctValues();
  }, []);

  useEffect(() => {
    loadAuditEntries();
  }, [currentPage, itemsPerPage, filterModule, filterAction, filterTable, filterCompany, filterUser, dateFrom, dateTo, searchTerm]);

  const loadCompanies = async () => {
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true });
    setCompanies(data || []);
  };

  const loadDistinctValues = async () => {
    const { data: tables } = await supabase
      .from('audit_trail')
      .select('table_name')
      .limit(1000);
    if (tables) {
      const unique = [...new Set(tables.map(t => t.table_name))].sort();
      setDistinctTables(unique);
    }

    const { data: users } = await supabase
      .from('audit_trail')
      .select('performed_by, performed_by_name')
      .limit(1000);
    if (users) {
      const seen = new Set<string>();
      const uniqueUsers: { id: string; name: string }[] = [];
      for (const u of users) {
        if (!seen.has(u.performed_by)) {
          seen.add(u.performed_by);
          uniqueUsers.push({ id: u.performed_by, name: u.performed_by_name });
        }
      }
      uniqueUsers.sort((a, b) => a.name.localeCompare(b.name));
      setDistinctUsers(uniqueUsers);
    }
  };

  const loadAuditEntries = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_trail')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (filterModule !== 'all') query = query.eq('module', filterModule);
      if (filterAction !== 'all') query = query.eq('action', filterAction);
      if (filterTable !== 'all') query = query.eq('table_name', filterTable);
      if (filterCompany !== 'all') query = query.eq('company_id', filterCompany);
      if (filterUser !== 'all') query = query.eq('performed_by', filterUser);
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);
      if (searchTerm) {
        query = query.or(`description.ilike.%${searchTerm}%,performed_by_name.ilike.%${searchTerm}%,table_name.ilike.%${searchTerm}%,record_id.ilike.%${searchTerm}%`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;
      setEntries(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error loading audit trail:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, filterModule, filterAction, filterTable, filterCompany, filterUser, dateFrom, dateTo, searchTerm]);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'UPDATE': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'DELETE': return 'bg-rose-50 text-rose-700 border-rose-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getModuleColor = (module: string) => {
    switch (module) {
      case 'configuration': return 'bg-blue-50 text-blue-700';
      case 'requests': return 'bg-teal-50 text-teal-700';
      case 'approvals': return 'bg-cyan-50 text-cyan-700';
      case 'p2p': return 'bg-sky-50 text-sky-700';
      default: return 'bg-slate-50 text-slate-700';
    }
  };

  const formatTableName = (name: string) => {
    return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getChangedFields = (oldVals: Record<string, any> | null, newVals: Record<string, any> | null) => {
    if (!oldVals && !newVals) return [];
    if (!oldVals) return Object.keys(newVals!).map(k => ({ key: k, old: null, new: newVals![k], type: 'added' as const }));
    if (!newVals) return Object.keys(oldVals).map(k => ({ key: k, old: oldVals[k], new: null, type: 'removed' as const }));

    const allKeys = new Set([...Object.keys(oldVals), ...Object.keys(newVals)]);
    const changes: { key: string; old: any; new: any; type: 'added' | 'removed' | 'changed' | 'unchanged' }[] = [];

    for (const key of allKeys) {
      if (key === 'updated_at' || key === 'created_at') continue;
      const oldVal = oldVals[key];
      const newVal = newVals[key];
      if (!(key in oldVals)) {
        changes.push({ key, old: null, new: newVal, type: 'added' });
      } else if (!(key in newVals)) {
        changes.push({ key, old: oldVal, new: null, type: 'removed' });
      } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ key, old: oldVal, new: newVal, type: 'changed' });
      }
    }

    return changes;
  };

  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return '(empty)';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
  };

  const activeFilterCount = [
    filterModule !== 'all',
    filterAction !== 'all',
    filterTable !== 'all',
    filterCompany !== 'all',
    filterUser !== 'all',
    !!dateFrom,
    !!dateTo,
  ].filter(Boolean).length;

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-slate-600">Loading audit trail...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Audit Trail</h2>
          <p className="text-sm text-slate-500">
            Complete history of all changes across the system ({totalCount.toLocaleString()} entries)
          </p>
        </div>
        <button
          onClick={() => { loadAuditEntries(); loadDistinctValues(); }}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Search & Filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search description, user, table name, or record ID..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg transition-colors ${
              activeFilterCount > 0
                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                : 'text-slate-700 bg-white border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-200">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Module</label>
              <select
                value={filterModule}
                onChange={(e) => { setFilterModule(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="all">All Modules</option>
                <option value="configuration">Configuration</option>
                <option value="requests">Requests</option>
                <option value="approvals">Approvals</option>
                <option value="p2p">P2P</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Action</label>
              <select
                value={filterAction}
                onChange={(e) => { setFilterAction(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="all">All Actions</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Table</label>
              <select
                value={filterTable}
                onChange={(e) => { setFilterTable(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="all">All Tables</option>
                {distinctTables.map(t => (
                  <option key={t} value={t}>{formatTableName(t)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Company</label>
              <select
                value={filterCompany}
                onChange={(e) => { setFilterCompany(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="all">All Companies</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Performed By</label>
              <select
                value={filterUser}
                onChange={(e) => { setFilterUser(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="all">All Users</option>
                {distinctUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        )}

        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 pt-2">
            <span className="text-xs text-slate-500">Active filters:</span>
            <button
              onClick={() => {
                setFilterModule('all');
                setFilterAction('all');
                setFilterTable('all');
                setFilterCompany('all');
                setFilterUser('all');
                setDateFrom('');
                setDateTo('');
                setCurrentPage(1);
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-700 w-8"></th>
                <th className="text-left px-4 py-3 font-medium text-slate-700">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Timestamp
                  </span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-700">Module</th>
                <th className="text-left px-4 py-3 font-medium text-slate-700">
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    Table
                  </span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-700">Action</th>
                <th className="text-left px-4 py-3 font-medium text-slate-700">
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    Performed By
                  </span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-700">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    No audit entries found matching your criteria.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <>
                    <tr
                      key={entry.id}
                      className={`hover:bg-slate-50 transition-colors cursor-pointer ${expandedRow === entry.id ? 'bg-slate-50' : ''}`}
                      onClick={() => setExpandedRow(expandedRow === entry.id ? null : entry.id)}
                    >
                      <td className="px-4 py-3">
                        {(entry.old_values || entry.new_values) && (
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedRow === entry.id ? 'rotate-180' : ''}`} />
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-slate-900 font-medium text-xs">
                          {new Date(entry.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-slate-500 text-xs">
                          {new Date(entry.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${getModuleColor(entry.module)}`}>
                          {entry.module}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-700 text-xs font-medium">{formatTableName(entry.table_name)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${getActionColor(entry.action)}`}>
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-900 text-xs">{entry.performed_by_name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-600 text-xs line-clamp-1">{entry.description || '—'}</span>
                      </td>
                    </tr>
                    {expandedRow === entry.id && (entry.old_values || entry.new_values) && (
                      <tr key={`${entry.id}-detail`}>
                        <td colSpan={7} className="px-4 py-4 bg-slate-50 border-t border-slate-100">
                          <DiffView entry={entry} getChangedFields={getChangedFields} formatValue={formatValue} />
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 0 && (
          <div className="border-t border-slate-200 px-4 py-3">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function DiffView({ entry, getChangedFields, formatValue }: {
  entry: AuditEntry;
  getChangedFields: (old: Record<string, any> | null, newV: Record<string, any> | null) => { key: string; old: any; new: any; type: 'added' | 'removed' | 'changed' | 'unchanged' }[];
  formatValue: (val: any) => string;
}) {
  const changes = getChangedFields(entry.old_values, entry.new_values);

  if (changes.length === 0) {
    return <p className="text-xs text-slate-500 italic">No field changes recorded.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 mb-2">
        <h4 className="text-xs font-semibold text-slate-700">Changes Detail</h4>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Added</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Changed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> Removed</span>
        </div>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-medium text-slate-600 w-1/4">Field</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600 w-[37.5%]">Old Value</th>
              <th className="text-center px-1 py-2 w-6"></th>
              <th className="text-left px-3 py-2 font-medium text-slate-600 w-[37.5%]">New Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {changes.map((change) => (
              <tr key={change.key} className={
                change.type === 'added' ? 'bg-emerald-50/50' :
                change.type === 'removed' ? 'bg-rose-50/50' :
                change.type === 'changed' ? 'bg-amber-50/30' : ''
              }>
                <td className="px-3 py-2 font-mono font-medium text-slate-700">
                  {change.key.replace(/_/g, ' ')}
                </td>
                <td className="px-3 py-2">
                  {change.type === 'added' ? (
                    <span className="text-slate-400 italic">—</span>
                  ) : (
                    <span className={`break-all whitespace-pre-wrap ${change.type === 'removed' ? 'text-rose-700 line-through' : 'text-slate-600'}`}>
                      {formatValue(change.old)}
                    </span>
                  )}
                </td>
                <td className="px-1 py-2 text-center">
                  {change.type !== 'removed' && <ArrowRight className="w-3 h-3 text-slate-400 mx-auto" />}
                </td>
                <td className="px-3 py-2">
                  {change.type === 'removed' ? (
                    <span className="text-slate-400 italic">—</span>
                  ) : (
                    <span className={`break-all whitespace-pre-wrap ${change.type === 'added' ? 'text-emerald-700 font-medium' : change.type === 'changed' ? 'text-amber-700 font-medium' : 'text-slate-600'}`}>
                      {formatValue(change.new)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
