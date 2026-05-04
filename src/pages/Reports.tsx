import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, orderBy, doc, getDoc, limit, deleteDoc } from 'firebase/firestore';
import Navbar from '../components/Navbar';
import { BarChart3, History, TrendingUp, Award, Calendar, CheckCircle2, BrainCircuit, AlertTriangle, Target, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Reports() {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [latestPrediction, setLatestPrediction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    avgScore: 0,
    totalQuizzes: 0,
    bestScore: 0,
    totalQuestions: 0,
    correctAnswers: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  const openDeleteModal = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteDoc(doc(db, 'attempts', deleteConfirmId));
      setAttempts(prev => prev.filter(a => a.id !== deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Failed to delete attempt:", err);
    }
  };

  const fetchData = async () => {
    if (!auth.currentUser) return;
    try {
      // Fetch Attempts
      const q = query(
        collection(db, 'attempts'),
        where('userId', '==', auth.currentUser.uid)
      );
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // manually sort to avoid composite index requirements
      docs.sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());

      // Fetch AI Prediction
      const aiQ = query(
        collection(db, 'ai_predictions'),
        where('user_id', '==', auth.currentUser.uid)
      );
      const aiSnap = await getDocs(aiQ);
      const allAi = aiSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
        .sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());
        
      if (allAi.length > 0) {
        setLatestPrediction(allAi[0]);
      }

      // Fetch classrooms to calculate scores per team/Course Class
      const classQ = query(
        collection(db, 'classrooms'),
        where('studentIds', 'array-contains', auth.currentUser.uid)
      );
      const classSnap = await getDocs(classQ);
      const classrooms = classSnap.docs.map(c => ({ id: c.id, ...c.data() } as any));
      const classMap = Object.fromEntries(classrooms.map(c => [c.id, c.name]));

      // Enrich with quiz details
      const quizCache: Record<string, any> = {};
      for (let i = 0; i < docs.length; i++) {
        const attempt = docs[i];
        if (!quizCache[attempt.quizId]) {
          const qDoc = await getDoc(doc(db, 'quizzes', attempt.quizId));
          quizCache[attempt.quizId] = qDoc.exists() ? qDoc.data() : { quizName: 'Deleted Quiz', type: 'practice' };
        }
        attempt.quizInfo = quizCache[attempt.quizId];
        
        // Find nearest AI prediction within 2 minutes of the attempt
        attempt.aiPrediction = allAi.find(ai => Math.abs(new Date(ai.generated_at).getTime() - new Date(attempt.endTime).getTime()) < 120000);
      }

      setAttempts(docs);

      if (docs.length > 0) {
        const officialQuizzes = docs.filter(d => 
          d.quizInfo?.type === 'instructor' && 
          d.quizInfo?.alignmentStatus === 'aligned'
        );

        if (officialQuizzes.length > 0) {
          const totalScore = officialQuizzes.reduce((acc, curr) => acc + (curr.score / curr.totalQuestions), 0);
          const best = Math.max(...officialQuizzes.map(d => (d.score / d.totalQuestions) * 100));
          const totalQ = officialQuizzes.reduce((acc, curr) => acc + curr.totalQuestions, 0);
          const totalC = officialQuizzes.reduce((acc, curr) => acc + curr.score, 0);

          // Calculate average score per Course Class
          const classScores: Record<string, { totalScore: number, totalQuestions: number, courseName: string }> = {};
          officialQuizzes.forEach(attempt => {
            const cId = attempt.quizInfo?.classroomId;
            if (cId && classMap[cId]) {
               if (!classScores[cId]) classScores[cId] = { totalScore: 0, totalQuestions: 0, courseName: classMap[cId] };
               classScores[cId].totalScore += attempt.score;
               classScores[cId].totalQuestions += attempt.totalQuestions;
            }
          });

          const classAverages = Object.values(classScores).map(cv => ({
             courseName: cv.courseName,
             avgScore: Math.round((cv.totalScore / cv.totalQuestions) * 100)
          }));

          setStats({
            avgScore: Math.round((totalScore / officialQuizzes.length) * 100),
            totalQuizzes: officialQuizzes.length,
            bestScore: Math.round(best),
            totalQuestions: totalQ,
            correctAnswers: totalC,
            classAverages // new property
          } as any);
        } else {
          setStats({
            avgScore: 0,
            totalQuizzes: 0,
            bestScore: 0,
            totalQuestions: 0,
            correctAnswers: 0,
            classAverages: []
          } as any);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-12">
          <h1 className="text-4xl font-serif italic font-bold text-stone-900">Proficiency Reports</h1>
          <p className="text-stone-500 font-mono text-sm">Analyze your learning progress and quiz history</p>
        </header>

        {loading ? (
          <div className="text-center py-20 font-mono text-stone-400">ANALYZING DATA...</div>
        ) : attempts.length === 0 ? (
          <div className="text-center py-20 bg-white brutal-border">
            <BarChart3 size={48} className="mx-auto text-stone-200 mb-4" />
            <h3 className="text-xl font-bold">No data available</h3>
            <p className="text-stone-500 mt-2">Take your first quiz to see your proficiency analytics.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Stats Grid */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <ReportStat 
                label="Average Score" 
                value={`${stats.avgScore}%`} 
                icon={<TrendingUp className="text-blue-500" />} 
              />
              <ReportStat 
                label="Quizzes Completed" 
                value={stats.totalQuizzes} 
                icon={<CheckCircle2 className="text-emerald-500" />} 
              />
              <ReportStat 
                label="Best Performance" 
                value={`${stats.bestScore}%`} 
                icon={<Award className="text-amber-500" />} 
              />
            </section>

            {/* Course Class Average Scores */}
            {stats.classAverages && stats.classAverages.length > 0 && (
              <section className="bg-white p-6 brutal-border">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <BarChart3 size={20} className="text-blue-500" />
                  Course Class Scores
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {stats.classAverages.map((ca: any, idx: number) => (
                    <div key={idx} className="bg-stone-50 p-4 brutal-border text-center">
                      <p className="text-sm font-bold text-stone-900 mb-1">{ca.courseName}</p>
                      <p className="text-2xl font-bold text-blue-600">{ca.avgScore}%</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {latestPrediction && (
              <section className="bg-stone-50 brutal-border p-6 text-left relative overflow-hidden">
                <div className="absolute -top-10 -right-10 opacity-5">
                  <BrainCircuit size={200} />
                </div>
                <div className="relative z-10">
                  <h2 className="font-bold font-serif text-xl border-b-2 border-stone-200 pb-2 mb-4 flex items-center gap-2">
                    <BrainCircuit className="text-purple-600" /> AI Performance Insights
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-4 brutal-border">
                      <span className="text-xs font-mono uppercase tracking-widest text-stone-500 flex items-center gap-2 mb-2"><AlertTriangle size={14} className="text-amber-500"/> Weak Area Identified</span>
                      <p className="text-sm font-medium leading-relaxed">{latestPrediction.weak_areas_identified}</p>
                    </div>
                    <div className="bg-white p-4 brutal-border">
                      <span className="text-xs font-mono uppercase tracking-widest text-stone-500 flex items-center gap-2 mb-2"><TrendingUp size={14} className="text-blue-500"/> Performance Trend</span>
                      <p className="text-sm font-medium leading-relaxed">{latestPrediction.performance_trend}</p>
                    </div>
                    <div className="bg-white p-4 brutal-border">
                      <span className="text-xs font-mono uppercase tracking-widest text-stone-500 flex items-center gap-2 mb-2"><Target size={14} className="text-emerald-500"/> Recommended Focus</span>
                      <p className="text-sm font-medium leading-relaxed">{latestPrediction.recommended_focus}</p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* History Table */}
            <section>
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <History size={20} />
                Recent Quiz Attempts
              </h2>
              
              <div className="bg-white brutal-border overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b-2 border-stone-900">
                      <th className="p-4 text-xs font-mono uppercase tracking-wider text-stone-500">Exam Details</th>
                      <th className="p-4 text-xs font-mono uppercase tracking-wider text-stone-500">Score</th>
                      <th className="p-4 text-xs font-mono uppercase tracking-wider text-stone-500">Accuracy</th>
                      <th className="p-4 text-xs font-mono uppercase tracking-wider text-stone-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((attempt) => {
                      const accuracy = Math.round((attempt.score / attempt.totalQuestions) * 100);
                      const isOfficial = attempt.quizInfo?.type === 'instructor';
                      const isExpanded = expandedAttemptId === attempt.id;

                      return (
                        <React.Fragment key={attempt.id}>
                          <tr 
                            onClick={() => setExpandedAttemptId(isExpanded ? null : attempt.id)}
                            className="border-b border-stone-100 hover:bg-stone-50 transition-colors cursor-pointer"
                          >
                            <td className="p-4">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-sm uppercase font-bold ${isOfficial ? 'bg-purple-100 text-purple-800' : 'bg-stone-200 text-stone-700'}`}>
                                    {isOfficial ? 'Official' : 'Practice'}
                                  </span>
                                  <span className="text-xs text-stone-500 font-mono flex items-center gap-1">
                                    <Calendar size={12} /> {new Date(attempt.endTime).toLocaleDateString()} {new Date(attempt.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </span>
                                </div>
                                <span className="text-sm font-bold mt-1 text-stone-900">
                                  {attempt.quizInfo?.quizName || attempt.quizInfo?.topic || 'Untitled Quiz'}
                                </span>
                              </div>
                            </td>
                            <td className="p-4 font-bold">
                              {attempt.score} / {attempt.totalQuestions}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 bg-stone-100 h-2 rounded-full overflow-hidden min-w-[100px]">
                                  <div 
                                    className={`h-full ${accuracy >= 80 ? 'bg-emerald-500' : accuracy >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                    style={{ width: `${accuracy}%` }}
                                  />
                                </div>
                                <span className="text-xs font-mono font-bold">{accuracy}%</span>
                              </div>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-4">
                                <span className={`text-[10px] font-mono px-2 py-1 rounded-full uppercase font-bold hidden sm:inline-block ${
                                  accuracy >= 80 ? 'bg-emerald-100 text-emerald-700' : 
                                  accuracy >= 50 ? 'bg-amber-100 text-amber-700' : 
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {accuracy >= 80 ? 'Mastered' : accuracy >= 50 ? 'Proficient' : 'Needs Review'}
                                </span>
                                <button onClick={(e) => openDeleteModal(e, attempt.id)} className="p-2 text-stone-400 hover:text-red-500 transition-colors brutal-border hover:bg-white rounded-md bg-stone-50">
                                  <Trash2 size={16} />
                                </button>
                                <div className="p-1">
                                  {isExpanded ? <ChevronUp size={20} className="text-stone-500" /> : <ChevronDown size={20} className="text-stone-500" />}
                                </div>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Content */}
                          <AnimatePresence>
                            {isExpanded && (
                              <tr>
                                <td colSpan={5} className="p-0 border-b-2 border-stone-200">
                                  <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="bg-stone-50 overflow-hidden"
                                  >
                                    <div className="p-6 space-y-6">
                                      
                                      {/* Unique AI Insight for this specific attempt */}
                                      {attempt.aiPrediction && (
                                        <div className="bg-white p-5 brutal-border">
                                          <h4 className="font-bold font-serif text-sm border-b-2 border-stone-100 pb-2 mb-4 flex items-center gap-2">
                                            <BrainCircuit size={18} className="text-purple-600" /> Insight from this Attempt
                                          </h4>
                                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                            <div>
                                              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 flex items-center gap-1 mb-1"><AlertTriangle size={12} className="text-amber-500"/> Weak Area</span>
                                              <p className="font-medium text-stone-700">{attempt.aiPrediction.weak_areas_identified}</p>
                                            </div>
                                            <div>
                                              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 flex items-center gap-1 mb-1"><TrendingUp size={12} className="text-blue-500"/> Trend</span>
                                              <p className="font-medium text-stone-700">{attempt.aiPrediction.performance_trend}</p>
                                            </div>
                                            <div>
                                              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 flex items-center gap-1 mb-1"><Target size={12} className="text-emerald-500"/> Focus</span>
                                              <p className="font-medium text-stone-700">{attempt.aiPrediction.recommended_focus}</p>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* Results Breakdown */}
                                      <div className="space-y-4">
                                        <h4 className="font-bold text-sm uppercase tracking-wider text-stone-500 border-b-2 border-stone-200 pb-2">Question Breakdown</h4>
                                        {attempt.results && attempt.results.length > 0 ? (
                                          <div className="space-y-3">
                                            {attempt.results.map((res: any, idx: number) => {
                                              const isCorrect = res.isCorrect || res.is_correct;
                                              return (
                                                <div key={idx} className={`p-4 brutal-border bg-white ${isCorrect ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-red-500'}`}>
                                                  <p className="font-medium text-sm mb-3">
                                                    <span className="text-stone-400 font-mono mr-2">{idx + 1}.</span> 
                                                    {res.questionText || res.question_text || 'Question text unavailable'}
                                                  </p>
                                                  <div className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50 p-3 rounded-md">
                                                    <div>
                                                      <span className="text-stone-500 text-[10px] uppercase font-mono block mb-1">Your Answer:</span>
                                                      <p className={`font-bold ${isCorrect ? 'text-emerald-600' : 'text-red-600'}`}>{res.userAnswer || res.user_answer}</p>
                                                    </div>
                                                    {!isCorrect && (
                                                      <div>
                                                        <span className="text-emerald-600/70 text-[10px] uppercase font-mono block mb-1">Correct Answer:</span>
                                                        <p className="font-bold text-emerald-600">{res.correctAnswer || res.correct_answer}</p>
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          <p className="text-sm text-stone-500 italic">No detailed breakdown available for this attempt.</p>
                                        )}
                                      </div>

                                    </div>
                                  </motion.div>
                                </td>
                              </tr>
                            )}
                          </AnimatePresence>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

      </main>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-6 brutal-border max-w-sm w-full"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3 text-red-600">
                <AlertTriangle size={24} />
                <h3 className="font-bold text-lg">Delete Attempt?</h3>
              </div>
              <button onClick={() => setDeleteConfirmId(null)} className="text-stone-400 hover:text-stone-900">
                <X size={20} />
              </button>
            </div>
            <p className="text-stone-600 mb-6 font-medium text-sm leading-relaxed">
              This will permanently remove this quiz attempt from your history and immediately recalculate your overall proficiency stats.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-100 brutal-border transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-bold bg-red-500 text-white hover:bg-red-600 brutal-border transition-colors"
                autoFocus
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function ReportStat({ label, value, icon }: any) {
  return (
    <div className="bg-white p-6 brutal-border">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-stone-50 rounded-lg">
          {icon}
        </div>
        <span className="text-xs font-mono uppercase tracking-wider text-stone-500">{label}</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
