import React, { useState } from 'react';
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, GraduationCap, User, BookOpen, Shield, Settings, Eye, EyeOff } from 'lucide-react';
import { logSystemAction } from '../utils/auditLogger';

const ROLES = [
  { id: 'student', label: 'Student', icon: User },
  { id: 'instructor', label: 'Instructor', icon: BookOpen },
  { id: 'academic_admin', label: 'Academic Admin', icon: Shield },
  { id: 'system_admin', label: 'System Admin', icon: Settings },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Verify the selected role matches the registered account role
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.role !== role) {
          await signOut(auth); // Sign them back out
          
          const roleNames: Record<string, string> = {
            'student': 'Student',
            'instructor': 'Instructor',
            'academic_admin': 'Academic Admin',
            'system_admin': 'System Admin'
          };
          const actualRoleName = roleNames[userData.role] || userData.role;
          const selectedRoleName = roleNames[role] || role;
          
          throw new Error(`Invalid section. This account is registered as an ${actualRoleName}, not a ${selectedRoleName}.`);
        }
      } else {
        await signOut(auth);
        throw new Error('User data not found.');
      }

      // Log the login to the AUDIT_LOG datastore as specified by DFD Process 1.0 -> D5
      await logSystemAction('USER_LOGIN', `User logged in as ${role}`);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address to reset password.');
      return;
    }
    setError('');
    setMessage('');
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-stone-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-stone-900 text-white rounded-2xl mb-4 brutal-border">
            <GraduationCap size={32} />
          </div>
          <h1 className="text-4xl font-serif italic font-bold text-stone-900">QuizCraft</h1>
          <p className="text-stone-500 font-mono text-sm mt-2 uppercase tracking-widest">Gordon College Edition</p>
        </div>

        <div className="bg-white p-8 brutal-border">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <LogIn size={20} />
            Login to Portal
          </h2>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                className={`p-3 border-2 transition-all flex flex-col items-center gap-2 text-sm font-semibold ${
                  role === r.id 
                  ? 'border-stone-900 bg-stone-900 text-white' 
                  : 'border-stone-200 text-stone-500 hover:border-stone-400'
                }`}
              >
                <r.icon size={20} />
                {r.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 text-red-700 text-sm">
              {error}
            </div>
          )}
          {message && (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 mb-6 text-emerald-700 text-sm">
              {message}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">GC Email</label>
              <input
                type="email"
                required
                className="w-full p-3 brutal-border focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all"
                placeholder={role === 'student' ? "student@gordoncollege.edu.ph" : "faculty@gordoncollege.edu.ph"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <div className="flex justify-between mb-1 items-end">
                <label className="block text-xs font-mono uppercase tracking-wider text-stone-500">Password</label>
                <button type="button" onClick={handleForgotPassword} className="text-xs font-bold text-stone-500 hover:text-stone-900 underline">Forgot Password?</button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className="w-full p-3 brutal-border focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all pr-12"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-900"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-stone-900 text-white py-4 font-bold uppercase tracking-widest hover:bg-stone-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Enter Dashboard'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-stone-500">New {role}? </span>
            <Link to="/register" className="font-bold underline hover:text-stone-700">Create Account</Link>
          </div>
        </div>
        
        <div className="mt-8 text-center text-[10px] text-stone-400 font-mono uppercase tracking-tighter">
          &copy; 2026 GC QuizCraft System // AppDev Course Project
        </div>
      </div>
    </div>
  );
}
