import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, getDocs, getDoc, doc, addDoc } from 'firebase/firestore';
import Navbar from '../components/Navbar';
import { BrainCircuit, CheckCircle2, XCircle, ArrowRight, Trophy, HelpCircle, Info, Eye, Timer, TrendingUp, AlertTriangle, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateAIInsights, generateTargetedPracticeQuiz } from '../services/gemini';

export default function QuizTake() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Quiz State
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<any[]>([]);
  const [isFinished, setIsFinished] = useState(false);

  const [insights, setInsights] = useState<any>(null);
  const [generatingInsights, setGeneratingInsights] = useState(false);

  // Targeted Practice State
  const [practiceCount, setPracticeCount] = useState(5);
  const [generatingPractice, setGeneratingPractice] = useState(false);

  // Timer State
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    fetchQuiz();
  }, [quizId]);

  const fetchQuiz = async () => {
    if (!quizId) return;
    try {
      const quizSnap = await getDoc(doc(db, 'quizzes', quizId));
      if (!quizSnap.exists()) {
        navigate('/');
        return;
      }
      const quizData: any = { id: quizSnap.id, ...quizSnap.data() };
      setQuiz(quizData);
      
      if (quizData.timeLimit) {
        setTimeLeft(quizData.timeLimit * 60); // Convert minutes to seconds
      }

      const qSnap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
      const qList = qSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setQuestions(qList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (timeLeft === null || isFinished || loading) return;
    if (timeLeft <= 0) {
      finishQuiz();
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isFinished, loading]);

  const handleAnswer = (answer: string) => {
    if (isAnswered) return;
    setSelectedAnswer(answer);
  };

  const isOfficial = quiz?.type === 'instructor';

  const submitAnswer = () => {
    if (!selectedAnswer) return;
    
    const currentQ = questions[currentIdx];
    const isCorrect = selectedAnswer === currentQ.correctAnswer;
    
    const newScore = isCorrect ? score + 1 : score;
    if (isCorrect) setScore(newScore);
    
    const newResultObj = {
      questionId: currentQ.id,
      questionText: currentQ.questionText,
      correctAnswer: currentQ.correctAnswer,
      userAnswer: selectedAnswer,
      isCorrect
    };

    const newResults = [...results, newResultObj];
    setResults(newResults);

    if (isOfficial) {
      if (currentIdx < questions.length - 1) {
        setCurrentIdx(currentIdx + 1);
        setSelectedAnswer(null);
        setIsAnswered(false);
        setShowCorrectAnswer(false);
      } else {
        finishQuiz(newScore, newResults);
      }
    } else {
      setIsAnswered(true);
    }
  };

  const nextQuestion = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setSelectedAnswer(null);
      setIsAnswered(false);
      setShowCorrectAnswer(false);
    } else {
      finishQuiz(score, results);
    }
  };

  const finishQuiz = async (finalScore = score, finalResults = results) => {
    setIsFinished(true);
    if (!auth.currentUser || !quizId) return;

    // 1. Save the Attempt Securely
    try {
      await addDoc(collection(db, 'attempts'), {
        userId: auth.currentUser.uid,
        quizId,
        classroomId: quiz?.classroomId || null,
        startTime: quiz.generationDate, // Using gen date as start for simplicity
        endTime: new Date().toISOString(),
        score: finalScore,
        totalQuestions: questions.length,
        results: finalResults
      });
      const { logSystemAction } = await import('../utils/auditLogger');
      if (quiz?.type === 'instructor') {
         await logSystemAction('OFFICIAL_QUIZ_COMPLETED', `Student completed official quiz: ${quiz?.quizName || quizId} | Score: ${finalScore}/${questions.length}`);
      } else {
         await logSystemAction('QUIZ_COMPLETED', `Completed practice quiz ${quiz?.quizName || quizId} with score: ${finalScore}/${questions.length}`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'attempts');
      return; // Stop if we can't save the attempt
    }
      
    // 2. Async generate and save insights (AI_PREDICTION)
    setGeneratingInsights(true);
    try {
      const prediction = await generateAIInsights(finalResults);
      setInsights(prediction);
      
      // Save AI insights to database
      await addDoc(collection(db, 'ai_predictions'), {
        user_id: auth.currentUser.uid,
        weak_areas_identified: prediction.weak_areas_identified,
        performance_trend: prediction.performance_trend,
        recommended_focus: prediction.recommended_focus,
        generated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error("AI Insights generation failed:", err);
      // Graceful fallback if Gemini API is overloaded
      setInsights({
        weak_areas_identified: "Analysis unavailable due to high AI API demand.",
        performance_trend: "Unable to calculate trend. Please check back later.",
        recommended_focus: "We recommend reviewing any questions you missed."
      } as any);
    } finally {
      setGeneratingInsights(false); // ALWAYS run this to clear the loading state
    }
  };

  const generateWeakAreaQuiz = async () => {
    if (!insights || !insights.weak_areas_identified) return;
    setGeneratingPractice(true);
    try {
      let content = '';
      if (quiz.materialId) {
        const matSnap = await getDoc(doc(db, 'materials', quiz.materialId));
        if (matSnap.exists()) {
          content = matSnap.data().content;
        }
      }
      
      if (!content) {
        // Fallback: use quiz questions as context
        content = questions.map(q => `Q: ${q.questionText}\nAns: ${q.correctAnswer}\nExp: ${q.explanation || ''}`).join('\n\n');
      }

      const generated = await generateTargetedPracticeQuiz(content, insights.weak_areas_identified, practiceCount);
      
      // Save Quiz
      const quizRef = await addDoc(collection(db, 'quizzes'), {
        userId: auth.currentUser?.uid,
        materialId: quiz.materialId || null,
        quizName: generated.quizName || `Targeted Practice: Weak Areas`,
        derivedFromQuizName: quiz.quizName,
        generationDate: new Date().toISOString(),
        type: 'practice'
      });

      const { logSystemAction } = await import('../utils/auditLogger');
      await logSystemAction('QUIZ_GENERATED_TARGETED', `Generated targeted practice quiz: ${quizRef.id}`);

      // Save Questions
      const questionsCol = collection(db, `quizzes/${quizRef.id}/questions`);
      for (const q of generated.questions) {
        await addDoc(questionsCol, {
          ...q,
          quizId: quizRef.id
        });
      }

      navigate(`/quiz/take/${quizRef.id}`);
    } catch (err) {
      console.error(err);
      alert("Failed to generate targeted quiz. Please try again.");
    } finally {
      setGeneratingPractice(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center font-mono text-stone-400">LOADING QUIZ...</div>;

  if (isFinished) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12 text-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-6 md:p-12 brutal-border"
          >
            <Trophy size={64} className="mx-auto text-amber-500 mb-6" />
            <h1 className="text-4xl font-serif italic font-bold mb-2">Quiz Complete!</h1>
            <p className="text-stone-500 font-mono uppercase tracking-widest text-sm mb-8">{quiz.quizName}</p>
            
            <div className="text-6xl font-bold mb-4">
              {score} <span className="text-stone-300">/</span> {questions.length}
            </div>
            
            <div className="w-full bg-stone-100 h-4 brutal-border mb-8 overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-1000" 
                style={{ width: `${(score / questions.length) * 100}%` }}
              />
            </div>

            {generatingInsights ? (
              <div className="bg-stone-50 brutal-border p-6 mb-8 mt-4 animate-pulse flex flex-col items-center max-w-2xl mx-auto">
                <BrainCircuit className="text-purple-500 mb-2 animate-spin" />
                <p className="text-sm font-mono text-stone-500">AI is analyzing your learning gaps...</p>
              </div>
            ) : insights ? (
              <div className="grid md:grid-cols-2 gap-8 mb-12">
                 <div className="bg-stone-50 brutal-border p-6 text-left flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold font-serif text-lg mb-4 flex items-center gap-2">
                        <BrainCircuit className="text-purple-600" /> AI Performance Insights
                      </h3>
                      <div className="space-y-4">
                        <div>
                           <span className="text-xs font-mono uppercase text-stone-500 flex items-center gap-1 mb-1"><AlertTriangle size={14} className="text-amber-500"/> Weak Area Identified</span>
                           <p className="text-sm font-medium">{insights.weak_areas_identified}</p>
                        </div>
                        <div>
                           <span className="text-xs font-mono uppercase text-stone-500 flex items-center gap-1 mb-1"><TrendingUp size={14} className="text-blue-500"/> Performance Trend</span>
                           <p className="text-sm font-medium">{insights.performance_trend}</p>
                        </div>
                        <div>
                           <span className="text-xs font-mono uppercase text-stone-500 flex items-center gap-1 mb-1"><Target size={14} className="text-emerald-500"/> Recommended Focus</span>
                           <p className="text-sm font-medium">{insights.recommended_focus}</p>
                        </div>
                      </div>
                    </div>
                 </div>
                 
                 <div className="bg-stone-50 brutal-border p-6 text-left flex flex-col justify-center">
                    <h3 className="font-bold font-serif text-lg mb-4 flex items-center gap-2">
                      <Target className="text-emerald-600" /> Practice Weak Areas
                    </h3>
                    <p className="text-sm font-mono text-stone-600 mb-6 flex-1">
                      Generate a targeted practice quiz focusing specifically on: <br/>
                      <strong className="text-stone-900 leading-relaxed mt-2 block">{insights.weak_areas_identified}</strong>
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold font-mono uppercase tracking-wider mb-2 text-stone-500">
                          Questions (Max 15)
                        </label>
                        <input 
                          type="number" 
                          min="1" 
                          max="15" 
                          value={practiceCount}
                          onChange={(e) => setPracticeCount(Math.min(15, Math.max(1, parseInt(e.target.value) || 1)))}
                          className="w-full p-3 brutal-border bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
                        />
                      </div>
                      <button
                        onClick={generateWeakAreaQuiz}
                        disabled={generatingPractice}
                        className="w-full brutal-btn bg-emerald-600 text-white py-3 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                      >
                        {generatingPractice ? <BrainCircuit size={16} className="animate-spin" /> : <TrendingUp size={16} />}
                        {generatingPractice ? 'Generating...' : 'Start Targeted Practice'}
                      </button>
                    </div>
                 </div>
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={() => navigate('/')}
                className="brutal-btn bg-stone-900 text-white px-8 py-3"
              >
                Back to Dashboard
              </button>
              <button 
                onClick={() => navigate('/reports')}
                className="brutal-btn bg-white text-stone-900 px-8 py-3"
              >
                View Proficiency
              </button>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  const currentQ = questions[currentIdx];

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex flex-col">
      
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-12">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-stone-500">Question {currentIdx + 1} of {questions.length}</span>
            <div className="flex items-center gap-2 mt-1">
              {quiz.type === 'instructor' && (
                <span className="text-[10px] bg-purple-100 text-purple-900 font-bold px-2 py-1 uppercase tracking-widest">Official</span>
              )}
              <h2 className="text-xl font-bold">{quiz.quizName}</h2>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {timeLeft !== null && (
              <div className={`flex items-center gap-2 font-mono font-bold px-3 py-1 border-2 ${timeLeft < 60 ? 'bg-red-100 border-red-500 text-red-700 animate-pulse' : 'bg-stone-100 border-stone-900 text-stone-900'}`}>
                <Timer size={16} /> {formatTime(timeLeft)}
              </div>
            )}
            {!isOfficial && (
              <div className="text-right">
                 <span className="text-xs font-mono uppercase tracking-widest text-stone-500">Score</span>
                 <p className="text-xl font-bold">{score}</p>
              </div>
            )}
          </div>
        </div>

        <div className="w-full bg-stone-200 h-2 mb-12 brutal-border overflow-hidden">
          <motion.div 
            className="h-full bg-stone-900"
            animate={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-white p-8 brutal-border"
          >
            <div className="flex items-start gap-4 mb-8">
              <div className="p-2 bg-stone-100 rounded-lg shrink-0">
                <HelpCircle size={24} className="text-stone-600" />
              </div>
              <h3 className="text-2xl font-serif font-bold leading-tight">
                {currentQ?.questionText}
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-4 mb-8">
              {currentQ?.options.map((option: string, i: number) => {
                let statusClass = "bg-white hover:bg-stone-50";
                if (isAnswered) {
                  if (option === currentQ.correctAnswer && (showCorrectAnswer || selectedAnswer === currentQ.correctAnswer)) {
                    statusClass = "bg-emerald-100 border-emerald-500 text-emerald-900";
                  } else if (option === selectedAnswer) {
                    statusClass = "bg-red-100 border-red-500 text-red-900";
                  } else {
                    statusClass = "opacity-50 bg-stone-50";
                  }
                } else if (selectedAnswer === option) {
                  statusClass = "bg-stone-900 text-white";
                }

                return (
                  <button
                    key={i}
                    disabled={isAnswered}
                    onClick={() => handleAnswer(option)}
                    className={`text-left p-5 brutal-border font-medium transition-all flex items-center justify-between ${statusClass}`}
                  >
                    <span>{option}</span>
                    {isAnswered && option === currentQ.correctAnswer && (showCorrectAnswer || selectedAnswer === currentQ.correctAnswer) && <CheckCircle2 size={20} />}
                    {isAnswered && option === selectedAnswer && option !== currentQ.correctAnswer && <XCircle size={20} />}
                  </button>
                );
              })}
            </div>

            {isAnswered && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-stone-50 p-6 border-l-4 border-stone-900 mb-8"
              >
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-stone-500 mb-2">
                  <Info size={14} />
                  Explanation
                </div>
                <p className="text-sm leading-relaxed text-stone-700">
                  {currentQ.explanation}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-[10px] font-mono text-stone-400 uppercase">
                    Topic: {currentQ.topic}
                  </div>
                  {selectedAnswer !== currentQ.correctAnswer && !showCorrectAnswer && (
                    <button
                      onClick={() => setShowCorrectAnswer(true)}
                      className="text-xs font-bold uppercase tracking-widest text-stone-500 hover:text-stone-900 flex items-center gap-1 transition-colors"
                    >
                      <Eye size={14} /> Show Correct Answer
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            <div className="flex justify-end">
              {!isAnswered ? (
                <button
                  disabled={!selectedAnswer}
                  onClick={submitAnswer}
                  className="brutal-btn bg-stone-900 text-white px-10 py-3 flex items-center gap-2 disabled:opacity-50"
                >
                  {isOfficial ? (currentIdx === questions.length - 1 ? 'Finish Exam' : 'Next Question') : 'Submit Answer'}
                  {isOfficial && <ArrowRight size={18} />}
                </button>
              ) : (
                <button
                  onClick={nextQuestion}
                  className="brutal-btn bg-stone-900 text-white px-10 py-3 flex items-center gap-2"
                >
                  {currentIdx === questions.length - 1 ? 'Finish Quiz' : 'Next Question'}
                  <ArrowRight size={18} />
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
