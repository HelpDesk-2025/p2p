import { useAuth } from '../contexts/AuthContext';
import { Eye, X } from 'lucide-react';

export function ImpersonationBanner() {
  const { isImpersonating, profile, actualProfile, stopImpersonation } = useAuth();

  if (!isImpersonating || !profile || !actualProfile) {
    return null;
  }

  return (
    <div className="bg-orange-500 text-white px-4 py-3 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="w-5 h-5" />
          <div>
            <span className="font-semibold">Viewing as: {profile.full_name}</span>
            <span className="mx-2">|</span>
            <span className="text-orange-100">
              Role: {profile.role} | Company: {profile.company_name} | Department: {profile.department}
            </span>
          </div>
        </div>
        <button
          onClick={stopImpersonation}
          className="flex items-center gap-2 px-4 py-1.5 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-colors font-medium"
        >
          <X className="w-4 h-4" />
          Exit View
        </button>
      </div>
    </div>
  );
}
