import { ReactNode, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  FileText,
  Search,
  Wallet,
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
  | 'reimbursement-request'
  | 'pr-approval'
  | 'canvass-approval'
  | 'petty-cash-approval'
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
  | 'config-vendors-items';

interface MenuItem {
  id: ViewType;
  label: string;
  icon: any;
  roles?: string[];
  group?: string;
}

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'main' },
  {
    id: 'pr-request',
    label: 'Purchase Requisition',
    icon: FileText,
    group: 'requests',
  },
  { id: 'canvass-request', label: 'Canvass', icon: Search, group: 'requests' },
  { id: 'petty-cash-request', label: 'Petty Cash', icon: Wallet, group: 'requests' },
  {
    id: 'reimbursement-request',
    label: 'Reimbursement',
    icon: Receipt,
    group: 'requests',
  },
  {
    id: 'pr-approval',
    label: 'PR Approval',
    icon: CheckSquare,
    roles: ['approver', 'admin'],
    group: 'approvals',
  },
  {
    id: 'canvass-approval',
    label: 'Canvass Approval',
    icon: CheckSquare,
    roles: ['approver', 'admin'],
    group: 'approvals',
  },
  {
    id: 'petty-cash-approval',
    label: 'Petty Cash Approval',
    icon: CheckSquare,
    roles: ['approver', 'admin'],
    group: 'approvals',
  },
  {
    id: 'reimbursement-approval',
    label: 'Reimbursement Approval',
    icon: CheckSquare,
    roles: ['approver', 'admin'],
    group: 'approvals',
  },
  {
    id: 'sme-approval',
    label: 'SME Approval',
    icon: UserCheck,
    group: 'approvals',
  },
  {
    id: 'procurement-checking',
    label: 'Procurement Checking',
    icon: ClipboardCheck,
    roles: ['approver', 'admin'],
    group: 'procurement',
  },
  {
    id: 'approval-ledger',
    label: 'Approval Ledger',
    icon: BookOpen,
    roles: ['approver', 'admin'],
    group: 'procurement',
  },
];

const configItems: MenuItem[] = [
  { id: 'config-approvers', label: 'Approvers', icon: Settings, roles: ['admin'] },
  { id: 'config-users', label: 'Users', icon: Settings, roles: ['admin'] },
  { id: 'config-checklists', label: 'PR Checklists', icon: Settings, roles: ['admin'] },
  { id: 'config-payment-modes', label: 'Payment Modes', icon: Settings, roles: ['admin'] },
  { id: 'config-holidays', label: 'Holidays', icon: Settings, roles: ['admin'] },
  { id: 'config-companies', label: 'Companies', icon: Settings, roles: ['admin'] },
  { id: 'config-approval-flows', label: 'Approval Flows', icon: Settings, roles: ['admin'] },
  { id: 'config-number-series', label: 'Number Series', icon: Settings, roles: ['admin'] },
  { id: 'config-vendors-items', label: 'Vendors & Items', icon: Settings, roles: ['admin'] },
  { id: 'config-smtp', label: 'SMTP Settings', icon: Settings, roles: ['admin'] },
];

export function Layout({ children, currentView, onViewChange }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  // Debug: Log profile data
  console.log('Current profile:', profile);

  const handleSignOut = async () => {
    await signOut();
  };

  const canAccessItem = (item: MenuItem) => {
    if (!item.roles) return true;
    return item.roles.includes(profile?.role || '');
  };

  const filteredMenuItems = menuItems.filter(canAccessItem);
  const filteredConfigItems = configItems.filter(canAccessItem);

  const requestItems = filteredMenuItems.filter((item) => item.group === 'requests');
  const approvalItems = filteredMenuItems.filter((item) => item.group === 'approvals');
  const procurementItems = filteredMenuItems.filter((item) => item.group === 'procurement');

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-slate-200">
            <h1 className="text-xl font-bold text-slate-900">Procure to Pay</h1>
            <p className="text-sm text-slate-600 mt-1">{profile?.full_name}</p>
            <p className="text-xs text-slate-500 capitalize">{profile?.role}</p>
          </div>

          <nav className="flex-1 overflow-y-auto p-4">
            <div className="space-y-1">
              <NavItem
                item={filteredMenuItems.find((item) => item.id === 'dashboard')!}
                active={currentView === 'dashboard'}
                onClick={() => {
                  onViewChange('dashboard');
                  setMobileMenuOpen(false);
                }}
              />
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

          <div className="p-4 border-t border-slate-200">
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

      <div className="flex-1 lg:ml-64">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div className="flex-1" />
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
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
      <Icon size={20} />
      {item.label}
    </button>
  );
}
