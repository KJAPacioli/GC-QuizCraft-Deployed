/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import Navbar from './components/Navbar';

// Standard Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Materials from './pages/Materials';
import QuizGen from './pages/QuizGen';
import QuizTake from './pages/QuizTake';
import Reports from './pages/Reports';

// Instructor Pages
import InstructorDashboard from './pages/instructor/InstructorDashboard';
import QuestionBank from './pages/instructor/QuestionBank';
import QuizConfig from './pages/instructor/QuizConfig';
import StudentPerformance from './pages/instructor/StudentPerformance';
import AdminFeedback from './pages/instructor/AdminFeedback';

// Admin Pages
import AcademicAdminDashboard from './pages/academic_admin/AcademicAdminDashboard';
import SystemAdminDashboard from './pages/system_admin/SystemAdminDashboard';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserProfile(docSnap.data());
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-pulse text-stone-400 font-mono">INITIALIZING QUIZCRAFT...</div>
      </div>
    );
  }

  const isInstructor = userProfile?.role === 'instructor';
  const isAcademicAdmin = userProfile?.role === 'academic_admin';
  const isSystemAdmin = userProfile?.role === 'system_admin';

  return (
    <Router>
      <div className="min-h-screen bg-stone-50 text-stone-900 font-sans flex flex-col">
        {user && userProfile && <Navbar profile={userProfile} />}
        <div className="flex-1">
          <Routes>
            <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
            <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />
            
            <Route path="/" element={
              user ? (
                isInstructor ? <InstructorDashboard profile={userProfile} /> :
                isAcademicAdmin ? <AcademicAdminDashboard profile={userProfile} /> :
                isSystemAdmin ? <SystemAdminDashboard profile={userProfile} /> :
                <Dashboard user={user} profile={userProfile} />
              ) : <Navigate to="/login" />
            } />
            
            <Route path="/materials" element={user && !isInstructor ? <Materials /> : <Navigate to={user ? "/" : "/login"} />} />
            <Route path="/quiz/gen" element={user && !isInstructor ? <QuizGen /> : <Navigate to={user ? "/" : "/login"} />} />
            <Route path="/quiz/take/:quizId" element={user ? <QuizTake /> : <Navigate to="/login" />} />
            <Route path="/reports" element={user && !isInstructor ? <Reports /> : <Navigate to={user ? "/" : "/login"} />} />

            {/* Instructor Routes */}
            <Route path="/question-bank" element={user && isInstructor ? <QuestionBank /> : <Navigate to={user ? "/" : "/login"} />} />
            <Route path="/quiz-config" element={user && isInstructor ? <QuizConfig /> : <Navigate to={user ? "/" : "/login"} />} />
            <Route path="/performance" element={user && isInstructor ? <StudentPerformance /> : <Navigate to={user ? "/" : "/login"} />} />
            <Route path="/admin-feedback" element={user && isInstructor ? <AdminFeedback /> : <Navigate to={user ? "/" : "/login"} />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

