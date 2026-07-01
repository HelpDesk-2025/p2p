import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Clock, CheckCircle, XCircle, ArrowLeft, Filter, Calendar, CreditCard as Edit3, Check, X, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';

interface ApprovalEntry {
  id: string;
  request_type: string;
  request_id: string;
  request_number: string;
  approver_id: string;
  approver_name: string;
  approver_type: string;
  action: string;
  comments: string;
  approval_date: string;
  sequence: number;
  created_at: string;
  for_checking?: boolean;
  company_id?: string;
}

interface Company {
  id: string;
  name: string;
}

interface UserResult {
  id: string;
  full_name: string;
}

const REQUEST_TYPES = [
  'Purchase Requisition',
  'Canvass',
  'Petty Cash',
  'Reimbursement',
  'Cash Advance',
  'Purchase Order',
];

const ACTIONS = [
  'Submitted',
  'Approved',
  'Rejected',
  'Returned',
  'Auto-Rejected',
  'Cancelled',
];

export function ApprovalLedger() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<ApprovalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editApproverType, setEditApproverType] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const pageSize = 50;

  const isAdmin = profile?.role === 'admin';

  // Add Entry Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState('');
  const [newApprovalDate, setNewApprovalDate] = useState('');
  const [newRequestType, setNewRequestType] = useState('');
  const [newRequestNumber, setNewRequestNumber] = useState('');
  const [newApproverName, setNewApproverName] = useState('');
  const [newApproverId, setNewApproverId] = useState<string | null>(null);
  const [newApproverType, setNewApproverType] = useState('');
  const [newAction, setNewAction] = useState('');
  const [newSequence, setNewSequence] = useState<number>(1);
  const [newComments, setNewComments] = useState('');
  const [newForChecking, setNewForChecking] = useState(false);

  // User search state
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserResult[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const userSearchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadCompanies();
    loadApprovalLedger();
  }, []);

  // Close user dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userSearchRef.current && !userSearchRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadCompanies = async () => {
    try {
      if (!profile) return;

      if (profile.role === 'admin') {
        const { data, error } = await supabase
          .from('companies')
          .select('id, name')
          .eq('is_active', true)
          .order('name', { ascending: true });
        if (error) throw error;
        setCompanies(data || []);
      } else if (profile.enable_multi_company_requests && profile.allowed_companies && profile.allowed_companies.length > 0) {
        const { data, error } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', profile.allowed_companies)
          .eq('is_active', true)
          .order('name', { ascending: true });
        if (error) throw error;
        setCompanies(data || []);
      } else if (profile.company_id) {
        const { data, error } = await supabase
          .from('companies')
          .select('id, name')
          .eq('id', profile.company_id)
          .eq('is_active', true);
        if (error) throw error;
        setCompanies(data || []);
      }
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const loadApprovalLedger = async () => {
    setLoading(true);
    try {
      const allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      const allowedCompanyIds = profile?.role === 'admin'
        ? null
        : (profile?.enable_multi_company_requests && profile?.allowed_companies?.length)
          ? profile.allowed_companies
          : profile?.company_id ? [profile.company_id] : null;

      while (hasMore) {
        let query = supabase
          .from('approval_ledger')
          .select('*')
          .order('approval_date', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (allowedCompanyIds) {
          query = query.in('company_id', allowedCompanyIds);
        }

        const { data, error } = await query;
        if (error) throw error;

        allData.push(...(data || []));
        hasMore = (data?.length || 0) === pageSize;
        page++;
      }

      setEntries(allData);
    } catch (error) {
      console.error('Error loading approval ledger:', error);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (entry: ApprovalEntry) => {
    setEditingId(entry.id);
    setEditApproverType(entry.approver_type || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditApproverType('');
  };

  const saveApproverType = async (entry: ApprovalEntry) => {
    setSaving(true);
    try {
      const isChecker = editApproverType.toLowerCase().includes('(checker)');
      const { error } = await supabase
        .from('approval_ledger')
        .update({ approver_type: editApproverType, for_checking: isChecker })
        .eq('id', entry.id);

      if (error) throw error;

      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id ? { ...e, approver_type: editApproverType, for_checking: isChecker } : e
        )
      );
      setEditingId(null);
      setEditApproverType('');
    } catch (error) {
      console.error('Error updating approver type:', error);
    } finally {
      setSaving(false);
    }
  };

  const getApproverTypeOptions = (entry: ApprovalEntry) => {
    const name = entry.approver_name;
    return [
      `${name} (Approver)`,
      `${name} (Checker)`,
      'Requestor',
      'Specific User',
    ];
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'Approved':
        return <CheckCircle size={18} className="text-green-600" />;
      case 'Rejected':
        return <XCircle size={18} className="text-red-600" />;
      case 'Returned':
        return <ArrowLeft size={18} className="text-orange-600" />;
      case 'Submitted':
        return <FileText size={18} className="text-blue-600" />;
      default:
        return <Clock size={18} className="text-slate-400" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'Approved':
        return 'bg-green-100 text-green-800';
      case 'Rejected':
        return 'bg-red-100 text-red-800';
      case 'Returned':
        return 'bg-orange-100 text-orange-800';
      case 'Submitted':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  // User search with debounce
  const searchUsers = useCallback(async (term: string) => {
    if (term.length < 2) {
      setUserSearchResults([]);
      setShowUserDropdown(false);
      return;
    }

    setSearchingUsers(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .ilike('full_name', `%${term}%`)
        .order('full_name', { ascending: true })
        .limit(10);

      if (error) throw error;
      setUserSearchResults(data || []);
      setShowUserDropdown(true);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearchingUsers(false);
    }
  }, []);

  const handleUserSearchChange = (value: string) => {
    setUserSearchTerm(value);
    setNewApproverName(value);
    setNewApproverId(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchUsers(value), 300);
  };

  const selectUser = (user: UserResult) => {
    setNewApproverName(user.full_name);
    setNewApproverId(user.id);
    setUserSearchTerm(user.full_name);
    setShowUserDropdown(false);
  };

  // Open add modal with defaults
  const openAddModal = () => {
    const now = new Date();
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setNewApprovalDate(localIso);
    setNewRequestType('');
    setNewRequestNumber('');
    setNewApproverName('');
    setNewApproverId(null);
    setNewApproverType('');
    setNewAction('');
    setNewSequence(1);
    setNewComments('');
    setNewForChecking(false);
    setUserSearchTerm('');
    setUserSearchResults([]);
    setShowUserDropdown(false);
    setAddError('');
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setAddError('');
  };

  // Look up request_id and company_id from the appropriate table
  const lookupRequest = async (requestType: string, requestNumber: string): Promise<{ id: string; company_id: string } | null> => {
    const tableMap: Record<string, { table: string; column: string }> = {
      'Purchase Requisition': { table: 'purchase_requisitions', column: 'pr_number' },
      'Canvass': { table: 'canvass_requests', column: 'canvass_number' },
      'Petty Cash': { table: 'petty_cash_requests', column: 'pc_number' },
      'Reimbursement': { table: 'reimbursement_requests', column: 'reimb_number' },
      'Cash Advance': { table: 'cash_advance_requests', column: 'ca_number' },
      'Purchase Order': { table: 'purchase_orders', column: 'po_number' },
    };

    const mapping = tableMap[requestType];
    if (!mapping) return null;

    const { data, error } = await supabase
      .from(mapping.table)
      .select('id, company_id')
      .eq(mapping.column, requestNumber)
      .maybeSingle();

    if (error || !data) return null;
    return { id: data.id, company_id: data.company_id };
  };

  const handleAddEntry = async () => {
    setAddError('');

    if (!newRequestType) { setAddError('Request Type is required'); return; }
    if (!newRequestNumber.trim()) { setAddError('Request Number is required'); return; }
    if (!newApproverName.trim()) { setAddError('Approver is required'); return; }
    if (!newAction) { setAddError('Action is required'); return; }
    if (!newApprovalDate) { setAddError('Date and Time is required'); return; }

    setSubmitting(true);
    try {
      const requestData = await lookupRequest(newRequestType, newRequestNumber.trim());
      if (!requestData) {
        setAddError(`Request number "${newRequestNumber.trim()}" not found for type "${newRequestType}"`);
        setSubmitting(false);
        return;
      }

      const insertData: any = {
        request_type: newRequestType,
        request_id: requestData.id,
        request_number: newRequestNumber.trim(),
        approver_name: newApproverName.trim(),
        approver_id: newApproverId || null,
        approver_type: newApproverType.trim() || null,
        action: newAction,
        comments: newComments.trim() || null,
        approval_date: new Date(newApprovalDate).toISOString(),
        sequence: newSequence || null,
        company_id: requestData.company_id || null,
        for_checking: newForChecking,
      };

      const { error } = await supabase
        .from('approval_ledger')
        .insert(insertData);

      if (error) throw error;

      closeAddModal();
      await loadApprovalLedger();
    } catch (error: any) {
      console.error('Error adding ledger entry:', error);
      setAddError(error.message || 'Failed to add entry');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEntries = useMemo(() => entries.filter((entry) => {
    const matchesType = filterType === 'all' || entry.request_type === filterType;
    const matchesAction = filterAction === 'all' || entry.action === filterAction;
    const matchesCompany = filterCompany === 'all' || entry.company_id === filterCompany;
    const matchesSearch =
      entry.request_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.approver_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (entry.comments || '').toLowerCase().includes(searchTerm.toLowerCase());

    const entryDate = new Date(entry.approval_date).toISOString().split('T')[0];
    const matchesDateFrom = !dateFrom || entryDate >= dateFrom;
    const matchesDateTo = !dateTo || entryDate <= dateTo;

    return matchesType && matchesAction && matchesCompany && matchesSearch && matchesDateFrom && matchesDateTo;
  }), [entries, filterType, filterAction, filterCompany, searchTerm, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, filterAction, filterCompany, searchTerm, dateFrom, dateTo]);

  const clearFilters = () => {
    setFilterType('all');
    setFilterAction('all');
    setFilterCompany('all');
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Approval Ledger</h2>
            <p className="text-slate-600 mt-1 text-sm sm:text-base">Complete audit trail of all approval activities</p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Add Entry</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
          <h3 className="text-base sm:text-lg font-semibold text-slate-900">Filters</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Company</label>
            <select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Request Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="Purchase Requisition">Purchase Requisition</option>
              <option value="Canvass">Canvass</option>
              <option value="Petty Cash">Petty Cash</option>
              <option value="Reimbursement">Reimbursement</option>
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Action</label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Actions</option>
              <option value="Submitted">Submitted</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Returned">Returned</option>
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Search</label>
            <input
              type="text"
              placeholder="Request #, Approver..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            Showing {filteredEntries.length} of {entries.length} entries
          </p>
          <button
            onClick={clearFilters}
            className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div className="p-12 text-center">
            <Clock size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600">No approval entries found</p>
            {(filterType !== 'all' || filterAction !== 'all' || searchTerm || dateFrom || dateTo) && (
              <p className="text-sm text-slate-500 mt-2">Try adjusting your filters</p>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Request Type
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Request Number
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Approver
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Approver Type
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Sequence
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Comments
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedEntries.map((entry) => (
                    <tr key={entry.id} className="group hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-slate-400" />
                          <div>
                            <div className="text-sm font-medium text-slate-900">
                              {new Date(entry.approval_date).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-slate-500">
                              {new Date(entry.approval_date).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">
                          {entry.request_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-blue-600" />
                          <span className="font-mono font-semibold text-slate-900 text-sm">
                            {entry.request_number}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-slate-900">{entry.approver_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingId === entry.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={editApproverType}
                              onChange={(e) => setEditApproverType(e.target.value)}
                              className="px-2 py-1 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              {getApproverTypeOptions(entry).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => saveApproverType(entry)}
                              disabled={saving}
                              className="p-1 text-green-600 hover:bg-green-50 rounded transition"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-600">{entry.approver_type || '-'}</span>
                            {isAdmin && (
                              <button
                                onClick={() => startEditing(entry)}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition opacity-0 group-hover:opacity-100"
                              >
                                <Edit3 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getActionIcon(entry.action)}
                          <span className={`px-3 py-1 rounded-lg text-xs font-bold ${getActionColor(entry.action)}`}>
                            {entry.action}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-900">
                          {entry.sequence ? `#${entry.sequence}` : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="max-w-xs">
                          <p className="text-sm text-slate-600 line-clamp-2">
                            {entry.comments || '-'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
                <p className="text-sm text-slate-600">
                  Page {currentPage} of {totalPages} ({filteredEntries.length} entries)
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-xl border border-blue-200 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
            <FileText size={24} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">About Approval Ledger</h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              The Approval Ledger provides a complete audit trail of all approval activities across all request types.
              Each entry records the approver, action taken, timestamp, and any comments provided during the approval process.
              This ensures full transparency and accountability in the procurement workflow.
            </p>
          </div>
        </div>
      </div>

      {/* Add Entry Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900">Add Manual Ledger Entry</h3>
              <p className="text-sm text-slate-500 mt-1">Manually insert a new record into the approval ledger</p>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Date and Time */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Date and Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={newApprovalDate}
                    onChange={(e) => setNewApprovalDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Request Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Request Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newRequestType}
                    onChange={(e) => setNewRequestType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select type...</option>
                    {REQUEST_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {/* Request Number */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Request Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newRequestNumber}
                    onChange={(e) => setNewRequestNumber(e.target.value)}
                    placeholder="e.g., CA000000078"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  />
                </div>

                {/* Action */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Action <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newAction}
                    onChange={(e) => setNewAction(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select action...</option>
                    {ACTIONS.map((action) => (
                      <option key={action} value={action}>{action}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Approver (search dropdown) */}
              <div ref={userSearchRef} className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Approver <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={userSearchTerm}
                    onChange={(e) => handleUserSearchChange(e.target.value)}
                    onFocus={() => { if (userSearchResults.length > 0) setShowUserDropdown(true); }}
                    placeholder="Search by name..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {searchingUsers && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                </div>
                {newApproverId && (
                  <p className="text-xs text-green-600 mt-1">User selected: {newApproverName}</p>
                )}
                {showUserDropdown && userSearchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {userSearchResults.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => selectUser(user)}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors border-b border-slate-50 last:border-b-0"
                      >
                        {user.full_name}
                      </button>
                    ))}
                  </div>
                )}
                {showUserDropdown && userSearchResults.length === 0 && userSearchTerm.length >= 2 && !searchingUsers && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-3">
                    <p className="text-sm text-slate-500 text-center">No users found</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Approver Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Approver Type</label>
                  <input
                    type="text"
                    value={newApproverType}
                    onChange={(e) => setNewApproverType(e.target.value)}
                    placeholder="e.g., Specific User"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Sequence */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Sequence</label>
                  <input
                    type="number"
                    min={0}
                    value={newSequence}
                    onChange={(e) => setNewSequence(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Comments */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Comments</label>
                <textarea
                  value={newComments}
                  onChange={(e) => setNewComments(e.target.value)}
                  rows={3}
                  placeholder="Optional comments..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {/* For Checking */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="forChecking"
                  checked={newForChecking}
                  onChange={(e) => setNewForChecking(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="forChecking" className="text-sm font-medium text-slate-700">
                  For Checking Only
                </label>
              </div>

              {/* Error message */}
              {addError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{addError}</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={closeAddModal}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddEntry}
                disabled={submitting}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  'Save Entry'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
