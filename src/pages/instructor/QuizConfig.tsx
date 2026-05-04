import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType, auth } from '../../firebase';
import { collection, query, getDocs, addDoc, where } from 'firebase/firestore';
import { Edit3, CheckCircle2, X, List, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export default function QuizConfig() {
  const [bankQuestions, setBankQuestions] = useState<any[]>([]);
  const [topics, setTopics] = useState<{name: string, count: number}[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  
  // Selection state
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedMultipleTopics, setSelectedMultipleTopics] = useState<string[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [quizName, setQuizName] = useState('');
  const [modalDifficulty, setModalDifficulty] = useState('mixed');
  const [numQuestions, setNumQuestions] = useState(10);
  const [timeLimit, setTimeLimit] = useState<number | ''>(''); // in minutes
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    if (!auth.currentUser) return;
    try {
      // Fetch topics & questions
      const qBank = query(collection(db, 'questionBank'));
      const bankSnap = await getDocs(qBank);
      const questions = bankSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setBankQuestions(questions);

      const topicMap = new Map<string, number>();
      questions.forEach(q => {
        if (q.topic) {
           topicMap.set(q.topic, (topicMap.get(q.topic) || 0) + 1);
        }
      });
      setTopics(Array.from(topicMap.entries()).map(([name, count]) => ({name, count})));

      // Fetch instructor's classrooms
      const qClass = query(collection(db, 'classrooms'), where('instructorId', '==', auth.currentUser.uid));
      const snapClass = await getDocs(qClass);
      setClassrooms(snapClass.docs.map(d => ({ id: d.id, ...d.data() })));
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const topicFilteredBank = useMemo(() => {
    let q = bankQuestions;
    if (selectedTopic && selectedTopic !== 'mixed') {
      q = q.filter(x => x.topic === selectedTopic);
    } else if (selectedTopic === 'mixed') {
      if (selectedMultipleTopics.length > 0) {
        q = q.filter(x => selectedMultipleTopics.includes(x.topic));
      } else {
        q = [];
      }
    } else {
      q = [];
    }
    return q;
  }, [bankQuestions, selectedTopic, selectedMultipleTopics]);

  const displayedBank = useMemo(() => {
    if (modalDifficulty === 'mixed') return topicFilteredBank;
    return topicFilteredBank.filter(x => x.difficulty === modalDifficulty);
  }, [topicFilteredBank, modalDifficulty]);

  // Set initial selected questions when exactly the topic list or bank changes
  useEffect(() => {
    setSelectedQuestionIds(topicFilteredBank.map(q => q.id));
  }, [selectedTopic, selectedMultipleTopics, bankQuestions]);

  const maxQuestions = selectedQuestionIds.length;
  useEffect(() => {
    if (maxQuestions === 0) {
      setNumQuestions(1); // will fail validation but prevents 0
    } else {
      setNumQuestions(maxQuestions);
    }
  }, [maxQuestions]);

  const handleCreateOfficialQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setIsCreating(true);
    
    try {
      if (!selectedClassroomId) throw new Error("Must select a classroom.");

      let finalPool = topicFilteredBank.filter(q => selectedQuestionIds.includes(q.id));
      finalPool = finalPool.sort(() => Math.random() - 0.5).slice(0, numQuestions);

      if (finalPool.length === 0) {
        alert("Not enough questions in the bank matching these criteria.");
        setIsCreating(false);
        return;
      }

      // 2. Create the Quiz document
      const quizRef = await addDoc(collection(db, 'quizzes'), {
        userId: auth.currentUser.uid,
        classroomId: selectedClassroomId,
        quizName: quizName,
        generationDate: new Date().toISOString(),
        type: 'instructor', // Mark as official
        alignmentStatus: 'pending', // Academic Admin must approve
        topic: selectedTopic === 'mixed' ? selectedMultipleTopics.join(', ') : selectedTopic,
        difficultyConfig: 'mixed',
        timeLimit: timeLimit ? Number(timeLimit) : null
      });

      const { logSystemAction } = await import('../../utils/auditLogger');
      await logSystemAction('QUIZ_CREATED_OFFICIAL', `Instructor submitted official quiz: ${quizName}`);

      // 3. Copy official questions into the quiz's subcollection
      for (const q of finalPool) {
        await addDoc(collection(db, `quizzes/${quizRef.id}/questions`), {
          questionText: (q as any).questionText,
          questionType: (q as any).questionType,
          correctAnswer: (q as any).correctAnswer,
          options: (q as any).options,
          explanation: (q as any).explanation,
          topic: (q as any).topic
        });
      }

      alert("Official Assigned Quiz Created!");
      navigate('/');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'quizzes');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto w-full px-4 py-8">
      <header className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-stone-900 text-white rounded-2xl mb-4 brutal-border">
          <Edit3 size={32} />
        </div>
        <h1 className="text-4xl font-serif italic font-bold text-stone-900">Quiz Configuration</h1>
        <p className="text-stone-500 font-mono text-sm mt-2">Deploy official assessments to your teams</p>
      </header>

      <form onSubmit={handleCreateOfficialQuiz} className="bg-white p-8 brutal-border space-y-6">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-2">Assessment Name</label>
          <input 
            type="text" 
            required 
            placeholder="e.g. Midterm: Software Architecture"
            className="w-full p-4 brutal-border text-lg font-bold placeholder:font-normal"
            value={quizName}
            onChange={e=>setQuizName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-2">Assign to Team / Classroom</label>
          <select 
            required
            className="w-full p-3 brutal-border bg-white font-bold text-stone-900"
            value={selectedClassroomId}
            onChange={e=>setSelectedClassroomId(e.target.value)}
          >
            <option value="">Select a missing classroom...</option>
            {classrooms.map(c => <option key={c.id} value={c.id}>{c.name} (Code: {c.joinCode})</option>)}
          </select>
        </div>

        <div className="border-t-2 border-stone-100 pt-6">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-2">Target Topic</label>
            <select 
              required
              className="w-full p-3 brutal-border bg-white"
              value={selectedTopic}
              onChange={e=>setSelectedTopic(e.target.value)}
            >
              <option value="">Select Topic from Bank...</option>
              <option value="mixed">Mixed (Custom Selection)</option>
              {topics.map(t => <option key={t.name} value={t.name}>{t.name} ({t.count} questions)</option>)}
            </select>
          </div>
        </div>

        {selectedTopic === 'mixed' && (
           <div className="border-t-2 border-stone-100 pt-4">
              <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-2">Select Target Topics</label>
              <div className="flex flex-wrap gap-2">
                 {topics.map(t =>(
                    <label key={t.name} className={`flex items-center gap-2 p-2 px-3 border ${selectedMultipleTopics.includes(t.name) ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-300'} cursor-pointer brutal-border transition-colors text-xs font-mono`}>
                       <input 
                          type="checkbox" 
                          className="hidden"
                          checked={selectedMultipleTopics.includes(t.name)}
                          onChange={(e) => {
                             if (e.target.checked) {
                                setSelectedMultipleTopics(prev => [...prev, t.name]);
                             } else {
                                setSelectedMultipleTopics(prev => prev.filter(x => x !== t.name));
                             }
                          }}
                       />
                       {t.name} ({t.count})
                    </label>
                 ))}
                 {topics.length === 0 && <p className="text-xs text-stone-400">No topics found in bank.</p>}
              </div>
           </div>
        )}

        {selectedTopic && (
           <div className="border-t-2 border-stone-100 pt-6">
             <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-2">Question Pool Selection</label>
             <div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-stone-50 brutal-border border-stone-200 gap-4">
               <div>
                 <p className="font-bold text-stone-800 text-lg">{maxQuestions} / {topicFilteredBank.length} Questions Selected</p>
                 <p className="text-stone-500 text-xs font-mono mt-1">Customize the exact questions to include in the random pool.</p>
               </div>
               <button
                 type="button"
                 onClick={() => setIsPoolModalOpen(true)}
                 className="px-4 py-3 bg-white brutal-border text-xs font-bold font-mono uppercase hover:bg-stone-100 flex items-center gap-2 shrink-0 md:w-auto"
               >
                 <List size={16} /> Edit Question Pool
               </button>
             </div>
           </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t-2 border-stone-100 pt-6">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-2">Question Count</label>
            <input 
              type="number" 
              min="1" 
              max={maxQuestions} 
              required
              className="w-full p-3 brutal-border"
              value={numQuestions}
              onChange={e=>setNumQuestions(parseInt(e.target.value) || 1)}
            />
            {maxQuestions > 0 && maxQuestions < 10 && (
               <p className="text-xs text-amber-600 font-mono mt-2">Limited to {maxQuestions} questions based on your selection pool.</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-2">Time Limit (Minutes)</label>
            <input 
              type="number" 
              min="1" 
              placeholder="Leave empty for no limit"
              className="w-full p-3 brutal-border"
              value={timeLimit}
              onChange={e=>setTimeLimit(e.target.value === '' ? '' : parseInt(e.target.value))}
            />
          </div>
        </div>

        <button 
          type="submit"
          disabled={isCreating || loading}
          className="w-full bg-stone-900 text-white py-4 font-bold uppercase tracking-widest hover:bg-stone-800 transition-colors flex justify-center items-center gap-2 group disabled:opacity-50 mt-4"
        >
          {isCreating ? 'Deploying...' : 'Deploy Official Quiz'}
          {!isCreating && <CheckCircle2 size={18} className="group-hover:scale-125 transition-transform" />}
        </button>
      </form>

      <AnimatePresence>
         {isPoolModalOpen && (
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="fixed inset-0 bg-stone-900/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
               onClick={() => setIsPoolModalOpen(false)}
            >
               <motion.div 
                  initial={{ scale: 0.95, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 20 }}
                  className="bg-white brutal-border p-6 max-w-2xl w-full shadow-[8px_8px_0px_rgba(28,25,23,1)] max-h-[85vh] flex flex-col"
                  onClick={e => e.stopPropagation()}
               >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                     <div>
                        <h3 className="text-xl font-bold font-serif flex items-center gap-2">
                           <Layers className="text-blue-500" />
                           Edit Question Pool
                        </h3>
                        <p className="text-sm text-stone-600 mt-1 font-mono">
                           Uncheck questions you want to exclude from the random selection pool for this quiz.
                        </p>
                     </div>
                     <div className="flex items-center gap-4">
                        <select 
                           className="p-2 brutal-border bg-white text-sm font-mono"
                           value={modalDifficulty}
                           onChange={e => setModalDifficulty(e.target.value)}
                        >
                           <option value="mixed">Mixed</option>
                           <option value="easy">Easy</option>
                           <option value="medium">Medium</option>
                           <option value="hard">Hard</option>
                        </select>
                        <button type="button" onClick={() => setIsPoolModalOpen(false)} className="text-stone-400 hover:text-stone-900 transition-colors bg-stone-100 p-1 brutal-border">
                           <X size={20} />
                        </button>
                     </div>
                  </div>
                  
                  <div className="overflow-y-auto pr-2 space-y-2 flex-grow min-h-0 mb-4 border border-stone-200 bg-stone-50 p-2">
                     {displayedBank.length === 0 ? (
                        <p className="text-stone-400 font-mono text-sm text-center mt-4">No questions available for this condition.</p>
                     ) : (
                        displayedBank.map(q => (
                           <label key={q.id} className="flex items-start gap-3 p-3 bg-white hover:bg-stone-50 cursor-pointer border border-stone-200 transition-colors brutal-border">
                              <input 
                                 type="checkbox" 
                                 checked={selectedQuestionIds.includes(q.id)}
                                 onChange={(e) => {
                                   if (e.target.checked) {
                                      setSelectedQuestionIds(prev => [...prev, q.id]);
                                   } else {
                                      setSelectedQuestionIds(prev => prev.filter(id => id !== q.id));
                                   }
                                 }}
                                 className="mt-1 w-4 h-4 text-stone-900 border-stone-300 rounded focus:ring-stone-900"
                              />
                              <div>
                                 <p className="text-sm font-bold text-stone-800">{q.questionText}</p>
                                 <p className="text-xs font-mono text-stone-500 mt-1">[{q.difficulty}] {q.topic}</p>
                              </div>
                           </label>
                        ))
                     )}
                  </div>

                  <div className="pt-4 border-t-2 border-stone-100 flex justify-between items-center">
                     <div>
                        <p className="text-sm font-bold">{maxQuestions} / {topicFilteredBank.length} Total Selected</p>
                        <button
                           type="button"
                           onClick={() => setSelectedQuestionIds([])}
                           className="text-xs font-mono text-stone-500 hover:text-stone-900 underline mt-1"
                        >
                           Clear Selection
                        </button>
                     </div>
                     <button
                        type="button"
                        onClick={() => setIsPoolModalOpen(false)}
                        className="px-6 py-3 text-sm font-bold font-mono uppercase bg-stone-900 text-white brutal-border hover:bg-stone-800"
                     >
                        Save & Close
                     </button>
                  </div>
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>
    </main>
  );
}
