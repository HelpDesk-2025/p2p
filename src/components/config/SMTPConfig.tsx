import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

interface SMTPConfiguration {
  id: string;
  company_id: string | null;
  mailer: string;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: string;
  from_address: string;
  from_name: string;
  is_active: boolean;
}

export default function SMTPConfig() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
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

  const [existingConfig, setExistingConfig] = useState<SMTPConfiguration | null>(null);

  useEffect(() => {
    fetchSMTPConfig();
  }, []);

  const fetchSMTPConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('smtp_configurations')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setExistingConfig(data);
        setFormData({
          mailer: data.mailer,
          host: data.host,
          port: data.port,
          username: data.username,
          password: data.password,
          encryption: data.encryption,
          from_address: data.from_address,
          from_name: data.from_name,
          is_active: data.is_active,
        });
      }
    } catch (error: any) {
      console.error('Error fetching SMTP config:', error);
      setMessage({ type: 'error', text: 'Failed to load SMTP configuration' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (existingConfig) {
        const { error } = await supabase
          .from('smtp_configurations')
          .update(formData)
          .eq('id', existingConfig.id);

        if (error) throw error;
        setMessage({ type: 'success', text: 'SMTP configuration updated successfully!' });
      } else {
        const { error } = await supabase
          .from('smtp_configurations')
          .insert([{ ...formData, company_id: null }]);

        if (error) throw error;
        setMessage({ type: 'success', text: 'SMTP configuration created successfully!' });
      }

      await fetchSMTPConfig();
    } catch (error: any) {
      console.error('Error saving SMTP config:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to save SMTP configuration' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">SMTP Email Configuration</h2>
          <p className="text-sm text-slate-600 mt-1">
            Configure the SMTP server settings for sending email notifications
          </p>
        </div>

        {message && (
          <div className={`mx-6 mt-6 p-4 rounded-lg flex items-start space-x-3 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            )}
            <p className={`text-sm ${
              message.type === 'success' ? 'text-green-800' : 'text-red-800'
            }`}>
              {message.text}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Mailer Type
              </label>
              <select
                value={formData.mailer}
                onChange={(e) => setFormData({ ...formData, mailer: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="smtp">SMTP</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                SMTP Host
              </label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                placeholder="e.g., smtp.office365.com"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Port
              </label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                placeholder="587"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Encryption
              </label>
              <select
                value={formData.encryption}
                onChange={(e) => setFormData({ ...formData, encryption: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="tls">TLS</option>
                <option value="ssl">SSL</option>
                <option value="none">None</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="SMTP username"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="SMTP password"
                  className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                From Email Address
              </label>
              <input
                type="email"
                value={formData.from_address}
                onChange={(e) => setFormData({ ...formData, from_address: e.target.value })}
                placeholder="e.g., notifications@company.com"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                From Name
              </label>
              <input
                type="text"
                value={formData.from_name}
                onChange={(e) => setFormData({ ...formData, from_name: e.target.value })}
                placeholder="e.g., Procure to Pay System"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-slate-700">
              Active Configuration
            </label>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Saving...' : existingConfig ? 'Update Configuration' : 'Save Configuration'}
            </button>
          </div>
        </form>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 rounded-b-lg">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-slate-600">
              <p className="font-medium text-slate-700 mb-1">Important Notes:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Only one SMTP configuration can be active at a time</li>
                <li>Make sure your SMTP credentials are correct before activating</li>
                <li>For Office 365, use: smtp.office365.com:587 with TLS</li>
                <li>Test the configuration by creating a request and verifying email delivery</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
