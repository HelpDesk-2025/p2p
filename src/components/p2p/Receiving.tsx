import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  CanvassOption,
  PoLineComputed,
  loadApprovedCanvassOptions,
  loadPoLinesComputed,
  loadSettings,
  nextGrnNumber,
  recomputeCanvassStatuses,
  writeAudit,
  formatDate,
  formatMoney,
  statusBadgeClasses,
  GrnStatus,
  P2PSettings,
} from '../../lib/p2pDownstream';
import {
  Plus,
  X,
  Package,
  Save,
  Send,
  Loader2,
  Eye,
  ClipboardList,
  Search,
} from 'lucide-react';

interface GrnHeader {
  id: string;
  grn_number: string;
  canvass_request_id: string;
  supplier_name?: string;
  received_date: string;
  delivery_receipt_no: string;
  remarks?: string;
  status: GrnStatus;
  created_at: string;
  canvass_requests?: { canvass_number: string; winning_vendor_number?: string };
}

interface DraftLine {
  po_line_id: string;
  qty_received: number;
  condition_status: 'Passed' | 'Failed';
  remarks: string;
  serial_or_batch: string;
}

export function Receiving() {
  const { profile } = useAuth();
  const [list, setList] = useState<GrnHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<GrnHeader | null>(null);
  const [detailLines, setDetailLines] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterText, setFilterText] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('goods_receipts')
      .select('*, canvass_requests(canvass_number, winning_vendor_number)')
      .order('created_at', { ascending: false });
    setList((data || []) as GrnHeader[]);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return list.filter((g) => {
      if (filterStatus && g.status !== filterStatus) return false;
      if (filterText) {
        const t = filterText.toLowerCase();
        const hay = [
          g.grn_number,
          g.delivery_receipt_no,
          g.supplier_name || '',
          g.canvass_requests?.canvass_number || '',
        ].join(' ').toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [list, filterStatus, filterText]);

  const openDetail = async (g: GrnHeader) => {
    setDetail(g);
    const { data } = await supabase
      .from('goods_receipt_lines')
      .select('*, canvass_request_po_lines(item_description, uom, qty_ordered, unit_price)')
      .eq('grn_id', g.id);
    setDetailLines(data || []);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="text-blue-600" /> Receiving (GRN)
          </h2>
          <p className="text-slate-600 mt-1 text-sm">Record deliveries against approved canvass / PO.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={!profile}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-semibold shadow-sm"
        >
          <Plus size={18} /> New GRN
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search GRN, DR, PO, supplier..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Statuses</option>
          {['Draft', 'Submitted', 'Partial', 'Complete', 'Cancelled'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500"><Loader2 className="animate-spin inline" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <ClipboardList size={40} className="mx-auto text-slate-300 mb-2" />
            No GRNs yet
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['GRN No.', 'PO / Canvass', 'Supplier', 'DR No.', 'Received', 'Status', 'Action'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-sm">{g.grn_number}</td>
                    <td className="px-4 py-3 text-sm">{g.canvass_requests?.canvass_number || '\u2014'}</td>
                    <td className="px-4 py-3 text-sm">{g.supplier_name || g.canvass_requests?.winning_vendor_number || '\u2014'}</td>
                    <td className="px-4 py-3 text-sm">{g.delivery_receipt_no}</td>
                    <td className="px-4 py-3 text-sm">{formatDate(g.received_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${statusBadgeClasses(g.status)}`}>
                        {g.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openDetail(g)} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <GrnForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      {detail && (
        <GrnDetailModal
          grn={detail}
          lines={detailLines}
          onClose={() => { setDetail(null); setDetailLines([]); }}
        />
      )}
    </div>
  );
}

function GrnForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [options, setOptions] = useState<CanvassOption[]>([]);
  const [selectedCr, setSelectedCr] = useState<string>('');
  const [poLines, setPoLines] = useState<PoLineComputed[]>([]);
  const [drNo, setDrNo] = useState('');
  const [receivedDate, setReceivedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<Record<string, DraftLine>>({});
  const [settings, setSettings] = useState<P2PSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setOptions(await loadApprovedCanvassOptions());
      setSettings(await loadSettings());
    })();
  }, []);

  useEffect(() => {
    if (!selectedCr) { setPoLines([]); return; }
    (async () => {
      const ls = await loadPoLinesComputed(selectedCr);
      setPoLines(ls);
      const draft: Record<string, DraftLine> = {};
      ls.forEach((l) => {
        draft[l.id] = { po_line_id: l.id, qty_received: 0, condition_status: 'Passed', remarks: '', serial_or_batch: '' };
      });
      setLines(draft);
    })();
  }, [selectedCr]);

  const updateLine = (id: string, patch: Partial<DraftLine>) => {
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const validate = (): string | null => {
    if (!selectedCr) return 'Select a PO / Canvass.';
    if (!drNo.trim()) return 'Delivery Receipt No. is required.';
    const anyQty = poLines.some((l) => (lines[l.id]?.qty_received || 0) > 0);
    if (!anyQty) return 'Enter at least one received quantity.';
    if (settings?.quantity_rule_strict && !settings?.allow_over_receiving) {
      for (const l of poLines) {
        const q = Number(lines[l.id]?.qty_received || 0);
        if (q > l.remaining_to_receive) {
          return `Line ${l.line_no}: qty received (${q}) exceeds remaining (${l.remaining_to_receive}).`;
        }
      }
    }
    return null;
  };

  const save = async (submit: boolean) => {
    setError('');
    if (submit) {
      const err = validate();
      if (err) { setError(err); return; }
    } else if (!selectedCr) {
      setError('Select a PO / Canvass.');
      return;
    }
    setSaving(true);
    try {
      const grnNumber = await nextGrnNumber();
      const chosen = options.find((o) => o.id === selectedCr);

      const totalRemaining = poLines.reduce((s, l) => s + l.remaining_to_receive, 0);
      const totalReceiving = poLines.reduce((s, l) => s + Number(lines[l.id]?.qty_received || 0), 0);
      let status: GrnStatus = 'Draft';
      if (submit) {
        status = totalReceiving >= totalRemaining ? 'Complete' : 'Partial';
      }

      const { data: grn, error: gErr } = await supabase
        .from('goods_receipts')
        .insert({
          grn_number: grnNumber,
          canvass_request_id: selectedCr,
          supplier_id: chosen?.winning_vendor_number ?? null,
          supplier_name: chosen?.winning_vendor_number ?? null,
          received_date: receivedDate,
          received_by_user_id: profile?.id ?? null,
          delivery_receipt_no: drNo.trim(),
          remarks,
          status,
          created_by: profile?.id ?? null,
        })
        .select()
        .maybeSingle();
      if (gErr) throw gErr;
      if (!grn) throw new Error('GRN insert failed');

      const lineRows = poLines
        .map((l) => lines[l.id])
        .filter((d) => d && Number(d.qty_received) > 0)
        .map((d) => ({ ...d, grn_id: grn.id }));
      if (lineRows.length > 0) {
        const { error: lErr } = await supabase.from('goods_receipt_lines').insert(lineRows);
        if (lErr) throw lErr;
      }

      await writeAudit('GRN', grn.id, submit ? 'Submitted' : 'Created', '', status, submit ? 'GRN submitted' : 'GRN saved as draft');
      if (submit) await recomputeCanvassStatuses(selectedCr);
      onSaved();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save GRN');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-xl font-bold text-slate-900">New GRN</h3>
            <p className="text-sm text-slate-500">Record goods receipt against an approved PO</p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-sm">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">PO / Canvass</label>
              <select
                value={selectedCr}
                onChange={(e) => setSelectedCr(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">Select approved canvass...</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.canvass_number} {o.winning_vendor_number ? `- ${o.winning_vendor_number}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Received Date</label>
              <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Delivery Receipt No. <span className="text-rose-500">*</span></label>
              <input value={drNo} onChange={(e) => setDrNo(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Remarks</label>
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          </div>

          {selectedCr && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    {['#', 'Item', 'UOM', 'Qty Ordered', 'Received', 'Remaining', 'Receive Now', 'Condition', 'Batch'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {poLines.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{l.line_no}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{l.item_description}</div>
                        {l.specifications && <div className="text-xs text-slate-500">{l.specifications}</div>}
                      </td>
                      <td className="px-3 py-2">{l.uom || '\u2014'}</td>
                      <td className="px-3 py-2">{l.qty_ordered}</td>
                      <td className="px-3 py-2">{l.total_received}</td>
                      <td className="px-3 py-2 font-semibold text-blue-700">{l.remaining_to_receive}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.0001"
                          min={0}
                          value={lines[l.id]?.qty_received ?? 0}
                          onChange={(e) => updateLine(l.id, { qty_received: Number(e.target.value) })}
                          className="w-24 px-2 py-1 border border-slate-300 rounded text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={lines[l.id]?.condition_status || 'Passed'}
                          onChange={(e) => updateLine(l.id, { condition_status: e.target.value as 'Passed' | 'Failed' })}
                          className="px-2 py-1 border border-slate-300 rounded text-sm bg-white"
                        >
                          <option>Passed</option>
                          <option>Failed</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={lines[l.id]?.serial_or_batch || ''}
                          onChange={(e) => updateLine(l.id, { serial_or_batch: e.target.value })}
                          className="w-28 px-2 py-1 border border-slate-300 rounded text-sm"
                          placeholder="Optional"
                        />
                      </td>
                    </tr>
                  ))}
                  {poLines.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-500">No PO lines for this canvass.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save Draft
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} Submit GRN
          </button>
        </div>
      </div>
    </div>
  );
}

function GrnDetailModal({ grn, lines, onClose }: { grn: GrnHeader; lines: any[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-xl font-bold text-slate-900">{grn.grn_number}</h3>
            <p className="text-sm text-slate-500">{grn.canvass_requests?.canvass_number} &middot; DR {grn.delivery_receipt_no}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-500">Status:</span> <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${statusBadgeClasses(grn.status)}`}>{grn.status}</span></div>
            <div><span className="text-slate-500">Received:</span> {formatDate(grn.received_date)}</div>
            <div className="col-span-2"><span className="text-slate-500">Remarks:</span> {grn.remarks || '\u2014'}</div>
          </div>
          <table className="w-full text-sm border border-slate-200 rounded">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">UOM</th>
                <th className="px-3 py-2 text-left">Qty Received</th>
                <th className="px-3 py-2 text-left">Condition</th>
                <th className="px-3 py-2 text-left">Batch/Serial</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-3 py-2">{l.canvass_request_po_lines?.item_description}</td>
                  <td className="px-3 py-2">{l.canvass_request_po_lines?.uom || '\u2014'}</td>
                  <td className="px-3 py-2">{l.qty_received}</td>
                  <td className="px-3 py-2">{l.condition_status}</td>
                  <td className="px-3 py-2">{l.serial_or_batch || '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
