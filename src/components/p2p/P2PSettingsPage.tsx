import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { loadSettings, upsertSettings, P2PSettings } from '../../lib/p2pDownstream';
import { Settings as SettingsIcon, Save, Loader2, Lock } from 'lucide-react';

export function P2PSettingsPage() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<P2PSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      if (s) setSettings(s);
      else setSettings({
        id: '',
        price_tolerance_percent: 0,
        price_tolerance_amount: 0,
        quantity_rule_strict: true,
        allow_over_receiving: false,
        over_receiving_threshold_percent: 0,
        require_grn_before_invoice: true,
        prevent_duplicate_invoice: true,
        require_proof_on_payment: true,
      });
    })();
  }, []);

  const isAdmin = profile?.role === 'admin';

  if (!profile) return null;

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <Lock size={32} className="mx-auto text-slate-400 mb-2" />
        <h2 className="text-lg font-semibold text-slate-900">Admin only</h2>
        <p className="text-sm text-slate-600">P2P Settings can be modified by administrators only.</p>
      </div>
    );
  }

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await upsertSettings({
        price_tolerance_percent: settings.price_tolerance_percent,
        price_tolerance_amount: settings.price_tolerance_amount,
        quantity_rule_strict: settings.quantity_rule_strict,
        allow_over_receiving: settings.allow_over_receiving,
        over_receiving_threshold_percent: settings.over_receiving_threshold_percent,
        require_grn_before_invoice: settings.require_grn_before_invoice,
        prevent_duplicate_invoice: settings.prevent_duplicate_invoice,
        require_proof_on_payment: settings.require_proof_on_payment,
      });
      if (updated) setSettings(updated);
      setMessage({ type: 'success', text: 'Settings saved.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="p-12"><Loader2 className="animate-spin" /></div>;

  const update = <K extends keyof P2PSettings>(k: K, v: P2PSettings[K]) => setSettings({ ...settings, [k]: v });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <SettingsIcon className="text-blue-600" /> P2P Settings
        </h2>
        <p className="text-slate-600 mt-1 text-sm">Configure tolerance and matching rules for Receiving, Invoicing and Payments.</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm border ${message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <h3 className="font-bold text-slate-800">Matching Tolerances</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Price Tolerance (%)</label>
            <input type="number" step="0.01" value={settings.price_tolerance_percent} onChange={(e) => update('price_tolerance_percent', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Price Tolerance (Amount)</label>
            <input type="number" step="0.01" value={settings.price_tolerance_amount} onChange={(e) => update('price_tolerance_amount', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-3">
        <h3 className="font-bold text-slate-800">Receiving & Invoice Rules</h3>
        <Toggle label="Strict Quantity Rule (invoice qty ≤ total received)" value={settings.quantity_rule_strict} onChange={(v) => update('quantity_rule_strict', v)} />
        <Toggle label="Allow Over-Receiving" value={settings.allow_over_receiving} onChange={(v) => update('allow_over_receiving', v)} />
        {settings.allow_over_receiving && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Over-Receiving Threshold (%)</label>
            <input type="number" step="0.01" value={settings.over_receiving_threshold_percent} onChange={(e) => update('over_receiving_threshold_percent', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm max-w-xs" />
          </div>
        )}
        <Toggle label="Require GRN Before Invoice" value={settings.require_grn_before_invoice} onChange={(v) => update('require_grn_before_invoice', v)} />
        <Toggle label="Prevent Duplicate Invoices (supplier + invoice no.)" value={settings.prevent_duplicate_invoice} onChange={(v) => update('prevent_duplicate_invoice', v)} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-3">
        <h3 className="font-bold text-slate-800">Payments</h3>
        <Toggle label="Require Proof of Payment" value={settings.require_proof_on_payment} onChange={(v) => update('require_proof_on_payment', v)} />
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save Settings
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${value ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </label>
  );
}
