import { Settings, Users, CheckSquare, CreditCard, Calendar, Building2, GitBranch, Hash, Package, Mail, DollarSign, Percent, Shield, UserCog } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission, MODULE_PERMISSIONS } from '../../lib/permissions';
import { ViewType } from '../Layout';

interface ConfigMenuProps {
  onViewChange: (view: ViewType) => void;
}

interface ConfigCard {
  id: ViewType;
  label: string;
  description: string;
  icon: any;
  permission?: string;
}

const configCards: ConfigCard[] = [
  {
    id: 'config-impersonation',
    label: 'View as User',
    description: 'Impersonate another user for testing',
    icon: UserCog,
    permission: MODULE_PERMISSIONS.ROLES_PERMISSIONS
  },
  {
    id: 'config-checklists',
    label: 'PR Checklists',
    description: 'Manage purchase requisition checklists',
    icon: CheckSquare,
    permission: MODULE_PERMISSIONS.APPROVAL_FLOW
  },
  {
    id: 'config-payment-modes',
    label: 'Payment Modes',
    description: 'Configure payment methods',
    icon: CreditCard,
    permission: MODULE_PERMISSIONS.APPROVAL_FLOW
  },
  {
    id: 'config-holidays',
    label: 'Holidays',
    description: 'Set company holidays',
    icon: Calendar,
    permission: MODULE_PERMISSIONS.APPROVAL_FLOW
  },
  {
    id: 'config-companies',
    label: 'Companies',
    description: 'Manage company information',
    icon: Building2,
    permission: MODULE_PERMISSIONS.APPROVAL_FLOW
  },
  {
    id: 'config-approval-flows',
    label: 'Approval Flows',
    description: 'Configure approval workflows',
    icon: GitBranch,
    permission: MODULE_PERMISSIONS.APPROVAL_FLOW
  },
  {
    id: 'config-number-series',
    label: 'Number Series',
    description: 'Manage document numbering',
    icon: Hash,
    permission: MODULE_PERMISSIONS.NUMBER_SERIES
  },
  {
    id: 'config-vendors-items',
    label: 'Vendors and Items',
    description: 'Sync vendors and items data',
    icon: Package,
    permission: MODULE_PERMISSIONS.PURCHASE_REQUISITION
  },
  {
    id: 'config-smtp',
    label: 'SMTP Settings',
    description: 'Configure email notifications',
    icon: Mail,
    permission: MODULE_PERMISSIONS.APPROVAL_FLOW
  },
  {
    id: 'config-expense-types',
    label: 'Type of Expense',
    description: 'Manage expense categories',
    icon: DollarSign,
    permission: MODULE_PERMISSIONS.APPROVAL_FLOW
  },
  {
    id: 'config-withholding-tax-rates',
    label: 'Withholding Tax Rates',
    description: 'Configure tax rates',
    icon: Percent,
    permission: MODULE_PERMISSIONS.APPROVAL_FLOW
  },
  {
    id: 'config-roles-permissions',
    label: 'Roles & Permissions',
    description: 'Manage user roles and access',
    icon: Shield,
    permission: MODULE_PERMISSIONS.ROLES_PERMISSIONS
  },
];

export function ConfigMenu({ onViewChange }: ConfigMenuProps) {
  const { profile, permissions } = useAuth();

  const canAccessConfig = (config: ConfigCard) => {
    if (!config.permission) return true;
    return hasPermission(permissions, config.permission);
  };

  const filteredConfigs = configCards.filter(canAccessConfig);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Configuration</h1>
        <p className="text-slate-600">Manage system settings and configurations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredConfigs.map((config) => {
          const Icon = config.icon;
          return (
            <button
              key={config.id}
              onClick={() => onViewChange(config.id)}
              className="bg-white rounded-lg border border-slate-200 p-6 text-left hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-blue-600 transition">
                    {config.label}
                  </h3>
                  <p className="text-sm text-slate-600">{config.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
