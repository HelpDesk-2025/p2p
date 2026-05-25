import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Search, Filter, Calendar, Clock, User, FileText, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import Pagination from '../Pagination';

interface AuditEntry {
  id: string;
  source: 'approval_ledger' | 'p2p_audit' | 'po_audit' | 'grn_audit' | 'invoice_audit';
  document_type: string;
  document_id: string;
  document_number: string;
  action: string;
  performed_by: string;
  performed_by_name: string;
  from_status: string;
  to_status: string;
  comments: string;
  timestamp: string;
  company_id?: string;
}

interface CompanyOption {
  id: string;
  name: string;
}

export function AuditTrailConfig() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [filterDocType, setFilterDocType] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const pageSize = 50;

  useEffect(() => {
    loadCompanies();
    loadAuditEntries();
  }, []);

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const loadAuditEntries = async () => {
    setLoading(true);
    try {
      const allEntries: AuditEntry[] = [];

      // Load approval ledger entries
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('approval_ledger')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);

      if (!ledgerError && ledgerData) {
        for (const entry of ledgerData) {
          allEntries.push({
            id: entry.id,
            source: 'approval_ledger',
            document_type: entry.request_type || 'Unknown',
            document_id: entry.request_id,
            document_number: entry.request_number || '',
            action: entry.action || 'pending',
            performed_by: entry.approver_id || '',
            performed_by_name: entry.approver_name || 'System',
            from_status: '',
            to_status: entry.action || '',
            comments: entry.comments || '',
            timestamp: entry.approval_date || entry.created_at,
            company_id: entry.company_id || undefined,
          });
        }
      }

      // Load p2p audit logs
      const { data: p2pData, error: p2pError } = await supabase
        .from('p2p_audit_logs')
        .select('*')
        .order('acted_at', { ascending: false })
        .limit(500);

      if (!p2pError && p2pData) {
        // Get user names for p2p logs
        const userIds = [...new Set(p2pData.map(e => e.acted_by_user_id).filter(Boolean))];
        const userNames = await getUserNames(userIds);

        for (const entry of p2pData) {
          allEntries.push({
            id: entry.id,
            source: 'p2p_audit',
            document_type: entry.document_type || 'P2P Document',
            document_id: entry.document_id,
            document_number: '',
            action: entry.action || '',
            performed_by: entry.acted_by_user_id || '',
            performed_by_name: userNames[entry.acted_by_user_id] || 'Unknown',
            from_status: entry.from_status || '',
            to_status: entry.to_status || '',
            comments: entry.comments || '',
            timestamp: entry.acted_at,
          });
        }
      }

      // Load PO audit logs
      const { data: poData, error: poError } = await supabase
        .from('po_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!poError && poData) {
        const userIds = [...new Set(poData.map(e => e.performed_by).filter(Boolean))];
        const userNames = await getUserNames(userIds);

        for (const entry of poData) {
          allEntries.push({
            id: entry.id,
            source: 'po_audit',
            document_type: 'Purchase Order',
            document_id: entry.purchase_order_id,
            document_number: '',
            action: entry.action || '',
            performed_by: entry.performed_by || '',
            performed_by_name: userNames[entry.performed_by] || 'Unknown',
            from_status: '',
            to_status: entry.action || '',
            comments: entry.remarks || '',
            timestamp: entry.created_at,
          });
        }
      }

      // Load GRN audit logs
      const { data: grnData, error: grnError } = await supabase
        .from('po_grn_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!grnError && grnData) {
        const userIds = [...new Set(grnData.map(e => e.performed_by).filter(Boolean))];
        const userNames = await getUserNames(userIds);

        for (const entry of grnData) {
          allEntries.push({
            id: entry.id,
            source: 'grn_audit',
            document_type: 'Goods Receipt',
            document_id: entry.po_grn_id,
            document_number: '',
            action: entry.action || '',
            performed_by: entry.performed_by || '',
            performed_by_name: userNames[entry.performed_by] || 'Unknown',
            from_status: '',
            to_status: entry.action || '',
            comments: entry.remarks || '',
            timestamp: entry.created_at,
          });
        }
      }

      // Load Invoice audit logs
      const { data: invData, error: invError } = await supabase
        .from('invoice_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!invError && invData) {
        const userIds = [...new Set(invData.map(e => e.performed_by).filter(Boolean))];
        const userNames = await getUserNames(userIds);

        for (const entry of invData) {
          allEntries.push({
            id: entry.id,
            source: 'invoice_audit',
            document_type: 'Vendor Invoice',
            document_id: entry.vendor_invoice_id,
            document_number: '',
            action: entry.action || '',
            performed_by: entry.performed_by || '',
            performed_by_name: userNames[entry.performed_by] || 'Unknown',
            from_status: '',
            to_status: entry.action || '',
            comments: entry.remarks || '',
            timestamp: entry.created_at,
          });
        }
      }

      // Sort by timestamp descending
      allEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEntries(allEntries);
    } catch (error) {
      console.error('Error loading audit entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUserNames = async (userIds: string[]): Promise<Record<string, string>> => {
    if (userIds.length === 0) return {};
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .in('id', userIds);
    const map: Record<string, string> = {};
    if (data) {
      for (const u of data) {
        map[u.id] = u.full_name || 'Unknown';
      }
    }
    return map;
  };

  const getActionColor = (action: string) => {
    const a = action.toLowerCase();
    if (a === 'approved' || a === 'posted' || a === 'paid') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (a === 'rejected' || a === 'cancelled') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (a === 'pending' || a === 'submitted') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (a === 'returned_to_maker') return 'bg-orange-50 text-orange-700 border-orange-200';
    if (a === 'dispatched') return 'bg-sky-50 text-sky-700 border-sky-200';
    return 'bg-slate-50 text-slate-700 border-slate-200';
  };

  const getDocTypeColor = (docType: string) => {
    switch (docType) {
      case 'Purchase Requisition': return 'bg-blue-50 text-blue-700';
      case 'Canvass': return 'bg-teal-50 text-teal-700';
      case 'Purchase Order': return 'bg-cyan-50 text-cyan-700';
      case 'Petty Cash': return 'bg-green-50 text-green-700';
      case 'Cash Advance': return 'bg-lime-50 text-lime-700';
      case 'Reimbursement': return 'bg-amber-50 text-amber-700';
      case 'Liquidation': return 'bg-orange-50 text-orange-700';
      case 'Goods Receipt': return 'bg-sky-50 text-sky-700';
      case 'Vendor Invoice': return 'bg-rose-50 text-rose-700';
      case 'Payment': return 'bg-emerald-50 text-emerald-700';
      case 'APV': return 'bg-fuchsia-50 text-fuchsia-700';
      case 'Invoice': return 'bg-pink-50 text-pink-700';
      default: return 'bg-slate-50 text-slate-700';
    }
  };

  const formatAction = (action: string) => {
    return action
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  // Get unique document types and actions for filters
  const documentTypes = [...new Set(entries.map(e => e.document_type))].sort();
  const actions = [...new Set(entries.map(e => e.action))].filter(Boolean).sort();

  // Filter entries
  const filteredEntries = entries.filter(entry => {
    if (filterDocType !== 'all' && entry.document_type !== filterDocType) return false;
    if (filterAction !== 'all' && entry.action !== filterAction) return false;
    if (filterCompany !== 'all' && entry.company_id !== filterCompany) return false;

    if (dateFrom) {
      const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
      if (entryDate < dateFrom) return false;
    }
    if (dateTo) {
      const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
      if (entryDate > dateTo) return false;
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        entry.document_number.toLowerCase().includes(term) ||
        entry.performed_by_name.toLowerCase().includes(term) ||
        entry.action.toLowerCase().includes(term) ||
        entry.comments.toLowerCase().includes(term) ||
        entry.document_type.toLowerCase().includes(term)
      );
    }

    return true;
  });

  // Sort
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const dateA = new Date(a.timestamp).getTime();
    const dateB = new Date(b.timestamp).getTime();
    return sortDirection === 'desc' ? dateB - dateA : dateA - dateB;
  });

  // Pagination
  const totalPages = Math.ceil(sortedEntries.length / pageSize);
  const paginatedEntries = sortedEntries.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const activeFilterCount = [
    filterDocType !== 'all',
    filterAction !== 'all',
    filterCompany !== 'all',
    !!dateFrom,
    !!dateTo,
  ].filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-slate-600">Loading audit trail...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Audit Trail</h2>
          <p className="text-sm text-slate-500">
            Complete history of all actions across the system ({filteredEntries.length.toLocaleString()} entries)
          </p>
        </div>
        <button
          onClick={loadAuditEntries}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Search & Filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by document number, user, action, or comments..."
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-slate-200">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Document Type</label>
              <select
                value={filterDocType}
                onChange={(e) => { setFilterDocType(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="all">All Types</option>
                {documentTypes.map(dt => (
                  <option key={dt} value={dt}>{dt}</option>
                ))}
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
                {actions.map(a => (
                  <option key={a} value={a}>{formatAction(a)}</option>
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
                setFilterDocType('all');
                setFilterAction('all');
                setFilterCompany('all');
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
                <th className="text-left px-4 py-3 font-medium text-slate-700">
                  <button
                    onClick={() => setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')}
                    className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Timestamp
                    {sortDirection === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-700">
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    Document
                  </span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-700">Action</th>
                <th className="text-left px-4 py-3 font-medium text-slate-700">
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    Performed By
                  </span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-700">Comments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    No audit entries found matching your criteria.
                  </td>
                </tr>
              ) : (
                paginatedEntries.map((entry) => (
                  <tr key={`${entry.source}-${entry.id}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-slate-900 font-medium text-xs">
                        {new Date(entry.timestamp).toLocaleDateString('en-PH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      <div className="text-slate-500 text-xs">
                        {new Date(entry.timestamp).toLocaleTimeString('en-PH', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getDocTypeColor(entry.document_type)}`}>
                        {entry.document_type}
                      </span>
                      {entry.document_number && (
                        <div className="text-xs text-slate-600 font-mono mt-0.5">{entry.document_number}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${getActionColor(entry.action)}`}>
                        {formatAction(entry.action)}
                      </span>
                      {entry.from_status && entry.to_status && entry.from_status !== entry.to_status && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {entry.from_status} → {entry.to_status}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-900 text-xs">{entry.performed_by_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-600 text-xs line-clamp-2">{entry.comments || '—'}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-slate-200 px-4 py-3">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={sortedEntries.length}
              itemsPerPage={pageSize}
            />
          </div>
        )}
      </div>
    </div>
  );
}
