import { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { generateQuizFromContent } from '../services/gemini';
import Navbar from '../components/Navbar';
import { BrainCircuit, Sparkles, ChevronRight, BookOpen, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export default function QuizGen() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [numQuestions, setNumQuestions] = useState(5);
  const [customQuizName, setCustomQuizName] = useState('');
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(collection(db, 'materials'), where('userId', '==', auth.currentUser.uid));
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMaterials(docs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedMaterialId) {
      setError('Please select a study material first.');
      return;
    }
    
    const material = materials.find(m => m.id === selectedMaterialId);
    if (!material) return;

    setError('');
    setIsGenerating(true);
    
    try {
      const generated = await generateQuizFromContent(material.content, numQuestions);
      
      // Save Quiz
      const quizRef = await addDoc(collection(db, 'quizzes'), {
        userId: auth.currentUser?.uid,
        materialId: selectedMaterialId,
        quizName: customQuizName.trim() || generated.quizName || `Quiz for ${material.title}`,
        generationDate: new Date().toISOString(),
        type: 'practice'
      });

      const { logSystemAction } = await import('../utils/auditLogger');
      await logSystemAction('QUIZ_GENERATED', `Generated quiz: ${generated.quizName || 'Quiz for ' + material.title}`);

      // Save Questions
      const questionsCol = collection(db, `quizzes/${quizRef.id}/questions`);
      for (const q of generated.questions) {
        await addDoc(questionsCol, {
          ...q,
          quizId: quizRef.id
        });
      }

      navigate(`/quiz/take/${quizRef.id}`);
    } catch (err: any) {
      console.error(err);
      setError('AI generation failed. Please try again or use shorter content.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-12">
        <header className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl mb-4 brutal-border">
            <BrainCircuit size={32} />
          </div>
          <h1 className="text-4xl font-serif italic font-bold text-stone-900">Practice Quiz</h1>
        </header>

        <div className="bg-white p-8 brutal-border space-y-8">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 text-red-700 text-sm flex items-center gap-2">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          {/* Step 1: Select Material */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-3">1. Select Study Material</label>
            {loading ? (
              <div className="h-12 bg-stone-50 animate-pulse brutal-border" />
            ) : materials.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded">
                You haven't uploaded any materials yet. <br />
                <button onClick={() => navigate('/materials')} className="font-bold underline">Upload Materials First</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {materials.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMaterialId(m.id)}
                    className={`text-left p-4 brutal-border transition-all flex items-center justify-between ${
                      selectedMaterialId === m.id ? 'bg-stone-900 text-white' : 'bg-white hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <BookOpen size={18} />
                      <span className="font-bold">{m.title}</span>
                    </div>
                    {selectedMaterialId === m.id && <ChevronRight size={18} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 2: Configuration */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-3">2. Quiz Settings</label>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <span className="text-sm font-medium whitespace-nowrap min-w-[150px]">Quiz Name (Optional):</span>
                <input
                  type="text"
                  placeholder="Leave blank for AI suggested name"
                  value={customQuizName}
                  onChange={(e) => setCustomQuizName(e.target.value)}
                  className="flex-1 w-full p-2 brutal-border bg-white placeholder:text-stone-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium min-w-[150px]">Number of Questions:</span>
                <div className="flex items-center gap-2">
                  {[5, 10, 15].map(n => (
                    <button
                      key={n}
                      onClick={() => setNumQuestions(n)}
                      className={`w-10 h-10 brutal-border font-bold ${
                        numQuestions === n ? 'bg-stone-900 text-white' : 'bg-white hover:bg-stone-50'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Generate */}
          <div className="pt-4">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !selectedMaterialId}
              className="w-full brutal-btn bg-stone-900 text-white py-4 flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                  AI is Crafting Your Quiz...
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  Generate Quiz Now
                </>
              )}
            </button>
            <p className="text-[10px] text-stone-400 mt-4 text-center font-mono uppercase">
              The AI will analyze your material and create unique questions.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
