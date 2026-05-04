import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { GraduationCap, LogOut, BookOpen, FileText, BarChart3, Database, Edit3, Settings } from 'lucide-react';

export default function Navbar({ profile }: { profile?: any }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const isInstructor = profile?.role === 'instructor';
  const isAdmin = profile?.role === 'system_admin' || profile?.role === 'academic_admin';

  return (
    <nav className="bg-white border-b-4 border-stone-900 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="bg-stone-900 text-white p-1.5 rounded-lg group-hover:scale-105 transition-transform">
                <GraduationCap size={20} />
              </div>
              <span className="text-xl font-serif italic font-bold">QuizCraft</span>
              {isInstructor && <span className="ml-2 text-[10px] font-mono bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full uppercase">Faculty</span>}
            </Link>
          </div>
          
          <div className="hidden sm:flex items-center space-x-8">
            {isInstructor ? (
              <NavLink to="/admin-feedback" icon={<FileText size={18} />} label="Admin Feedback" currentPath={location.pathname} />
            ) : (
              <NavLink to="/" icon={<BarChart3 size={18} />} label={profile?.role === 'academic_admin' ? 'Academic Admin' : profile?.role === 'system_admin' ? 'System Admin' : 'Dashboard'} currentPath={location.pathname} />
            )}
            
            {/* Student Links */}
            {!isInstructor && !isAdmin && (
              <>
                <NavLink to="/materials" icon={<BookOpen size={18} />} label="Materials" currentPath={location.pathname} />
                <NavLink to="/reports" icon={<FileText size={18} />} label="Reports" currentPath={location.pathname} />
              </>
            )}

            {/* Instructor Links */}
            {isInstructor && (
              <>
                <NavLink to="/question-bank" icon={<Database size={18} />} label="Question Bank" currentPath={location.pathname} />
                <NavLink to="/quiz-config" icon={<Edit3 size={18} />} label="Create Quiz" currentPath={location.pathname} />
                <NavLink to="/performance" icon={<FileText size={18} />} label="Student Performance" currentPath={location.pathname} />
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={handleLogout}
              className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-full transition-all"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ to, icon, label, currentPath }: { to: string, icon: React.ReactNode, label: string, currentPath: string }) {
  const isActive = currentPath === to;
  return (
    <Link 
      to={to} 
      className={`relative flex h-full items-center gap-2 text-sm font-bold uppercase tracking-wider transition-colors ${isActive ? 'text-stone-900' : 'text-stone-400 hover:text-stone-700'}`}
    >
      {icon}
      {label}
      {isActive && (
        <span className="absolute bottom-0 left-0 w-full h-1 bg-stone-900"></span>
      )}
    </Link>
  );
}
