import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType, auth } from '../../firebase';
import { collection, query, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { Database, Plus, Trash2, Tag, BrainCircuit, Loader2, FileUp, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateBankQuestions } from '../../services/gemini';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export default function QuestionBank() {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [showManualModal, setShowManualModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteTopicConfirmData, setDeleteTopicConfirmData] = useState<{topic: string, questionIds: string[]} | null>(null);

  // Form State (Manual)
  const [questionText, setQuestionText] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [wrongOpt1, setWrongOpt1] = useState('');
  const [wrongOpt2, setWrongOpt2] = useState('');
  const [wrongOpt3, setWrongOpt3] = useState('');
  const [explanation, setExplanation] = useState('');

  // AI Gen State
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(3);
  const [aiDifficulty, setAiDifficulty] = useState('mixed');
  const [uploadType, setUploadType] = useState<'text' | 'pdf'>('text');
  const [content, setContent] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<any[]>([]);

  // Accordion state
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});

  const toggleTopic = (t: string) => {
    setExpandedTopics((prev) => ({
      ...prev,
      [t]: !prev[t]
    }));
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const q = query(collection(db, 'questionBank'));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setQuestions(docs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'questionBank'), {
        createdBy: auth.currentUser?.uid,
        questionText,
        topic,
        difficulty,
        questionType: 'multiple-choice',
        correctAnswer,
        options: [correctAnswer, wrongOpt1, wrongOpt2, wrongOpt3].sort(() => Math.random() - 0.5),
        explanation,
        createdAt: new Date().toISOString()
      });
      setShowManualModal(false);
      fetchQuestions();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'questionBank');
    }
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText;
  };

  const handleGenerateAI = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    try {
      let finalContent = content;
      if (uploadType === 'pdf' && pdfFile) {
        finalContent = await extractTextFromPDF(pdfFile);
      }

      const gQuestions = await generateBankQuestions(aiTopic, aiCount, finalContent, aiDifficulty);
      setGeneratedQuestions(gQuestions.map(q => ({...q, topic: aiTopic})));
    } catch (err) {
      console.error("AI Gen Failed:", err);
      alert("Failed to generate questions. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveGenerated = async (indexToSave: number) => {
    const qToSave = generatedQuestions[indexToSave];
    try {
      await addDoc(collection(db, 'questionBank'), {
        createdBy: auth.currentUser?.uid,
        questionText: qToSave.questionText,
        topic: qToSave.topic,
        difficulty: qToSave.difficulty,
        questionType: 'multiple-choice',
        correctAnswer: qToSave.correctAnswer,
        options: qToSave.options,
        explanation: qToSave.explanation,
        createdAt: new Date().toISOString()
      });
      // Remove from preview list
      setGeneratedQuestions(prev => prev.filter((_, i) => i !== indexToSave));
      fetchQuestions();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'questionBank');
    }
  };

  const handleSaveAllGenerated = async () => {
    setIsGenerating(true);
    try {
      const promises = generatedQuestions.map(qToSave => 
        addDoc(collection(db, 'questionBank'), {
          createdBy: auth.currentUser?.uid,
          questionText: qToSave.questionText,
          topic: qToSave.topic,
          difficulty: qToSave.difficulty,
          questionType: 'multiple-choice',
          correctAnswer: qToSave.correctAnswer,
          options: qToSave.options,
          explanation: qToSave.explanation,
          createdAt: new Date().toISOString()
        })
      );
      await Promise.all(promises);
      setGeneratedQuestions([]);
      fetchQuestions();
      setShowAiModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'questionBank');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'questionBank', id));
      setDeleteConfirmId(null);
      fetchQuestions();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `questionBank/${id}`);
    }
  };

  const handleDeleteTopicConfirm = async () => {
    if (!deleteTopicConfirmData) return;
    try {
      const promises = deleteTopicConfirmData.questionIds.map(id => deleteDoc(doc(db, 'questionBank', id)));
      await Promise.all(promises);
      setDeleteTopicConfirmData(null);
      fetchQuestions();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `questionBank/topic_batch`);
    }
  };

  return (
    <main className="max-w-7xl mx-auto w-full px-4 py-8">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-serif italic font-bold flex items-center gap-2">
            <Database size={28} /> Question Bank
          </h1>
          <p className="text-stone-500 font-mono text-sm">Official assessment content repository</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => { setAiTopic(''); setShowAiModal(true); }}
            className="brutal-btn bg-[#f5f5f5] text-stone-900 border-2 border-stone-900 flex items-center gap-2 hover:bg-[#e5e5e5]"
          >
            <BrainCircuit size={20} className="text-purple-600" /> AI Generate
          </button>
          <button 
            onClick={() => setShowManualModal(true)}
            className="brutal-btn bg-stone-900 text-white flex items-center gap-2"
          >
            <Plus size={20} /> Manual Entry
          </button>
        </div>
      </header>

      {loading ? (
        <div className="text-center py-20 font-mono text-stone-400">LOADING BANK...</div>
      ) : (
        <div className="space-y-6">
          {questions.length === 0 ? (
            <div className="bg-white brutal-border p-8 text-center text-stone-400">
              No official questions yet. Add some to get started.
            </div>
          ) : (
            Object.entries(
              questions.reduce((acc, q) => {
                const t = q.topic || 'Uncategorized';
                if (!acc[t]) acc[t] = [];
                acc[t].push(q);
                return acc;
              }, {} as Record<string, any[]>)
            ).map(([topic, topicQuestions]: [string, any]) => {
              const isExpanded = !!expandedTopics[topic]; // collapsed by default
              return (
              <div key={topic} className="bg-white brutal-border overflow-hidden">
                <div 
                  onClick={() => toggleTopic(topic)}
                  className="w-full bg-stone-100 p-4 border-b-2 border-stone-900 flex justify-between items-center hover:bg-stone-200 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    <h3 className="font-bold text-xl font-serif">-- {topic} --</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-stone-500 bg-white px-2 py-1 border border-stone-300 mr-2 hidden sm:inline-block">
                      {topicQuestions.length} Questions
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setAiTopic(topic); setShowAiModal(true); }}
                      className="bg-white border-2 border-stone-900 text-stone-900 text-[10px] px-2 py-1 flex items-center gap-1 hover:bg-purple-50 font-bold uppercase tracking-widest shadow-[2px_2px_0px_rgba(28,25,23,1)] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_rgba(28,25,23,1)] transition-all"
                      title="AI Generate more for this topic"
                    >
                      <BrainCircuit size={12} className="text-purple-600"/> <span className="hidden sm:inline">AI</span>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setTopic(topic); setShowManualModal(true); }}
                      className="bg-stone-900 border-2 border-stone-900 text-white text-[10px] px-2 py-1 flex items-center gap-1 hover:bg-stone-800 font-bold uppercase tracking-widest shadow-[2px_2px_0px_rgba(28,25,23,1)] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_rgba(28,25,23,1)] transition-all"
                      title="Manually add more for this topic"
                    >
                      <Plus size={12} /> <span className="hidden sm:inline">Add</span>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setDeleteTopicConfirmData({ topic, questionIds: topicQuestions.map((q: any) => q.id) }); }}
                      className="bg-red-50 border-2 border-red-900 text-red-900 text-[10px] px-2 py-1 flex items-center gap-1 hover:bg-red-100 font-bold uppercase tracking-widest shadow-[2px_2px_0px_rgba(127,29,29,1)] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_rgba(127,29,29,1)] transition-all"
                      title={`Delete topic ${topic} and its questions`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 space-y-4">
                        {topicQuestions.map((q: any, i: number) => (
                          <div key={q.id} className="p-4 border-2 border-stone-100 bg-stone-50 relative group">
                            <div className="flex justify-between items-start mb-2">
                              <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 bg-white border border-stone-200 
                                ${q.difficulty === 'hard' ? 'text-red-500' : q.difficulty === 'medium' ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {q.difficulty}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-stone-400 font-mono">Q{i + 1}</span>
                                <button onClick={() => setDeleteConfirmId(q.id)} className="text-stone-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                            <p className="font-bold text-sm mb-4">{q.questionText}</p>
                            
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              {q.options?.map((opt: string, optIdx: number) => (
                                <div key={optIdx} className={`p-2 text-xs border ${opt === q.correctAnswer ? 'bg-emerald-100 border-emerald-500 font-bold' : 'bg-white border-stone-200 text-stone-500'}`}>
                                  {opt}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )})
          )}
        </div>
      )}

      {/* AI Generate Modal */}
      <AnimatePresence>
        {showAiModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-3xl brutal-border p-8 relative max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <BrainCircuit className="text-purple-600" /> AI Question Assistant
                </h2>
                <button onClick={() => { setShowAiModal(false); setGeneratedQuestions([]); }} className="text-stone-400 hover:text-stone-900 font-bold">X</button>
              </div>

              {generatedQuestions.length === 0 ? (
                <form onSubmit={handleGenerateAI} className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Target Topic</label>
                    <input 
                      type="text" 
                      required 
                      autoFocus
                      className="w-full p-4 brutal-border text-lg font-bold" 
                      value={aiTopic} 
                      onChange={e=>setAiTopic(e.target.value)} 
                      placeholder="e.g., Object-Oriented Programming Principles" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Number of Questions</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="50" 
                        className="w-full p-3 brutal-border bg-white" 
                        value={aiCount} 
                        onChange={e => setAiCount(e.target.value as any)}
                        onBlur={() => {
                          const val = Number(aiCount);
                          if (val < 1) setAiCount(1);
                          if (val > 50) setAiCount(50);
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Difficulty</label>
                      <select className="w-full p-3 brutal-border bg-white" value={aiDifficulty} onChange={e=>setAiDifficulty(e.target.value)}>
                        <option value="mixed">Mixed</option>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex gap-4 mb-4">
                      <button
                        type="button"
                        onClick={() => setUploadType('text')}
                        className={`flex-1 py-2 font-mono text-sm border-2 transition-colors ${uploadType === 'text' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-500 hover:border-stone-400'}`}
                      >
                        Paste Text
                      </button>
                      <button
                        type="button"
                        onClick={() => setUploadType('pdf')}
                        className={`flex-1 py-2 font-mono text-sm border-2 transition-colors ${uploadType === 'pdf' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-500 hover:border-stone-400'}`}
                      >
                        Upload PDF
                      </button>
                    </div>

                    {uploadType === 'text' ? (
                      <>
                        <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Content / Notes (Optional)</label>
                        <textarea
                          rows={6}
                          className="w-full p-3 brutal-border focus:outline-none focus:ring-2 focus:ring-stone-900 font-sans text-sm"
                          placeholder="Paste lecture notes, book snippets, or study summaries to guide the generation..."
                          value={content}
                          onChange={(e) => setContent(e.target.value)}
                        />
                        <p className="text-[10px] text-stone-400 mt-2 font-mono uppercase">
                          Tip: The more detailed the context, the better the generated questions.
                        </p>
                      </>
                    ) : (
                      <div className="border-2 border-dashed border-stone-300 p-8 text-center hover:bg-stone-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          ref={fileInputRef}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file && file.type === 'application/pdf') {
                              setPdfFile(file);
                            } else {
                              alert('Please select a valid PDF file.');
                            }
                          }}
                        />
                        <FileUp size={48} className="mx-auto text-stone-400 mb-4" />
                        {pdfFile ? (
                          <div>
                            <p className="font-bold text-stone-900">{pdfFile.name}</p>
                            <p className="text-sm text-stone-500">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        ) : (
                          <div>
                            <p className="font-bold text-stone-900">Click to select a PDF</p>
                            <p className="text-sm text-stone-500">Max size: ~10MB (text extraction only)</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-4">
                    <button type="submit" disabled={isGenerating} className="w-full bg-stone-900 text-white flex items-center justify-center gap-2 p-4 font-bold uppercase tracking-widest disabled:opacity-50">
                      {isGenerating ? <><Loader2 className="animate-spin" /> Generating...</> : 'Generate'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-sm font-mono text-stone-500">Review generated questions before adding to the official bank.</p>
                    <button 
                      onClick={handleSaveAllGenerated}
                      disabled={isGenerating}
                      className="bg-emerald-600 text-white text-xs px-4 py-2 font-bold tracking-wider hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {isGenerating ? <Loader2 className="animate-spin" size={14} /> : null}
                      + Add All {generatedQuestions.length} to Bank
                    </button>
                  </div>
                  {generatedQuestions.map((q, idx) => (
                    <div key={idx} className="p-4 border-2 border-stone-200 relative group bg-stone-50">
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 bg-white border border-stone-200 
                          ${q.difficulty === 'hard' ? 'text-red-500' : q.difficulty === 'medium' ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {q.difficulty}
                        </span>
                        <button 
                          onClick={() => handleSaveGenerated(idx)}
                          className="bg-stone-900 text-white text-xs px-3 py-1 font-bold tracking-wider hover:bg-emerald-600 transition-colors"
                        >
                          + Add to Bank
                        </button>
                      </div>
                      <p className="font-bold text-lg mb-4">{q.questionText}</p>
                      
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {q.options.map((opt: string, i: number) => (
                          <div key={i} className={`p-2 text-sm border ${opt === q.correctAnswer ? 'bg-emerald-100 border-emerald-500 font-bold' : 'bg-white border-stone-200 text-stone-500'}`}>
                            {opt}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-stone-500 bg-white p-3 border border-stone-100">
                        <strong className="text-stone-900 uppercase">Explanation:</strong> {q.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manual Create Modal */}
      <AnimatePresence>
        {showManualModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl brutal-border p-8 relative max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-2xl font-bold mb-6">Manual Official Question</h2>
              <form onSubmit={handleCreateManual} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono mb-1">Question Text</label>
                  <textarea required className="w-full p-2 brutal-border" value={questionText} onChange={e=>setQuestionText(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono mb-1">Topic Tag</label>
                    <input required type="text" className="w-full p-2 brutal-border" value={topic} onChange={e=>setTopic(e.target.value)} placeholder="e.g. Data Structures" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono mb-1">Difficulty</label>
                    <select className="w-full p-2 brutal-border bg-white" value={difficulty} onChange={e=>setDifficulty(e.target.value)}>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
                
                <div className="pt-4 border-t-2 border-stone-100">
                  <label className="block text-xs font-mono mb-1 text-emerald-600 font-bold">Correct Answer</label>
                  <input required type="text" className="w-full p-2 brutal-border border-emerald-500 bg-emerald-50" value={correctAnswer} onChange={e=>setCorrectAnswer(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-mono text-stone-500">Distractors (Wrong Options)</label>
                  <input required type="text" className="w-full p-2 brutal-border" value={wrongOpt1} onChange={e=>setWrongOpt1(e.target.value)} />
                  <input required type="text" className="w-full p-2 brutal-border" value={wrongOpt2} onChange={e=>setWrongOpt2(e.target.value)} />
                  <input required type="text" className="w-full p-2 brutal-border" value={wrongOpt3} onChange={e=>setWrongOpt3(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-mono mb-1">Explanation</label>
                  <textarea required className="w-full p-2 brutal-border text-sm" value={explanation} onChange={e=>setExplanation(e.target.value)} />
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <button type="button" onClick={() => setShowManualModal(false)} className="px-4 py-2 font-bold text-stone-500">Cancel</button>
                  <button type="submit" className="brutal-btn bg-stone-900 text-white px-6 py-2">Add to Bank</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white p-6 brutal-border max-w-sm w-full"
            >
              <h3 className="font-bold text-xl font-serif text-stone-900 mb-2">Delete Question?</h3>
              <p className="text-stone-500 font-mono text-sm mb-6">
                This action cannot be undone. Are you sure you want to permanently delete this official question?
              </p>
              
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setDeleteConfirmId(null)} 
                  className="px-4 py-2 font-bold text-stone-500 hover:text-stone-900 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDelete(deleteConfirmId)} 
                  className="brutal-btn bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Delete Confirmation Modal for Topic */}
      <AnimatePresence>
        {deleteTopicConfirmData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white p-6 brutal-border max-w-sm w-full"
            >
              <h3 className="font-bold text-xl font-serif text-stone-900 mb-2">Delete Topic?</h3>
              <p className="text-stone-500 font-mono text-sm mb-6">
                This action cannot be undone. Are you sure you want to permanently delete the topic <strong>{deleteTopicConfirmData.topic}</strong> and all its {deleteTopicConfirmData.questionIds.length} questions?
              </p>
              
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setDeleteTopicConfirmData(null)} 
                  className="px-4 py-2 font-bold text-stone-500 hover:text-stone-900 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteTopicConfirm} 
                  className="brutal-btn bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
