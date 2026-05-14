import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, hasAnyPermission, MODULE_PERMISSIONS } from '../lib/permissions';
import { supabase } from '../lib/supabase';
import { ImpersonationBanner } from './ImpersonationBanner';
import {
  LayoutDashboard,
  FileText,
  Search,
  Wallet,
  Banknote,
  Receipt,
  ShoppingCart,
  CheckSquare,
  ClipboardCheck,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  BookOpen,
  UserCheck,
  KeyRound,
  ScrollText,
  AlertTriangle,
  History,
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export type ViewType =
  | 'dashboard'
  | 'pr-request'
  | 'canvass-request'
  | 'petty-cash-request'
  | 'cash-advance-request'
  | 'reimbursement-request'
  | 'po-request'
  | 'pr-approval'
  | 'po-approval'
  | 'canvass-approval'
  | 'petty-cash-approval'
  | 'cash-advance-approval'
  | 'reimbursement-approval'
  | 'sme-approval'
  | 'petty-cash-release'
  | 'procurement-checking'
  | 'approval-ledger'
  | 'config-approvers'
  | 'config-users'
  | 'config-checklists'
  | 'config-payment-modes'
  | 'config-holidays'
  | 'config-companies'
  | 'config-approval-flows'
  | 'config-number-series'
  | 'config-smtp'
  | 'config-vendors-items'
  | 'config-expense-types'
  | 'config-roles-permissions'
  | 'config-impersonation'
  | 'config-withholding-tax-rates'
  | 'config-announcements'
  | 'config-api-integrations'
  | 'change-password'
  | 'user-manual'
  | 'approved-rejected';

interface MenuItem {
  id: ViewType;
  label: string;
  icon: any;
  permission?: string | string[];
  group?: string;
}

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'main' },
  { id: 'user-manual', label: 'User Manual', icon: BookOpen, group: 'main' },
  {
    id: 'pr-request',
    label: 'Purchase Requisition',
    icon: FileText,
    permission: MODULE_PERMISSIONS.PURCHASE_REQUISITION,
    group: 'requests',
  },
  {
    id: 'canvass-request',
    label: 'Canvass',
    icon: Search,
    permission: MODULE_PERMISSIONS.CANVASS,
    group: 'requests'
  },
  {
    id: 'petty-cash-request',
    label: 'Petty Cash',
    icon: Wallet,
    permission: MODULE_PERMISSIONS.PETTY_CASH,
    group: 'requests'
  },
  {
    id: 'cash-advance-request',
    label: 'Cash Advance',
    icon: Banknote,
    permission: MODULE_PERMISSIONS.CASH_ADVANCE,
    group: 'requests'
  },
  {
    id: 'reimbursement-request',
    label: 'Reimbursement | Liquidation',
    icon: Receipt,
    permission: MODULE_PERMISSIONS.REIMBURSEMENT,
    group: 'requests',
  },
  {
    id: 'po-request',
    label: 'Purchase Order',
    icon: ShoppingCart,
    permission: MODULE_PERMISSIONS.PURCHASE_ORDER,
    group: 'requests',
  },
  {
    id: 'pr-approval',
    label: 'PR Approval',
    icon: CheckSquare,
    permission: MODULE_PERMISSIONS.PR_APPROVAL,
    group: 'approvals',
  },
  {
    id: 'canvass-approval',
    label: 'Canvass Approval',
    icon: CheckSquare,
    permission: MODULE_PERMISSIONS.CANVASS_APPROVAL,
    group: 'approvals',
  },
  {
    id: 'petty-cash-approval',
    label: 'Petty Cash Approval',
    icon: CheckSquare,
    permission: MODULE_PERMISSIONS.PETTY_CASH_APPROVAL,
    group: 'approvals',
  },
  {
    id: 'cash-advance-approval',
    label: 'Cash Advance Approval',
    icon: CheckSquare,
    permission: MODULE_PERMISSIONS.CASH_ADVANCE_APPROVAL,
    group: 'approvals',
  },
  {
    id: 'reimbursement-approval',
    label: 'Reimbursement | Liquidation Approval',
    icon: CheckSquare,
    permission: MODULE_PERMISSIONS.REIMBURSEMENT_APPROVAL,
    group: 'approvals',
  },
  {
    id: 'po-approval',
    label: 'PO Approval',
    icon: CheckSquare,
    permission: MODULE_PERMISSIONS.PO_APPROVAL,
    group: 'approvals',
  },
  {
    id: 'sme-approval',
    label: 'SME Approval',
    icon: UserCheck,
    permission: MODULE_PERMISSIONS.SME_APPROVAL,
    group: 'approvals',
  },
  {
    id: 'petty-cash-release',
    label: 'Petty Cash Release',
    icon: Banknote,
    permission: MODULE_PERMISSIONS.PETTY_CASH_RELEASE,
    group: 'approvals',
  },
  {
    id: 'procurement-checking',
    label: 'Procurement Checking',
    icon: ClipboardCheck,
    permission: MODULE_PERMISSIONS.PROCUREMENT_CHECKING,
    group: 'procurement',
  },
  {
    id: 'approval-ledger',
    label: 'Approval Ledger',
    icon: ScrollText,
    permission: MODULE_PERMISSIONS.APPROVAL_LEDGER,
    group: 'procurement',
  },
  {
    id: 'approved-rejected',
    label: 'Approval Logs',
    icon: History,
    permission: MODULE_PERMISSIONS.APPROVED_REJECTED,
    group: 'procurement',
  },
  {
    id: 'change-password',
    label: 'Change Password',
    icon: KeyRound,
    group: 'profile',
  },
];

const configItems: MenuItem[] = [
  { id: 'config-approvers', label: 'Approvers', icon: Settings, permission: 'config_approvers' },
  { id: 'config-users', label: 'Users', icon: Settings, permission: 'config_users' },
  { id: 'config-impersonation', label: 'View as User', icon: Settings, permission: 'config_view_as_users' },
  { id: 'config-checklists', label: 'PR Checklists', icon: Settings, permission: 'config_pr_checklists' },
  { id: 'config-payment-modes', label: 'Payment Modes', icon: Settings, permission: 'config_payment_modes' },
  { id: 'config-holidays', label: 'Holidays', icon: Settings, permission: 'config_holidays' },
  { id: 'config-companies', label: 'Companies', icon: Settings, permission: 'config_companies' },
  { id: 'config-approval-flows', label: 'Approval Flows', icon: Settings, permission: 'config_approval_flows' },
  { id: 'config-number-series', label: 'Number Series', icon: Settings, permission: 'config_number_series' },
  { id: 'config-vendors-items', label: 'Vendors & Items', icon: Settings, permission: 'config_vendors_items' },
  { id: 'config-smtp', label: 'SMTP Settings', icon: Settings, permission: 'config_smtp_settings' },
  { id: 'config-expense-types', label: 'Type of Expense', icon: Settings, permission: 'config_expense_types' },
  { id: 'config-withholding-tax-rates', label: 'Withholding Tax Rates', icon: Settings, permission: 'config_tax_rates' },
  { id: 'config-roles-permissions', label: 'Roles & Permissions', icon: Settings, permission: 'config_roles_permissions' },
  { id: 'config-announcements', label: 'Announcements', icon: Settings, permission: 'config_roles_permissions' },
  { id: 'config-api-integrations', label: 'API Integration', icon: Settings, permission: 'config_api_integrations' },
];

const VIEW_KEYS_EXEMPT_FROM_COMPANY_GATING: Set<string> = new Set([
  'dashboard',
  'user-manual',
  'change-password',
]);

export function Layout({ children, currentView, onViewChange }: LayoutProps) {
  const { profile, permissions, signOut, showInactivityWarning, inactivityCountdown, resetInactivityTimer } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [allowedPageKeys, setAllowedPageKeys] = useState<Set<string> | null>(null);

  useEffect(() => {
    const loadCompanyPerms = async () => {
      if (!profile) {
        setAllowedPageKeys(null);
        return;
      }
      if (profile.role === 'admin' || permissions?.hasFullAccess) {
        setAllowedPageKeys(null);
        return;
      }

      const companyIds: string[] = [];
      if (profile.enable_multi_company_requests && Array.isArray(profile.allowed_companies) && profile.allowed_companies.length > 0) {
        companyIds.push(...profile.allowed_companies);
      } else if (profile.company_id) {
        companyIds.push(profile.company_id);
      }

      if (companyIds.length === 0) {
        setAllowedPageKeys(new Set());
        return;
      }

      const { data } = await supabase
        .from('company_page_permissions')
        .select('company_id, page_key, enabled')
        .in('company_id', companyIds)
        .eq('enabled', true);

      const allowedPages = new Set<string>();
      (data || []).forEach((row: any) => allowedPages.add(row.page_key));
      setAllowedPageKeys(allowedPages);
    };

    loadCompanyPerms();
  }, [profile, permissions?.hasFullAccess]);

  const handleSignOut = async () => {
    await signOut();
  };

  const handleStayLoggedIn = () => {
    resetInactivityTimer();
  };

  const canAccessItem = (item: MenuItem) => {
    if (!item.permission) return true;
    if (Array.isArray(item.permission)) {
      return hasAnyPermission(permissions, item.permission);
    }
    return hasPermission(permissions, item.permission);
  };

  const passesCompanyPageFilter = (item: MenuItem) => {
    if (allowedPageKeys === null) return true;
    if (VIEW_KEYS_EXEMPT_FROM_COMPANY_GATING.has(item.id as string)) return true;
    return allowedPageKeys.has(item.id as string);
  };

  const filteredMenuItems = menuItems.filter(
    (item) => canAccessItem(item) && passesCompanyPageFilter(item)
  );
  const filteredConfigItems = configItems.filter(
    (item) => canAccessItem(item) && passesCompanyPageFilter(item)
  );

  const requestItems = filteredMenuItems.filter((item) => item.group === 'requests');
  const approvalItems = filteredMenuItems.filter((item) => item.group === 'approvals');
  const procurementItems = filteredMenuItems.filter((item) => item.group === 'procurement');

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-200 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <img src="/p2p_logo.png" alt="Point to Point" className="h-10 w-auto object-contain" />
              <span className="text-2xl font-bold text-slate-900">P2P</span>
            </div>
            <p className="text-sm text-slate-600 truncate">{profile?.full_name}</p>
            <p className="text-xs text-slate-500 capitalize truncate">{profile?.role}</p>
          </div>

          <nav className="flex-1 overflow-y-auto overflow-x-hidden p-4">
            <div className="space-y-1">
              <NavItem
                item={filteredMenuItems.find((item) => item.id === 'dashboard')!}
                active={currentView === 'dashboard'}
                onClick={() => {
                  onViewChange('dashboard');
                  setMobileMenuOpen(false);
                }}
              />
              {filteredMenuItems.find((item) => item.id === 'user-manual') && (
                <NavItem
                  item={filteredMenuItems.find((item) => item.id === 'user-manual')!}
                  active={currentView === 'user-manual'}
                  onClick={() => {
                    onViewChange('user-manual');
                    setMobileMenuOpen(false);
                  }}
                />
              )}
            </div>

            {requestItems.length > 0 && (
              <div className="mt-6">
                <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Requests
                </h3>
                <div className="space-y-1">
                  {requestItems.map((item) => (
                    <NavItem
                      key={item.id}
                      item={item}
                      active={currentView === item.id}
                      onClick={() => {
                        onViewChange(item.id);
                        setMobileMenuOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {approvalItems.length > 0 && (
              <div className="mt-6">
                <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Approvals
                </h3>
                <div className="space-y-1">
                  {approvalItems.map((item) => (
                    <NavItem
                      key={item.id}
                      item={item}
                      active={currentView === item.id}
                      onClick={() => {
                        onViewChange(item.id);
                        setMobileMenuOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {procurementItems.length > 0 && (
              <div className="mt-6">
                <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Checking
                </h3>
                <div className="space-y-1">
                  {procurementItems.map((item) => (
                    <NavItem
                      key={item.id}
                      item={item}
                      active={currentView === item.id}
                      onClick={() => {
                        onViewChange(item.id);
                        setMobileMenuOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredConfigItems.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setConfigOpen(!configOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition"
                >
                  <div className="flex items-center gap-3">
                    <Settings size={20} />
                    Configuration
                  </div>
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${configOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {configOpen && (
                  <div className="mt-1 space-y-1 ml-4">
                    {filteredConfigItems.map((item) => (
                      <NavItem
                        key={item.id}
                        item={item}
                        active={currentView === item.id}
                        onClick={() => {
                          onViewChange(item.id);
                          setMobileMenuOpen(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>

          <div className="p-4 border-t border-slate-200 space-y-2 flex-shrink-0">
            {filteredMenuItems.find((item) => item.id === 'change-password') && (
              <NavItem
                item={filteredMenuItems.find((item) => item.id === 'change-password')!}
                active={currentView === 'change-password'}
                onClick={() => {
                  onViewChange('change-password');
                  setMobileMenuOpen(false);
                }}
              />
            )}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <LogOut size={20} />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col w-full min-w-0 overflow-hidden lg:ml-64">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40 w-full flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 flex-shrink-0 -ml-2"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div className="flex-1" />
          </div>
        </header>

        <ImpersonationBanner />

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full">
          <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 w-full h-full">{children}</div>
        </main>
      </div>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {showInactivityWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="bg-amber-50 border-b border-amber-100 px-6 py-5 flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Session Expiring Soon</h2>
                <p className="text-sm text-amber-700">Due to inactivity</p>
              </div>
            </div>
            <div className="px-6 py-6 text-center">
              <p className="text-slate-600 text-sm mb-4">
                You will be automatically logged out in
              </p>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 border-2 border-red-200 mb-4">
                <span className="text-2xl font-bold text-red-600">{inactivityCountdown}</span>
              </div>
              <p className="text-slate-500 text-xs">seconds</p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={handleSignOut}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Log Out Now
              </button>
              <button
                onClick={handleStayLoggedIn}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Stay Logged In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({ item, active, onClick }: { item: MenuItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition ${
        active
          ? 'bg-blue-50 text-blue-700'
          : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      <Icon size={20} className="flex-shrink-0" />
      <span className="text-left truncate">{item.label}</span>
    </button>
  );
}
