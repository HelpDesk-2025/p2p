import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Save, X, Shield, Key, CreditCard as Edit } from 'lucide-react';

interface Role {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

interface Permission {
  id: string;
  name: string;
  description: string;
  module: string;
  is_active: boolean;
  created_at: string;
}

interface RolePermission {
  role_id: string;
  permission_id: string;
}

export function RolesPermissionsConfig() {
  const [activeTab, setActiveTab] = useState<'roles' | 'permissions' | 'assign'>('roles');
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [showPermissionForm, setShowPermissionForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editingPermission, setEditingPermission] = useState<Permission | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');

  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    is_active: true,
  });

  const [permissionForm, setPermissionForm] = useState({
    name: '',
    description: '',
    module: '',
    is_active: true,
  });

  const modules = [
    'purchase_requisition',
    'canvass',
    'petty_cash',
    'cash_advance',
    'reimbursement',
    'pr_approval',
    'canvass_approval',
    'petty_cash_approval',
    'cash_advance_approval',
    'reimbursement_approval',
    'sme_approval',
    'petty_cash_release',
    'procurement_checking',
    'approval_ledger',
    'approved_rejected',
    'configuration',
  ];

  useEffect(() => {
    loadRoles();
    loadPermissions();
    loadRolePermissions();
  }, []);

  const loadRoles = async () => {
    const { data } = await supabase
      .from('roles')
      .select('*')
      .order('name', { ascending: true });
    setRoles(data || []);
  };

  const loadPermissions = async () => {
    const { data } = await supabase
      .from('permissions')
      .select('*')
      .order('module, name', { ascending: true });
    setPermissions(data || []);
  };

  const loadRolePermissions = async () => {
    const { data } = await supabase
      .from('role_permissions')
      .select('role_id, permission_id');
    setRolePermissions(data || []);
  };

  const handleSaveRole = async () => {
    setLoading(true);
    try {
      if (editingRole) {
        const { error } = await supabase
          .from('roles')
          .update(roleForm)
          .eq('id', editingRole.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('roles')
          .insert([roleForm]);
        if (error) throw error;
      }
      setShowRoleForm(false);
      setEditingRole(null);
      setRoleForm({ name: '', description: '', is_active: true });
      loadRoles();
    } catch (error: any) {
      alert('Error saving role: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePermission = async () => {
    setLoading(true);
    try {
      if (editingPermission) {
        const { error } = await supabase
          .from('permissions')
          .update(permissionForm)
          .eq('id', editingPermission.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('permissions')
          .insert([permissionForm]);
        if (error) throw error;
      }
      setShowPermissionForm(false);
      setEditingPermission(null);
      setPermissionForm({ name: '', description: '', module: '', is_active: true });
      loadPermissions();
    } catch (error: any) {
      alert('Error saving permission: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (!confirm('Are you sure you want to delete this role?')) return;
    const { error } = await supabase.from('roles').delete().eq('id', id);
    if (error) {
      alert('Error deleting role: ' + error.message);
    } else {
      loadRoles();
    }
  };

  const handleDeletePermission = async (id: string) => {
    if (!confirm('Are you sure you want to delete this permission?')) return;
    const { error } = await supabase.from('permissions').delete().eq('id', id);
    if (error) {
      alert('Error deleting permission: ' + error.message);
    } else {
      loadPermissions();
    }
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description || '',
      is_active: role.is_active,
    });
    setShowRoleForm(true);
  };

  const handleEditPermission = (permission: Permission) => {
    setEditingPermission(permission);
    setPermissionForm({
      name: permission.name,
      description: permission.description || '',
      module: permission.module,
      is_active: permission.is_active,
    });
    setShowPermissionForm(true);
  };

  const hasPermission = (roleId: string, permissionId: string) => {
    return rolePermissions.some(
      (rp) => rp.role_id === roleId && rp.permission_id === permissionId
    );
  };

  const handleTogglePermission = async (roleId: string, permissionId: string) => {
    const exists = hasPermission(roleId, permissionId);

    if (exists) {
      const { error } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId)
        .eq('permission_id', permissionId);
      if (error) {
        alert('Error removing permission: ' + error.message);
      } else {
        loadRolePermissions();
      }
    } else {
      const { error } = await supabase
        .from('role_permissions')
        .insert([{ role_id: roleId, permission_id: permissionId }]);
      if (error) {
        alert('Error assigning permission: ' + error.message);
      } else {
        loadRolePermissions();
      }
    }
  };

  const renderRolesTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-900">Manage Roles</h3>
        <button
          onClick={() => {
            setShowRoleForm(true);
            setEditingRole(null);
            setRoleForm({ name: '', description: '', is_active: true });
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={18} />
          Add Role
        </button>
      </div>

      {showRoleForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 space-y-4">
          <h4 className="font-semibold text-slate-900">
            {editingRole ? 'Edit Role' : 'New Role'}
          </h4>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role Name</label>
            <input
              type="text"
              value={roleForm.name}
              onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g., manager"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={roleForm.description}
              onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              rows={3}
              placeholder="Role description"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="role-active"
              checked={roleForm.is_active}
              onChange={(e) => setRoleForm({ ...roleForm, is_active: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <label htmlFor="role-active" className="text-sm font-medium text-slate-700">
              Active
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowRoleForm(false);
                setEditingRole(null);
              }}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveRole}
              disabled={loading || !roleForm.name}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={18} />
              Save
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {roles.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  No roles found
                </td>
              </tr>
            ) : (
              roles.map((role) => (
                <tr key={role.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{role.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{role.description}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        role.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {role.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEditRole(role)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteRole(role.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
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

  const renderPermissionsTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-900">Manage Permissions</h3>
        <button
          onClick={() => {
            setShowPermissionForm(true);
            setEditingPermission(null);
            setPermissionForm({ name: '', description: '', module: '', is_active: true });
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={18} />
          Add Permission
        </button>
      </div>

      {showPermissionForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 space-y-4">
          <h4 className="font-semibold text-slate-900">
            {editingPermission ? 'Edit Permission' : 'New Permission'}
          </h4>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Permission Name</label>
            <input
              type="text"
              value={permissionForm.name}
              onChange={(e) => setPermissionForm({ ...permissionForm, name: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g., create_invoice"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={permissionForm.description}
              onChange={(e) => setPermissionForm({ ...permissionForm, description: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              rows={3}
              placeholder="Permission description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Module</label>
            <select
              value={permissionForm.module}
              onChange={(e) => setPermissionForm({ ...permissionForm, module: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            >
              <option value="">Select module</option>
              {modules.map((module) => (
                <option key={module} value={module}>
                  {module.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="permission-active"
              checked={permissionForm.is_active}
              onChange={(e) => setPermissionForm({ ...permissionForm, is_active: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <label htmlFor="permission-active" className="text-sm font-medium text-slate-700">
              Active
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowPermissionForm(false);
                setEditingPermission(null);
              }}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSavePermission}
              disabled={loading || !permissionForm.name || !permissionForm.module}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={18} />
              Save
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Module</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {permissions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  No permissions found
                </td>
              </tr>
            ) : (
              permissions.map((permission) => (
                <tr key={permission.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{permission.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{permission.description}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {permission.module.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        permission.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {permission.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEditPermission(permission)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeletePermission(permission.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
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

  const configSubPermissionLabels: Record<string, string> = {
    'config_approvers': 'Approvers',
    'config_users': 'Users',
    'config_view_as_users': 'View as Users',
    'config_pr_checklists': 'PR Checklists',
    'config_payment_modes': 'Payment Modes',
    'config_holidays': 'Holidays',
    'config_companies': 'Companies',
    'config_approval_flows': 'Approval Flows',
    'config_number_series': 'Number Series',
    'config_vendors_items': 'Vendors & Items',
    'config_smtp_settings': 'SMTP Settings',
    'config_expense_types': 'Type of Expense',
    'config_tax_rates': 'Withholding Tax Rates',
    'config_roles_permissions': 'Roles & Permission',
  };

  const renderAssignTab = () => {
    const groupedPermissions = permissions.reduce((acc, permission) => {
      if (!acc[permission.module]) {
        acc[permission.module] = [];
      }
      acc[permission.module].push(permission);
      return acc;
    }, {} as Record<string, Permission[]>);

    const mainConfigPermission = permissions.find(p => p.name === 'Configuration' && p.module === 'configuration');
    const configSubPermissions = permissions.filter(p => p.name.startsWith('config_') && p.module === 'configuration');
    const hasConfigPermission = selectedRole && mainConfigPermission ? hasPermission(selectedRole, mainConfigPermission.id) : false;

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-900">Assign Permissions to Roles</h3>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Select Role:</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">All Roles</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedRole ? (
          <div className="space-y-6">
            {Object.entries(groupedPermissions).map(([module, perms]) => (
              <div key={module} className="bg-white rounded-lg border border-slate-200 p-6">
                <h4 className="font-semibold text-slate-900 mb-4">
                  {module.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {perms.map((permission) => {
                    if (permission.name.startsWith('config_')) return null;

                    return (
                      <label
                        key={permission.id}
                        className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={hasPermission(selectedRole, permission.id)}
                          onChange={() => handleTogglePermission(selectedRole, permission.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <div>
                          <div className="text-sm font-medium text-slate-900">{permission.name}</div>
                          {permission.description && (
                            <div className="text-xs text-slate-500">{permission.description}</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>

                {module === 'configuration' && hasConfigPermission && configSubPermissions.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <h5 className="font-medium text-slate-700 mb-3 text-sm">Configuration Sub-Permissions:</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {configSubPermissions.map((subPerm) => (
                        <label
                          key={subPerm.id}
                          className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={hasPermission(selectedRole, subPerm.id)}
                            onChange={() => handleTogglePermission(selectedRole, subPerm.id)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="text-sm font-medium text-slate-700">
                            {configSubPermissionLabels[subPerm.name] || subPerm.name}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Permission</th>
                  {roles.map((role) => (
                    <th key={role.id} className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">
                      {role.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {Object.entries(groupedPermissions).map(([module, perms]) => (
                  <>
                    <tr key={module} className="bg-slate-50">
                      <td colSpan={roles.length + 1} className="px-6 py-2 text-sm font-semibold text-slate-700">
                        {module.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                      </td>
                    </tr>
                    {perms.map((permission) => {
                      if (permission.name.startsWith('config_')) return null;

                      return (
                        <tr key={permission.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm text-slate-900">
                            <div>{permission.name}</div>
                            {permission.description && (
                              <div className="text-xs text-slate-500">{permission.description}</div>
                            )}
                          </td>
                          {roles.map((role) => (
                            <td key={role.id} className="px-6 py-4 text-center">
                              <input
                                type="checkbox"
                                checked={hasPermission(role.id, permission.id)}
                                onChange={() => handleTogglePermission(role.id, permission.id)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {module === 'configuration' && configSubPermissions.length > 0 && (
                      <>
                        <tr className="bg-blue-50">
                          <td colSpan={roles.length + 1} className="px-6 py-2 text-xs font-semibold text-blue-700">
                            Configuration Sub-Permissions (Visible when Configuration is checked)
                          </td>
                        </tr>
                        {configSubPermissions.map((subPerm) => (
                          <tr key={subPerm.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 text-sm text-slate-900 pl-12">
                              <div>{configSubPermissionLabels[subPerm.name] || subPerm.name}</div>
                              {subPerm.description && (
                                <div className="text-xs text-slate-500">{subPerm.description}</div>
                              )}
                            </td>
                            {roles.map((role) => (
                              <td key={role.id} className="px-6 py-4 text-center">
                                <input
                                  type="checkbox"
                                  checked={hasPermission(role.id, subPerm.id)}
                                  onChange={() => handleTogglePermission(role.id, subPerm.id)}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-slate-700">
        <Shield size={24} />
        <h2 className="text-2xl font-bold">Roles & Permissions</h2>
      </div>

      <div className="border-b border-slate-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('roles')}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === 'roles'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Shield size={18} />
              Roles
            </div>
          </button>
          <button
            onClick={() => setActiveTab('permissions')}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === 'permissions'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Key size={18} />
              Permissions
            </div>
          </button>
          <button
            onClick={() => setActiveTab('assign')}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === 'assign'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Assign Permissions
          </button>
        </nav>
      </div>

      <div>
        {activeTab === 'roles' && renderRolesTab()}
        {activeTab === 'permissions' && renderPermissionsTab()}
        {activeTab === 'assign' && renderAssignTab()}
      </div>
    </div>
  );
}
