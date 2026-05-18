import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, Send, Search, ChevronRight, RotateCcw, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getApprovalFlow, createApprovalLedgerEntry, sendApprovalEmail, sendApprovalEmailToAll, createRejectedLedgerEntries, ApprovalFlow } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';

type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'returned'
  | 'rejected'
  | 'dispatched'
  | 'partially_received'
  | 'fully_received'
  | 'closed'
  | 'cancelled';

interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_name: string;
  vendor_email: string;
  department: string;
  total_amount: number;
  budget_status: 'within_budget' | 'over_budget' | 'no_budget';
  status: POStatus;
  current_approver_id: string | null;
  current_approval_level: number;
  po_date: string;
  expected_delivery_date: string | null;
  delivery_address: string;
  payment_terms: string;
  delivery_terms: string;
  remarks: string;
  subtotal: number;
  vat_amount: number;
  pr_id: string | null;
  canvass_request_id: string | null;
  company_id: string | null;
  prepared_by: string | null;
  created_at: string;
  user_profiles?: { full_name: string; email: string } | null;
  companies?: { id: string; name: string } | null;
}

interface POItem {
  id: string;
  item_description: string;
  unit_of_measure: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  remarks: string;
}

interface ToastMsg {
  id: number;
  type: 'success' | 'error';
  text: string;
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_LABEL: Record<POStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  returned: 'Returned',
  rejected: 'Rejected',
  dispatched: 'Dispatched',
  partially_received: 'Partially Received',
  fully_received: 'Fully Received',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const BudgetBadge = ({ status }: { status: PurchaseOrder['budget_status'] }) => {
  const map = {
    within_budget: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Within Budget' },
    over_budget: { cls: 'bg-red-50 text-red-700 border-red-200', label: 'Over Budget' },
    no_budget: { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: 'No Budget' },
  } as const;
  const s = map[status];
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${s.cls}`}>{s.label}</span>;
};

export function POApproval() {
  const { user, profile } = useAuth();
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<PurchaseOrder | null>(null);
  const [items, setItems] = useState<POItem[]>([]);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlow[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'return' | 'reject' | null>(null);
  const [actionRemarks, setActionRemarks] = useState('');

  const showToast = (type: ToastMsg['type'], text: string) => {
    const id = Date.now();
    setToast({ id, type, text });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3500);
  };

  useEffect(() => {
    loadPending();
  }, [profile?.id]);

  const loadPending = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data: idRows, error: rpcError } = await supabase.rpc('get_my_pending_approval_ids', {
        p_request_type: 'Purchase Order',
        p_user_id: profile.id,
      });

      if (rpcError) {
        console.error('RPC error loading PO approval IDs:', rpcError);
        setPOs([]);
        setLoading(false);
        return;
      }

      const ids = (idRows || []).map((r: { request_id: string }) => r.request_id);

      if (ids.length === 0) {
        setPOs([]);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          user_profiles:prepared_by (full_name, email),
          companies:company_id (id, name)
        `)
        .in('id', ids)
        .order('created_at', { ascending: false });

      setPOs((data || []) as PurchaseOrder[]);
    } catch (error) {
      console.error('Error loading PO approvals:', error);
      setPOs([]);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pos;
    return pos.filter(
      (p) =>
        p.po_number.toLowerCase().includes(q) ||
        p.vendor_name.toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q)
    );
  }, [pos, search]);

  const openPO = async (po: PurchaseOrder) => {
    setActive(po);
    const { data: itemRows } = await supabase
      .from('purchase_order_items')
      .select('*')
      .eq('purchase_order_id', po.id);
    setItems((itemRows || []) as POItem[]);

    if (po.company_id && po.department) {
      try {
        const flows = await getApprovalFlow(
          po.company_id,
          po.department,
          'Purchase Order',
          false,
          Number(po.total_amount)
        );
        setApprovalFlows(flows);
      } catch (err) {
        console.error('Error loading approval flows for PO:', err);
        setApprovalFlows([]);
      }
    }
  };

  const currentApproverStep = useMemo(() => {
    if (!active || approvalFlows.length === 0) return null;
    const level = active.current_approval_level;
    return approvalFlows[level] || null;
  }, [active, approvalFlows]);

  const canApprove = () => {
    if (!profile || !active || approvalFlows.length === 0) return false;
    const level = active.current_approval_level;
    if (level >= approvalFlows.length) return false;
    const step = approvalFlows[level];
    if (step.user_id === profile.id) return true;
    if (step.alternate_approver_id === profile.id) return true;
    return true;
  };

  const performAction = async () => {
    if (!active || !user || !profile || !actionType) return;
    if ((actionType === 'return' || actionType === 'reject') && !actionRemarks.trim()) {
      showToast('error', 'Remarks are required.');
      return;
    }

    if (!canApprove()) {
      showToast('error', 'You are not authorized to perform this action at this level.');
      return;
    }

    setActionLoading(true);
    try {
      const currentLevel = active.current_approval_level;
      const nextLevel = currentLevel + 1;
      const isLastApproval = nextLevel >= approvalFlows.length;

      if (actionType === 'reject') {
        await supabase
          .from('purchase_orders')
          .update({
            status: 'rejected',
            current_approver_id: null,
            rejected_at: new Date().toISOString(),
            updated_by: user.id,
          })
          .eq('id', active.id);

        await createApprovalLedgerEntry(
          'Purchase Order',
          active.id,
          active.po_number,
          profile.id,
          profile.full_name || 'Unknown',
          currentApproverStep?.approver_type || 'Approver',
          'Rejected',
          actionRemarks,
          currentLevel + 1,
          currentApproverStep?.for_checking || false
        );

        await createRejectedLedgerEntries(
          'Purchase Order',
          active.id,
          active.po_number,
          approvalFlows,
          currentLevel,
          active.company_id || '',
          active.department
        );

        if (active.user_profiles?.email) {
          await sendApprovalEmail(
            active.user_profiles.email,
            active.user_profiles.full_name || 'User',
            'Purchase Order',
            active.po_number,
            active.user_profiles.full_name || 'Unknown',
            active.department,
            Number(active.total_amount),
            'Rejected',
            profile.full_name || 'Unknown',
            actionRemarks
          );
        }
      } else if (actionType === 'approve') {
        const newStatus = isLastApproval ? 'approved' : 'pending_approval';

        const updatePayload: any = {
          status: newStatus,
          current_approval_level: nextLevel,
          updated_by: user.id,
        };
        if (isLastApproval) {
          updatePayload.approved_at = new Date().toISOString();
          updatePayload.current_approver_id = null;
        }

        await supabase
          .from('purchase_orders')
          .update(updatePayload)
          .eq('id', active.id);

        await createApprovalLedgerEntry(
          'Purchase Order',
          active.id,
          active.po_number,
          profile.id,
          profile.full_name || 'Unknown',
          currentApproverStep?.approver_type || 'Approver',
          'Approved',
          actionRemarks,
          currentLevel + 1,
          currentApproverStep?.for_checking || false
        );

        if (!isLastApproval) {
          const nextApprover = approvalFlows[nextLevel];
          if (nextApprover && active.company_id) {
            await sendApprovalEmailToAll(
              nextApprover,
              active.company_id,
              active.department,
              'Purchase Order',
              active.po_number,
              active.user_profiles?.full_name || 'Unknown',
              Number(active.total_amount),
              'Approved',
              profile.full_name || 'Unknown',
              actionRemarks,
              nextApprover.approver_type
            );
          }
        } else {
          if (active.user_profiles?.email) {
            await sendApprovalEmail(
              active.user_profiles.email,
              active.user_profiles.full_name || 'User',
              'Purchase Order',
              active.po_number,
              active.user_profiles.full_name || 'Unknown',
              active.department,
              Number(active.total_amount),
              'Fully Approved',
              profile.full_name || 'Unknown',
              actionRemarks
            );
          }
        }
      } else if (actionType === 'return') {
        await supabase
          .from('purchase_orders')
          .update({
            status: 'returned',
            current_approver_id: null,
            updated_by: user.id,
          })
          .eq('id', active.id);

        await createApprovalLedgerEntry(
          'Purchase Order',
          active.id,
          active.po_number,
          profile.id,
          profile.full_name || 'Unknown',
          currentApproverStep?.approver_type || 'Approver',
          'Returned',
          actionRemarks,
          currentLevel + 1,
          currentApproverStep?.for_checking || false
        );

        if (active.user_profiles?.email) {
          await sendApprovalEmail(
            active.user_profiles.email,
            active.user_profiles.full_name || 'User',
            'Purchase Order',
            active.po_number,
            active.user_profiles.full_name || 'Unknown',
            active.department,
            Number(active.total_amount),
            'Returned to Maker',
            profile.full_name || 'Unknown',
            actionRemarks
          );
        }
      }

      showToast('success', `PO ${active.po_number} ${actionType}d.`);
      setActive(null);
      setActionType(null);
      setActionRemarks('');
      loadPending();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to act on PO.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-[100]">
          <div
            className={`px-4 py-3 rounded-lg shadow-lg border flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span className="text-sm font-medium">{toast.text}</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">PO Approval</h1>
            <p className="text-sm text-slate-500">Purchase orders awaiting your approval</p>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-60"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            <Loader2 className="animate-spin inline mr-2" size={16} /> Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">No POs awaiting your approval.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="px-3 py-2">PO Number</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">Budget</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((po) => (
                  <tr
                    key={po.id}
                    onClick={() => openPO(po)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 font-medium text-slate-900">{po.po_number}</td>
                    <td className="px-3 py-2 text-slate-700">{po.vendor_name}</td>
                    <td className="px-3 py-2 text-slate-700">{po.companies?.name || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{po.department || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(po.total_amount))}</td>
                    <td className="px-3 py-2 text-slate-600">{new Date(po.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2"><BudgetBadge status={po.budget_status} /></td>
                    <td className="px-3 py-2 text-right text-slate-400"><ChevronRight size={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setActive(null)} />
          <div className="relative ml-auto w-full max-w-3xl bg-white h-full overflow-y-auto shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 sticky top-0 bg-white flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">{active.po_number}</h2>
                <p className="text-xs text-slate-500">Status: {STATUS_LABEL[active.status]}</p>
              </div>
              <button onClick={() => setActive(null)} className="text-slate-500 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs uppercase text-slate-500 mb-2">Vendor</p>
                  <p className="font-medium">{active.vendor_name}</p>
                  <p className="text-slate-600 text-xs">{active.vendor_email || '—'}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs uppercase text-slate-500 mb-2">Totals</p>
                  <p className="text-slate-600 text-xs">Subtotal: {fmtMoney(Number(active.subtotal))}</p>
                  <p className="text-slate-600 text-xs">VAT: {fmtMoney(Number(active.vat_amount))}</p>
                  <p className="font-semibold">Total: {fmtMoney(Number(active.total_amount))}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <Info label="Company" value={active.companies?.name || '—'} />
                <Info label="Department" value={active.department || '—'} />
                <Info label="PO Date" value={active.po_date} />
                <Info label="Expected Delivery" value={active.expected_delivery_date || '—'} />
                <Info label="Payment Terms" value={active.payment_terms} />
                <Info label="Delivery Terms" value={active.delivery_terms || '—'} />
                <Info label="Budget" value={STATUS_LABEL_BUDGET[active.budget_status]} />
                <Info label="Prepared By" value={active.user_profiles?.full_name || '—'} />
              </div>

              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-200 font-semibold text-sm">Line Items</div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500">
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-left">UOM</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td className="px-3 py-2">{it.item_description}</td>
                        <td className="px-3 py-2">{it.unit_of_measure}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(it.quantity).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(it.unit_price))}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(it.total_price))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {active.company_id && (
                <ApprovalProgressTracker
                  requestType="Purchase Order"
                  requestId={active.id}
                  requestNumber={active.po_number}
                  companyId={active.company_id}
                  department={active.department}
                />
              )}

              {actionType ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-blue-900 capitalize">{actionType} this PO</p>
                  <textarea
                    placeholder={
                      actionType === 'approve' ? 'Optional remarks' : 'Remarks (required)'
                    }
                    value={actionRemarks}
                    onChange={(e) => setActionRemarks(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setActionType(null);
                        setActionRemarks('');
                      }}
                      className="px-3 py-1.5 text-sm text-slate-700 bg-slate-200 hover:bg-slate-300 rounded"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={performAction}
                      disabled={actionLoading}
                      className={`px-3 py-1.5 text-sm text-white rounded inline-flex items-center gap-2 ${
                        actionType === 'approve'
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : actionType === 'return'
                            ? 'bg-blue-600 hover:bg-blue-700'
                            : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {actionLoading && <Loader2 size={14} className="animate-spin" />}
                      Confirm
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setActionType('reject')}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg"
                  >
                    <X size={16} /> Reject
                  </button>
                  <button
                    onClick={() => setActionType('return')}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    <RotateCcw size={16} /> Return to Maker
                  </button>
                  <button
                    onClick={() => setActionType('approve')}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                  >
                    <Send size={16} /> Approve
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL_BUDGET: Record<PurchaseOrder['budget_status'], string> = {
  within_budget: 'Within Budget',
  over_budget: 'Over Budget',
  no_budget: 'No Budget Allocated',
};

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-500 tracking-wide">{label}</p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  );
}
