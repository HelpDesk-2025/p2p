import { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'dispatched'
  | 'partially_received'
  | 'fully_received'
  | 'cancelled';

interface POSummary {
  id: string;
  po_number: string;
  vendor_name: string;
  status: POStatus;
  po_date: string;
  expected_delivery_date: string | null;
  total_amount: number;
}

interface POItemRow {
  id: string;
  item_description: string;
  unit_of_measure: string;
  quantity: number;
}

interface GRItemRow {
  po_item_id: string;
  received_quantity: number;
  accepted_quantity: number;
  po_grns: { status: string } | null;
}

interface ItemReceiptRow {
  po_item_id: string;
  description: string;
  uom: string;
  ordered: number;
  received: number;
  accepted: number;
  remaining: number;
}

const STATUS_STYLES: Record<POStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  pending_approval: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-blue-100 text-blue-700 border-blue-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  dispatched: 'bg-sky-100 text-sky-700 border-sky-200',
  partially_received: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  fully_received: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
};

const STATUS_LABELS: Record<POStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  dispatched: 'Dispatched',
  partially_received: 'Partially Received',
  fully_received: 'Fully Received',
  cancelled: 'Cancelled',
};

export function POReceiptTracker() {
  const [pos, setPOs] = useState<POSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<POStatus | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [itemRowsByPO, setItemRowsByPO] = useState<Record<string, ItemReceiptRow[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  useEffect(() => {
    loadPOs();
  }, []);

  const loadPOs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, po_number, vendor_name, status, po_date, expected_delivery_date, total_amount')
      .in('status', ['dispatched', 'partially_received', 'fully_received'])
      .is('deleted_at', null)
      .order('po_date', { ascending: false });
    if (!error) {
      setPOs((data || []) as POSummary[]);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pos.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.po_number.toLowerCase().includes(q) ||
        p.vendor_name.toLowerCase().includes(q)
      );
    });
  }, [pos, search, statusFilter]);

  const toggleExpand = async (poId: string) => {
    if (expanded === poId) {
      setExpanded(null);
      return;
    }
    setExpanded(poId);
    if (itemRowsByPO[poId]) return;

    setLoadingDetails(poId);
    const { data: items } = await supabase
      .from('purchase_order_items')
      .select('id, item_description, unit_of_measure, quantity')
      .eq('purchase_order_id', poId)
      .order('created_at', { ascending: true });

    const { data: grItems } = await supabase
      .from('po_grn_items')
      .select(`
        po_item_id,
        received_quantity,
        accepted_quantity,
        po_grns!inner(status, purchase_order_id)
      `)
      .eq('po_grns.purchase_order_id', poId);

    const confirmedByItem = new Map<string, { received: number; accepted: number }>();
    (grItems || []).forEach((row: any) => {
      const grStatus = row.po_grns?.status;
      if (grStatus !== 'confirmed') return;
      const cur = confirmedByItem.get(row.po_item_id) || { received: 0, accepted: 0 };
      cur.received += Number(row.received_quantity || 0);
      cur.accepted += Number(row.accepted_quantity || 0);
      confirmedByItem.set(row.po_item_id, cur);
    });

    const rows: ItemReceiptRow[] = (items || []).map((it: POItemRow) => {
      const ordered = Number(it.quantity || 0);
      const sums = confirmedByItem.get(it.id) || { received: 0, accepted: 0 };
      return {
        po_item_id: it.id,
        description: it.item_description,
        uom: it.unit_of_measure,
        ordered,
        received: sums.received,
        accepted: sums.accepted,
        remaining: Math.max(0, ordered - sums.accepted),
      };
    });

    setItemRowsByPO((prev) => ({ ...prev, [poId]: rows }));
    setLoadingDetails(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Package size={24} className="text-blue-600" />
            PO Receipt Tracker
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track receipt progress across dispatched purchase orders
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by PO number or vendor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as POStatus | 'all')}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="dispatched">Dispatched</option>
            <option value="partially_received">Partially Received</option>
            <option value="fully_received">Fully Received</option>
          </select>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center text-slate-500">
            <Loader2 size={20} className="animate-spin mr-2" />
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Package size={32} className="mx-auto mb-2 text-slate-300" />
            <p>No purchase orders found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filtered.map((po) => (
              <div key={po.id}>
                <button
                  onClick={() => toggleExpand(po.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition text-left"
                >
                  {expanded === po.id ? (
                    <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight size={18} className="text-slate-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-4 items-center">
                    <div>
                      <div className="font-medium text-slate-900 truncate">{po.po_number}</div>
                      <div className="text-xs text-slate-500">{po.po_date}</div>
                    </div>
                    <div className="text-sm text-slate-700 truncate">{po.vendor_name}</div>
                    <div className="text-sm text-slate-600">
                      Total: {Number(po.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[po.status]}`}>
                        {STATUS_LABELS[po.status]}
                      </span>
                    </div>
                  </div>
                </button>

                {expanded === po.id && (
                  <div className="bg-slate-50 px-4 py-4 border-t border-slate-200">
                    {loadingDetails === po.id ? (
                      <div className="flex items-center justify-center py-4 text-slate-500">
                        <Loader2 size={18} className="animate-spin mr-2" />
                        Loading items...
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                              <th className="pb-2 pr-3 font-medium">Description</th>
                              <th className="pb-2 px-3 font-medium">UOM</th>
                              <th className="pb-2 px-3 font-medium text-right">Ordered</th>
                              <th className="pb-2 px-3 font-medium text-right">Received</th>
                              <th className="pb-2 px-3 font-medium text-right">Accepted</th>
                              <th className="pb-2 pl-3 font-medium text-right">Remaining</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(itemRowsByPO[po.id] || []).map((row) => (
                              <tr key={row.po_item_id} className="border-b border-slate-100 last:border-0">
                                <td className="py-2 pr-3 text-slate-800">{row.description}</td>
                                <td className="py-2 px-3 text-slate-600">{row.uom}</td>
                                <td className="py-2 px-3 text-right text-slate-700">{row.ordered.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-slate-700">{row.received.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-slate-700">{row.accepted.toFixed(2)}</td>
                                <td className={`py-2 pl-3 text-right font-medium ${row.remaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                  {row.remaining.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
