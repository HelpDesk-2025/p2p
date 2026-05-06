import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { generateMsbcApiDocPdf, downloadBytesAsPdf } from '../../lib/msbcApiDocGenerator';
import {
  Plus,
  Save,
  X,
  Trash2,
  CreditCard as Edit,
  Eye,
  EyeOff,
  Globe,
  Key,
  CheckCircle,
  AlertCircle,
  Database,
  ArrowRightLeft,
  Copy,
  Code2,
  ChevronDown,
  ChevronUp,
  Terminal,
  Download,
  Upload,
  Table as TableIcon,
} from 'lucide-react';

type AuthType = 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
type Perspective = 'consuming' | 'providing';
type TabKey = 'integrations' | 'msbc';

interface ApiIntegration {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  auth_type: AuthType;
  api_key: string;
  username: string;
  password: string;
  client_id: string;
  client_secret: string;
  tenant_id: string;
  headers: Record<string, string>;
  notes: string;
  is_active: boolean;
  perspective: Perspective;
  action: string;
  role_type: string;
  direction: string;
  created_at?: string;
  updated_at?: string;
}

interface HeaderRow {
  key: string;
  value: string;
}

interface MsbcPosting {
  id: string;
  msbc_document_no: string;
  document_no: string;
  external_document_no: string;
  payment_type: string;
  date_posted: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

const PERSPECTIVE_PRESETS: Record<Perspective, { action: string[]; role_type: string[]; direction: string[] }> = {
  consuming: {
    action: ['Using', 'Calling'],
    role_type: ['Consumer'],
    direction: ['Pull (Request-Response)'],
  },
  providing: {
    action: ['Exposing', 'Providing', 'Serving'],
    role_type: ['Producer', 'Provider'],
    direction: ['Push (Webhook / Event-Driven)'],
  },
};

const EMPTY_INTEGRATION: ApiIntegration = {
  id: '',
  name: '',
  provider: '',
  base_url: '',
  auth_type: 'none',
  api_key: '',
  username: '',
  password: '',
  client_id: '',
  client_secret: '',
  tenant_id: '',
  headers: {},
  notes: '',
  is_active: true,
  perspective: 'consuming',
  action: 'Using',
  role_type: 'Consumer',
  direction: 'Pull (Request-Response)',
};

const PAYMENT_TYPES = ['Check', 'Cash', 'Wire Transfer', 'Bank Transfer', 'Credit Card', 'Other'];

const headersObjectToRows = (headers: Record<string, string> | null | undefined): HeaderRow[] => {
  if (!headers) return [];
  return Object.entries(headers).map(([key, value]) => ({ key, value: String(value ?? '') }));
};

const rowsToHeadersObject = (rows: HeaderRow[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    out[key] = row.value;
  }
  return out;
};

export function ApiIntegrationsConfig() {
  const [tab, setTab] = useState<TabKey>('integrations');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <Globe size={22} className="text-blue-600" />
          API Integration
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Configure external API endpoints and system-to-system data exchange.
        </p>
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setTab('integrations')}
            className={`py-3 border-b-2 text-sm font-medium transition ${
              tab === 'integrations'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Globe size={16} />
              Integrations
            </span>
          </button>
          <button
            onClick={() => setTab('msbc')}
            className={`py-3 border-b-2 text-sm font-medium transition ${
              tab === 'msbc'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <ArrowRightLeft size={16} />
              MSBC to P2P
            </span>
          </button>
        </nav>
      </div>

      {tab === 'integrations' ? <IntegrationsTab /> : <MsbcTab />}
    </div>
  );
}

function IntegrationsTab() {
  const [items, setItems] = useState<ApiIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ApiIntegration>(EMPTY_INTEGRATION);
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([]);
  const [revealSecrets, setRevealSecrets] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('api_integrations')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      setItems((data || []) as ApiIntegration[]);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load integrations' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setForm(EMPTY_INTEGRATION);
    setHeaderRows([]);
    setEditingId(null);
    setShowForm(true);
    setRevealSecrets(false);
  };

  const openEdit = (item: ApiIntegration) => {
    setForm({
      ...item,
      headers: item.headers || {},
      perspective: (item.perspective as Perspective) || 'consuming',
      action: item.action || '',
      role_type: item.role_type || '',
      direction: item.direction || '',
    });
    setHeaderRows(headersObjectToRows(item.headers));
    setEditingId(item.id);
    setShowForm(true);
    setRevealSecrets(false);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_INTEGRATION);
    setHeaderRows([]);
  };

  const addHeaderRow = () => setHeaderRows((prev) => [...prev, { key: '', value: '' }]);
  const updateHeaderRow = (index: number, field: keyof HeaderRow, value: string) =>
    setHeaderRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  const removeHeaderRow = (index: number) =>
    setHeaderRows((prev) => prev.filter((_, i) => i !== index));

  const save = async () => {
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'Name is required' });
      return;
    }
    const seenKeys = new Set<string>();
    for (const row of headerRows) {
      const key = row.key.trim();
      if (!key) continue;
      if (seenKeys.has(key)) {
        setMessage({ type: 'error', text: `Duplicate header key: ${key}` });
        return;
      }
      seenKeys.add(key);
    }
    const headers = rowsToHeadersObject(headerRows);

    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        name: form.name.trim(),
        provider: form.provider.trim(),
        base_url: form.base_url.trim(),
        auth_type: form.auth_type,
        api_key: form.api_key,
        username: form.username,
        password: form.password,
        client_id: form.client_id,
        client_secret: form.client_secret,
        tenant_id: form.tenant_id,
        headers,
        notes: form.notes,
        is_active: form.is_active,
        perspective: form.perspective,
        action: form.action,
        role_type: form.role_type,
        direction: form.direction,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase.from('api_integrations').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('api_integrations').insert(payload);
        if (error) throw error;
      }

      setMessage({ type: 'success', text: editingId ? 'Integration updated' : 'Integration added' });
      cancelForm();
      await load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this integration? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('api_integrations').delete().eq('id', id);
      if (error) throw error;
      await load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete' });
    }
  };

  const toggleActive = async (item: ApiIntegration) => {
    try {
      const { error } = await supabase
        .from('api_integrations')
        .update({ is_active: !item.is_active, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;
      await load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update' });
    }
  };

  const maskedValue = (v: string) => (v ? '•'.repeat(Math.min(v.length, 10)) : '—');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Integrations</h3>
          <p className="text-sm text-slate-600">External API endpoints and credentials used by the system.</p>
        </div>
        {!showForm && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={18} />
            Add Integration
          </button>
        )}
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.type === 'success' ? <CheckCircle size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              {editingId ? 'Edit Integration' : 'New Integration'}
            </h3>
            <button onClick={cancelForm} className="text-slate-500 hover:text-slate-700">
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="e.g., MSBC Production"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
              <input
                type="text"
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="e.g., Microsoft Business Central"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Base URL</label>
              <input
                type="url"
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="https://api.example.com/v1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Auth Type</label>
              <select
                value={form.auth_type}
                onChange={(e) => setForm({ ...form, auth_type: e.target.value as AuthType })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              >
                <option value="none">None</option>
                <option value="api_key">API Key</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="oauth2">OAuth 2.0</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tenant ID</label>
              <input
                type="text"
                value={form.tenant_id}
                onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
              <h4 className="text-sm font-semibold text-slate-900">Integration Perspective</h4>
              <p className="text-xs text-slate-600">Classify how this integration behaves in the system.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Perspective</th>
                    <th className="px-4 py-2 font-semibold text-slate-700">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="perspective"
                          value="consuming"
                          checked={form.perspective === 'consuming'}
                          onChange={() => {
                            const p = PERSPECTIVE_PRESETS.consuming;
                            setForm({
                              ...form,
                              perspective: 'consuming',
                              action: p.action[0],
                              role_type: p.role_type[0],
                              direction: p.direction[0],
                            });
                          }}
                        />
                        Consuming
                      </label>
                    </th>
                    <th className="px-4 py-2 font-semibold text-slate-700">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="perspective"
                          value="providing"
                          checked={form.perspective === 'providing'}
                          onChange={() => {
                            const p = PERSPECTIVE_PRESETS.providing;
                            setForm({
                              ...form,
                              perspective: 'providing',
                              action: p.action[0],
                              role_type: p.role_type[0],
                              direction: p.direction[0],
                            });
                          }}
                        />
                        Opposite
                      </label>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="px-4 py-3 font-semibold text-slate-800">Action</td>
                    <td className="px-4 py-3">
                      {form.perspective === 'consuming' ? (
                        <select
                          value={form.action}
                          onChange={(e) => setForm({ ...form, action: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-sm"
                        >
                          {PERSPECTIVE_PRESETS.consuming.action.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-400">Using / Calling</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {form.perspective === 'providing' ? (
                        <select
                          value={form.action}
                          onChange={(e) => setForm({ ...form, action: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-sm"
                        >
                          {PERSPECTIVE_PRESETS.providing.action.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-400">Exposing / Providing / Serving</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-semibold text-slate-800">Role</td>
                    <td className="px-4 py-3">
                      {form.perspective === 'consuming' ? (
                        <select
                          value={form.role_type}
                          onChange={(e) => setForm({ ...form, role_type: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-sm"
                        >
                          {PERSPECTIVE_PRESETS.consuming.role_type.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-400">Consumer</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {form.perspective === 'providing' ? (
                        <select
                          value={form.role_type}
                          onChange={(e) => setForm({ ...form, role_type: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-sm"
                        >
                          {PERSPECTIVE_PRESETS.providing.role_type.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-400">Producer / Provider</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-semibold text-slate-800">Direction</td>
                    <td className="px-4 py-3">
                      {form.perspective === 'consuming' ? (
                        <select
                          value={form.direction}
                          onChange={(e) => setForm({ ...form, direction: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-sm"
                        >
                          {PERSPECTIVE_PRESETS.consuming.direction.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-400">Pull (Request-Response)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {form.perspective === 'providing' ? (
                        <select
                          value={form.direction}
                          onChange={(e) => setForm({ ...form, direction: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-sm"
                        >
                          {PERSPECTIVE_PRESETS.providing.direction.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-400">Push (Webhook / Event-Driven)</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {(form.auth_type === 'api_key' || form.auth_type === 'bearer') && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                <Key size={14} />
                {form.auth_type === 'bearer' ? 'Bearer Token' : 'API Key'}
              </label>
              <div className="relative">
                <input
                  type={revealSecrets ? 'text' : 'password'}
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setRevealSecrets((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                >
                  {revealSecrets ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {form.auth_type === 'basic' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  type={revealSecrets ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          )}

          {form.auth_type === 'oauth2' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client ID</label>
                <input
                  type="text"
                  value={form.client_id}
                  onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client Secret</label>
                <input
                  type={revealSecrets ? 'text' : 'password'}
                  value={form.client_secret}
                  onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Additional Headers</label>
              <button
                type="button"
                onClick={addHeaderRow}
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
              >
                <Plus size={14} />
                Add Header
              </button>
            </div>
            {headerRows.length === 0 ? (
              <p className="text-xs text-slate-500 px-3 py-4 border border-dashed border-slate-300 rounded-lg text-center">
                No headers. Click "Add Header" to include one.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="hidden md:grid md:grid-cols-[1fr_1fr_auto] gap-2 px-1 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <span>Key</span>
                  <span>Value</span>
                  <span className="w-8" />
                </div>
                {headerRows.map((row, i) => (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-start">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) => updateHeaderRow(i, 'key', e.target.value)}
                      placeholder="Header name"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => updateHeaderRow(i, 'value', e.target.value)}
                      placeholder="Value"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeHeaderRow(i)}
                      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                      title="Remove header"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="integration-active"
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="integration-active" className="text-sm text-slate-700">
              Active
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              onClick={cancelForm}
              className="px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Provider</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Base URL</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Perspective</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Auth</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Secret</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                  No API integrations configured yet.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{item.provider || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 truncate max-w-xs">{item.base_url || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <div className="flex flex-col">
                      <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full w-fit ${
                        (item.perspective || 'consuming') === 'consuming'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {(item.perspective || 'consuming') === 'consuming' ? 'Consuming' : 'Providing'}
                      </span>
                      <span className="text-xs text-slate-500 mt-1">{item.direction || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 uppercase">{item.auth_type.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 font-mono">
                    {maskedValue(item.api_key || item.password || item.client_secret)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(item)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        item.is_active
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => remove(item.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MsbcTab() {
  const EMPTY_POSTING: MsbcPosting = {
    id: '',
    msbc_document_no: '',
    document_no: '',
    external_document_no: '',
    payment_type: PAYMENT_TYPES[0],
    date_posted: new Date().toISOString().slice(0, 16),
    notes: '',
  };

  const [items, setItems] = useState<MsbcPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MsbcPosting>(EMPTY_POSTING);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPostingsModal, setShowPostingsModal] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('msbc_postings')
        .select('*')
        .order('date_posted', { ascending: false });
      if (error) throw error;
      setItems((data || []) as MsbcPosting[]);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load postings' });
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (item: MsbcPosting) => {
    const dt = item.date_posted ? new Date(item.date_posted).toISOString().slice(0, 16) : '';
    setForm({ ...item, date_posted: dt });
    setEditingId(item.id);
    setShowForm(true);
    setMessage(null);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_POSTING);
  };

  const postToP2P = async () => {
    if (!form.msbc_document_no.trim()) {
      setMessage({ type: 'error', text: 'MSBC Document No. is required' });
      return;
    }
    if (!form.payment_type) {
      setMessage({ type: 'error', text: 'Payment Type is required' });
      return;
    }
    if (!form.date_posted) {
      setMessage({ type: 'error', text: 'Date Posted is required' });
      return;
    }

    setPosting(true);
    setMessage(null);
    try {
      const payload = {
        msbc_document_no: form.msbc_document_no.trim(),
        document_no: form.document_no.trim(),
        external_document_no: form.external_document_no.trim(),
        payment_type: form.payment_type,
        date_posted: new Date(form.date_posted).toISOString(),
        notes: form.notes,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase.from('msbc_postings').update(payload).eq('id', editingId);
        if (error) throw error;
        setMessage({ type: 'success', text: 'MSBC posting updated in P2P' });
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const insertPayload = { ...payload, created_by: userData.user?.id || null };
        const { error } = await supabase.from('msbc_postings').insert(insertPayload);
        if (error) throw error;
        setMessage({ type: 'success', text: 'MSBC data posted to P2P successfully' });
      }

      cancelForm();
      await load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to post to P2P' });
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this MSBC posting? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('msbc_postings').delete().eq('id', id);
      if (error) throw error;
      await load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete' });
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Database size={18} className="text-blue-600" />
            MSBC to P2P Posting
          </h3>
          <p className="text-sm text-slate-600">
            Post data from Microsoft Business Central into the P2P system.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPostingsModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
          >
            <TableIcon size={18} />
            View Postings
            <span className="ml-1 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
              {items.length}
            </span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.type === 'success' ? <CheckCircle size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}

      <MsbcDeveloperConnection />

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              {editingId ? 'Edit MSBC Posting' : 'Post MSBC Data to P2P'}
            </h3>
            <button onClick={cancelForm} className="text-slate-500 hover:text-slate-700">
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                MSBC Document No. <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.msbc_document_no}
                onChange={(e) => setForm({ ...form, msbc_document_no: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="e.g., PO-000123"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Document No.</label>
              <input
                type="text"
                value={form.document_no}
                onChange={(e) => setForm({ ...form, document_no: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="e.g., DOC-000123"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">External Document No.</label>
              <input
                type="text"
                value={form.external_document_no}
                onChange={(e) => setForm({ ...form, external_document_no: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="e.g., INV-98765"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Payment Type <span className="text-red-500">*</span>
              </label>
              <select
                value={form.payment_type}
                onChange={(e) => setForm({ ...form, payment_type: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              >
                {PAYMENT_TYPES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date Posted <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={form.date_posted}
                onChange={(e) => setForm({ ...form, date_posted: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              onClick={cancelForm}
              className="px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
            >
              Cancel
            </button>
            <button
              onClick={postToP2P}
              disabled={posting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
            >
              <ArrowRightLeft size={18} />
              {posting ? 'Posting...' : editingId ? 'Save Changes' : 'Post to P2P'}
            </button>
          </div>
        </div>
      )}

      {showPostingsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setShowPostingsModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <TableIcon size={18} className="text-blue-600" />
                <h3 className="text-base font-semibold text-slate-900">MSBC Postings</h3>
                <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
                  {items.length}
                </span>
              </div>
              <button
                onClick={() => setShowPostingsModal(false)}
                className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">MSBC Document No.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Document No.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">External Document No.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Payment Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date Posted</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Notes</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                        No MSBC data has been posted to P2P yet.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.msbc_document_no}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{item.document_no || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{item.external_document_no || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {item.payment_type || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">{formatDate(item.date_posted)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 truncate max-w-xs">{item.notes || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => remove(item.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end px-6 py-3 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setShowPostingsModal(false)}
                className="px-4 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface MsbcToken {
  id: string;
  name: string;
  token: string;
  is_active: boolean;
  created_at?: string;
}

type DevTab = 'overview' | 'post' | 'get';

function MsbcDeveloperConnection() {
  const [expanded, setExpanded] = useState(true);
  const [devTab, setDevTab] = useState<DevTab>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [tokens, setTokens] = useState<MsbcToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('MSBC Integration');
  const [revealedTokenId, setRevealedTokenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingDoc, setDownloadingDoc] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const endpoint = supabaseUrl ? `${supabaseUrl}/functions/v1/msbc-post` : '';
  const getEndpoint = supabaseUrl ? `${supabaseUrl}/functions/v1/msbc-get` : '';

  const activeToken = tokens.find((t) => t.is_active);
  const sampleToken = activeToken?.token || 'YOUR_MSBC_API_KEY';

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    setLoadingTokens(true);
    try {
      const { data, error } = await supabase
        .from('msbc_api_tokens')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTokens((data || []) as MsbcToken[]);
    } catch (err: any) {
      setError(err.message || 'Failed to load API tokens');
    } finally {
      setLoadingTokens(false);
    }
  };

  const generateToken = async () => {
    setCreating(true);
    setError(null);
    try {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const token =
        'msbc_' +
        Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

      const { data, error } = await supabase
        .from('msbc_api_tokens')
        .insert({ name: newName.trim() || 'MSBC Integration', token, is_active: true })
        .select()
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setRevealedTokenId(data.id);
        await loadTokens();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate token');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (t: MsbcToken) => {
    try {
      const { error } = await supabase
        .from('msbc_api_tokens')
        .update({ is_active: !t.is_active, updated_at: new Date().toISOString() })
        .eq('id', t.id);
      if (error) throw error;
      await loadTokens();
    } catch (err: any) {
      setError(err.message || 'Failed to update token');
    }
  };

  const deleteToken = async (t: MsbcToken) => {
    if (!confirm(`Delete token "${t.name}"? Any integrations using it will stop working.`)) return;
    try {
      const { error } = await supabase.from('msbc_api_tokens').delete().eq('id', t.id);
      if (error) throw error;
      await loadTokens();
    } catch (err: any) {
      setError(err.message || 'Failed to delete token');
    }
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(label);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // ignore
    }
  };

  const maskToken = (token: string) =>
    token.length > 16 ? `${token.slice(0, 8)}…${token.slice(-6)}` : '•'.repeat(token.length);

  const downloadApiDoc = async () => {
    setDownloadingDoc(true);
    setError(null);
    try {
      const bytes = await generateMsbcApiDocPdf({
        endpoint,
        getEndpoint,
        sampleToken: activeToken?.token || 'YOUR_MSBC_API_KEY',
      });
      downloadBytesAsPdf(bytes, `MSBC-to-P2P-API-Documentation-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err: any) {
      setError(err.message || 'Failed to generate PDF');
    } finally {
      setDownloadingDoc(false);
    }
  };

  const jsonExample = `{
  "msbc_document_no": "PO-000123",
  "external_document_no": "INV-98765",
  "payment_type": "Check",
  "date_posted": "2026-05-04T08:00:00Z",
  "notes": "Optional notes"
}`;

  const basicUser = 'msbc';
  const basicAuthHeader = (() => {
    try {
      return `Basic ${btoa(`${basicUser}:${sampleToken}`)}`;
    } catch {
      return `Basic <base64(${basicUser}:${sampleToken})>`;
    }
  })();

  const curlExample = `curl -X POST "${endpoint}" \\
  -u "${basicUser}:${sampleToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "msbc_document_no": "PO-000123",
    "external_document_no": "INV-98765",
    "payment_type": "Check",
    "date_posted": "${new Date().toISOString()}"
  }'`;

  const powershellExample = `$pair = "${basicUser}:${sampleToken}"
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
$headers = @{
  "Authorization" = "Basic $encoded"
  "Content-Type"  = "application/json"
}
$body = @{
  msbc_document_no     = "PO-000123"
  external_document_no = "INV-98765"
  payment_type         = "Check"
  date_posted          = (Get-Date).ToString("o")
} | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri "${endpoint}" -Headers $headers -Body $body`;

  const getExampleUrl = `${getEndpoint}?resource=all&limit=50`;
  const getCurlExample = `curl -X GET "${getExampleUrl}" \\
  -u "${basicUser}:${sampleToken}"`;
  const getPowershellExample = `$pair = "${basicUser}:${sampleToken}"
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
$headers = @{ "Authorization" = "Basic $encoded" }
$uri = "${getExampleUrl}"
Invoke-RestMethod -Method GET -Uri $uri -Headers $headers`;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl shadow-sm border border-slate-700 overflow-hidden">
      <div className="w-full px-5 py-4 flex items-center justify-between gap-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-3 text-left hover:opacity-90 transition"
        >
          <div className="p-2 rounded-lg bg-blue-500/20 text-blue-300">
            <Code2 size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Developer API Connection</h3>
            <p className="text-xs text-slate-300">
              Endpoint, headers, and credentials for the MSBC developer to push data into P2P.
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadApiDoc}
            disabled={downloadingDoc}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-white text-slate-900 hover:bg-slate-100 transition disabled:opacity-60"
            title="Download the full API documentation as PDF"
          >
            <Download size={14} />
            {downloadingDoc ? 'Generating...' : 'Download API Docs (PDF)'}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-slate-300 p-1 hover:bg-slate-800 rounded"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-700">
          <div className="px-5 pt-4 border-b border-slate-700">
            <nav className="flex gap-1">
              <DevTabButton
                active={devTab === 'overview'}
                onClick={() => setDevTab('overview')}
                icon={<Key size={14} />}
                label="Overview & API Keys"
              />
              <DevTabButton
                active={devTab === 'post'}
                onClick={() => setDevTab('post')}
                icon={<Upload size={14} />}
                label="POST (MSBC to P2P)"
                accent="blue"
              />
              <DevTabButton
                active={devTab === 'get'}
                onClick={() => setDevTab('get')}
                icon={<Download size={14} />}
                label="GET (P2P to MSBC)"
                accent="green"
              />
            </nav>
          </div>

          <div className="p-5 space-y-5">
            {error && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {devTab === 'overview' && (
              <div className="space-y-5">
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
                  <h4 className="text-sm font-semibold text-white mb-1">Two endpoints, one credential</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    MSBC authenticates using <strong className="text-amber-300">HTTP Basic Auth</strong>. Send the header
                    <code className="mx-1 px-1 py-0.5 rounded bg-slate-900/60">Authorization: Basic base64(msbc:API_KEY)</code>.
                    Use <strong className="text-blue-300">POST</strong> to push payment postings from MSBC into P2P,
                    or <strong className="text-green-300">GET</strong> to pull approved P2P records (PRs, Canvasses, CAs, Petty Cash,
                    Reimbursements, postings) back into MSBC.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ConnField
                    label="Auth Scheme"
                    value="Basic (username: msbc)"
                    copyable
                    copied={copiedKey === 'header'}
                    onCopy={() => copy('header', 'Authorization: Basic <base64(msbc:API_KEY)>')}
                  />
                  <ConnField label="Content-Type" value="application/json" copyable={false} />
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-950/60 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900/60">
                    <div className="flex items-center gap-2">
                      <Key size={14} className="text-blue-300" />
                      <h4 className="text-sm font-semibold text-white">API Keys</h4>
                    </div>
                    <div className="flex items-stretch gap-2">
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Token name"
                        className="px-2 py-1 text-xs rounded-md bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={generateToken}
                        disabled={creating}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-60"
                      >
                        <Plus size={12} />
                        {creating ? 'Generating...' : 'Generate Key'}
                      </button>
                    </div>
                  </div>

                  {loadingTokens ? (
                    <div className="p-4 text-xs text-slate-400">Loading tokens...</div>
                  ) : tokens.length === 0 ? (
                    <div className="p-4 text-xs text-slate-400">
                      No API key yet. Click "Generate Key" so MSBC can authenticate.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800">
                      {tokens.map((t) => {
                        const revealed = revealedTokenId === t.id;
                        return (
                          <div key={t.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-white truncate">{t.name}</span>
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                    t.is_active
                                      ? 'bg-green-500/20 text-green-300'
                                      : 'bg-slate-700 text-slate-400'
                                  }`}
                                >
                                  {t.is_active ? 'ACTIVE' : 'DISABLED'}
                                </span>
                              </div>
                              <code className="block mt-1 text-xs font-mono text-green-300 truncate">
                                {revealed ? t.token : maskToken(t.token)}
                              </code>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setRevealedTokenId(revealed ? null : t.id)}
                                className="p-2 rounded-md text-slate-300 hover:bg-slate-800 transition"
                                title={revealed ? 'Hide' : 'Reveal'}
                              >
                                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                              <button
                                onClick={() => copy(`tok-${t.id}`, t.token)}
                                className="p-2 rounded-md text-slate-300 hover:bg-slate-800 transition"
                                title="Copy token"
                              >
                                {copiedKey === `tok-${t.id}` ? (
                                  <CheckCircle size={14} className="text-green-400" />
                                ) : (
                                  <Copy size={14} />
                                )}
                              </button>
                              <button
                                onClick={() => toggleActive(t)}
                                className="px-2 py-1 text-[10px] font-semibold rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
                              >
                                {t.is_active ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                onClick={() => deleteToken(t)}
                                className="p-2 rounded-md text-red-400 hover:bg-red-500/20 transition"
                                title="Delete token"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    onClick={() => setDevTab('post')}
                    className="text-left rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 hover:bg-blue-500/20 transition"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Upload size={14} className="text-blue-300" />
                      <span className="text-sm font-semibold text-white">POST endpoint</span>
                    </div>
                    <p className="text-xs text-blue-100">
                      Push MSBC document postings into P2P's msbc_postings table.
                    </p>
                  </button>
                  <button
                    onClick={() => setDevTab('get')}
                    className="text-left rounded-lg border border-green-500/30 bg-green-500/10 p-4 hover:bg-green-500/20 transition"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Download size={14} className="text-green-300" />
                      <span className="text-sm font-semibold text-white">GET endpoint</span>
                    </div>
                    <p className="text-xs text-green-100">
                      Pull approved P2P records (PRs, CAs, Petty Cash, and more) into MSBC.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {devTab === 'post' && (
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-blue-500/20 text-blue-300">
                    <Upload size={16} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">POST: MSBC to P2P</h4>
                    <p className="text-xs text-slate-300">
                      Insert a new posting record from Microsoft Business Central into P2P.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ConnField
                    label="Endpoint URL"
                    value={endpoint || 'Not configured'}
                    copyable={!!endpoint}
                    copied={copiedKey === 'endpoint'}
                    onCopy={() => copy('endpoint', endpoint)}
                  />
                  <ConnField label="HTTP Method" value="POST" copyable={false} />
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-300 mb-1">Required Headers</div>
                  <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
                    <table className="w-full text-xs font-mono">
                      <tbody className="divide-y divide-slate-800">
                        <tr>
                          <td className="px-3 py-2 text-slate-400 w-56">Authorization</td>
                          <td className="px-3 py-2 text-green-300">Basic &lt;base64(msbc:API_KEY)&gt;</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-slate-400">Content-Type</td>
                          <td className="px-3 py-2 text-green-300">application/json</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <CodeBlock
                    title="Request Body (JSON)"
                    icon={<Code2 size={14} />}
                    code={jsonExample}
                    copied={copiedKey === 'json'}
                    onCopy={() => copy('json', jsonExample)}
                  />
                  <CodeBlock
                    title="cURL Example"
                    icon={<Terminal size={14} />}
                    code={curlExample}
                    copied={copiedKey === 'curl'}
                    onCopy={() => copy('curl', curlExample)}
                  />
                  <div className="lg:col-span-2">
                    <CodeBlock
                      title="PowerShell Example (AL / BC HttpClient equivalent)"
                      icon={<Terminal size={14} />}
                      code={powershellExample}
                      copied={copiedKey === 'ps'}
                      onCopy={() => copy('ps', powershellExample)}
                    />
                  </div>
                </div>
              </div>
            )}

            {devTab === 'get' && (
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-green-500/20 text-green-300">
                    <Download size={16} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">GET: P2P to MSBC</h4>
                    <p className="text-xs text-slate-300">
                      Pull P2P records (PRs, Canvasses, CAs, Petty Cash, Reimbursements, postings) into MSBC. Use
                      <code className="mx-1 px-1 py-0.5 rounded bg-slate-900/60">resource=all</code> to fetch every resource in one call,
                      or pass a specific name like <code className="mx-1 px-1 py-0.5 rounded bg-slate-900/60">resource=petty_cash_requests</code>.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ConnField
                    label="GET Endpoint URL"
                    value={getEndpoint || 'Not configured'}
                    copyable={!!getEndpoint}
                    copied={copiedKey === 'get-endpoint'}
                    onCopy={() => copy('get-endpoint', getEndpoint)}
                  />
                  <ConnField label="HTTP Method" value="GET" copyable={false} />
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-300 mb-1">Query Parameters</div>
                  <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
                    <table className="w-full text-xs font-mono">
                      <tbody className="divide-y divide-slate-800">
                        <tr>
                          <td className="px-3 py-2 text-slate-400 w-56">resource</td>
                          <td className="px-3 py-2 text-green-300">
                            all (default) | purchase_requisitions | canvass_requests | cash_advance_requests | petty_cash_requests | reimbursement_requests | msbc_postings
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-slate-400">status</td>
                          <td className="px-3 py-2 text-green-300">e.g. approved, pending, rejected</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-slate-400">company_id</td>
                          <td className="px-3 py-2 text-green-300">UUID of the company</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-slate-400">document_no</td>
                          <td className="px-3 py-2 text-green-300">Exact match on document number</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-slate-400">msbc_posting_status</td>
                          <td className="px-3 py-2 text-green-300">e.g. not_posted, posted, failed</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-slate-400">since / until</td>
                          <td className="px-3 py-2 text-green-300">ISO timestamp filter on created_at</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-slate-400">limit / offset</td>
                          <td className="px-3 py-2 text-green-300">Pagination (limit max 500, default 50)</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <CodeBlock
                    title="cURL Example (GET)"
                    icon={<Terminal size={14} />}
                    code={getCurlExample}
                    copied={copiedKey === 'get-curl'}
                    onCopy={() => copy('get-curl', getCurlExample)}
                  />
                  <CodeBlock
                    title="PowerShell Example (GET)"
                    icon={<Terminal size={14} />}
                    code={getPowershellExample}
                    copied={copiedKey === 'get-ps'}
                    onCopy={() => copy('get-ps', getPowershellExample)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DevTabButton({
  active,
  onClick,
  icon,
  label,
  accent = 'blue',
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent?: 'blue' | 'green';
}) {
  const accentBorder = accent === 'green' ? 'border-green-400 text-green-300' : 'border-blue-400 text-blue-300';
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 -mb-px text-xs font-semibold inline-flex items-center gap-2 border-b-2 transition ${
        active
          ? accentBorder
          : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ConnField({
  label,
  value,
  copyable = true,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  copied?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-300 mb-1">{label}</div>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 px-3 py-2 text-xs font-mono text-green-300 bg-slate-950 border border-slate-700 rounded-lg overflow-x-auto whitespace-nowrap">
          {value}
        </code>
        {copyable && onCopy && (
          <button
            onClick={onCopy}
            className="px-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
            title={`Copy ${label}`}
          >
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

function CodeBlock({
  title,
  icon,
  code,
  copied,
  onCopy,
}: {
  title: string;
  icon: React.ReactNode;
  code: string;
  copied?: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-700">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
          {icon}
          {title}
        </div>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white transition"
        >
          {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre">{code}</pre>
    </div>
  );
}
