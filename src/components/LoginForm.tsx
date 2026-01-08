import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LogIn, UserPlus, Mail, AlertCircle } from 'lucide-react';

interface Company {
  id: string;
  name: string;
}

export function LoginForm() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [otpStep, setOtpStep] = useState<'email' | 'otp' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [department, setDepartment] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isSignUp) {
      loadCompanies();
    }
  }, [isSignUp]);

  useEffect(() => {
    if (selectedCompanyId) {
      loadDepartments(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const loadDepartments = async (companyId: string) => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('name')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      setDepartments(data?.map(d => d.name) || []);
      setDepartment('');
    } catch (error) {
      console.error('Error loading departments:', error);
      setDepartments([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isForgotPassword) {
        if (otpStep === 'email') {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-reset-otp`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({ email }),
            }
          );

          const data = await response.json();

          if (!data.success) {
            throw new Error(data.error || 'Failed to send OTP');
          }

          setSuccess('OTP sent to your email! Please check your inbox.');
          setOtpStep('otp');
        } else if (otpStep === 'otp') {
          if (otpCode.length !== 6) {
            throw new Error('Please enter a valid 6-digit OTP');
          }
          setSuccess('OTP verified! Please enter your new password.');
          setOtpStep('password');
        } else if (otpStep === 'password') {
          if (newPassword.length < 6) {
            throw new Error('Password must be at least 6 characters long');
          }
          if (newPassword !== confirmPassword) {
            throw new Error('Passwords do not match');
          }

          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-otp-and-reset-password`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                email,
                otpCode,
                newPassword,
              }),
            }
          );

          const data = await response.json();

          if (!data.success) {
            throw new Error(data.error || 'Failed to reset password');
          }

          setSuccess('Password reset successfully! You can now sign in with your new password.');
          setTimeout(() => {
            setIsForgotPassword(false);
            setOtpStep('email');
            setEmail('');
            setOtpCode('');
            setNewPassword('');
            setConfirmPassword('');
            setSuccess('');
          }, 3000);
        }
      } else if (isSignUp) {
        if (!selectedCompanyId) {
          throw new Error('Please select a company');
        }
        if (!department) {
          throw new Error('Please select a department');
        }
        const selectedCompany = companies.find(c => c.id === selectedCompanyId);
        const companyName = selectedCompany?.name || '';
        await signUp(email, password, fullName, department, selectedCompanyId, companyName);
        setSuccess('Account created successfully! Your account is pending approval. An administrator will activate your account soon.');
        setIsSignUp(false);
        setEmail('');
        setPassword('');
        setFullName('');
        setSelectedCompanyId('');
        setDepartment('');
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Procure to Pay</h1>
          <p className="text-slate-600">
            {isForgotPassword
              ? otpStep === 'email'
                ? 'Enter your email to receive OTP'
                : otpStep === 'otp'
                  ? 'Enter the OTP sent to your email'
                  : 'Set your new password'
              : isSignUp
                ? 'Create your account'
                : 'Sign in to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isForgotPassword && otpStep === 'email' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                placeholder="your@email.com"
              />
            </div>
          )}

          {isForgotPassword && otpStep === 'otp' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                OTP Code
              </label>
              <input
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-center text-2xl tracking-widest font-mono"
                placeholder="000000"
              />
              <p className="text-sm text-slate-500 mt-2 text-center">
                Enter the 6-digit code sent to {email}
              </p>
            </div>
          )}

          {isForgotPassword && otpStep === 'password' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="Confirm new password"
                />
              </div>
            </>
          )}

          {!isForgotPassword && isSignUp && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Company <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                >
                  <option value="">Select a company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Department <span className="text-red-500">*</span>
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  required
                  disabled={!selectedCompanyId}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                >
                  <option value="">Select a department</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {!isForgotPassword && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>
            </>
          )}

          {error && (
            <div className={`border px-4 py-3 rounded-lg text-sm flex items-start gap-3 ${
              error.includes('pending approval') || error.includes('inactive')
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {error.includes('pending approval') || error.includes('inactive')
                    ? 'Account Pending Approval'
                    : 'Error'}
                </p>
                <p className="mt-1">{error}</p>
                {(error.includes('pending approval') || error.includes('inactive')) && (
                  <p className="mt-2 text-xs">
                    Your account has been created successfully but requires admin approval before you can log in.
                    Please wait for an administrator to activate your account, or contact your system administrator for assistance.
                  </p>
                )}
              </div>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              'Loading...'
            ) : isForgotPassword ? (
              otpStep === 'email' ? (
                <>
                  <Mail size={20} />
                  Send OTP
                </>
              ) : otpStep === 'otp' ? (
                'Verify OTP'
              ) : (
                'Reset Password'
              )
            ) : isSignUp ? (
              <>
                <UserPlus size={20} />
                Sign Up
              </>
            ) : (
              <>
                <LogIn size={20} />
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-center">
          {!isForgotPassword && !isSignUp && (
            <button
              onClick={() => {
                setIsForgotPassword(true);
                setError('');
                setSuccess('');
              }}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium block w-full"
            >
              Forgot password?
            </button>
          )}

          <button
            onClick={() => {
              if (isForgotPassword) {
                setIsForgotPassword(false);
                setOtpStep('email');
                setOtpCode('');
                setNewPassword('');
                setConfirmPassword('');
              } else {
                setIsSignUp(!isSignUp);
              }
              setError('');
              setSuccess('');
            }}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            {isForgotPassword
              ? 'Back to sign in'
              : isSignUp
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
