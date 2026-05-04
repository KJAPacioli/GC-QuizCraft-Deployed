import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebase';
import { collection, query, getDocs, where, limit, doc, getDoc } from 'firebase/firestore';
import { Users, TrendingUp, AlertTriangle, Eye, XCircle, CheckCircle2, ChevronDown, ChevronUp, BrainCircuit, Target, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function StudentPerformance() {
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [examGroups, setExamGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null);
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);

  useEffect(() => {
    fetchInstructorAttempts();
  }, []);

  const fetchInstructorAttempts = async () => {
    if (!auth.currentUser) return;
    try {
      // 1. Get instructor's classrooms
      const classQ = query(collection(db, 'classrooms'), where('instructorId', '==', auth.currentUser.uid));
      const classSnap = await getDocs(classQ);
      const classDict: Record<string, any> = {};
      classSnap.docs.forEach(d => {
        classDict[d.id] = { id: d.id, ...d.data() };
      });
      const classIds = Object.keys(classDict);

      if (classIds.length === 0) {
        setRecentAttempts([]);
        setExamGroups([]);
        setLoading(false);
        return;
      }

      // 2. Get attempts for those classrooms
      const attemptsQ = query(
        collection(db, 'attempts'), 
        where('classroomId', 'in', classIds),
        limit(100)
      );
      const snap = await getDocs(attemptsQ);
      
      let attemptsData: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 3. Fetch user and quiz details to enrich the attempts
      const userCache: Record<string, any> = {};
      const quizCache: Record<string, any> = {};
      const aiCache: Record<string, any[]> = {};

      for (let i = 0; i < attemptsData.length; i++) {
        const attempt = attemptsData[i];
        
        // Fetch User Info
        if (!userCache[attempt.userId]) {
          const uDoc = await getDoc(doc(db, 'users', attempt.userId));
          userCache[attempt.userId] = uDoc.exists() ? uDoc.data() : { fullName: 'Unknown Student' };
        }
        attempt.studentInfo = userCache[attempt.userId];

        // Fetch Quiz Info
        if (!quizCache[attempt.quizId]) {
          const qDoc = await getDoc(doc(db, 'quizzes', attempt.quizId));
          quizCache[attempt.quizId] = qDoc.exists() ? qDoc.data() : { topic: 'Unknown Topic', quizName: 'Unknown Quiz' };
        }
        attempt.quizInfo = quizCache[attempt.quizId];
        attempt.classroomInfo = classDict[attempt.classroomId] || { name: 'Unknown Class' };

        // Fetch AI Info
        if (!aiCache[attempt.userId]) {
            const aiQ = query(collection(db, 'ai_predictions'), where('user_id', '==', attempt.userId));
            const aiSnap = await getDocs(aiQ);
            aiCache[attempt.userId] = aiSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        const userPredictions = aiCache[attempt.userId];
        attempt.aiPrediction = userPredictions.find((ai: any) => Math.abs(new Date(ai.generated_at).getTime() - new Date(attempt.endTime).getTime()) < 120000);
      }

      // Sort by descending time manually
      attemptsData.sort((a: any, b: any) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());
      
      setRecentAttempts(attemptsData);

      // Group by Quiz ID
      const grouped: Record<string, any> = {};
      attemptsData.forEach(a => {
        if (!grouped[a.quizId]) {
          grouped[a.quizId] = {
            quizId: a.quizId,
            quizInfo: a.quizInfo,
            classroomInfo: a.classroomInfo,
            attempts: []
          };
        }
        grouped[a.quizId].attempts.push(a);
      });

      setExamGroups(Object.values(grouped));

    } catch (err) {
      console.error("Error fetching attempts:", err);
    } finally {
      setLoading(false);
    }
  };

  const averageScore = recentAttempts.length > 0 
    ? (recentAttempts.reduce((acc, curr) => acc + (curr.score / curr.totalQuestions), 0) / recentAttempts.length) * 100
    : 0;

  return (
    <main className="max-w-7xl mx-auto w-full px-4 py-8">
      <header className="mb-8">
        <h1 className="text-4xl font-serif italic font-bold flex items-center gap-2">
          <Users size={28} /> Student Performance Analytics
        </h1>
        <p className="text-stone-500 font-mono text-sm mt-1">Cross-course evaluation and gap detection</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-1 gap-6 mb-8">
        <div className="bg-white p-6 brutal-border flex items-center gap-4">
          <div className="p-4 bg-stone-100 rounded-full">
            <TrendingUp size={32} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-stone-500 mb-1">Classroom Average Score</p>
            <p className="text-4xl font-bold text-stone-900">{averageScore.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="bg-white brutal-border p-8 text-center text-stone-500 font-mono">LOADING ANALYTICS...</div>
        ) : examGroups.length === 0 ? (
          <div className="bg-white brutal-border p-8 text-center text-stone-500 font-mono">No attempts logged yet.</div>
        ) : (
          examGroups.map(group => {
            const isExamExpanded = expandedExamId === group.quizId;
            return (
              <div key={group.quizId} className="bg-white brutal-border overflow-hidden shadow-[4px_4px_0px_rgba(28,25,23,1)]">
                <div 
                  className={`flex flex-col md:flex-row md:items-center justify-between p-4 cursor-pointer hover:bg-stone-50 transition-colors ${isExamExpanded ? 'bg-stone-100 border-b-2 border-stone-200' : ''}`}
                  onClick={() => setExpandedExamId(isExamExpanded ? null : group.quizId)}
                >
                  <div>
                    <h3 className="font-bold text-lg text-stone-900 flex items-center gap-2">
                       <Target size={20} className="text-emerald-600" />
                       {group.quizInfo?.quizName || group.quizId}
                    </h3>
                    <div className="flex flex-col md:flex-row gap-2 md:gap-4 mt-2">
                      <span className="text-sm text-stone-600 font-mono"><strong className="text-stone-900">Class:</strong> {group.classroomInfo?.name}</span>
                      <span className="text-sm text-stone-600 font-mono"><strong className="text-stone-900">Topic:</strong> {group.quizInfo?.topic || 'Uncategorized'}</span>
                      <span className="text-sm text-stone-600 font-mono"><strong className="text-stone-900">Attempts:</strong> {group.attempts.length}</span>
                    </div>
                  </div>
                  <div className="mt-4 md:mt-0 text-stone-500 flex items-center gap-2 font-mono text-sm self-end md:self-auto">
                    {isExamExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                  </div>
                </div>

                <AnimatePresence>
                  {isExamExpanded && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                    >
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-stone-900 text-white font-mono text-xs uppercase tracking-widest">
                            <tr>
                              <th className="p-4">Student</th>
                              <th className="p-4">Program & Year</th>
                              <th className="p-4">Score</th>
                              <th className="p-4">Date Taken</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-200">
                            {group.attempts.map((a: any) => {
                              const percentage = (a.score / a.totalQuestions) * 100;
                              const isAttemptExpanded = expandedAttemptId === a.id;
                              
                              return (
                                <React.Fragment key={a.id}>
                                  <motion.tr 
                                    initial={{ opacity: 0 }} 
                                    animate={{ opacity: 1 }} 
                                    className={`hover:bg-stone-50 cursor-pointer transition-colors ${isAttemptExpanded ? 'bg-stone-50' : ''}`}
                                    onClick={() => setExpandedAttemptId(isAttemptExpanded ? null : a.id)}
                                  >
                                    <td className="p-4">
                                      <p className="font-bold text-sm text-stone-900 flex items-center gap-2">
                                        <Users size={16} className="text-stone-400" />
                                        {a.studentInfo?.fullName || 'Unknown Student'}
                                      </p>
                                    </td>
                                    <td className="p-4">
                                      <p className="text-xs font-mono text-stone-500">
                                        {a.studentInfo?.program || 'N/A'} • Year {a.studentInfo?.yearLevel || 'N/A'}
                                      </p>
                                    </td>
                                    <td className="p-4">
                                      <span className={`px-2 py-1 text-xs font-bold font-mono inline-block ${percentage >= 70 ? 'bg-emerald-100 text-emerald-800' : percentage >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                                        {a.score} / {a.totalQuestions} ({percentage.toFixed(0)}%)
                                      </span>
                                    </td>
                                    <td className="p-4 text-xs font-mono text-stone-500">
                                      <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1"><Calendar size={14}/> {new Date(a.endTime).toLocaleString()}</span>
                                        <button className="text-stone-400 hover:text-stone-900 transition-colors ml-4 p-1">
                                          {isAttemptExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                      </div>
                                    </td>
                                  </motion.tr>

                                  {/* Expanded Content */}
                                  <AnimatePresence>
                                    {isAttemptExpanded && (
                                      <tr>
                                        <td colSpan={4} className="p-0 border-b-2 border-stone-200">
                                          <motion.div 
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="bg-stone-100 overflow-hidden shadow-inner p-6 space-y-6"
                                          >
                                            {/* Unique AI Insight for this specific attempt */}
                                            {a.aiPrediction && (
                                              <div className="bg-white p-5 brutal-border shadow-[2px_2px_0px_rgba(28,25,23,1)]">
                                                <h4 className="font-bold font-serif text-sm border-b-2 border-stone-100 pb-2 mb-4 flex items-center gap-2">
                                                  <BrainCircuit size={18} className="text-purple-600" /> Student AI Insight
                                                </h4>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                                  <div>
                                                    <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 flex items-center gap-1 mb-1"><AlertTriangle size={12} className="text-amber-500"/> Weak Area</span>
                                                    <p className="font-medium text-stone-700">{a.aiPrediction.weak_areas_identified}</p>
                                                  </div>
                                                  <div>
                                                    <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 flex items-center gap-1 mb-1"><TrendingUp size={12} className="text-blue-500"/> Trend</span>
                                                    <p className="font-medium text-stone-700">{a.aiPrediction.performance_trend}</p>
                                                  </div>
                                                  <div>
                                                    <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 flex items-center gap-1 mb-1"><Target size={12} className="text-emerald-500"/> Focus</span>
                                                    <p className="font-medium text-stone-700">{a.aiPrediction.recommended_focus}</p>
                                                  </div>
                                                </div>
                                              </div>
                                            )}

                                            {/* Results Breakdown */}
                                            <div className="space-y-4">
                                              <h4 className="font-bold text-sm uppercase tracking-wider text-stone-500 border-b-2 border-stone-200 pb-2 font-mono">Attempt Breakdown</h4>
                                              {a.results && a.results.length > 0 ? (
                                                <div className="space-y-3">
                                                  {a.results.map((res: any, idx: number) => {
                                                    const isCorrect = res.isCorrect || res.is_correct;
                                                    return (
                                                      <div key={idx} className={`p-4 brutal-border bg-white shadow-[2px_2px_0px_rgba(28,25,23,1)] ${isCorrect ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-red-500'}`}>
                                                        <p className="font-medium text-sm mb-3">
                                                          <span className="text-stone-400 font-mono mr-2">{idx + 1}.</span> 
                                                          {res.questionText || res.question_text || 'Question text unavailable'}
                                                        </p>
                                                        <div className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50 p-3 rounded-md brutal-border">
                                                          <div>
                                                            <span className="text-stone-500 text-[10px] uppercase font-mono block mb-1">Student's Answer:</span>
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
                                                <p className="text-sm text-stone-500 italic font-mono">No detailed breakdown available for this attempt.</p>
                                              )}
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
