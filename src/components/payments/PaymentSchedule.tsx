import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckVoucher } from './CheckVoucher';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Wallet,
  ArrowRight,
  Search,
  RefreshCw,
  CheckSquare,
  Square,
} from 'lucide-react';

interface ScheduleRow {
  id: string;
  apv_id: string;
  apv_number: string;
  vendor_id: string | null;
  vendor_name: string;
  due_date: string | null;
  net_payable: number;
  payment_batch: string;
  status: string;
  invoice_number: string | null;
  po_number: string | null;
}

function fmt(n: number): string {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysUntil(date: string | null): number {
  if (!date) return 9999;
  const d = new Date(date);
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

type Bucket = 'overdue' | 'this_week' | 'next_week' | 'this_month' | 'future';

function bucketize(date: string | null): Bucket {
  const d = daysUntil(date);
  if (d < 0) return 'overdue';
  if (d <= 7) return 'this_week';
  if (d <= 14) return 'next_week';
  if (d <= 30) return 'this_month';
  return 'future';
}

const BUCKET_META: Record<Bucket, { label: string; color: string; icon: any }> = {
  overdue: { label: 'Overdue', color: 'text-red-700 bg-red-50 border-red-200', icon: AlertTriangle },
  this_week: { label: 'Due This Week', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: CalendarClock },
  next_week: { label: 'Due Next Week', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: CalendarDays },
  this_month: { label: 'Due This Month', color: 'text-teal-700 bg-teal-50 border-teal-200', icon: CalendarRange },
  future: { label: 'Future', color: 'text-slate-700 bg-slate-50 border-slate-200', icon: Wallet },
};

export function PaymentSchedule() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCv, setShowCv] = useState(false);
  const [cvApvIds, setCvApvIds] = useState<string[]>([]);

  const isTreasury = profile?.role === 'admin' || profile?.role === 'treasury' || profile?.role === 'finance' || profile?.role === 'accounting';

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_schedule')
        .select(`
          id, apv_id, due_date, net_payable, payment_batch, status,
          ap_vouchers!inner (
            apv_number, vendor_id, vendor_name, invoice_number, po_number, status
          )
        `)
        .in('status', ['scheduled', 'on_hold'])
        .order('due_date', { ascending: true });
      if (error) throw error;
      const mapped: ScheduleRow[] = (data || []).map((r: any) => ({
        id: r.id,
        apv_id: r.apv_id,
        apv_number: r.ap_vouchers?.apv_number || '',
        vendor_id: r.ap_vouchers?.vendor_id || null,
        vendor_name: r.ap_vouchers?.vendor_name || '',
        due_date: r.due_date,
        net_payable: Number(r.net_payable || 0),
        payment_batch: r.payment_batch,
        status: r.status,
        invoice_number: r.ap_vouchers?.invoice_number || null,
        po_number: r.ap_vouchers?.po_number || null,
      })).filter((r: any) => r.apv_number);
      setRows(mapped);
    } catch (e) {
      console.error('Load schedule error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let out = rows;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((r) =>
        r.apv_number.toLowerCase().includes(q) ||
        r.vendor_name.toLowerCase().includes(q) ||
        (r.invoice_number || '').toLowerCase().includes(q) ||
        (r.po_number || '').toLowerCase().includes(q)
      );
    }
    if (vendorFilter) {
      out = out.filter((r) => r.vendor_name === vendorFilter);
    }
    return out;
  }, [rows, search, vendorFilter]);

  const grouped = useMemo(() => {
    const g: Record<Bucket, ScheduleRow[]> = {
      overdue: [], this_week: [], next_week: [], this_month: [], future: [],
    };
    filtered.forEach((r) => g[bucketize(r.due_date)].push(r));
    return g;
  }, [filtered]);

  const summary = useMemo(() => {
    const sum = (arr: ScheduleRow[]) => arr.reduce((a, b) => a + b.net_payable, 0);
    return {
      total: sum(filtered),
      overdue: sum(grouped.overdue),
      thisWeek: sum(grouped.this_week),
      thisMonth: sum(grouped.this_month) + sum(grouped.this_week) + sum(grouped.next_week),
      countOverdue: grouped.overdue.length,
    };
  }, [filtered, grouped]);

  const vendors = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.vendor_name && set.add(r.vendor_name));
    return Array.from(set).sort();
  }, [rows]);

  const toggleSelect = (apvId: string) => {
    const ns = new Set(selected);
    ns.has(apvId) ? ns.delete(apvId) : ns.add(apvId);
    setSelected(ns);
  };

  const selectedRows = filtered.filter((r) => selected.has(r.apv_id));
  const selectedVendors = new Set(selectedRows.map((r) => r.vendor_id));
  const selectedTotal = selectedRows.reduce((a, b) => a + b.net_payable, 0);
  const canBatch = selectedRows.length > 0 && selectedVendors.size === 1;

  const handleCreateCv = () => {
    if (!canBatch) return;
    setCvApvIds(Array.from(selected));
    setShowCv(true);
  };

  const onCvDone = () => {
    setShowCv(false);
    setSelected(new Set());
    setCvApvIds([]);
    load();
  };

  if (showCv) {
    return <CheckVoucher initialApvIds={cvApvIds} onBack={onCvDone} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payment Schedule</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Approved AP Vouchers awaiting payment release
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total Payable" value={`PHP ${fmt(summary.total)}`} icon={Wallet} tone="text-slate-900 bg-white" />
        <SummaryCard label={`Overdue (${summary.countOverdue})`} value={`PHP ${fmt(summary.overdue)}`} icon={AlertTriangle} tone="text-red-700 bg-red-50" />
        <SummaryCard label="Due This Week" value={`PHP ${fmt(summary.thisWeek)}`} icon={CalendarClock} tone="text-amber-700 bg-amber-50" />
        <SummaryCard label="Due This Month" value={`PHP ${fmt(summary.thisMonth)}`} icon={CalendarRange} tone="text-teal-700 bg-teal-50" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search APV / vendor / invoice / PO"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
        >
          <option value="">All vendors</option>
          {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <div className="ml-auto flex items-center gap-3">
          {selected.size > 0 && (
            <span className="text-sm text-slate-600">
              {selected.size} selected · PHP {fmt(selectedTotal)}
            </span>
          )}
          {isTreasury && (
            <button
              disabled={!canBatch}
              onClick={handleCreateCv}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
              title={!canBatch ? 'Select APVs from one vendor only' : ''}
            >
              Create Check Voucher <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {selected.size > 0 && selectedVendors.size > 1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          A Check Voucher can only batch APVs from a single vendor. You currently have {selectedVendors.size} vendors selected.
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">Loading payment schedule...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">No items in payment schedule.</div>
      ) : (
        (Object.keys(grouped) as Bucket[]).map((b) => {
          const items = grouped[b];
          if (items.length === 0) return null;
          const meta = BUCKET_META[b];
          const Icon = meta.icon;
          const total = items.reduce((a, c) => a + c.net_payable, 0);
          return (
            <div key={b} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className={`flex items-center justify-between px-4 py-3 border-b border-slate-200 ${meta.color}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <Icon size={16} />
                  {meta.label}
                  <span className="text-xs font-normal opacity-75">({items.length})</span>
                </div>
                <div className="text-sm font-semibold">PHP {fmt(total)}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2 w-10"></th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">APV</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Vendor</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Invoice</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">PO</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Due Date</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">Net Payable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => {
                      const checked = selected.has(r.apv_id);
                      const sameVendor = selectedVendors.size === 0 || (selectedVendors.size === 1 && selectedVendors.has(r.vendor_id));
                      return (
                        <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <button
                              onClick={() => toggleSelect(r.apv_id)}
                              disabled={!sameVendor && !checked}
                              className="text-blue-600 disabled:text-slate-300 disabled:cursor-not-allowed"
                              title={!sameVendor && !checked ? 'Different vendor' : ''}
                            >
                              {checked ? <CheckSquare size={18} /> : <Square size={18} />}
                            </button>
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-900">{r.apv_number}</td>
                          <td className="px-3 py-2 text-slate-700">{r.vendor_name}</td>
                          <td className="px-3 py-2 text-slate-600">{r.invoice_number || '-'}</td>
                          <td className="px-3 py-2 text-slate-600">{r.po_number || '-'}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {r.due_date || '-'}
                            {b === 'overdue' && r.due_date && (
                              <span className="ml-2 text-xs text-red-600 font-semibold">
                                {Math.abs(daysUntil(r.due_date))}d late
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">{fmt(r.net_payable)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: string }) {
  return (
    <div className={`border border-slate-200 rounded-xl p-4 ${tone}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-75">{label}</span>
        <Icon size={16} />
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
