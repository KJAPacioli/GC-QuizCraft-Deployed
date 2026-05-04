import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, GraduationCap, User, BookOpen, Shield, Settings, Eye, EyeOff } from 'lucide-react';
import { logSystemAction } from '../utils/auditLogger';

const ROLES = [
  { id: 'student', label: 'Student', icon: User },
  { id: 'instructor', label: 'Instructor', icon: BookOpen },
  { id: 'academic_admin', label: 'Academic Admin', icon: Shield },
  { id: 'system_admin', label: 'System Admin', icon: Settings },
];

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('student');
  
  // Student specific
  const [program, setProgram] = useState('');
  const [yearLevel, setYearLevel] = useState('1st Year');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userData: any = {
        uid: user.uid,
        email,
        fullName,
        role,
        createdAt: new Date().toISOString()
      };

      if (role === 'student') {
        userData.program = program;
        userData.yearLevel = yearLevel;
      }

      await setDoc(doc(db, 'users', user.uid), userData);

      // Log the registration creation event to AUDIT_LOG datastore
      await logSystemAction('USER_REGISTERED', `New ${role} account created for ${email}`);

      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    } finally {
      setLoading(false);
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
            <UserPlus size={20} />
            Create Account
          </h2>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 text-red-700 text-sm">
              {error}
            </div>
          )}

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

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Full Name</label>
              <input
                type="text"
                required
                className="w-full p-3 brutal-border focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all"
                placeholder={role === 'student' ? "Juan Dela Cruz" : "Prof. Juan Dela Cruz"}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
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
            
            {role === 'student' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Program</label>
                  <select
                    className="w-full p-3 brutal-border focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all bg-white"
                    value={program}
                    onChange={(e) => setProgram(e.target.value)}
                    required
                  >
                    <option value="">Select</option>
                    <option value="BSIT">BSIT</option>
                    <option value="BSCS">BSCS</option>
                    <option value="BSBA">BSBA</option>
                    <option value="BSEd">BSEd</option>
                    <option value="BSN">BSN</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Year Level</label>
                  <select
                    className="w-full p-3 brutal-border focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all bg-white"
                    value={yearLevel}
                    onChange={(e) => setYearLevel(e.target.value)}
                  >
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Password</label>
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
              {loading ? 'Creating Account...' : 'Register Now'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-stone-500">Already have an account? </span>
            <Link to="/login" className="font-bold underline hover:text-stone-700">Login Here</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
