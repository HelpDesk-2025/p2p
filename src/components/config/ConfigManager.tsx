import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Save, CreditCard as Edit, X, Upload, Image as ImageIcon, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { ApprovalFlowSetupConfig } from './ApprovalFlowSetupConfig';
import { NumberSeriesConfig } from './NumberSeriesConfig';
import { SmtpConfig } from './SmtpConfig';
import { RolesPermissionsConfig } from './RolesPermissionsConfig';

type ConfigType = 'approvers' | 'users' | 'checklists' | 'payment-modes' | 'holidays' | 'companies' | 'approval-flows' | 'number-series' | 'vendors-items' | 'smtp' | 'roles-permissions';

interface ConfigManagerProps {
  type: ConfigType;
}

export function ConfigManager({ type }: ConfigManagerProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [type]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query;
      switch (type) {
        case 'users':
          query = supabase.from('user_profiles').select('*').order('created_at', { ascending: false });
          break;
        case 'checklists':
          query = supabase.from('pr_checklists').select('*').order('order_index', { ascending: true });
          break;
        case 'payment-modes':
          query = supabase.from('payment_modes').select('*').order('created_at', { ascending: false });
          break;
        case 'holidays':
          query = supabase.from('holidays').select('*').order('holiday_date', { ascending: false });
          break;
        case 'companies':
          query = supabase.from('companies').select('*').order('name', { ascending: true });
          break;
        case 'approval-flows':
          query = supabase.from('approval_flows').select(`
            *,
            companies (name),
            departments (name)
          `).order('sequence', { ascending: true });
          break;
        default:
          query = supabase.from('approvers').select(`
            *,
            user_profiles (full_name, email)
          `).order('created_at', { ascending: false });
      }
      const { data: result } = await query;
      setData(result || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    switch (type) {
      case 'users':
        return <UsersConfig data={data} reload={loadData} />;
      case 'checklists':
        return <ChecklistsConfig data={data} reload={loadData} />;
      case 'payment-modes':
        return <PaymentModesConfig data={data} reload={loadData} />;
      case 'holidays':
        return <HolidaysConfig data={data} reload={loadData} />;
      case 'companies':
        return <CompaniesConfig data={data} reload={loadData} />;
      case 'approval-flows':
        return <ApprovalFlowSetupConfig />;
      case 'number-series':
        return <NumberSeriesConfig />;
      case 'vendors-items':
        return <VendorsAndItemsConfig />;
      case 'smtp':
        return <SmtpConfig />;
      case 'roles-permissions':
        return <RolesPermissionsConfig />;
      default:
        return <div>Select a configuration type</div>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return <div className="space-y-6">{renderContent()}</div>;
}

function UsersConfig({ data, reload }: { data: any[]; reload: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    company: '',
    department: '',
    role: '',
    approver_type: '',
    sequence: '',
    days_of_approval: '',
    e_sig: '',
    is_active: false,
    enable_multi_company_requests: false,
    allowed_companies: [] as string[]
  });
  const [originalESig, setOriginalESig] = useState<string>('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [allDepartments, setAllDepartments] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortField, setSortField] = useState<'full_name' | 'email' | 'company' | 'department' | 'role' | 'created_at'>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadCompaniesAndDepartments();
  }, []);

  useEffect(() => {
    if (formData.company) {
      const company = companies.find(c => c.name === formData.company);
      if (company) {
        const filtered = allDepartments.filter(dept => dept.company_id === company.id);
        setDepartments(filtered);
      } else {
        setDepartments([]);
      }
    } else {
      setDepartments([]);
    }
  }, [formData.company, allDepartments, companies]);

  const loadCompaniesAndDepartments = async () => {
    try {
      const [companiesRes, departmentsRes, rolesRes] = await Promise.all([
        supabase.from('companies').select('*').eq('is_active', true).order('name', { ascending: true }),
        supabase.from('departments').select('*').eq('is_active', true).order('name', { ascending: true }),
        supabase.from('roles').select('*').eq('is_active', true).order('name', { ascending: true })
      ]);

      setCompanies(companiesRes.data || []);
      setAllDepartments(departmentsRes.data || []);
      setRoles(rolesRes.data || []);
    } catch (error) {
      console.error('Error loading companies and departments:', error);
    }
  };

  const handleEdit = (user: any) => {
    console.log('Editing user:', user);
    setEditingId(user.id);

    if (user.company) {
      const company = companies.find(c => c.name === user.company);
      console.log('Found company:', company);
      if (company) {
        const filtered = allDepartments.filter(dept => dept.company_id === company.id);
        console.log('Filtered departments:', filtered);
        setDepartments(filtered);
      }
    }

    const formDataToSet = {
      full_name: user.full_name || '',
      email: user.email || '',
      password: '',
      company: user.company || '',
      department: user.department || '',
      role: user.role || 'standard',
      approver_type: user.approver_type || '',
      sequence: user.sequence?.toString() || '',
      days_of_approval: user.days_of_approval?.toString() || '',
      e_sig: user.e_sig || '',
      is_active: user.is_active ?? false,
      enable_multi_company_requests: user.enable_multi_company_requests ?? false,
      allowed_companies: user.allowed_companies || []
    };
    console.log('Setting form data:', formDataToSet);
    setOriginalESig(user.e_sig || '');
    setFormData(formDataToSet);
    setShowForm(true);
  };

  const handleAdd = async () => {
    try {
      if (!formData.email || !formData.password || !formData.full_name) {
        alert('Please fill in email, password, and full name');
        return;
      }

      const company = companies.find(c => c.name === formData.company);
      const companyId = company ? company.id : null;

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.full_name,
            company: formData.company || null,
            company_id: companyId,
            department: formData.department || null,
            role: formData.role,
            approver_type: formData.approver_type || null,
            e_sig: formData.e_sig || null
          }
        }
      });

      if (authError) throw authError;

      // Update the user profile with additional fields
      if (authData.user) {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({
            is_active: formData.is_active,
            enable_multi_company_requests: formData.enable_multi_company_requests,
            allowed_companies: formData.allowed_companies
          })
          .eq('id', authData.user.id);

        if (updateError) throw updateError;
      }

      alert('User created successfully!');
      setShowForm(false);
      setFormData({
        full_name: '',
        email: '',
        password: '',
        company: '',
        department: '',
        role: 'standard',
        approver_type: '',
        sequence: '',
        days_of_approval: '',
        e_sig: '',
        is_active: false,
        enable_multi_company_requests: false,
        allowed_companies: []
      });
      reload();
    } catch (error: any) {
      alert('Error creating user: ' + error.message);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      e.target.value = '';
      return;
    }

    if (file.size > 10240) {
      alert('File size must be 10KB or less');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData({ ...formData, e_sig: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleUpdate = async () => {
    try {
      if (!editingId) return;

      console.log('Form data company:', formData.company);
      console.log('Available companies:', companies);

      const company = companies.find(c => c.name === formData.company);
      const companyId = company ? company.id : null;

      console.log('Found company:', company);
      console.log('Company ID:', companyId);

      const updateData = {
        full_name: formData.full_name,
        email: formData.email,
        company: formData.company || null,
        company_id: companyId,
        department: formData.department || null,
        role: formData.role,
        approver_type: formData.approver_type || null,
        e_sig: formData.e_sig || null,
        is_active: formData.is_active,
        enable_multi_company_requests: formData.enable_multi_company_requests,
        allowed_companies: formData.allowed_companies
      };

      console.log('Updating user:', editingId, updateData);

      // Update user profile (RLS policy allows admins to update any profile)
      const { data: result, error } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('id', editingId)
        .select();

      if (error) {
        console.error('Update error:', error);
        throw error;
      }

      console.log('Update result:', result);
      alert('User updated successfully!');
      setShowForm(false);
      setEditingId(null);
      setOriginalESig('');
      setFormData({
        full_name: '',
        email: '',
        password: '',
        company: '',
        department: '',
        role: 'standard',
        approver_type: '',
        sequence: '',
        days_of_approval: '',
        e_sig: '',
        is_active: false,
        enable_multi_company_requests: false,
        allowed_companies: []
      });
      reload();
    } catch (error: any) {
      console.error('Error in handleUpdate:', error);
      alert('Error updating user: ' + error.message);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setOriginalESig('');
    setFormData({
      full_name: '',
      email: '',
      password: '',
      company: '',
      department: '',
      role: 'standard',
      approver_type: '',
      sequence: '',
      days_of_approval: '',
      e_sig: '',
      is_active: false,
      enable_multi_company_requests: false,
      allowed_companies: []
    });
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedData = data
    .filter(user => {
      const matchesSearch = searchTerm === '' ||
        user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCompany = filterCompany === '' || user.company === filterCompany;
      const matchesDepartment = filterDepartment === '' || user.department === filterDepartment;
      const matchesRole = filterRole === '' || user.role === filterRole;
      const matchesStatus = filterStatus === 'all' ||
        (filterStatus === 'active' && user.is_active) ||
        (filterStatus === 'inactive' && !user.is_active);

      return matchesSearch && matchesCompany && matchesDepartment && matchesRole && matchesStatus;
    })
    .sort((a, b) => {
      let aValue = a[sortField] || '';
      let bValue = b[sortField] || '';

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
      }
      if (typeof bValue === 'string') {
        bValue = bValue.toLowerCase();
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

  const inactiveCount = data.filter(user => !user.is_active).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">User Management</h2>
          <p className="text-slate-600 mt-1">Manage user profiles, roles, and permissions</p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/30 transition-all"
        >
          <Plus size={20} />
          Add User
        </button>
      </div>

      {inactiveCount > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-amber-900 font-semibold">
              {inactiveCount} {inactiveCount === 1 ? 'account' : 'accounts'} pending approval
            </p>
            <p className="text-amber-700 text-sm mt-1">
              {inactiveCount === 1 ? 'This user is' : 'These users are'} waiting for admin approval to access the system.
              Click the edit button to review and activate {inactiveCount === 1 ? 'the account' : 'their accounts'}.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 mb-6">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Filter & Search</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Search</label>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Company</label>
            <select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="">All Companies</option>
              {companies.map((company) => (
                <option key={company.id} value={company.name}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Department</label>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="">All Departments</option>
              {Array.from(new Set(allDepartments.map(dept => dept.name))).sort().map((deptName) => (
                <option key={deptName} value={deptName}>
                  {deptName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="">All Roles</option>
              {roles.map((role) => (
                <option key={role.id} value={role.name}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterCompany('');
                setFilterDepartment('');
                setFilterRole('');
                setFilterStatus('all');
              }}
              className="w-full px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-all"
            >
              Clear Filters
            </button>
          </div>
        </div>
        <div className="mt-4 text-sm text-slate-600">
          Showing {filteredAndSortedData.length} of {data.length} users
        </div>
      </div>

      {showForm && (
        <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl shadow-lg border border-slate-200 p-8 mb-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-slate-900">
              {editingId ? "Edit User Profile" : "Add New User"}
            </h3>
            <button
              onClick={handleCancel}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Full Name *</label>
              <input
                type="text"
                placeholder="Enter full name"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Email Address *</label>
              <input
                type="email"
                placeholder="user@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            {!editingId && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Password *</label>
                <input
                  type="password"
                  placeholder="Enter password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Company</label>
              <select
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              >
                <option value="">Select Company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.name}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Department</label>
              <select
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                disabled={!formData.company}
              >
                <option value="">Select Department</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>
              {!formData.company && (
                <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                  <span className="w-1 h-1 rounded-full bg-amber-600"></span>
                  Select a company first
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              >
                <option value="">Select Role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Approver Type</label>
              <select
                value={formData.approver_type}
                onChange={(e) => setFormData({ ...formData, approver_type: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              >
                <option value="">None</option>
                <option value="Procurement Head">Procurement Head</option>
                <option value="Procurement">Procurement</option>
                <option value="Department Head">Department Head</option>
                <option value="President">President</option>
                <option value="Requestor">Requestor</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Account Status</label>
              <div className="flex items-center gap-3 mt-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                  <span className={`ml-3 text-sm font-semibold ${formData.is_active ? 'text-green-700' : 'text-slate-600'}`}>
                    {formData.is_active ? 'Active' : 'Inactive'}
                  </span>
                </label>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {formData.is_active
                  ? 'User can sign in and access the system'
                  : 'User account is disabled and cannot sign in'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Multi-Company Access</label>
              <div className="flex items-center gap-3 mt-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.enable_multi_company_requests}
                    onChange={(e) => setFormData({ ...formData, enable_multi_company_requests: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className={`ml-3 text-sm font-semibold ${formData.enable_multi_company_requests ? 'text-blue-700' : 'text-slate-600'}`}>
                    {formData.enable_multi_company_requests ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {formData.enable_multi_company_requests
                  ? 'User can create requests for multiple companies'
                  : 'User is limited to their primary company only'}
              </p>
            </div>

            {formData.enable_multi_company_requests && (
              <div className="col-span-2 space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Allowed Companies *</label>
                <div className="border border-slate-300 rounded-xl p-3 bg-white max-h-48 overflow-y-auto">
                  {companies.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-2">No companies available</p>
                  ) : (
                    <div className="space-y-2">
                      {companies.map((company) => (
                        <label key={company.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={formData.allowed_companies.includes(company.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  allowed_companies: [...formData.allowed_companies, company.id]
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  allowed_companies: formData.allowed_companies.filter(id => id !== company.id)
                                });
                              }
                            }}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-slate-700">{company.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Select which companies this user can create requests for
                </p>
              </div>
            )}

            <div className="col-span-2 space-y-3">
              <label className="block text-sm font-semibold text-slate-700">E-Signature</label>
              <div className="relative">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-all group">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-2 text-slate-400 group-hover:text-slate-600 transition-colors" />
                    <p className="mb-1 text-sm text-slate-600 font-medium">
                      <span className="text-blue-600">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-slate-500">Image files only (max 10KB)</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
              {formData.e_sig && (
                <div className="relative group">
                  <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-blue-50 to-slate-50 rounded-xl border-2 border-blue-200">
                    <div className="flex items-center justify-center w-20 h-20 bg-white rounded-lg border border-slate-200 shadow-sm">
                      <img
                        src={formData.e_sig}
                        alt="E-Signature"
                        className="max-h-16 max-w-16 object-contain"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <ImageIcon size={16} className="text-blue-600" />
                        Signature uploaded
                      </p>
                      {formData.e_sig !== originalESig ? (
                        <p className="text-xs text-orange-600 mt-1 font-medium">Click "Update User" to save changes</p>
                      ) : (
                        <p className="text-xs text-green-600 mt-1 font-medium">Signature saved</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, e_sig: '' })}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      title="Remove signature"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
            <button
              onClick={editingId ? handleUpdate : handleAdd}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 focus:ring-4 focus:ring-blue-200 transition-all shadow-lg shadow-blue-500/30"
            >
              <Save size={18} />
              {editingId ? "Update User" : "Create User"}
            </button>
            <button
              onClick={handleCancel}
              className="px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">All Users</h3>
          <p className="text-sm text-slate-600 mt-0.5">{data.length} total users</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50">
              <tr>
                <th
                  className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => handleSort('full_name')}
                >
                  <div className="flex items-center gap-2">
                    Name
                    {sortField === 'full_name' ? (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="text-slate-400" />
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => handleSort('email')}
                >
                  <div className="flex items-center gap-2">
                    Email
                    {sortField === 'email' ? (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="text-slate-400" />
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => handleSort('company')}
                >
                  <div className="flex items-center gap-2">
                    Company
                    {sortField === 'company' ? (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="text-slate-400" />
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => handleSort('department')}
                >
                  <div className="flex items-center gap-2">
                    Department
                    {sortField === 'department' ? (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="text-slate-400" />
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => handleSort('role')}
                >
                  <div className="flex items-center gap-2">
                    Role
                    {sortField === 'role' ? (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="text-slate-400" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Approver Type</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Status</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-500">
                      <AlertCircle size={48} className="mb-3 text-slate-400" />
                      <p className="text-lg font-semibold">No users found</p>
                      <p className="text-sm mt-1">Try adjusting your filters or search terms</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAndSortedData.map((user) => (
                  <tr key={user.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all">
                  <td className="px-4 py-4 text-sm">
                    <div className="max-w-[150px] truncate font-semibold text-slate-900" title={user.full_name}>
                      {user.full_name}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <div className="max-w-[180px] truncate text-slate-600" title={user.email}>
                      {user.email}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <div className="max-w-[120px] truncate text-slate-600" title={user.company || '-'}>
                      {user.company || <span className="text-slate-400">-</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <div className="max-w-[120px] truncate text-slate-600" title={user.department || '-'}>
                      {user.department || <span className="text-slate-400">-</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <span className="capitalize px-3 py-1.5 bg-gradient-to-r from-slate-100 to-slate-200 text-slate-700 rounded-lg text-xs font-semibold whitespace-nowrap shadow-sm">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    {user.approver_type ? (
                      <span className="px-3 py-1.5 bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 rounded-lg text-xs font-semibold whitespace-nowrap inline-block shadow-sm">
                        {user.approver_type}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shadow-sm ${user.is_active ? 'bg-gradient-to-r from-green-100 to-green-200 text-green-800' : 'bg-gradient-to-r from-red-100 to-red-200 text-red-800'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <button
                      onClick={() => handleEdit(user)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all group"
                      title="Edit"
                    >
                      <Edit size={18} className="group-hover:scale-110 transition-transform" />
                    </button>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ChecklistsConfig({ data, reload }: { data: any[]; reload: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    item_name: '',
    description: '',
    is_required: false,
    pr_type: 'purchase_order',
    attachments: [] as { name: string; is_required: boolean }[]
  });
  const [newAttachment, setNewAttachment] = useState({ name: '', is_required: false });
  const [editingAttachmentIndex, setEditingAttachmentIndex] = useState<number | null>(null);
  const [editingAttachmentData, setEditingAttachmentData] = useState({ name: '', is_required: false });

  const handleAdd = async () => {
    try {
      if (editingId) {
        const { error } = await supabase.from('pr_checklists').update({
          item_name: formData.item_name,
          description: formData.description,
          is_required: formData.is_required,
          pr_type: formData.pr_type,
          attachments: formData.attachments,
        }).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('pr_checklists').insert({
          item_name: formData.item_name,
          description: formData.description,
          is_required: formData.is_required,
          pr_type: formData.pr_type,
          attachments: formData.attachments,
          order_index: data.length,
        });
        if (error) throw error;
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({
        item_name: '',
        description: '',
        is_required: false,
        pr_type: 'purchase_order',
        attachments: []
      });
      reload();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setFormData({
      item_name: item.item_name,
      description: item.description || '',
      is_required: item.is_required,
      pr_type: item.pr_type || 'purchase_order',
      attachments: item.attachments || []
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      item_name: '',
      description: '',
      is_required: false,
      pr_type: 'purchase_order',
      attachments: []
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this checklist item?')) return;
    try {
      const { error } = await supabase.from('pr_checklists').delete().eq('id', id);
      if (error) throw error;
      reload();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const addAttachment = () => {
    if (!newAttachment.name.trim()) {
      alert('Please enter an attachment name');
      return;
    }
    setFormData({
      ...formData,
      attachments: [...formData.attachments, { ...newAttachment }]
    });
    setNewAttachment({ name: '', is_required: false });
  };

  const removeAttachment = (index: number) => {
    setFormData({
      ...formData,
      attachments: formData.attachments.filter((_, i) => i !== index)
    });
    if (editingAttachmentIndex === index) {
      setEditingAttachmentIndex(null);
    }
  };

  const startEditingAttachment = (index: number) => {
    setEditingAttachmentIndex(index);
    setEditingAttachmentData({ ...formData.attachments[index] });
  };

  const saveAttachmentEdit = (index: number) => {
    if (!editingAttachmentData.name.trim()) {
      alert('Please enter an attachment name');
      return;
    }
    const updatedAttachments = [...formData.attachments];
    updatedAttachments[index] = { ...editingAttachmentData };
    setFormData({
      ...formData,
      attachments: updatedAttachments
    });
    setEditingAttachmentIndex(null);
  };

  const cancelAttachmentEdit = () => {
    setEditingAttachmentIndex(null);
    setEditingAttachmentData({ name: '', is_required: false });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">PR Checklists</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Add Item
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {editingId ? 'Edit Checklist Item' : 'Add Checklist Item'}
          </h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">PR Type</label>
            <select
              value={formData.pr_type}
              onChange={(e) => setFormData({ ...formData, pr_type: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="purchase_order">Purchase Order</option>
              <option value="non_purchase_order">Non-Purchase Order</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="Item Name"
            value={formData.item_name}
            onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg"
          />
          <input
            type="text"
            placeholder="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_required}
              onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">Required</span>
          </label>

          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium text-slate-900">Attachments</h3>

            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Attachment Name"
                  value={newAttachment.name}
                  onChange={(e) => setNewAttachment({ ...newAttachment, name: e.target.value })}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={addAttachment}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm whitespace-nowrap"
                >
                  <Plus size={16} className="inline mr-1" />
                  Add
                </button>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAttachment.is_required}
                  onChange={(e) => setNewAttachment({ ...newAttachment, is_required: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
                <span className="text-sm text-slate-700 font-medium">Mark as Required</span>
              </label>
            </div>

            {formData.attachments.length > 0 && (
              <div className="space-y-2">
                {formData.attachments.map((att, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded">
                    {editingAttachmentIndex === idx ? (
                      <>
                        <input
                          type="text"
                          value={editingAttachmentData.name}
                          onChange={(e) => setEditingAttachmentData({ ...editingAttachmentData, name: e.target.value })}
                          className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm"
                        />
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={editingAttachmentData.is_required}
                            onChange={(e) => setEditingAttachmentData({ ...editingAttachmentData, is_required: e.target.checked })}
                            className="w-3 h-3 text-blue-600 rounded"
                          />
                          <span className="text-xs text-slate-700">Req</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => saveAttachmentEdit(idx)}
                          className="text-green-600 hover:text-green-800"
                          title="Save"
                        >
                          <Save size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={cancelAttachmentEdit}
                          className="text-slate-600 hover:text-slate-800"
                          title="Cancel"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-slate-900">{att.name}</span>
                        <span className={`text-xs px-2 py-1 rounded ${att.is_required ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                          {att.is_required ? 'Required' : 'Optional'}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEditingAttachment(idx)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAttachment(idx)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              {editingId ? 'Update' : 'Save'}
            </button>
            <button onClick={handleCancel} className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">PR Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Item Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Required</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Attachments</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 text-sm">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                    {item.pr_type === 'purchase_order' ? 'PO' : 'Non-PO'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-900">{item.item_name}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{item.description}</td>
                <td className="px-6 py-4 text-sm">{item.is_required ? 'Yes' : 'No'}</td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {item.attachments && item.attachments.length > 0 ? (
                    <div className="space-y-1">
                      {item.attachments.map((att: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          {att.name} {att.is_required && <span className="text-red-600">*</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-6 py-4 text-sm">
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800" title="Edit">
                      <Edit size={16} />
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentModesConfig({ data, reload }: { data: any[]; reload: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    mode_name: '',
    description: '',
    line_names: [] as { name: string; is_required: boolean }[]
  });
  const [newLineName, setNewLineName] = useState({ name: '', is_required: false });
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [editingLineData, setEditingLineData] = useState({ name: '', is_required: false });

  const handleAdd = async () => {
    try {
      if (editingId) {
        const { error } = await supabase.from('payment_modes').update({
          mode_name: formData.mode_name,
          description: formData.description,
          line_names: formData.line_names
        }).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('payment_modes').insert({
          mode_name: formData.mode_name,
          description: formData.description,
          line_names: formData.line_names
        });
        if (error) throw error;
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ mode_name: '', description: '', line_names: [] });
      reload();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const handleEdit = (mode: any) => {
    setEditingId(mode.id);
    setFormData({
      mode_name: mode.mode_name,
      description: mode.description,
      line_names: mode.line_names || []
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ mode_name: '', description: '', line_names: [] });
    setEditingLineIndex(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this payment mode?')) return;
    try {
      const { error } = await supabase.from('payment_modes').delete().eq('id', id);
      if (error) throw error;
      reload();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const addLineName = () => {
    if (!newLineName.name.trim()) {
      alert('Please enter a line name');
      return;
    }
    setFormData({
      ...formData,
      line_names: [...formData.line_names, { ...newLineName }]
    });
    setNewLineName({ name: '', is_required: false });
  };

  const removeLineName = (index: number) => {
    setFormData({
      ...formData,
      line_names: formData.line_names.filter((_, i) => i !== index)
    });
    if (editingLineIndex === index) {
      setEditingLineIndex(null);
    }
  };

  const startEditingLine = (index: number) => {
    setEditingLineIndex(index);
    setEditingLineData({ ...formData.line_names[index] });
  };

  const saveLineEdit = (index: number) => {
    if (!editingLineData.name.trim()) {
      alert('Please enter a line name');
      return;
    }
    const updatedLines = [...formData.line_names];
    updatedLines[index] = { ...editingLineData };
    setFormData({
      ...formData,
      line_names: updatedLines
    });
    setEditingLineIndex(null);
  };

  const cancelLineEdit = () => {
    setEditingLineIndex(null);
    setEditingLineData({ name: '', is_required: false });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Payment Modes</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Add Mode
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {editingId ? 'Edit Payment Mode' : 'Add Payment Mode'}
          </h3>
          <input
            type="text"
            placeholder="Mode Name"
            value={formData.mode_name}
            onChange={(e) => setFormData({ ...formData, mode_name: e.target.value })}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg"
          />
          <input
            type="text"
            placeholder="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg"
          />

          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium text-slate-900">Line Names</h3>

            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Line Name"
                  value={newLineName.name}
                  onChange={(e) => setNewLineName({ ...newLineName, name: e.target.value })}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={addLineName}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm whitespace-nowrap"
                >
                  <Plus size={16} className="inline mr-1" />
                  Add
                </button>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newLineName.is_required}
                  onChange={(e) => setNewLineName({ ...newLineName, is_required: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
                <span className="text-sm text-slate-700 font-medium">Mark as Required</span>
              </label>
            </div>

            {formData.line_names.length > 0 && (
              <div className="space-y-2">
                {formData.line_names.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded">
                    {editingLineIndex === idx ? (
                      <>
                        <input
                          type="text"
                          value={editingLineData.name}
                          onChange={(e) => setEditingLineData({ ...editingLineData, name: e.target.value })}
                          className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm"
                        />
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={editingLineData.is_required}
                            onChange={(e) => setEditingLineData({ ...editingLineData, is_required: e.target.checked })}
                            className="w-3 h-3 text-blue-600 rounded"
                          />
                          <span className="text-xs text-slate-700">Req</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => saveLineEdit(idx)}
                          className="text-green-600 hover:text-green-800"
                          title="Save"
                        >
                          <Save size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={cancelLineEdit}
                          className="text-slate-600 hover:text-slate-800"
                          title="Cancel"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-slate-900">{line.name}</span>
                        <span className={`text-xs px-2 py-1 rounded ${line.is_required ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                          {line.is_required ? 'Required' : 'Optional'}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEditingLine(idx)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLineName(idx)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              {editingId ? 'Update' : 'Save'}
            </button>
            <button onClick={handleCancel} className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Mode Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Line Names</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.map((mode) => (
              <tr key={mode.id}>
                <td className="px-6 py-4 text-sm text-slate-900">{mode.mode_name}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{mode.description}</td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {mode.line_names && mode.line_names.length > 0 ? (
                    <div className="space-y-1">
                      {mode.line_names.map((line: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          {line.name} {line.is_required && <span className="text-red-600">*</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs ${mode.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {mode.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEdit(mode)} className="text-blue-600 hover:text-blue-800" title="Edit">
                      <Edit size={16} />
                    </button>
                    <button onClick={() => handleDelete(mode.id)} className="text-red-600 hover:text-red-800" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompaniesConfig({ data, reload }: { data: any[]; reload: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    api_id: '',
    president_min_amount: '0'
  });
  const [departments, setDepartments] = useState<any[]>([]);
  const [showDepartments, setShowDepartments] = useState<string | null>(null);

  const handleAdd = async () => {
    try {
      if (editingId) {
        const { error } = await supabase.from('companies').update({
          name: formData.name,
          api_id: formData.api_id || null,
          president_min_amount: parseFloat(formData.president_min_amount) || 0
        }).eq('id', editingId);
        if (error) throw error;
      } else {
        const payload = {
          name: formData.name,
          api_id: formData.api_id || null,
          president_min_amount: parseFloat(formData.president_min_amount) || 0
        };
        const { error } = await supabase.from('companies').insert(payload);
        if (error) throw error;
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', api_id: '', president_min_amount: '0' });
      reload();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const handleEdit = (company: any) => {
    setEditingId(company.id);
    setFormData({
      name: company.name,
      api_id: company.api_id || '',
      president_min_amount: company.president_min_amount?.toString() || '0'
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', approver_president: '', approver_email: '', president_min_amount: '0' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this company?')) return;
    try {
      const { error } = await supabase.from('companies').delete().eq('id', id);
      if (error) throw error;
      reload();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const loadDepartments = async (companyId: string) => {
    try {
      const { data: depts } = await supabase
        .from('departments')
        .select('*')
        .eq('company_id', companyId)
        .order('name', { ascending: true });
      setDepartments(depts || []);
      setShowDepartments(companyId);
    } catch (error: any) {
      alert('Error loading departments: ' + error.message);
    }
  };

  const toggleDepartments = (companyId: string) => {
    if (showDepartments === companyId) {
      setShowDepartments(null);
      setDepartments([]);
    } else {
      loadDepartments(companyId);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Companies</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Add Company
        </button>
      </div>

      {showForm && (
        <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl shadow-lg border border-slate-200 p-8 mb-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-slate-900">
              {editingId ? 'Edit Company' : 'Add Company'}
            </h3>
            <button
              onClick={handleCancel}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Company Name</label>
              <input
                type="text"
                placeholder="Enter company name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">API ID</label>
              <input
                type="text"
                placeholder="Enter API identifier"
                value={formData.api_id}
                onChange={(e) => setFormData({ ...formData, api_id: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              <p className="text-xs text-slate-500">External system API identifier</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">President Minimum Approval Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">₱</span>
                <input
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={formData.president_min_amount}
                  onChange={(e) => setFormData({ ...formData, president_min_amount: e.target.value })}
                  className="w-full pl-8 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <p className="text-xs text-slate-500">Amounts above this require president approval</p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 focus:ring-4 focus:ring-blue-200 transition-all shadow-lg shadow-blue-500/30"
            >
              <Save size={18} />
              {editingId ? 'Update Company' : 'Save Company'}
            </button>
            <button
              onClick={handleCancel}
              className="px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {data.map((company) => (
          <div key={company.id} className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden hover:shadow-xl transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-slate-900">{company.name}</h3>
                  {company.api_id && (
                    <div className="mt-1 text-xs text-slate-500 font-mono bg-slate-50 inline-block px-2 py-0.5 rounded">API: {company.api_id}</div>
                  )}
                  <div className="mt-3">
                    <div className="text-sm">
                      <span className="font-semibold text-slate-700">President Minimum Approval Amount:</span>
                      <span className="ml-2 text-slate-600 font-mono">
                        ₱{company.president_min_amount ? parseFloat(company.president_min_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-sm ${
                    company.is_active ? 'bg-gradient-to-r from-green-100 to-green-200 text-green-800' : 'bg-gradient-to-r from-red-100 to-red-200 text-red-800'
                  }`}>
                    {company.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button onClick={() => handleEdit(company)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit">
                    <Edit size={18} />
                  </button>
                  <button onClick={() => handleDelete(company.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <button
                onClick={() => toggleDepartments(company.id)}
                className="w-full px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                {showDepartments === company.id ? 'Hide Departments' : 'Manage Departments'}
              </button>

              {showDepartments === company.id && (
                <DepartmentManager
                  companyId={company.id}
                  departments={departments}
                  onReload={() => loadDepartments(company.id)}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DepartmentManager({ companyId, departments, onReload }: { companyId: string; departments: any[]; onReload: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  const handleAdd = async () => {
    try {
      if (editingId) {
        const { error } = await supabase.from('departments').update({
          name: formData.name,
          description: formData.description
        }).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('departments').insert({
          company_id: companyId,
          name: formData.name,
          description: formData.description
        });
        if (error) throw error;
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', description: '' });
      onReload();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const handleEdit = (dept: any) => {
    setEditingId(dept.id);
    setFormData({
      name: dept.name,
      description: dept.description || ''
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', description: '' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this department?')) return;
    try {
      const { error } = await supabase.from('departments').delete().eq('id', id);
      if (error) throw error;
      onReload();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-md font-semibold text-slate-900">Departments</h4>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          <Plus size={16} />
          Add Department
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-50 rounded-lg p-4 mb-4 space-y-3">
          <h5 className="text-sm font-semibold text-slate-900">
            {editingId ? 'Edit Department' : 'Add Department'}
          </h5>
          <input
            type="text"
            placeholder="Department Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <input
            type="text"
            placeholder="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              {editingId ? 'Update' : 'Save'}
            </button>
            <button onClick={handleCancel} className="px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-white text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {departments.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-sm">
          No departments added yet
        </div>
      ) : (
        <div className="space-y-2">
          {departments.map((dept) => (
            <div key={dept.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex-1">
                <div className="font-medium text-slate-900 text-sm">{dept.name}</div>
                {dept.description && (
                  <div className="text-xs text-slate-600 mt-0.5">{dept.description}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  dept.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {dept.is_active ? 'Active' : 'Inactive'}
                </span>
                <button onClick={() => handleEdit(dept)} className="text-blue-600 hover:text-blue-800" title="Edit">
                  <Edit size={14} />
                </button>
                <button onClick={() => handleDelete(dept.id)} className="text-red-600 hover:text-red-800" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HolidaysConfig({ data, reload }: { data: any[]; reload: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ holiday_date: '', holiday_name: '', is_recurring: false });

  const handleAdd = async () => {
    try {
      const { error } = await supabase.from('holidays').insert(formData);
      if (error) throw error;
      setShowForm(false);
      setFormData({ holiday_date: '', holiday_name: '', is_recurring: false });
      reload();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Holidays</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Add Holiday
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 space-y-4">
          <input
            type="date"
            value={formData.holiday_date}
            onChange={(e) => setFormData({ ...formData, holiday_date: e.target.value })}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg"
          />
          <input
            type="text"
            placeholder="Holiday Name"
            value={formData.holiday_name}
            onChange={(e) => setFormData({ ...formData, holiday_name: e.target.value })}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_recurring}
              onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
            />
            <span className="text-sm text-slate-700">Recurring Annually</span>
          </label>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg">
              Save
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Holiday Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Recurring</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.map((holiday) => (
              <tr key={holiday.id}>
                <td className="px-6 py-4 text-sm text-slate-900">
                  {new Date(holiday.holiday_date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">{holiday.holiday_name}</td>
                <td className="px-6 py-4 text-sm">{holiday.is_recurring ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VendorsAndItemsConfig() {
  const [activeTab, setActiveTab] = useState<'vendors' | 'items'>('vendors');

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900">Vendors & Items</h2>
        <p className="text-slate-600 mt-1">Manage vendors and items from BC API</p>
      </div>

      <div className="mb-6 border-b border-slate-200">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('vendors')}
            className={`px-6 py-3 font-semibold rounded-t-lg transition-all ${
              activeTab === 'vendors'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Vendors
          </button>
          <button
            onClick={() => setActiveTab('items')}
            className={`px-6 py-3 font-semibold rounded-t-lg transition-all ${
              activeTab === 'items'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Items
          </button>
        </div>
      </div>

      {activeTab === 'vendors' ? <VendorsList /> : <ItemsList />}
    </div>
  );
}

function VendorsList() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      loadVendors();
    }
  }, [selectedCompanyId]);

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, api_id')
        .order('name');

      if (error) throw error;
      setCompanies(data || []);

      if (data && data.length > 0) {
        setSelectedCompanyId(data[0].id);
      }
    } catch (error: any) {
      console.error('Error loading companies:', error);
      setError('Failed to load companies');
    }
  };

  const loadVendors = async () => {
    if (!selectedCompanyId) return;

    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('No active session found. Please log in again.');
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-vendors?company_id=${selectedCompanyId}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || `Failed to fetch vendors (status ${response.status})`);
        console.error('Vendor fetch error:', data);
        return;
      }

      setVendors(data.value || []);
    } catch (error: any) {
      console.error('Error loading vendors:', error);
      setError(error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const filteredVendors = vendors.filter((vendor) =>
    vendor.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vendor.number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1 mr-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Select Company
          </label>
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={loadVendors}
          disabled={loading}
          className="mt-7 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-5 h-5 text-red-600 mt-0.5">⚠</div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-900 mb-1">Error Loading Vendors</h4>
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by name or number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-600">Unable to load vendors. Please check the error message above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">All Vendors</h3>
            <p className="text-sm text-slate-600 mt-0.5">{filteredVendors.length} vendors found</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-100 to-slate-50">
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Number</th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Display Name</th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Phone</th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVendors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No vendors found
                    </td>
                  </tr>
                ) : (
                  filteredVendors.map((vendor) => (
                    <tr key={vendor.number} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all">
                      <td className="px-4 py-4 text-sm">
                        <div className="font-mono font-semibold text-slate-900">{vendor.number}</div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="font-semibold text-slate-900">{vendor.displayName}</div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="text-slate-600">{vendor.email || '-'}</div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="text-slate-600">{vendor.phoneNumber || '-'}</div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="font-mono text-slate-900">
                          {vendor.balance ? `₱${parseFloat(vendor.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemsList() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      loadItems();
    }
  }, [selectedCompanyId]);

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, api_id')
        .order('name');

      if (error) throw error;
      setCompanies(data || []);

      if (data && data.length > 0) {
        setSelectedCompanyId(data[0].id);
      }
    } catch (error: any) {
      console.error('Error loading companies:', error);
      setError('Failed to load companies');
    }
  };

  const loadItems = async () => {
    if (!selectedCompanyId) return;

    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('No active session found. Please log in again.');
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-items?company_id=${selectedCompanyId}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || `Failed to fetch items (status ${response.status})`);
        console.error('Items fetch error:', data);
        return;
      }

      setItems(data.value || []);
    } catch (error: any) {
      console.error('Error loading items:', error);
      setError(error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter((item) =>
    item.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1 mr-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Select Company
          </label>
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={loadItems}
          disabled={loading}
          className="mt-7 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-5 h-5 text-red-600 mt-0.5">⚠</div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-900 mb-1">Error Loading Items</h4>
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by name or number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-600">Unable to load items. Please check the error message above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">All Items</h3>
            <p className="text-sm text-slate-600 mt-0.5">{filteredItems.length} items found</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-100 to-slate-50">
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Number</th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Display Name</th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Unit Price</th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Inventory</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No items found
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.number} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all">
                      <td className="px-4 py-4 text-sm">
                        <div className="font-mono font-semibold text-slate-900">{item.number}</div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="font-semibold text-slate-900">{item.displayName}</div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="text-slate-600">{item.type || '-'}</div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="font-mono text-slate-900">
                          {item.unitPrice ? `₱${parseFloat(item.unitPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="text-slate-600">{item.inventory !== undefined ? item.inventory : '-'}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
