import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { BarChart3, Clock, Users, Receipt, Download, RefreshCw } from 'lucide-react';

type Tab = 'aging' | 'vendor' | 'summary' | 'ewt';

function fmt(n: number): string {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysUntil(date: string | null): number {
  if (!date) return 0;
  const d = new Date(date);
  const now = new Date();
  d.setHours(0, 0, 0, 0); now.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - now.getTime()) / 86400000);
}

function csvDownload(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function PaymentReports() {
  const [tab, setTab] = useState<Tab>('aging');
  const [loading, setLoading] = useState(true);
  const [apvs, setApvs] = useState<any[]>([]);
  const [cvs, setCvs] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        supabase.from('ap_vouchers').select('id, apv_number, vendor_name, vendor_tin, due_date, posting_date, invoice_amount, vat_amount, ewt_amount, ewt_rate, net_payable, status, invoice_number, po_number'),
        supabase.from('check_vouchers').select('id, cv_number, payee_name, payment_date, total_amount, status, payment_method, payment_status, check_date, created_at'),
      ]);
      setApvs(a.data || []);
      setCvs(c.data || []);
    } catch (e) {
      console.error('Reports load:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payment Reports</h1>
          <p className="text-sm text-slate-600 mt-0.5">Aging, vendor history, summary, and EWT breakdowns</p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          <TabButton active={tab === 'aging'} onClick={() => setTab('aging')} icon={Clock} label="Aging" />
          <TabButton active={tab === 'vendor'} onClick={() => setTab('vendor')} icon={Users} label="Vendor History" />
          <TabButton active={tab === 'summary'} onClick={() => setTab('summary')} icon={BarChart3} label="Payment Summary" />
          <TabButton active={tab === 'ewt'} onClick={() => setTab('ewt')} icon={Receipt} label="EWT Summary" />
        </div>

        <div className="p-4">
          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading...</div>
          ) : tab === 'aging' ? (
            <AgingReport apvs={apvs} />
          ) : tab === 'vendor' ? (
            <VendorHistory apvs={apvs} cvs={cvs} />
          ) : tab === 'summary' ? (
            <PaymentSummary cvs={cvs} />
          ) : (
            <EwtSummary apvs={apvs} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
        active ? 'border-blue-600 text-blue-700 bg-blue-50' : 'border-transparent text-slate-600 hover:text-slate-900'
      }`}
    >
      <Icon size={16} /> {label}
    </button>
  );
}

function AgingReport({ apvs }: { apvs: any[] }) {
  const data = useMemo(() => {
    const open = apvs.filter((a) => ['approved', 'pending_approval'].includes(a.status));
    const buckets = {
      current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b90plus: 0,
    };
    const rows: any[] = [];
    open.forEach((a) => {
      const d = -daysUntil(a.due_date);
      const bucket = d <= 0 ? 'current' : d <= 30 ? 'b1_30' : d <= 60 ? 'b31_60' : d <= 90 ? 'b61_90' : 'b90plus';
      buckets[bucket] += Number(a.net_payable || 0);
      rows.push({ ...a, days_overdue: d > 0 ? d : 0, bucket });
    });
    return { buckets, rows };
  }, [apvs]);

  const total = Object.values(data.buckets).reduce((a, b) => a + b, 0);

  const exportCsv = () => {
    const rows: any[] = [['APV', 'Vendor', 'Invoice', 'Due Date', 'Days Overdue', 'Bucket', 'Net Payable']];
    data.rows.forEach((r) => rows.push([r.apv_number, r.vendor_name, r.invoice_number || '', r.due_date || '', r.days_overdue, r.bucket, r.net_payable]));
    csvDownload('aging_report.csv', rows);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Current" value={data.buckets.current} />
        <Stat label="1-30 days" value={data.buckets.b1_30} tone="amber" />
        <Stat label="31-60 days" value={data.buckets.b31_60} tone="orange" />
        <Stat label="61-90 days" value={data.buckets.b61_90} tone="red" />
        <Stat label="90+ days" value={data.buckets.b90plus} tone="red" />
      </div>
      <div className="text-sm text-slate-600">Total open payables: <span className="font-semibold text-slate-900">PHP {fmt(total)}</span></div>
      <div className="flex justify-end">
        <button onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
          <Download size={14} /> Export CSV
        </button>
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <Th>APV</Th><Th>Vendor</Th><Th>Invoice</Th><Th>Due Date</Th><Th align="right">Days</Th><Th align="right">Net Payable</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                <Td>{r.apv_number}</Td>
                <Td>{r.vendor_name}</Td>
                <Td>{r.invoice_number || '-'}</Td>
                <Td>{r.due_date || '-'}</Td>
                <Td align="right" className={r.days_overdue > 0 ? 'text-red-600 font-semibold' : ''}>{r.days_overdue}</Td>
                <Td align="right">{fmt(r.net_payable)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VendorHistory({ apvs, cvs }: { apvs: any[]; cvs: any[] }) {
  const grouped = useMemo(() => {
    const byVendor: Record<string, { vendor: string; total_billed: number; total_paid: number; outstanding: number; apv_count: number; last_payment: string | null }> = {};
    apvs.forEach((a) => {
      const k = a.vendor_name || '(unknown)';
      if (!byVendor[k]) byVendor[k] = { vendor: k, total_billed: 0, total_paid: 0, outstanding: 0, apv_count: 0, last_payment: null };
      byVendor[k].total_billed += Number(a.invoice_amount || 0);
      byVendor[k].apv_count += 1;
      if (a.status === 'paid') byVendor[k].total_paid += Number(a.net_payable || 0);
      else if (['approved', 'pending_approval'].includes(a.status)) byVendor[k].outstanding += Number(a.net_payable || 0);
    });
    cvs.filter((c) => c.payment_status === 'cleared' || c.status === 'completed').forEach((c) => {
      const k = c.payee_name;
      if (byVendor[k]) {
        const d = c.payment_date || c.check_date || c.created_at;
        if (!byVendor[k].last_payment || (d && d > byVendor[k].last_payment!)) byVendor[k].last_payment = d;
      }
    });
    return Object.values(byVendor).sort((a, b) => b.total_billed - a.total_billed);
  }, [apvs, cvs]);

  const exportCsv = () => {
    const rows: any[] = [['Vendor', 'APV Count', 'Total Billed', 'Total Paid', 'Outstanding', 'Last Payment']];
    grouped.forEach((g) => rows.push([g.vendor, g.apv_count, g.total_billed, g.total_paid, g.outstanding, g.last_payment || '']));
    csvDownload('vendor_history.csv', rows);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
          <Download size={14} /> Export CSV
        </button>
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <Th>Vendor</Th><Th align="right">APVs</Th><Th align="right">Billed</Th><Th align="right">Paid</Th><Th align="right">Outstanding</Th><Th>Last Payment</Th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => (
              <tr key={g.vendor} className="border-b border-slate-100 hover:bg-slate-50">
                <Td>{g.vendor}</Td>
                <Td align="right">{g.apv_count}</Td>
                <Td align="right">{fmt(g.total_billed)}</Td>
                <Td align="right" className="text-emerald-700">{fmt(g.total_paid)}</Td>
                <Td align="right" className={g.outstanding > 0 ? 'text-amber-700 font-semibold' : ''}>{fmt(g.outstanding)}</Td>
                <Td>{g.last_payment ? String(g.last_payment).slice(0, 10) : '-'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentSummary({ cvs }: { cvs: any[] }) {
  const data = useMemo(() => {
    const byMonth: Record<string, { month: string; count: number; total: number; check: number; transfer: number }> = {};
    cvs.filter((c) => c.payment_status === 'cleared' || c.payment_status === 'released' || c.status === 'completed').forEach((c) => {
      const d = c.payment_date || c.created_at;
      if (!d) return;
      const m = String(d).slice(0, 7);
      if (!byMonth[m]) byMonth[m] = { month: m, count: 0, total: 0, check: 0, transfer: 0 };
      byMonth[m].count += 1;
      byMonth[m].total += Number(c.total_amount || 0);
      if (c.payment_method === 'check') byMonth[m].check += Number(c.total_amount || 0);
      else byMonth[m].transfer += Number(c.total_amount || 0);
    });
    return Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month));
  }, [cvs]);

  const totals = data.reduce((acc, r) => ({
    count: acc.count + r.count, total: acc.total + r.total, check: acc.check + r.check, transfer: acc.transfer + r.transfer,
  }), { count: 0, total: 0, check: 0, transfer: 0 });

  const exportCsv = () => {
    const rows: any[] = [['Month', 'CV Count', 'Total', 'Check', 'Bank Transfer/Other']];
    data.forEach((r) => rows.push([r.month, r.count, r.total, r.check, r.transfer]));
    csvDownload('payment_summary.csv', rows);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="CVs Issued" value={totals.count} format="num" />
        <Stat label="Total Paid" value={totals.total} />
        <Stat label="By Check" value={totals.check} />
        <Stat label="Other Methods" value={totals.transfer} />
      </div>
      <div className="flex justify-end">
        <button onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
          <Download size={14} /> Export CSV
        </button>
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <Th>Month</Th><Th align="right">CVs</Th><Th align="right">Total</Th><Th align="right">Check</Th><Th align="right">Bank Transfer</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.month} className="border-b border-slate-100 hover:bg-slate-50">
                <Td>{r.month}</Td>
                <Td align="right">{r.count}</Td>
                <Td align="right" className="font-semibold">{fmt(r.total)}</Td>
                <Td align="right">{fmt(r.check)}</Td>
                <Td align="right">{fmt(r.transfer)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EwtSummary({ apvs }: { apvs: any[] }) {
  const grouped = useMemo(() => {
    const byVendor: Record<string, { vendor: string; tin: string; ewt_rate: number; gross: number; ewt: number; vat: number; count: number }> = {};
    apvs.filter((a) => a.status === 'paid' || a.status === 'approved').forEach((a) => {
      const k = `${a.vendor_name}|${a.ewt_rate || 0}`;
      if (!byVendor[k]) byVendor[k] = { vendor: a.vendor_name || '', tin: a.vendor_tin || '', ewt_rate: Number(a.ewt_rate || 0), gross: 0, ewt: 0, vat: 0, count: 0 };
      byVendor[k].gross += Number(a.invoice_amount || 0);
      byVendor[k].ewt += Number(a.ewt_amount || 0);
      byVendor[k].vat += Number(a.vat_amount || 0);
      byVendor[k].count += 1;
    });
    return Object.values(byVendor).sort((a, b) => b.ewt - a.ewt);
  }, [apvs]);

  const totals = grouped.reduce((acc, r) => ({
    gross: acc.gross + r.gross, ewt: acc.ewt + r.ewt, vat: acc.vat + r.vat,
  }), { gross: 0, ewt: 0, vat: 0 });

  const exportCsv = () => {
    const rows: any[] = [['Vendor', 'TIN', 'EWT Rate', 'APV Count', 'Gross', 'VAT', 'EWT Withheld']];
    grouped.forEach((r) => rows.push([r.vendor, r.tin, `${r.ewt_rate}%`, r.count, r.gross, r.vat, r.ewt]));
    csvDownload('ewt_summary.csv', rows);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Total Gross" value={totals.gross} />
        <Stat label="Total VAT" value={totals.vat} />
        <Stat label="Total EWT Withheld" value={totals.ewt} tone="amber" />
      </div>
      <div className="flex justify-end">
        <button onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
          <Download size={14} /> Export CSV (BIR 2307 prep)
        </button>
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <Th>Vendor</Th><Th>TIN</Th><Th align="right">EWT %</Th><Th align="right">APVs</Th><Th align="right">Gross</Th><Th align="right">VAT</Th><Th align="right">EWT</Th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((r, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                <Td>{r.vendor}</Td>
                <Td>{r.tin || '-'}</Td>
                <Td align="right">{r.ewt_rate}%</Td>
                <Td align="right">{r.count}</Td>
                <Td align="right">{fmt(r.gross)}</Td>
                <Td align="right">{fmt(r.vat)}</Td>
                <Td align="right" className="font-semibold text-amber-700">{fmt(r.ewt)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'slate', format = 'money' }: { label: string; value: number; tone?: string; format?: 'money' | 'num' }) {
  const toneClass: Record<string, string> = {
    slate: 'text-slate-900 bg-white border-slate-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    orange: 'text-orange-700 bg-orange-50 border-orange-200',
    red: 'text-red-700 bg-red-50 border-red-200',
  };
  return (
    <div className={`border rounded-lg p-3 ${toneClass[tone] || toneClass.slate}`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-75 mb-1">{label}</div>
      <div className="text-lg font-bold">{format === 'num' ? value : `PHP ${fmt(value)}`}</div>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: any; align?: 'left' | 'right' }) {
  return <th className={`px-3 py-2 font-medium text-slate-600 text-${align}`}>{children}</th>;
}
function Td({ children, align = 'left', className = '' }: { children: any; align?: 'left' | 'right'; className?: string }) {
  return <td className={`px-3 py-2 text-${align} ${className}`}>{children}</td>;
}
