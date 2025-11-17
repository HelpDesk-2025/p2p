import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginForm } from './components/LoginForm';
import { Layout, ViewType } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { PurchaseRequisition } from './components/requests/PurchaseRequisition';
import { PettyCash } from './components/requests/PettyCash';
import { Canvass } from './components/requests/Canvass';
import { Reimbursement } from './components/requests/Reimbursement';
import { PRApproval } from './components/approvals/PRApproval';
import { ConfigManager } from './components/config/ConfigManager';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'pr-request':
        return <PurchaseRequisition />;
      case 'canvass-request':
        return <Canvass />;
      case 'petty-cash-request':
        return <PettyCash />;
      case 'reimbursement-request':
        return <Reimbursement />;
      case 'pr-approval':
        return <PRApproval />;
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
