import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, type Variants } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  LogIn,
  UserPlus,
  Mail,
  AlertCircle,
  RefreshCw,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface Company {
  id: string;
  name: string;
}

const fieldVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.05 * i, duration: 0.35, ease: 'easeOut' },
  }),
};

export function LoginForm() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [signUpStep, setSignUpStep] = useState<'form' | 'otp'>('form');
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
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resending, setResending] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mouse-reactive parallax for the brand panel's ambient orbs and the card tilt
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const springX = useSpring(mouseX, { stiffness: 50, damping: 20, mass: 0.5 });
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20, mass: 0.5 });
  const orb1X = useTransform(springX, [0, 1], [-24, 24]);
  const orb1Y = useTransform(springY, [0, 1], [-24, 24]);
  const orb2X = useTransform(springX, [0, 1], [18, -18]);
  const orb2Y = useTransform(springY, [0, 1], [18, -18]);
  const cardRotateX = useTransform(springY, [0, 1], [2.5, -2.5]);
  const cardRotateY = useTransform(springX, [0, 1], [-2.5, 2.5]);
  const ringGroupRotateX = useTransform(springY, [0, 1], [10, -10]);
  const ringGroupRotateY = useTransform(springX, [0, 1], [-10, 10]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };

  const startResendCountdown = () => {
    setResendCountdown(15);
    countdownRef.current = setInterval(() => {
      setResendCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

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
          startResendCountdown();
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
        if (signUpStep === 'form') {
          if (!selectedCompanyId) {
            throw new Error('Please select a company');
          }
          if (!department) {
            throw new Error('Please select a department');
          }

          const selectedCompany = companies.find(c => c.id === selectedCompanyId);
          const companyName = selectedCompany?.name || '';

          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-signup-otp`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                email,
                fullName,
                password,
                department,
                companyId: selectedCompanyId,
                companyName,
              }),
            }
          );

          const data = await response.json();

          if (!data.success) {
            throw new Error(data.error || 'Failed to send OTP');
          }

          setSuccess('OTP sent to your email! Please check your inbox and enter the code.');
          setSignUpStep('otp');
          startResendCountdown();
        } else if (signUpStep === 'otp') {
          if (otpCode.length !== 6) {
            throw new Error('Please enter a valid 6-digit OTP');
          }

          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-signup-otp`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                email,
                otpCode,
              }),
            }
          );

          const data = await response.json();

          if (!data.success) {
            throw new Error(data.error || 'Failed to verify OTP');
          }

          setSuccess('Account created successfully! Your account is pending approval. An administrator will activate your account soon.');
          setTimeout(() => {
            setIsSignUp(false);
            setSignUpStep('form');
            setEmail('');
            setPassword('');
            setFullName('');
            setSelectedCompanyId('');
            setDepartment('');
            setOtpCode('');
            setSuccess('');
          }, 3000);
        }
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCountdown > 0 || resending) return;
    setResending(true);
    setError('');
    setSuccess('');
    try {
      if (isForgotPassword) {
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
        if (!data.success) throw new Error(data.error || 'Failed to resend OTP');
      } else {
        const selectedCompany = companies.find(c => c.id === selectedCompanyId);
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-signup-otp`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              email,
              fullName,
              password,
              department,
              companyId: selectedCompanyId,
              companyName: selectedCompany?.name || '',
            }),
          }
        );
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to resend OTP');
      }
      setSuccess('A new OTP has been sent to your email.');
      startResendCountdown();
    } catch (err: any) {
      setError(err.message || 'Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  const stepKey = isForgotPassword
    ? `forgot-${otpStep}`
    : isSignUp
      ? `signup-${signUpStep}`
      : 'signin';

  const titleText = isForgotPassword
    ? otpStep === 'email'
      ? 'Reset your password'
      : otpStep === 'otp'
        ? 'Verify your identity'
        : 'Choose a new password'
    : isSignUp
      ? signUpStep === 'form'
        ? 'Create your account'
        : 'Verify your email'
      : 'Welcome back';

  const subtitleText = isForgotPassword
    ? otpStep === 'email'
      ? 'Enter your email to receive a one-time code'
      : otpStep === 'otp'
        ? `Enter the 6-digit code sent to ${email}`
        : 'Set a new password for your account'
    : isSignUp
      ? signUpStep === 'form'
        ? 'Set up your access to Point to Point'
        : `Enter the 6-digit code sent to ${email}`
      : 'Sign in to continue to Point to Point';

  const inputClass =
    'w-full px-4 py-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400 outline-none transition-all duration-200 placeholder:text-slate-400 text-slate-900';
  const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5';

  return (
    <div
      className="min-h-screen w-full flex bg-slate-50"
      onMouseMove={handleMouseMove}
    >
      {/* Brand panel — desktop only */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700">
        <motion.div
          style={{ x: orb1X, y: orb1Y }}
          className="absolute -top-24 -left-16 w-96 h-96 rounded-full bg-gold-400/20 blur-3xl animate-float-slow"
        />
        <motion.div
          style={{ x: orb2X, y: orb2Y }}
          className="absolute bottom-0 -right-10 w-[28rem] h-[28rem] rounded-full bg-blue-400/20 blur-3xl animate-float"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(240,201,85,0.10),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] bg-[size:48px_48px]" />

        {/* 3D ring constellation, anchored to the top-right corner so it reads as an
            intentional bleed rather than a clipped shape; tilts gently with the cursor */}
        <div
          className="absolute -right-24 -top-24 w-[34rem] h-[34rem] pointer-events-none"
          style={{ perspective: 1600 }}
        >
          <motion.div
            style={{ rotateX: ringGroupRotateX, rotateY: ringGroupRotateY, transformStyle: 'preserve-3d' }}
            className="relative w-0 h-0"
          >
            <motion.div
              className="absolute top-1/2 left-1/2 w-52 h-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-gold-300/25 to-blue-300/15 blur-3xl"
              animate={{ scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            />

            <div className="absolute top-1/2 left-1/2 w-56 h-56 -translate-x-1/2 -translate-y-1/2">
              <motion.div
                className="relative w-full h-full rounded-full border border-gold-300/55"
                style={{ rotateX: 62 }}
                animate={{ rotateZ: 360 }}
                transition={{ duration: 45, repeat: Infinity, ease: 'linear' }}
              >
                <div className="absolute top-0 left-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-200 shadow-[0_0_8px_2px_rgba(240,201,85,0.7)]" />
              </motion.div>
            </div>

            <div className="absolute top-1/2 left-1/2 w-80 h-80 -translate-x-1/2 -translate-y-1/2">
              <motion.div
                className="relative w-full h-full rounded-full border border-blue-200/40"
                style={{ rotateX: 62, rotateY: 14 }}
                animate={{ rotateZ: -360 }}
                transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
              >
                <div className="absolute bottom-0 left-1/2 w-1 h-1 -translate-x-1/2 translate-y-1/2 rounded-full bg-blue-100 shadow-[0_0_6px_2px_rgba(191,219,254,0.6)]" />
              </motion.div>
            </div>

            <div className="absolute top-1/2 left-1/2 w-[27rem] h-[27rem] -translate-x-1/2 -translate-y-1/2">
              <motion.div
                className="w-full h-full rounded-full border border-gold-200/28"
                style={{ rotateX: 62, rotateY: -12 }}
                animate={{ rotateZ: 360 }}
                transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}
              />
            </div>
          </motion.div>
        </div>

        {/* Soft breathing glow seated directly behind the headline for extra depth */}
        <motion.div
          className="absolute left-[6%] top-[36%] w-72 h-72 rounded-full bg-gold-400/10 blur-3xl pointer-events-none"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Drifting particles for ambient depth/parallax */}
        {[
          { top: '14%', left: '55%', size: 3, duration: 7, delay: 0, color: 'bg-gold-200', glow: 'rgba(240,201,85,0.7)' },
          { top: '26%', left: '80%', size: 2, duration: 9, delay: 1.2, color: 'bg-blue-100', glow: 'rgba(191,219,254,0.6)' },
          { top: '44%', left: '66%', size: 5, duration: 8, delay: 0.4, color: 'bg-gold-200', glow: 'rgba(240,201,85,0.7)' },
          { top: '8%', left: '36%', size: 2, duration: 6.5, delay: 2, color: 'bg-blue-100', glow: 'rgba(191,219,254,0.5)' },
          { top: '56%', left: '86%', size: 3, duration: 10, delay: 1.6, color: 'bg-gold-200', glow: 'rgba(240,201,85,0.6)' },
          { top: '68%', left: '46%', size: 4, duration: 7.5, delay: 0.8, color: 'bg-gold-200', glow: 'rgba(240,201,85,0.65)' },
          { top: '36%', left: '18%', size: 2, duration: 8.5, delay: 2.4, color: 'bg-blue-100', glow: 'rgba(191,219,254,0.5)' },
          { top: '78%', left: '70%', size: 3, duration: 9.5, delay: 0.6, color: 'bg-gold-200', glow: 'rgba(240,201,85,0.6)' },
          { top: '20%', left: '10%', size: 2, duration: 11, delay: 3, color: 'bg-blue-100', glow: 'rgba(191,219,254,0.4)' },
          { top: '62%', left: '30%', size: 2, duration: 6, delay: 1, color: 'bg-gold-200', glow: 'rgba(240,201,85,0.55)' },
        ].map((p, i) => (
          <motion.div
            key={i}
            className={`absolute rounded-full pointer-events-none ${p.color}`}
            style={{ top: p.top, left: p.left, width: p.size, height: p.size, boxShadow: `0 0 6px 1px ${p.glow}` }}
            animate={{ y: [0, -16, 0], opacity: [0.2, 0.85, 0.2] }}
            transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white w-full">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3"
          >
            <img src="/p2p_logo.png" alt="Point to Point" className="h-10 w-auto object-contain" />
            <span className="font-display text-xl tracking-wide">Point to Point</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="font-display text-4xl xl:text-5xl font-medium leading-tight mb-4">
              Procurement,
              <br />
              <span className="text-shimmer">refined.</span>
            </h2>
            <p className="text-blue-200/80 text-base max-w-sm leading-relaxed">
              A single source of truth for requisitions, approvals, and payments —
              built for clarity at every step.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-xs text-blue-300/50"
          >
            Point to Point &middot; Secure enterprise access
          </motion.div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-12 relative overflow-hidden">
        {/* Ambient 3D geometry — rotating rings suspended behind the card, tilted with the cursor */}
        <div
          className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none"
          style={{ perspective: 1600 }}
        >
          <motion.div
            style={{ rotateX: ringGroupRotateX, rotateY: ringGroupRotateY, transformStyle: 'preserve-3d' }}
            className="relative w-0 h-0"
          >
            {/* Positioning wrappers hold only translate(-50%,-50%); rotation lives on the
                inner element so the two transforms never compose into one matrix and drift. */}
            <div className="absolute top-1/2 left-1/2 w-56 h-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-gold-300/50 to-blue-300/30 blur-3xl" />

            <div className="absolute top-1/2 left-1/2 w-[22rem] h-[22rem] -translate-x-1/2 -translate-y-1/2">
              <motion.div
                className="w-full h-full rounded-full border-2 border-gold-400/80"
                style={{ rotateX: 62 }}
                animate={{ rotateZ: 360 }}
                transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
              />
            </div>

            <div className="absolute top-1/2 left-1/2 w-[30rem] h-[30rem] -translate-x-1/2 -translate-y-1/2">
              <motion.div
                className="w-full h-full rounded-full border-2 border-blue-500/60"
                style={{ rotateX: 62, rotateY: 12 }}
                animate={{ rotateZ: -360 }}
                transition={{ duration: 55, repeat: Infinity, ease: 'linear' }}
              />
            </div>

            <div className="absolute top-1/2 left-1/2 w-[38rem] h-[38rem] -translate-x-1/2 -translate-y-1/2">
              <motion.div
                className="w-full h-full rounded-full border border-gold-400/45"
                style={{ rotateX: 62, rotateY: -10 }}
                animate={{ rotateZ: 360 }}
                transition={{ duration: 70, repeat: Infinity, ease: 'linear' }}
              />
            </div>

            <div className="absolute top-1/2 left-1/2 w-14 h-14 -translate-x-1/2 -translate-y-1/2">
              <motion.div
                className="relative w-full h-full rounded-full bg-gradient-to-br from-gold-300 to-gold-500 shadow-gold-glow"
                style={{ rotateX: 62 }}
                animate={{ rotateZ: 360 }}
                transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
              >
                <div className="absolute top-1/2 -left-1 w-2.5 h-2.5 -translate-y-1/2 rounded-full bg-blue-800/70" />
              </motion.div>
            </div>
          </motion.div>
        </div>

        <motion.div
          style={{ rotateX: cardRotateX, rotateY: cardRotateY, transformPerspective: 1200 }}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 bg-white rounded-2xl shadow-luxury-lg border border-slate-200/70 w-full max-w-md p-6 sm:p-8"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 rounded-b-full bg-gradient-to-r from-gold-300 via-gold-500 to-gold-300" />

          <div className="text-center mb-6 sm:mb-8 lg:hidden">
            <motion.img
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              src="/p2p_logo.png"
              alt="Point to Point"
              className="h-14 w-auto object-contain mx-auto mb-3"
            />
            <h1 className="font-display text-2xl font-semibold text-slate-900">Point to Point</h1>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={stepKey}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mb-6 hidden lg:block">
                <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-900 mb-1">
                  {titleText}
                </h1>
                <p className="text-sm text-slate-500">{subtitleText}</p>
              </div>
              <div className="mb-6 lg:hidden text-center">
                <p className="text-sm text-slate-500">{subtitleText}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {isForgotPassword && otpStep === 'email' && (
                  <motion.div variants={fieldVariants} custom={0} initial="hidden" animate="visible">
                    <label className={labelClass}>Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className={inputClass}
                      placeholder="your@email.com"
                    />
                  </motion.div>
                )}

                {isForgotPassword && otpStep === 'otp' && (
                  <motion.div variants={fieldVariants} custom={0} initial="hidden" animate="visible">
                    <label className={labelClass}>OTP Code</label>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      maxLength={6}
                      className={`${inputClass} text-center text-2xl tracking-widest font-mono`}
                      placeholder="000000"
                    />
                    <p className="text-sm text-slate-500 mt-2 text-center">
                      Enter the 6-digit code sent to {email}
                    </p>
                    <div className="mt-3 text-center">
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resendCountdown > 0 || resending}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-600 hover:text-gold-700 disabled:text-slate-400 disabled:cursor-not-allowed transition"
                      >
                        <RefreshCw size={14} className={resending ? 'animate-spin' : ''} />
                        {resending
                          ? 'Sending...'
                          : resendCountdown > 0
                            ? `Resend OTP in ${resendCountdown}s`
                            : 'Resend OTP'}
                      </button>
                    </div>
                  </motion.div>
                )}

                {isForgotPassword && otpStep === 'password' && (
                  <>
                    <motion.div variants={fieldVariants} custom={0} initial="hidden" animate="visible">
                      <label className={labelClass}>New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={6}
                        className={inputClass}
                        placeholder="Enter new password"
                      />
                    </motion.div>
                    <motion.div variants={fieldVariants} custom={1} initial="hidden" animate="visible">
                      <label className={labelClass}>Confirm Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        className={inputClass}
                        placeholder="Confirm new password"
                      />
                    </motion.div>
                  </>
                )}

                {!isForgotPassword && isSignUp && signUpStep === 'form' && (
                  <>
                    <motion.div variants={fieldVariants} custom={0} initial="hidden" animate="visible">
                      <label className={labelClass}>
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        className={inputClass}
                      />
                    </motion.div>

                    <motion.div variants={fieldVariants} custom={1} initial="hidden" animate="visible">
                      <label className={labelClass}>
                        Company <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selectedCompanyId}
                        onChange={(e) => setSelectedCompanyId(e.target.value)}
                        required
                        className={`${inputClass} bg-white`}
                      >
                        <option value="">Select a company</option>
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.name}
                          </option>
                        ))}
                      </select>
                    </motion.div>

                    <motion.div variants={fieldVariants} custom={2} initial="hidden" animate="visible">
                      <label className={labelClass}>
                        Department <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        required
                        disabled={!selectedCompanyId}
                        className={`${inputClass} bg-white disabled:bg-slate-100 disabled:cursor-not-allowed`}
                      >
                        <option value="">Select a department</option>
                        {departments.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                    </motion.div>
                  </>
                )}

                {!isForgotPassword && isSignUp && signUpStep === 'otp' && (
                  <motion.div variants={fieldVariants} custom={0} initial="hidden" animate="visible">
                    <label className={labelClass}>OTP Code</label>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      maxLength={6}
                      className={`${inputClass} text-center text-2xl tracking-widest font-mono`}
                      placeholder="000000"
                    />
                    <p className="text-sm text-slate-500 mt-2 text-center">
                      Enter the 6-digit code sent to {email}
                    </p>
                    <div className="mt-3 text-center">
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resendCountdown > 0 || resending}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-600 hover:text-gold-700 disabled:text-slate-400 disabled:cursor-not-allowed transition"
                      >
                        <RefreshCw size={14} className={resending ? 'animate-spin' : ''} />
                        {resending
                          ? 'Sending...'
                          : resendCountdown > 0
                            ? `Resend OTP in ${resendCountdown}s`
                            : 'Resend OTP'}
                      </button>
                    </div>
                  </motion.div>
                )}

                {!isForgotPassword && !(isSignUp && signUpStep === 'otp') && (
                  <>
                    <motion.div variants={fieldVariants} custom={0} initial="hidden" animate="visible">
                      <label className={labelClass}>Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className={inputClass}
                      />
                    </motion.div>

                    <motion.div variants={fieldVariants} custom={isSignUp ? 3 : 1} initial="hidden" animate="visible">
                      <label className={labelClass}>Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className={inputClass}
                      />
                    </motion.div>
                  </>
                )}

                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div
                      key={error}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0, x: [0, -6, 6, -4, 4, 0] }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.4 }}
                      className={`border px-4 py-3 rounded-xl text-sm flex items-start gap-3 ${
                        error.includes('pending approval') || error.includes('inactive')
                          ? 'bg-amber-50 border-amber-300 text-amber-800'
                          : 'bg-red-50 border-red-200 text-red-700'
                      }`}
                    >
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
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                  {success && (
                    <motion.div
                      key={success}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2"
                    >
                      <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
                      <span>{success}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={!loading ? { scale: 1.015 } : {}}
                  whileTap={!loading ? { scale: 0.985 } : {}}
                  className="w-full bg-gradient-to-r from-blue-800 to-blue-900 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-luxury"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {loading ? (
                      <motion.span
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2"
                      >
                        <Loader2 size={18} className="animate-spin" />
                        Loading...
                      </motion.span>
                    ) : (
                      <motion.span
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2"
                      >
                        {isForgotPassword ? (
                          otpStep === 'email' ? (
                            <>
                              <Mail size={18} />
                              Send OTP
                            </>
                          ) : otpStep === 'otp' ? (
                            'Verify OTP'
                          ) : (
                            'Reset Password'
                          )
                        ) : isSignUp ? (
                          signUpStep === 'form' ? (
                            <>
                              <Mail size={18} />
                              Send OTP
                            </>
                          ) : (
                            <>
                              <UserPlus size={18} />
                              Verify & Sign Up
                            </>
                          )
                        ) : (
                          <>
                            <LogIn size={18} />
                            Sign In
                          </>
                        )}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </form>

              <div className="mt-6 space-y-2 text-center">
                {!isForgotPassword && !isSignUp && (
                  <button
                    onClick={() => {
                      setIsForgotPassword(true);
                      setError('');
                      setSuccess('');
                    }}
                    className="text-gold-700 hover:text-gold-800 text-sm font-medium block w-full transition"
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
                    } else if (isSignUp && signUpStep === 'otp') {
                      setSignUpStep('form');
                      setOtpCode('');
                    } else {
                      setIsSignUp(!isSignUp);
                      setSignUpStep('form');
                    }
                    setError('');
                    setSuccess('');
                  }}
                  className="text-gold-700 hover:text-gold-800 text-sm font-medium transition"
                >
                  {isForgotPassword
                    ? 'Back to sign in'
                    : isSignUp
                    ? signUpStep === 'otp'
                      ? 'Back to sign up form'
                      : 'Already have an account? Sign in'
                    : "Don't have an account? Sign up"}
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
