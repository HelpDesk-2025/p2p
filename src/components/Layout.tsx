import { ReactNode, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, hasAnyPermission, MODULE_PERMISSIONS } from '../lib/permissions';
import { ImpersonationBanner } from './ImpersonationBanner';
import {
  LayoutDashboard,
  FileText,
  Search,
  Wallet,
  Banknote,
  Receipt,
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
  | 'pr-approval'
  | 'canvass-approval'
  | 'petty-cash-approval'
  | 'cash-advance-approval'
  | 'reimbursement-approval'
  | 'sme-approval'
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
    label: 'Reimbursement/Liquidation',
    icon: Receipt,
    permission: MODULE_PERMISSIONS.REIMBURSEMENT,
    group: 'requests',
  },
  {
    id: 'approved-rejected',
    label: 'Approved & Rejected',
    icon: History,
    permission: MODULE_PERMISSIONS.APPROVED_REJECTED,
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
    label: 'Reimbursement Approval',
    icon: CheckSquare,
    permission: MODULE_PERMISSIONS.REIMBURSEMENT_APPROVAL,
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
    id: 'change-password',
    label: 'Change Password',
    icon: KeyRound,
    group: 'profile',
  },
];

const configItems: MenuItem[] = [
  { id: 'config-approvers', label: 'Approvers', icon: Settings, permission: MODULE_PERMISSIONS.APPROVAL_FLOW },
  { id: 'config-users', label: 'Users', icon: Settings, permission: MODULE_PERMISSIONS.ROLES_PERMISSIONS },
  { id: 'config-impersonation', label: 'View as User', icon: Settings, permission: MODULE_PERMISSIONS.ROLES_PERMISSIONS },
  { id: 'config-checklists', label: 'PR Checklists', icon: Settings, permission: [MODULE_PERMISSIONS.APPROVAL_FLOW, MODULE_PERMISSIONS.CONFIG_PR_CHECKLISTS] },
  { id: 'config-payment-modes', label: 'Payment Modes', icon: Settings, permission: [MODULE_PERMISSIONS.APPROVAL_FLOW, MODULE_PERMISSIONS.CONFIG_PAYMENT_MODES] },
  { id: 'config-holidays', label: 'Holidays', icon: Settings, permission: MODULE_PERMISSIONS.APPROVAL_FLOW },
  { id: 'config-companies', label: 'Companies', icon: Settings, permission: MODULE_PERMISSIONS.APPROVAL_FLOW },
  { id: 'config-approval-flows', label: 'Approval Flows', icon: Settings, permission: MODULE_PERMISSIONS.APPROVAL_FLOW },
  { id: 'config-number-series', label: 'Number Series', icon: Settings, permission: MODULE_PERMISSIONS.NUMBER_SERIES },
  { id: 'config-vendors-items', label: 'Vendors & Items', icon: Settings, permission: MODULE_PERMISSIONS.APPROVAL_FLOW },
  { id: 'config-smtp', label: 'SMTP Settings', icon: Settings, permission: MODULE_PERMISSIONS.SMTP },
  { id: 'config-expense-types', label: 'Type of Expense', icon: Settings, permission: [MODULE_PERMISSIONS.APPROVAL_FLOW, MODULE_PERMISSIONS.CONFIG_EXPENSE_TYPES] },
  { id: 'config-withholding-tax-rates', label: 'Withholding Tax Rates', icon: Settings, permission: [MODULE_PERMISSIONS.APPROVAL_FLOW, MODULE_PERMISSIONS.CONFIG_TAX_RATES] },
  { id: 'config-roles-permissions', label: 'Roles & Permissions', icon: Settings, permission: MODULE_PERMISSIONS.ROLES_PERMISSIONS },
];

export function Layout({ children, currentView, onViewChange }: LayoutProps) {
  const { profile, permissions, signOut, showInactivityWarning, inactivityCountdown, resetInactivityTimer } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

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

  const filteredMenuItems = menuItems.filter(canAccessItem);
  const filteredConfigItems = configItems.filter(canAccessItem);

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
                  Procurement
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

        <main className="flex-1 overflow-y-auto overflow-x-hidden w-full">
          <div className="p-4 sm:p-6 lg:p-8 w-full">{children}</div>
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
