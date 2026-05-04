import { User } from 'firebase/auth';
import { Link } from 'react-router-dom';
import { Users, Database, FileText, Settings, ArrowRight, BrainCircuit, Plus, Copy, X, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, getDocs, addDoc, doc, deleteDoc } from 'firebase/firestore';

interface DashboardProps {
  profile: any;
}

export default function InstructorDashboard({ profile }: DashboardProps) {
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [loading, setLoading] = useState(true);

  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [classDetails, setClassDetails] = useState<{students: any[]}>({ students: [] });
  const [loadingClassDetails, setLoadingClassDetails] = useState(false);
  const [classToDelete, setClassToDelete] = useState<any>(null);

  useEffect(() => {
    fetchClassrooms();
  }, []);

  const handleClassClick = async (c: any) => {
    setSelectedClass(c);
    setLoadingClassDetails(true);
    setClassDetails({ students: [] });
    
    try {
      const studentIds = c.studentIds || [];
      const chunks = [];
      for (let i = 0; i < studentIds.length; i += 30) {
        chunks.push(studentIds.slice(i, i + 30));
      }
      
      const studentsData: any[] = [];
      for (const chunk of chunks) {
        if (chunk.length === 0) continue;
        const qStudents = query(collection(db, 'users'), where('uid', 'in', chunk));
        const snapStudents = await getDocs(qStudents);
        snapStudents.forEach(doc => {
          const data = doc.data();
          studentsData.push({
            name: data.fullName || 'Unknown Student',
            program: data.program || 'N/A',
            yearLevel: data.yearLevel || 'N/A'
          });
        });
      }
      
      setClassDetails({
        students: studentsData.sort((a, b) => a.name.localeCompare(b.name))
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingClassDetails(false);
    }
  };

  const fetchClassrooms = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(collection(db, 'classrooms'), where('instructorId', '==', auth.currentUser.uid));
      const snap = await getDocs(q);
      setClassrooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newClassName.trim()) return;
    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    try {
      await addDoc(collection(db, 'classrooms'), {
        instructorId: auth.currentUser.uid,
        name: newClassName.trim(),
        joinCode,
        studentIds: [],
        createdAt: new Date().toISOString()
      });
      const { logSystemAction } = await import('../../utils/auditLogger');
      await logSystemAction('CLASSROOM_CREATED', `Created new course class: ${newClassName.trim()}`);
      setNewClassName('');
      fetchClassrooms();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'classrooms');
    }
  };

  const handleDeleteClass = async (e: React.MouseEvent, classId: string) => {
    e.stopPropagation();
    const classToDel = classrooms.find(c => c.id === classId);
    if (classToDel) {
      setClassToDelete(classToDel);
    }
  };

  const confirmDeleteClass = async () => {
    if (!classToDelete) return;
    try {
      await deleteDoc(doc(db, 'classrooms', classToDelete.id));
      const { logSystemAction } = await import('../../utils/auditLogger');
      await logSystemAction('CLASSROOM_DELETED', `Deleted course class: ${classToDelete.name}`);
      fetchClassrooms();
      setClassToDelete(null);
    } catch (err) {
       handleFirestoreError(err, OperationType.DELETE, `classrooms/${classToDelete.id}`);
    }
  };

  return (
    <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-4"
        >
          <div>
            <h1 className="text-4xl font-serif italic font-bold text-stone-900">
              Faculty Portal
            </h1>
            <p className="text-stone-500 font-mono text-sm mt-1 uppercase tracking-widest">
              Welcome back, {profile?.fullName || 'Instructor'} // Gordon College
            </p>
          </div>
          
          <Link to="/quiz-config" className="brutal-btn bg-stone-900 text-white flex items-center gap-2">
            <Settings size={20} />
            Configure New Exam
          </Link>
        </motion.div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Core Actions */}
        <section className="lg:col-span-2 space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <ActionCard 
              title="Question Bank" 
              desc="Curate official questions tagged by competencies." 
              icon={<Database className="text-amber-500" />} 
              link="/question-bank"
              btnLabel="Manage Bank"
            />
            <ActionCard 
              title="Admin Feedback" 
              desc="Review feedback from Academic Admin on submitted quizzes." 
              icon={<FileText className="text-blue-500" />} 
              link="/admin-feedback"
              btnLabel="View Feedback"
            />
            <ActionCard 
              title="Student Performance" 
              desc="Analyze scores and identify learning gaps." 
              icon={<Users className="text-purple-500" />} 
              link="/performance"
              btnLabel="View Analytics"
            />
          </div>

          <div className="bg-white p-6 brutal-border">
            <h3 className="text-xl font-bold mb-4">Course Classes</h3>
            <form onSubmit={handleCreateClass} className="flex gap-2 mb-6">
              <input 
                type="text" 
                placeholder="New Class Name (e.g. BSIT 1A)"
                className="flex-1 p-3 brutal-border text-sm"
                value={newClassName}
                onChange={e => setNewClassName(e.target.value)}
              />
              <button type="submit" className="bg-stone-900 text-white px-6 font-bold uppercase text-xs tracking-widest hover:bg-stone-800 transition-colors">
                Create
              </button>
            </form>

            <div className="space-y-3">
              {loading ? (
                <div className="text-stone-400 font-mono text-sm py-4">LOADING CLASSES...</div>
              ) : classrooms.length === 0 ? (
                <div className="text-stone-400 font-mono text-sm py-4">No classes created yet.</div>
              ) : (
                classrooms.map(c => (
                  <div 
                    key={c.id} 
                    onClick={() => handleClassClick(c)}
                    className="flex justify-between items-center p-4 border-2 border-stone-200 cursor-pointer hover:bg-stone-50 transition-colors group"
                  >
                    <div>
                      <h4 className="font-bold text-lg flex items-center gap-2">
                        {c.name}
                        <ArrowRight size={16} className="text-stone-300 group-hover:text-stone-900 group-hover:translate-x-1 transition-all" />
                      </h4>
                      <p className="text-xs text-stone-500 font-mono">{c.studentIds?.length || 0} Students Enrolled</p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-stone-400 mb-1">Join Code</p>
                        <div className="flex items-center gap-2 bg-stone-100 px-3 py-1.5 rounded text-stone-900 font-mono font-bold">
                          {c.joinCode}
                          <button onClick={() => navigator.clipboard.writeText(c.joinCode)} className="text-stone-400 hover:text-stone-900" title="Copy Code">
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteClass(e, c.id)} 
                        className="text-red-400 hover:text-red-600 bg-red-50 p-2 brutal-border" 
                        title="Delete Class"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Intelligence Layer Sidebar */}
        <aside className="space-y-8">
          <div className="bg-stone-900 text-white p-6 brutal-border">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <BrainCircuit size={20} />
              AI Insights
            </h3>
            <p className="text-stone-300 text-sm leading-relaxed mb-4">
              "The adaptive engine detects a college-wide learning gap in <strong className="text-white">Software Architecture Concepts</strong>. Consider deploying a targeted review quiz."
            </p>
            <Link to="/quiz-config" className="text-xs font-bold uppercase tracking-widest text-amber-400 hover:text-amber-300 flex items-center gap-1">
              Create Review Quiz <ArrowRight size={14} />
            </Link>
          </div>
        </aside>
      </div>

      {/* Class Details Modal */}
      <AnimatePresence>
        {selectedClass && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm" onClick={() => setSelectedClass(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white p-6 md:p-8 brutal-border max-w-lg w-full max-h-[80vh] flex flex-col"
            >
              <div className="flex justify-between items-start mb-6 shrink-0">
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
                  LOADING ENROLLED STUDENTS...
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  <h4 className="text-xs font-mono uppercase tracking-widest text-stone-500 mb-2 flex items-center justify-between shrink-0">
                    <span>Enrolled Students</span>
                    <span className="bg-stone-100 px-2 py-0.5 rounded text-[10px]">{classDetails.students.length}</span>
                  </h4>
                  {classDetails.students.length === 0 ? (
                    <p className="text-sm text-stone-500 font-mono bg-stone-50 p-4 brutal-border text-center">No students enrolled yet.</p>
                  ) : (
                    <ul className="bg-stone-50 p-4 brutal-border space-y-3 overflow-y-auto">
                      {classDetails.students.map((student: any, i: number) => (
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
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {classToDelete && (
          <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white p-6 max-w-sm w-full brutal-border shadow-[8px_8px_0px_rgba(28,25,23,1)]"
            >
              <div className="flex justify-between items-center border-b-2 border-stone-200 pb-3 mb-4">
                <h3 className="font-bold text-lg font-serif text-red-600">Delete Class</h3>
                <button onClick={() => setClassToDelete(null)} className="text-stone-500 hover:text-stone-900"><X size={20}/></button>
              </div>
              <p className="text-sm text-stone-600 font-mono mb-6">
                Are you sure you want to delete <span className="font-bold">{classToDelete.name}</span>? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                 <button 
                    onClick={() => setClassToDelete(null)}
                    className="px-4 py-2 font-bold font-mono text-sm tracking-wider uppercase text-stone-600 hover:bg-stone-100 brutal-border"
                 >
                   Cancel
                 </button>
                 <button 
                    onClick={confirmDeleteClass}
                    className="px-6 py-2 bg-red-600 text-white font-bold font-mono text-sm tracking-wider uppercase shadow-[4px_4px_0px_rgba(28,25,23,1)] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(28,25,23,1)] transition-all active:translate-y-[4px] active:shadow-none"
                 >
                   Delete
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}

function ActionCard({ title, desc, icon, link, btnLabel }: any) {
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="bg-white p-6 brutal-border flex flex-col justify-between"
    >
      <div>
        <div className="flex justify-between items-start mb-4">
          <h4 className="text-xl font-bold">{title}</h4>
          <div className="p-2 bg-stone-50 rounded-lg">
            {icon}
          </div>
        </div>
        <p className="text-stone-500 text-sm mb-6">{desc}</p>
      </div>
      <Link to={link} className="brutal-btn bg-stone-100 text-stone-900 text-center hover:bg-stone-200 transition-colors">
        {btnLabel}
      </Link>
    </motion.div>
  );
}
