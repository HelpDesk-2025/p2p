import { useState, useEffect } from 'react';
import { supabase, UserProfile } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Eye, Search, User, Building, Briefcase } from 'lucide-react';

export function ImpersonationConfig() {
  const { impersonateUser, actualProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [searchTerm, selectedRole, selectedCompany, users]);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('full_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = users.filter(user => user.id !== actualProfile?.id);

    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.department.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedRole !== 'all') {
      filtered = filtered.filter(user => user.role === selectedRole);
    }

    if (selectedCompany !== 'all') {
      filtered = filtered.filter(user => user.company_id === selectedCompany);
    }

    setFilteredUsers(filtered);
  };

  const handleImpersonate = async (userId: string) => {
    try {
      await impersonateUser(userId);
      alert('Now viewing as selected user. You will see the application from their perspective.');
    } catch (error: any) {
      alert(error.message || 'Failed to impersonate user');
    }
  };

  const roles = Array.from(new Set(users.map(u => u.role).filter(Boolean))).sort();
  const companies = Array.from(new Set(users.map(u => ({ id: u.company_id, name: u.company_name }))))
    .filter((v, i, a) => v.id && v.name && a.findIndex(t => t.id === v.id) === i)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-600">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Eye className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">View as User</h3>
            <p className="text-sm text-blue-700">
              Select a user to view the application from their perspective. This helps you understand what different users see
              and troubleshoot issues. A banner will appear at the top showing you're in view mode.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            <Search className="w-4 h-4 inline mr-1" />
            Search Users
          </label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Name, email, or department..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            <Briefcase className="w-4 h-4 inline mr-1" />
            Filter by Role
          </label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Roles</option>
            {roles.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            <Building className="w-4 h-4 inline mr-1" />
            Filter by Company
          </label>
          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Companies</option>
            {companies.map(company => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">User</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Role</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Department</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Company</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Status</th>
              <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No users found matching your filters
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-slate-900">{user.full_name}</div>
                      <div className="text-sm text-slate-500">{user.email}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.role === 'admin' ? 'bg-red-100 text-red-800' :
                      user.role === 'approver' ? 'bg-blue-100 text-blue-800' :
                      user.role === 'procurement' ? 'bg-green-100 text-green-800' :
                      'bg-slate-100 text-slate-800'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{user.department}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{user.company_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
                    }`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleImpersonate(user.id)}
                      disabled={!user.is_active}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                    >
                      <Eye className="w-4 h-4" />
                      View as User
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-slate-500">
        Showing {filteredUsers.length} of {users.filter(u => u.id !== actualProfile?.id).length} users
      </div>
    </div>
  );
}
