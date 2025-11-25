import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, Mail, Shield, AlertCircle } from 'lucide-react';

interface SmtpConfig {
  id: string;
  company_id: string | null;
  mailer: string;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: 'tls' | 'ssl' | 'none';
  from_address: string;
  from_name: string;
  is_active: boolean;
}

export function SmtpConfig() {
  const [config, setConfig] = useState<SmtpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('smtp_configurations')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig(data);
      } else {
        setConfig({
          id: '',
          company_id: null,
          mailer: 'smtp',
          host: '',
          port: 587,
          username: '',
          password: '',
          encryption: 'tls',
          from_address: '',
          from_name: 'Procure to Pay System',
          is_active: true,
        });
      }
    } catch (error) {
      console.error('Error loading SMTP config:', error);
      setMessage({ type: 'error', text: 'Failed to load SMTP configuration' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    if (!config.host || !config.username || !config.password || !config.from_address) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      if (config.id) {
        const { error } = await supabase
          .from('smtp_configurations')
          .update({
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            encryption: config.encryption,
            from_address: config.from_address,
            from_name: config.from_name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('smtp_configurations')
          .insert({
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            encryption: config.encryption,
            from_address: config.from_address,
            from_name: config.from_name,
            is_active: true,
          });

        if (error) throw error;
      }

      setMessage({ type: 'success', text: 'SMTP configuration saved successfully' });
      await loadConfig();
    } catch (error: any) {
      console.error('Error saving SMTP config:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to save configuration' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">SMTP Configuration</h2>
          <p className="text-sm text-slate-600 mt-1">
            Configure email settings for approval notifications
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition"
        >
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <AlertCircle size={20} />
          <span>{message.text}</span>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-slate-700 font-semibold mb-4">
            <Mail size={20} />
            <span>Server Settings</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                SMTP Host *
              </label>
              <input
                type="text"
                value={config.host}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
                placeholder="smtp.office365.com"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Port *
              </label>
              <input
                type="number"
                value={config.port}
                onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 587 })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Encryption *
              </label>
              <select
                value={config.encryption}
                onChange={(e) =>
                  setConfig({ ...config, encryption: e.target.value as 'tls' | 'ssl' | 'none' })
                }
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="tls">TLS</option>
                <option value="ssl">SSL</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-700 font-semibold mb-4 mt-8">
            <Shield size={20} />
            <span>Authentication</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Username *
              </label>
              <input
                type="text"
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                placeholder="your-email@domain.com"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={config.password}
                  onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-700 font-semibold mb-4 mt-8">
            <Mail size={20} />
            <span>Email Identity</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                From Address *
              </label>
              <input
                type="email"
                value={config.from_address}
                onChange={(e) => setConfig({ ...config, from_address: e.target.value })}
                placeholder="noreply@yourdomain.com"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                From Name
              </label>
              <input
                type="text"
                value={config.from_name}
                onChange={(e) => setConfig({ ...config, from_name: e.target.value })}
                placeholder="Procure to Pay System"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> For Office365/Outlook, use:
              <br />
              Host: smtp.office365.com, Port: 587, Encryption: TLS
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
