import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, getDocs, where, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { Shield, ArrowLeft, CheckCircle2, XCircle, Clock, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';

export default function AdminFeedback() {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteQuizConfirmData, setDeleteQuizConfirmData] = useState<{ id: string, name: string } | null>(null);

  const fetchQuizzes = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(collection(db, 'quizzes'), where('userId', '==', auth.currentUser.uid), where('type', '==', 'instructor'));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort by generationDate desc
      data.sort((a: any, b: any) => new Date(b.generationDate || 0).getTime() - new Date(a.generationDate || 0).getTime());
      setQuizzes(data);
    } catch (error) {
      console.error("Error fetching quizzes:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const handleDeleteQuizConfirm = async () => {
    if (!deleteQuizConfirmData) return;
    try {
      await deleteDoc(doc(db, 'quizzes', deleteQuizConfirmData.id));
      setDeleteQuizConfirmData(null);
      fetchQuizzes();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `quizzes/${deleteQuizConfirmData.id}`);
    }
  };

  if (loading) {
    return <div className="p-8 font-mono animate-pulse text-stone-500">Loading Feedback...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      <Link to="/dashboard" className="text-sm font-bold font-mono uppercase text-stone-400 hover:text-stone-900 flex items-center gap-2 mb-8 inline-flex">
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-4xl font-serif italic font-bold text-stone-900 flex items-center gap-3">
          <Shield className="text-blue-500" size={32} />
          Academic Admin Feedback
        </h1>
        <p className="text-stone-500 font-mono mt-2">
          Review the curriculum alignment status of your official assessments.
        </p>
      </div>

      <div className="space-y-6">
        {quizzes.length === 0 ? (
          <div className="bg-white p-8 brutal-border text-center text-stone-500 font-mono">
            No official quizzes created yet.
          </div>
        ) : (
          quizzes.map(quiz => (
            <div key={quiz.id} className="bg-white brutal-border p-6 shadow-[4px_4px_0px_rgba(28,25,23,1)]">
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
                <div>
                  <h3 className="text-xl font-bold">{quiz.quizName || 'Untitled Quiz'}</h3>
                  <p className="text-xs font-mono text-stone-500">Subject: {quiz.topic}</p>
                  <p className="text-xs font-mono text-stone-400 mt-1">Generated: {new Date(quiz.generationDate).toLocaleDateString()}</p>
                </div>
                <div className="shrink-0 flex items-center gap-4">
                  {quiz.alignmentStatus === 'aligned' ? (
                     <span className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold bg-emerald-50 px-3 py-1 w-max brutal-border border-emerald-200 uppercase">
                        <CheckCircle2 size={14} /> Approved
                     </span>
                  ) : quiz.alignmentStatus === 'unaligned' ? (
                     <span className="flex items-center gap-1 text-red-600 text-[10px] font-bold bg-red-50 px-3 py-1 w-max brutal-border border-red-200 uppercase">
                        <XCircle size={14} /> Rejected
                     </span>
                  ) : (
                     <span className="flex items-center gap-1 text-amber-600 text-[10px] font-bold bg-amber-50 px-3 py-1 w-max brutal-border border-amber-200 uppercase">
                        <Clock size={14} /> Pending Review
                     </span>
                  )}
                  <button
                    onClick={() => setDeleteQuizConfirmData({ id: quiz.id, name: quiz.name || 'Assessment' })}
                    className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    title="Delete Assessment"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {quiz.alignmentStatus === 'unaligned' && quiz.feedback && (
                <div className="bg-red-50 p-4 border border-red-200 mt-4 rounded-sm">
                  <h4 className="text-xs font-bold font-mono text-red-800 uppercase mb-2">Admin Feedback</h4>
                  <p className="text-sm font-mono text-stone-800 whitespace-pre-wrap">{quiz.feedback}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal for Quiz */}
      <AnimatePresence>
        {deleteQuizConfirmData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white p-6 brutal-border max-w-sm w-full"
            >
              <h3 className="font-bold text-xl font-serif text-stone-900 mb-2">Delete Assessment?</h3>
              <p className="text-stone-500 font-mono text-sm mb-6">
                This action cannot be undone. Are you sure you want to permanently delete <strong>{deleteQuizConfirmData.name}</strong>?
              </p>
              
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setDeleteQuizConfirmData(null)} 
                  className="px-4 py-2 font-bold text-stone-500 hover:text-stone-900 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteQuizConfirm} 
                  className="brutal-btn bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
