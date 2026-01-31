import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginForm } from './components/LoginForm';
import { ResetPassword } from './components/ResetPassword';
import { ChangePassword } from './components/ChangePassword';
import { Layout, ViewType } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { PurchaseRequisition } from './components/requests/PurchaseRequisition';
import { PettyCash } from './components/requests/PettyCash';
import { Canvass } from './components/requests/Canvass';
import { CashAdvance } from './components/requests/CashAdvance';
import { Reimbursement } from './components/requests/Reimbursement';
import { PRApproval } from './components/approvals/PRApproval';
import { CanvassApproval } from './components/approvals/CanvassApproval';
import { PettyCashApproval } from './components/approvals/PettyCashApproval';
import { CashAdvanceApproval } from './components/approvals/CashAdvanceApproval';
import { ReimbursementApproval } from './components/approvals/ReimbursementApproval';
import { SmeApproval } from './components/approvals/SmeApproval';
import { ConfigManager } from './components/config/ConfigManager';
import { ApprovalLedger } from './components/ApprovalLedger';
import { ProcurementChecking } from './components/ProcurementChecking';
import { UserManual } from './components/UserManual';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isResetPassword, setIsResetPassword] = useState(false);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    if (type === 'recovery') {
      setIsResetPassword(true);
    }
  }, []);

  // Reset view to dashboard when user logs out or session expires
  useEffect(() => {
    if (!user && !loading) {
      setCurrentView('dashboard');
      setIsResetPassword(false);
    }
  }, [user, loading]);

  if (loading) {
    return (
      <div className="h-full w-full bg-slate-50 flex items-center justify-center overflow-hidden">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (isResetPassword && user) {
    return <ResetPassword />;
  }

  if (!user) {
    return <LoginForm />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard onViewChange={setCurrentView} />;
      case 'user-manual':
        return <UserManual />;
      case 'pr-request':
        return <PurchaseRequisition />;
      case 'canvass-request':
        return <Canvass />;
      case 'petty-cash-request':
        return <PettyCash />;
      case 'cash-advance-request':
        return <CashAdvance />;
      case 'reimbursement-request':
        return <Reimbursement />;
      case 'pr-approval':
        return <PRApproval />;
      case 'canvass-approval':
        return <CanvassApproval />;
      case 'petty-cash-approval':
        return <PettyCashApproval />;
      case 'cash-advance-approval':
        return <CashAdvanceApproval />;
      case 'reimbursement-approval':
        return <ReimbursementApproval />;
      case 'sme-approval':
        return <SmeApproval />;
      case 'procurement-checking':
        return <ProcurementChecking />;
      case 'approval-ledger':
        return <ApprovalLedger />;
      case 'config-users':
        return <ConfigManager type="users" />;
      case 'config-checklists':
        return <ConfigManager type="checklists" />;
      case 'config-payment-modes':
        return <ConfigManager type="payment-modes" />;
      case 'config-holidays':
        return <ConfigManager type="holidays" />;
      case 'config-companies':
        return <ConfigManager type="companies" />;
      case 'config-approval-flows':
        return <ConfigManager type="approval-flows" />;
      case 'config-number-series':
        return <ConfigManager type="number-series" />;
      case 'config-vendors-items':
        return <ConfigManager type="vendors-items" />;
      case 'config-smtp':
        return <ConfigManager type="smtp" />;
      case 'config-expense-types':
        return <ConfigManager type="expense-types" />;
      case 'config-withholding-tax-rates':
        return <ConfigManager type="withholding-tax-rates" />;
      case 'config-roles-permissions':
        return <ConfigManager type="roles-permissions" />;
      case 'config-impersonation':
        return <ConfigManager type="impersonation" />;
      case 'change-password':
        return <ChangePassword />;
      default:
        return (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Coming Soon</h2>
            <p className="text-slate-600">This feature is under development</p>
          </div>
        );
    }
  };

  return (
    <Layout currentView={currentView} onViewChange={setCurrentView}>
      {renderView()}
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
