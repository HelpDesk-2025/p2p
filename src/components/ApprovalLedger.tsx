import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Clock, CheckCircle, XCircle, ArrowLeft, Filter, Calendar, CreditCard as Edit3, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';

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

  useEffect(() => {
    loadCompanies();
    loadApprovalLedger();
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
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      className="space-y-4 sm:space-y-6"
    >
      <motion.div
        variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } }}
        className="relative overflow-hidden bg-white rounded-2xl shadow-luxury border border-slate-200/70 p-4 sm:p-6"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold-300 via-gold-500 to-gold-300" />
        <h2 className="text-2xl sm:text-3xl font-display font-semibold text-slate-900">Approval Ledger</h2>
        <p className="text-slate-600 mt-1 text-sm sm:text-base">Complete audit trail of all approval activities</p>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut', delay: 0.05 } } }}
        className="bg-white rounded-2xl shadow-luxury border border-slate-200/70 p-4 sm:p-6"
      >
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
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400"
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
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400"
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
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400"
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
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400"
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400"
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Search</label>
            <input
              type="text"
              placeholder="Request #, Approver..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            Showing {filteredEntries.length} of {entries.length} entries
          </p>
          <button
            onClick={clearFilters}
            className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-xl transition"
          >
            Clear Filters
          </button>
        </div>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut', delay: 0.05 } } }}
        className="bg-white rounded-2xl shadow-luxury border border-slate-200/70 overflow-hidden"
      >
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
                <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-gold-200">
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
                  {paginatedEntries.map((entry, index) => (
                    <tr
                      key={entry.id}
                      className="group hover:bg-gold-50/40 transition-all animate-fade-in-up"
                      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
                    >
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
                          <span className="font-mono font-semibold text-blue-900 text-sm">
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
                          <span className={`px-3 py-1 rounded-lg text-xs font-bold ring-1 ring-inset ring-black/5 ${getActionColor(entry.action)}`}>
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
      </motion.div>

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
    </motion.div>
  );
}
