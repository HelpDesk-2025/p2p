import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, CreditCard as Edit, Trash2, X, Megaphone, Info, AlertTriangle, AlertOctagon, CheckCircle2 } from 'lucide-react';

type Priority = 'info' | 'success' | 'warning' | 'critical';

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: Priority;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CompanyOption {
  id: string;
  name: string;
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

const priorityIcon = (priority: Priority) => {
  const cls = 'w-4 h-4';
  switch (priority) {
    case 'success':
      return <CheckCircle2 className={`${cls} text-emerald-600`} />;
    case 'warning':
      return <AlertTriangle className={`${cls} text-amber-600`} />;
    case 'critical':
      return <AlertOctagon className={`${cls} text-rose-600`} />;
    default:
      return <Info className={`${cls} text-sky-600`} />;
  }
};

const priorityBadge = (priority: Priority) => {
  switch (priority) {
    case 'success':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'warning':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'critical':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-sky-50 text-sky-700 border-sky-200';
  }
};

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (value: string) => {
  if (!value) return null;
  return new Date(value).toISOString();
};

export function AnnouncementsConfig() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    priority: 'info' as Priority,
    is_active: true,
    starts_at: '',
    ends_at: '',
    company_id: '',
  });

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        supabase.from('announcements').select('*').order('created_at', { ascending: false }),
        supabase.from('companies').select('id, name').order('name', { ascending: true }),
      ]);
      setItems(a.data || []);
      setCompanies(c.data || []);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      message: '',
      priority: 'info',
      is_active: true,
      starts_at: '',
      ends_at: '',
      company_id: '',
    });
    setEditingId(null);
  };

  const handleAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const handleEdit = (item: Announcement) => {
    setFormData({
      title: item.title,
      message: item.message,
      priority: item.priority,
      is_active: item.is_active,
      starts_at: toLocalInput(item.starts_at),
      ends_at: toLocalInput(item.ends_at),
      company_id: item.company_id || '',
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleCancel = () => {
    resetForm();
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.message.trim()) {
      alert('Title and message are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: formData.title.trim(),
        message: formData.message.trim(),
        priority: formData.priority,
        is_active: formData.is_active,
        starts_at: fromLocalInput(formData.starts_at),
        ends_at: fromLocalInput(formData.ends_at),
        company_id: formData.company_id || null,
      };
      if (editingId) {
        const { error } = await supabase
          .from('announcements')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('announcements').insert({
          ...payload,
          created_by: profile?.id,
        });
        if (error) throw error;
      }
      resetForm();
      setShowForm(false);
      await loadAll();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) {
      alert('Error: ' + error.message);
      return;
    }
    await loadAll();
  };

  const toggleActive = async (item: Announcement) => {
    const { error } = await supabase
      .from('announcements')
      .update({ is_active: !item.is_active, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) {
      alert('Error: ' + error.message);
      return;
    }
    await loadAll();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Announcements</h2>
            <p className="text-sm text-slate-500">Messages displayed on the dashboard.</p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Announcement
          </button>
        )}
      </div>

      {showForm && (
        <div className="p-4 sm:p-6 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900">
              {editingId ? 'Edit Announcement' : 'New Announcement'}
            </h3>
            <button onClick={handleCancel} className="p-1 rounded hover:bg-slate-200">
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Short summary"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Body of the announcement"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as Priority })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Audience</label>
              <select
                value={formData.company_id}
                onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Starts At</label>
              <input
                type="datetime-local"
                value={formData.starts_at}
                onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ends At</label>
              <input
                type="datetime-local"
                value={formData.ends_at}
                onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <input
                id="ann_active"
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="ann_active" className="text-sm text-slate-700">
                Active
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="p-4 sm:p-6">
        {loading ? (
          <div className="text-sm text-slate-500">Loading announcements...</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-8">No announcements yet.</div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const company = companies.find((c) => c.id === item.company_id);
              return (
                <div
                  key={item.id}
                  className="border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {priorityIcon(item.priority)}
                        <h3 className="font-semibold text-slate-900 truncate">{item.title}</h3>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${priorityBadge(item.priority)}`}
                        >
                          {item.priority}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${
                            item.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {item.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{item.message}</p>
                      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-slate-500 mt-2">
                        <span>Audience: {company ? company.name : 'All Companies'}</span>
                        {item.starts_at && (
                          <span>Starts: {new Date(item.starts_at).toLocaleString()}</span>
                        )}
                        {item.ends_at && (
                          <span>Ends: {new Date(item.ends_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleActive(item)}
                        className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50 text-slate-700"
                      >
                        {item.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
