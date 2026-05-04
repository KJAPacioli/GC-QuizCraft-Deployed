import { User } from 'firebase/auth';
import Navbar from '../components/Navbar';
import { Link } from 'react-router-dom';
import { Plus, BookOpen, BrainCircuit, History, TrendingUp, ArrowRight, UserPlus, Play, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion, deleteDoc, getDoc } from 'firebase/firestore';

interface DashboardProps {
  user: User;
  profile: any;
}

export default function Dashboard({ user, profile }: DashboardProps) {
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [myClasses, setMyClasses] = useState<any[]>([]);
  const [officialQuizzes, setOfficialQuizzes] = useState<any[]>([]);
  
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [classDetails, setClassDetails] = useState<{instructor: string, classmates: any[]}>({ instructor: '', classmates: [] });
  const [loadingClassDetails, setLoadingClassDetails] = useState(false);

  useEffect(() => {
    fetchClassesAndQuizzes();
  }, [user.uid]);

  const handleClassClick = async (c: any) => {
    setSelectedClass(c);
    setLoadingClassDetails(true);
    setClassDetails({ instructor: '', classmates: [] });
    
    try {
      // Fetch Instructor
      const instrDoc = await getDoc(doc(db, 'users', c.instructorId));
      const instructorName = instrDoc.exists() ? instrDoc.data().fullName : 'Unknown Instructor';
      
      // Fetch Classmates (excluding current user)
      const otherStudentIds = (c.studentIds || []).filter((id: string) => id !== user.uid);
      const chunks = [];
      for (let i = 0; i < otherStudentIds.length; i += 30) {
        chunks.push(otherStudentIds.slice(i, i + 30));
      }
      
      const classmatesData: any[] = [];
      for (const chunk of chunks) {
        if (chunk.length === 0) continue;
        const qStudents = query(collection(db, 'users'), where('uid', 'in', chunk));
        const snapStudents = await getDocs(qStudents);
        snapStudents.forEach(doc => {
          const data = doc.data();
          classmatesData.push({
            name: data.fullName || 'Unknown Student',
            program: data.program || 'N/A',
            yearLevel: data.yearLevel || 'N/A'
          });
        });
      }
      
      setClassDetails({
        instructor: instructorName,
        classmates: classmatesData.sort((a, b) => a.name.localeCompare(b.name))
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingClassDetails(false);
    }
  };

  const fetchClassesAndQuizzes = async () => {
    if (!user.uid) return;
    try {
      // 2. Fetch classes where student is enrolled
      const qClass = query(collection(db, 'classrooms'), where('studentIds', 'array-contains', user.uid));
      const snapClass = await getDocs(qClass);
      const classes = snapClass.docs.map(d => ({ id: d.id, ...d.data() }));
      setMyClasses(classes);

      // 3. Fetch official quizzes for those classes
      if (classes.length > 0) {
        const classIds = classes.map(c => c.id);
        const qQuiz = query(collection(db, 'quizzes'), where('classroomId', 'in', classIds));
        const snapQuiz = await getDocs(qQuiz);
        let quizzes = snapQuiz.docs.map(d => ({ id: d.id, ...d.data() } as any));
        
        // Filter out unaligned/pending quizzes
        quizzes = quizzes.filter(q => q.alignmentStatus === 'aligned');

        // Fetch attempts for this student to filter out completed official tasks
        const qAttempts = query(collection(db, 'attempts'), where('userId', '==', user.uid));
        const snapAttempts = await getDocs(qAttempts);
        const attempts = snapAttempts.docs.map(d => d.data());
        const completedQuizIds = new Set(attempts.map(a => a.quizId));
        
        // Discard official quizzes they have already finished
        quizzes = quizzes.filter(q => !completedQuizIds.has(q.id));
        setOfficialQuizzes(quizzes);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || joining) return;
    setJoining(true);
    
    try {
      // Find class by code
      const q = query(collection(db, 'classrooms'), where('joinCode', '==', joinCode.trim().toUpperCase()));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        alert('Invalid join code!');
        setJoining(false);
        return;
      }

      const classDoc = snap.docs[0];
      await updateDoc(doc(db, 'classrooms', classDoc.id), {
        studentIds: arrayUnion(user.uid)
      });
      
      setJoinCode('');
      alert('Successfully joined the Course Class!');
      fetchClassesAndQuizzes();
    } catch (err) {
      console.error(err);
      alert('Failed to join Course Class.');
    } finally {
      setJoining(false);
    }
  };



  return (
    <div className="min-h-screen flex flex-col">
      
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-12">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-4"
          >
            <div>
              <h1 className="text-4xl font-serif italic font-bold text-stone-900">
                Welcome back, {profile?.fullName?.split(' ')[0] || 'Student'}!
              </h1>
              <p className="text-stone-500 font-mono text-sm mt-1 uppercase tracking-widest">
                {profile?.program} // {profile?.yearLevel} // Gordon College
              </p>
            </div>
            
            <Link to="/quiz/gen" className="brutal-btn bg-stone-900 text-white flex items-center gap-2">
              <Plus size={20} />
              Generate Self-Practice
            </Link>
          </motion.div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 space-y-8">
            {/* Action Bar for joining classes */}
            <div className="bg-emerald-50 border-2 border-emerald-900 p-6 flex flex-col sm:flex-row items-center gap-6">
              <div className="flex-1">
                <h3 className="text-xl font-bold flex items-center gap-2 text-emerald-900 mb-1">
                  <UserPlus size={24} /> Join a Course Class
                </h3>
                <p className="text-sm font-mono text-emerald-700">Get your unique join code from your instructor.</p>
              </div>
              <form onSubmit={handleJoinClass} className="flex w-full sm:w-auto">
                <input 
                  type="text" 
                  required
                  placeholder="Enter 6-Digit Code"
                  className="p-3 border-2 border-emerald-900 border-r-0 uppercase font-mono font-bold w-full sm:w-48 placeholder:font-normal placeholder:normal-case"
                  value={joinCode}
                  onChange={e=>setJoinCode(e.target.value)}
                />
                <button type="submit" disabled={joining} className="bg-emerald-900 text-white font-bold uppercase tracking-widest px-6 hover:bg-emerald-800 disabled:opacity-50">
                  Join
                </button>
              </form>
            </div>

            {/* Official Quizzes List */}
            <div>
              <h3 className="text-2xl font-serif italic font-bold mb-4">Official Tasks</h3>
              {officialQuizzes.length === 0 ? (
                <div className="p-8 border-2 border-dashed border-stone-300 text-center text-stone-400 font-mono">
                  No official quizzes assigned yet.
                </div>
              ) : (
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {officialQuizzes.map(quiz => (
                    <div key={quiz.id} className="bg-white p-6 brutal-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono bg-purple-100 text-purple-800 px-2 py-1 uppercase tracking-widest font-bold">
                            Official Exam
                          </span>
                          {quiz.timeLimit && (
                            <span className="text-[10px] font-mono bg-stone-100 text-stone-800 px-2 py-1 uppercase tracking-widest">
                              {quiz.timeLimit} Min Limit
                            </span>
                          )}
                        </div>
                        <h4 className="text-xl font-bold">{quiz.quizName}</h4>
                        <p className="text-xs text-stone-500 font-mono mt-1">Topic: {quiz.topic === 'all' ? 'Mixed Topics' : quiz.topic}</p>
                      </div>
                      <Link to={`/quiz/take/${quiz.id}`} className="brutal-btn bg-purple-600 text-white flex items-center justify-center gap-2 hover:bg-purple-700 whitespace-nowrap">
                        <Play size={16} /> Start Attempt
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>



            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <StatCard 
                title="Course Classes" 
                value={myClasses.length.toString()} 
                icon={<Users className="text-blue-500" />} 
                label={`Enrolled in ${myClasses.length} Classes`}
              />
              <StatCard 
                title="Self Practice" 
                value="View History" 
                icon={<BrainCircuit className="text-purple-500" />} 
                link="/reports"
                label="Check Progress"
              />
            </div>
          </section>

          {/* Sidebar */}
          <aside className="space-y-8">
            <div className="bg-stone-900 text-white p-6 brutal-border">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <BrainCircuit size={20} />
                AI Study Tip
              </h3>
              <p className="text-stone-300 text-sm leading-relaxed">
                "Spaced repetition is key. Try retaking your earlier self-practice quizzes today to reinforce your memory before official assessments."
              </p>
            </div>

            <div className="bg-white p-6 brutal-border">
              <h3 className="text-lg font-bold mb-4">Course Classes</h3>
              <ul className="space-y-3">
                {myClasses.length === 0 ? (
                  <p className="text-xs font-mono text-stone-500">Not enrolled in any classes.</p>
                ) : (
                  myClasses.map(c => (
                    <li 
                      key={c.id} 
                      onClick={() => handleClassClick(c)}
                      className="text-sm font-bold border-b border-stone-100 pb-2 cursor-pointer hover:bg-stone-50 p-2 brutal-border transition-colors group flex justify-between items-center"
                    >
                      {c.name}
                      <ArrowRight size={14} className="text-stone-300 group-hover:text-stone-900 group-hover:translate-x-1 transition-all" />
                    </li>
                  ))
                )}
              </ul>
            </div>
          </aside>
        </div>
      </main>

      {/* Class Details Modal */}
      {selectedClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm" onClick={() => setSelectedClass(null)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white p-6 md:p-8 brutal-border max-w-lg w-full max-h-[80vh] overflow-y-auto"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[10px] font-mono bg-stone-100 text-stone-800 px-2 py-1 uppercase tracking-widest font-bold mb-2 inline-block">
                  Course Class
                </span>
                <h2 className="text-3xl font-serif font-bold italic">{selectedClass.name}</h2>
              </div>
              <button onClick={() => setSelectedClass(null)} className="p-2 bg-stone-100 hover:bg-stone-200 brutal-border transition-colors">
                <X size={20} />
              </button>
            </div>

            {loadingClassDetails ? (
              <div className="py-12 text-center text-stone-400 font-mono text-sm animate-pulse">
                LOADING CLASS DETAILS...
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-mono uppercase tracking-widest text-stone-500 mb-2">Instructor</h4>
                  <p className="text-lg font-bold bg-purple-50 text-purple-900 p-3 brutal-border border-purple-200">
                    Prof. {classDetails.instructor}
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-mono uppercase tracking-widest text-stone-500 mb-2 flex items-center justify-between">
                    <span>Classmates</span>
                    <span className="bg-stone-100 px-2 py-0.5 rounded text-[10px]">{classDetails.classmates.length}</span>
                  </h4>
                  {classDetails.classmates.length === 0 ? (
                    <p className="text-sm text-stone-500 font-mono bg-stone-50 p-4 brutal-border text-center">No other classmates yet.</p>
                  ) : (
                    <ul className="bg-stone-50 p-4 brutal-border space-y-3 max-h-48 overflow-y-auto">
                      {classDetails.classmates.map((student: any, i: number) => (
                        <li key={i} className="text-sm border-b border-stone-200 pb-2 last:border-0 last:pb-0">
                          <span className="font-bold text-stone-900 block">{student.name}</span>
                          <span className="text-[10px] font-mono text-stone-500 uppercase flex gap-2">
                             <span>{student.program}</span>
                             <span>&bull;</span>
                             <span>{student.yearLevel}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}


    </div>
  );
}

function StatCard({ title, value, icon, link, label }: any) {
  const content = (
    <>
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-stone-500">{title}</p>
          <h4 className="text-3xl font-bold mt-1">{value}</h4>
        </div>
        <div className="p-2 bg-stone-50 rounded-lg">
          {icon}
        </div>
      </div>
      <div className="text-sm font-bold flex items-center gap-1 hover:gap-2 transition-all group mt-auto pt-4 border-t-2 border-stone-100">
        {label} {link && <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />}
      </div>
    </>
  );

  return link ? (
    <Link to={link} className="bg-white p-6 brutal-border flex flex-col justify-between hover:scale-[1.02] transition-transform">
      {content}
    </Link>
  ) : (
    <div className="bg-white p-6 brutal-border flex flex-col justify-between">
      {content}
    </div>
  );
}

import { Users } from 'lucide-react';
