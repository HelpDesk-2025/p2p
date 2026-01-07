import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Save, Trash2, Edit2, X, Hash, Building2 } from 'lucide-react';

interface NumberSeries {
  id: string;
  series_name: string;
  prefix: string;
  next_number: number;
  number_length: number;
  format_example: string;
  is_active: boolean;
  company_id: string;
  created_at: string;
  updated_at: string;
}

interface Company {
  id: string;
  company_name: string;
}

export function NumberSeriesConfig() {
  const { profile } = useAuth();
  const [series, setSeries] = useState<NumberSeries[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    series_name: '',
    prefix: '',
    next_number: 1,
    number_length: 9,
    is_active: true,
  });

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      loadSeries();
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    updateFormatExample();
  }, [formData.prefix, formData.next_number, formData.number_length]);

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name')
        .order('company_name', { ascending: true });

      if (error) throw error;
      setCompanies(data || []);

      if (profile?.company_id && data && data.length > 0) {
        setSelectedCompanyId(profile.company_id);
      } else if (data && data.length > 0) {
        setSelectedCompanyId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const loadSeries = async () => {
    if (!selectedCompanyId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('number_series')
        .select('*')
        .eq('company_id', selectedCompanyId)
        .order('series_name', { ascending: true });

      if (error) throw error;
      setSeries(data || []);
    } catch (error) {
      console.error('Error loading number series:', error);
      alert('Failed to load number series');
    } finally {
      setLoading(false);
    }
  };

  const updateFormatExample = () => {
    const paddedNumber = String(formData.next_number).padStart(formData.number_length, '0');
    return `${formData.prefix}${paddedNumber}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCompanyId) {
      alert('Company information not available');
      return;
    }

    setLoading(true);

    try {
      const format_example = updateFormatExample();

      if (editingId) {
        const { error } = await supabase
          .from('number_series')
          .update({
            series_name: formData.series_name,
            prefix: formData.prefix,
            next_number: formData.next_number,
            number_length: formData.number_length,
            format_example,
            is_active: formData.is_active,
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('number_series').insert({
          series_name: formData.series_name,
          prefix: formData.prefix,
          next_number: formData.next_number,
          number_length: formData.number_length,
          format_example,
          is_active: formData.is_active,
          company_id: selectedCompanyId,
        });

        if (error) throw error;
      }

      resetForm();
      loadSeries();
    } catch (error: any) {
      console.error('Error saving number series:', error);
      alert('Failed to save number series: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item: NumberSeries) => {
    setEditingId(item.id);
    setFormData({
      series_name: item.series_name,
      prefix: item.prefix,
      next_number: item.next_number,
      number_length: item.number_length,
      is_active: item.is_active,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this number series?')) return;

    try {
      setLoading(true);
      const { error } = await supabase.from('number_series').delete().eq('id', id);

      if (error) throw error;
      loadSeries();
    } catch (error: any) {
      console.error('Error deleting number series:', error);
      alert('Failed to delete number series: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('number_series')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      loadSeries();
    } catch (error: any) {
      console.error('Error updating status:', error);
      alert('Failed to update status: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      series_name: '',
      prefix: '',
      next_number: 1,
      number_length: 9,
      is_active: true,
    });
    setEditingId(null);
    setShowForm(false);
  };

  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            {editingId ? 'Edit Number Series' : 'Add Number Series'}
          </h3>
          <button
            onClick={resetForm}
            className="px-4 py-2 text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Series Name
            </label>
            <input
              type="text"
              value={formData.series_name}
              onChange={(e) => setFormData({ ...formData, series_name: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="e.g., Purchase Requisition"
              required
              disabled={editingId !== null}
            />
            {editingId && (
              <p className="text-xs text-slate-500 mt-1">Series name cannot be changed after creation</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Prefix
              </label>
              <input
                type="text"
                value={formData.prefix}
                onChange={(e) => setFormData({ ...formData, prefix: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                placeholder="e.g., PR"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Next Number
              </label>
              <input
                type="number"
                value={formData.next_number}
                onChange={(e) => setFormData({ ...formData, next_number: parseInt(e.target.value) || 1 })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                min="1"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Number Length (Padding)
            </label>
            <input
              type="number"
              value={formData.number_length}
              onChange={(e) => setFormData({ ...formData, number_length: parseInt(e.target.value) || 1 })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              min="1"
              max="20"
              required
            />
            <p className="text-xs text-slate-500 mt-1">Total digits for the number part (will be padded with zeros)</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Format Preview</label>
            <div className="flex items-center gap-2">
              <Hash size={20} className="text-slate-400" />
              <span className="text-lg font-mono font-semibold text-slate-900">
                {updateFormatExample()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-slate-700">
              Active
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={resetForm}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              <Save size={18} />
              {editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Number Series</h3>
          <p className="text-sm text-slate-500 mt-1">
            Configure auto-incrementing number formats for documents
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={18} />
          Add Series
        </button>
      </div>

      {companies.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <Building2 size={20} className="text-slate-400" />
            <label className="text-sm font-medium text-slate-700">Company:</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.company_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : series.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No number series configured yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Series Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Format
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Next Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Latest No
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {series.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-900">{item.series_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded text-slate-900">
                        {item.format_example}
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-900">{item.next_number}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className="text-xs font-mono bg-blue-50 px-2 py-1 rounded text-blue-900">
                        {item.next_number > 1
                          ? `${item.prefix}${String(item.next_number - 1).padStart(item.number_length, '0')}`
                          : '-'
                        }
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleActive(item.id, item.is_active)}
                        className={`px-2 py-1 text-xs font-medium rounded-full transition ${
                          item.is_active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {item.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
