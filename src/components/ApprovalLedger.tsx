import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Clock, CheckCircle, XCircle, ArrowLeft, Filter, Calendar } from 'lucide-react';

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

  useEffect(() => {
    loadApprovalLedger();
  }, []);

  const loadApprovalLedger = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('approval_ledger')
        .select('*')
        .order('approval_date', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error loading approval ledger:', error);
    } finally {
      setLoading(false);
    }
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

  const filteredEntries = entries.filter((entry) => {
    const matchesType = filterType === 'all' || entry.request_type === filterType;
    const matchesAction = filterAction === 'all' || entry.action === filterAction;
    const matchesSearch =
      entry.request_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.approver_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (entry.comments || '').toLowerCase().includes(searchTerm.toLowerCase());

    const entryDate = new Date(entry.approval_date).toISOString().split('T')[0];
    const matchesDateFrom = !dateFrom || entryDate >= dateFrom;
    const matchesDateTo = !dateTo || entryDate <= dateTo;

    return matchesType && matchesAction && matchesSearch && matchesDateFrom && matchesDateTo;
  });

  const clearFilters = () => {
    setFilterType('all');
    setFilterAction('all');
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Approval Ledger</h2>
          <p className="text-slate-600 mt-1">Complete audit trail of all approval activities</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-slate-500" />
          <h3 className="text-lg font-semibold text-slate-900">Filters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Request Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="Purchase Requisition">Purchase Requisition</option>
              <option value="Canvass">Canvass</option>
              <option value="Petty Cash">Petty Cash</option>
              <option value="Reimbursement">Reimbursement</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Action</label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Actions</option>
              <option value="Submitted">Submitted</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Returned">Returned</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Search</label>
            <input
              type="text"
              placeholder="Request #, Approver..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                {filteredEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all">
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
                      <span className="text-sm text-slate-600">{entry.approver_type || '-'}</span>
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
    </div>
  );
}
