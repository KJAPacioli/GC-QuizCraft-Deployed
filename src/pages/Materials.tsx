import React, { useState, useEffect, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, query, where, getDocs, deleteDoc, doc, orderBy } from 'firebase/firestore';
import Navbar from '../components/Navbar';
import { BookOpen, Upload, Trash2, FileText, Plus, X, FileUp, Play, ChevronDown, ListTodo } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker using a reliable CDN with explicit https
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export default function Materials() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [uploadType, setUploadType] = useState<'text' | 'pdf'>('text');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [practiceQuizzes, setPracticeQuizzes] = useState<any[]>([]);
  const [showPracticeQuizzesModal, setShowPracticeQuizzesModal] = useState(false);
  const [deleteQuizId, setDeleteQuizId] = useState<string | null>(null);

  useEffect(() => {
    fetchMaterials();
    fetchPracticeQuizzes();
  }, []);

  const fetchPracticeQuizzes = async () => {
    if (!auth.currentUser) return;
    try {
      const qPractice = query(collection(db, 'quizzes'), where('userId', '==', auth.currentUser.uid));
      const snapPractice = await getDocs(qPractice);
      const pQuizzes = snapPractice.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const qAttempts = query(collection(db, 'attempts'), where('userId', '==', auth.currentUser.uid));
      const snapAttempts = await getDocs(qAttempts);
      const attemptsDict = new Set(snapAttempts.docs.map(d => d.data().quizId));

      const enhancedQuizzes = pQuizzes
         .sort((a: any, b: any) => new Date(b.generationDate).getTime() - new Date(a.generationDate).getTime())
         .filter((q: any) => q.type !== 'instructor')
         .map((q: any) => ({ ...q, hasTaken: attemptsDict.has(q.id) }));
         
      setPracticeQuizzes(enhancedQuizzes);
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDeletePracticeQuiz = async () => {
    if (!deleteQuizId) return;
    try {
       await deleteDoc(doc(db, 'quizzes', deleteQuizId));
       setPracticeQuizzes(prev => prev.filter(q => q.id !== deleteQuizId));
    } catch(err) {
      console.error('Failed to delete practice quiz:', err);
      alert('Failed to delete practice quiz.');
    } finally {
      setDeleteQuizId(null);
    }
  };

  const fetchMaterials = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(
        collection(db, 'materials'), 
        where('userId', '==', auth.currentUser.uid)
      );
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);
      
      docs.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
      
      setMaterials(docs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    setIsUploading(true);
    try {
      let finalContent = content;
      
      if (uploadType === 'pdf' && pdfFile) {
        finalContent = await extractTextFromPDF(pdfFile);
      }

      if (!finalContent.trim()) {
        throw new Error("Content cannot be empty.");
      }

      await addDoc(collection(db, 'materials'), {
        userId: auth.currentUser.uid,
        title,
        content: finalContent.substring(0, 50000), // Limit content size
        uploadDate: new Date().toISOString()
      });

      const { logSystemAction } = await import('../utils/auditLogger');
      await logSystemAction('MATERIAL_UPLOADED', `Uploaded learning material: ${title}`);

      
      setTitle('');
      setContent('');
      setPdfFile(null);
      setShowModal(false);
      fetchMaterials();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to upload material.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'materials', id));
      setDeleteConfirmId(null);
      fetchMaterials();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `materials/${id}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-serif italic font-bold text-stone-900">Study Materials</h1>
            <p className="text-stone-500 font-mono text-sm">Manage your lecture notes and readings</p>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="brutal-btn bg-stone-900 text-white flex items-center gap-2"
          >
            <Plus size={20} />
            Add Material
          </button>
        </header>

        {loading ? (
          <div className="text-center py-20 font-mono text-stone-400">LOADING MATERIALS...</div>
        ) : materials.length === 0 ? (
          <div className="text-center py-20 bg-white brutal-border">
            <BookOpen size={48} className="mx-auto text-stone-200 mb-4" />
            <h3 className="text-xl font-bold">No materials yet</h3>
            <p className="text-stone-500 mt-2">Upload your first study material to start generating quizzes.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {materials.map((material) => (
                <motion.div
                  key={material.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-white p-6 brutal-border flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-stone-100 rounded-lg">
                        <FileText size={20} className="text-stone-600" />
                      </div>
                      <button 
                        onClick={() => setDeleteConfirmId(material.id)}
                        className="text-stone-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <h4 className="text-lg font-bold mb-2 line-clamp-2">{material.title}</h4>
                    <p className="text-stone-500 text-sm line-clamp-3 mb-4">
                      {material.content}
                    </p>
                  </div>
                  <div className="pt-4 border-t border-stone-100 flex justify-between items-center">
                    <span className="text-[10px] font-mono text-stone-400 uppercase">
                      {new Date(material.uploadDate).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] font-mono bg-stone-100 px-2 py-1 rounded">
                      {Math.ceil(material.content.split(' ').length / 100)} MIN READ
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        
        {/* Practice Quizzes Section */}
        <section className="mt-16 pt-12 border-t-2 border-stone-100">
           <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className="text-3xl font-serif italic font-bold text-stone-900 mb-2">Practice Quizzes container</h2>
                <p className="text-stone-500 font-mono text-sm max-w-xl">Self-practice activities generated for your study materials and weak area reviews.</p>
              </div>
              <button 
                 onClick={() => setShowPracticeQuizzesModal(true)}
                 className="brutal-btn bg-white text-stone-900 border-2 border-stone-900 shadow-[4px_4px_0px_rgba(28,25,23,1)] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(28,25,23,1)] transition-all flex items-center gap-2 font-bold uppercase tracking-wide text-sm font-mono px-6 py-3"
              >
                 <ListTodo size={18} /> View Practice Quizzes ({practiceQuizzes.length})
              </button>
           </div>
        </section>
      </main>

      {/* Practice Quizzes Modal */}
      <AnimatePresence>
        {showPracticeQuizzesModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm" onClick={() => setShowPracticeQuizzesModal(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-stone-50 w-full max-w-4xl brutal-border flex flex-col h-[85vh] overflow-hidden"
            >
              <div className="p-6 border-b-2 border-stone-200 flex justify-between items-center bg-white">
                 <div>
                    <h2 className="text-2xl font-serif italic font-bold flex items-center gap-2">
                      <ListTodo size={24} /> My Practice Quizzes
                    </h2>
                 </div>
                 <button 
                   onClick={() => setShowPracticeQuizzesModal(false)}
                   className="p-2 text-stone-400 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded transition-colors"
                 >
                   <X size={20} />
                 </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                 {practiceQuizzes.length === 0 ? (
                    <div className="py-20 text-center font-mono text-stone-400 border-2 border-dashed border-stone-200">
                       No practice quizzes available at the moment.
                    </div>
                 ) : (
                    practiceQuizzes.map(quiz => (
                      <div key={quiz.id} className="bg-white p-6 brutal-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono bg-stone-100 text-stone-800 px-2 py-1 uppercase tracking-widest font-bold border border-stone-200">
                              {quiz.quizName.includes('Weak Areas') ? 'Suggested Question From Weak Areas' : 'Self Practice'}
                            </span>
                            <span className="text-[10px] font-mono text-stone-500">
                              {new Date(quiz.generationDate).toLocaleDateString()}
                            </span>
                          </div>
                          <h4 className="text-xl font-bold">{quiz.quizName}</h4>
                           {quiz.derivedFromQuizName && (
                              <p className="text-xs text-blue-600 font-mono mt-1 font-bold bg-blue-50 w-fit px-2 py-1">Derived from: {quiz.derivedFromQuizName}</p>
                           )}
                           <p className="text-xs text-stone-500 font-mono mt-1">Topic: {quiz.topic === 'all' ? 'Mixed Topics' : quiz.topic}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link to={`/quiz/take/${quiz.id}`} className="brutal-btn bg-stone-900 text-white flex items-center justify-center gap-2 hover:bg-stone-800 whitespace-nowrap px-4 py-2 text-sm font-bold">
                            <Play size={16} /> {quiz.hasTaken ? 'Retake Quiz' : 'Start Quiz'}
                          </Link>
                          <button onClick={() => setDeleteQuizId(quiz.id)} className="p-2 text-stone-400 hover:text-red-500 transition-colors brutal-border hover:bg-white bg-stone-50" title="Delete Practice Quiz">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                 )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Upload Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl brutal-border p-8 relative"
            >
              <button 
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-stone-400 hover:text-stone-900"
              >
                <X size={24} />
              </button>

              <h2 className="text-2xl font-serif italic font-bold mb-6 flex items-center gap-2">
                <Upload size={24} />
                Upload Study Material
              </h2>

              <form onSubmit={handleUpload} className="space-y-6">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    className="w-full p-3 brutal-border focus:outline-none focus:ring-2 focus:ring-stone-900"
                    placeholder="e.g., Introduction to Data Structures"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
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
                      <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Content / Notes</label>
                      <textarea
                        required={uploadType === 'text'}
                        rows={10}
                        className="w-full p-3 brutal-border focus:outline-none focus:ring-2 focus:ring-stone-900 font-sans text-sm"
                        placeholder="Paste your lecture notes, book snippets, or study summaries here..."
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                      />
                      <p className="text-[10px] text-stone-400 mt-2 font-mono uppercase">
                        Tip: The more detailed the content, the better the generated quiz.
                      </p>
                    </>
                  ) : (
                    <div className="border-2 border-dashed border-stone-300 p-8 text-center hover:bg-stone-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        ref={fileInputRef}
                        required={uploadType === 'pdf'}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && file.type === 'application/pdf') {
                            setPdfFile(file);
                            if (!title) {
                              setTitle(file.name.replace('.pdf', ''));
                            }
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

                <div className="flex justify-end gap-4">
                  <button 
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-6 py-2 font-bold text-stone-500 hover:text-stone-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUploading}
                    className="brutal-btn bg-stone-900 text-white px-8 py-2 disabled:opacity-50"
                  >
                    {isUploading ? 'Uploading...' : 'Save Material'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white p-6 brutal-border max-w-sm w-full"
            >
              <h3 className="font-bold text-xl font-serif text-stone-900 mb-2">Delete Material?</h3>
              <p className="text-stone-500 font-mono text-sm mb-6">
                This action cannot be undone. Are you sure you want to permanently delete this material?
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

      {/* Delete Practice Quiz Confirmation Modal */}
      <AnimatePresence>
        {deleteQuizId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm" onClick={() => setDeleteQuizId(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white p-6 md:p-8 brutal-border max-w-sm w-full"
            >
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-serif font-bold italic text-red-600 flex items-center gap-2"><Trash2 size={20}/> Confirm Delete</h3>
                <button onClick={() => setDeleteQuizId(null)} className="p-2 bg-stone-100 hover:bg-stone-200 brutal-border transition-colors">
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm font-mono text-stone-600 mb-6">
                Are you sure you want to permanently delete this practice quiz? You will not be able to retake it again.
              </p>
              <div className="flex justify-end gap-3 pt-4 border-t border-stone-200">
                 <button 
                    onClick={() => setDeleteQuizId(null)}
                    className="px-4 py-2 font-bold font-mono text-sm tracking-wider uppercase text-stone-600 hover:bg-stone-100 brutal-border"
                 >
                   Cancel
                 </button>
                 <button 
                    onClick={confirmDeletePracticeQuiz}
                    className="px-6 py-2 bg-red-600 text-white font-bold font-mono text-sm tracking-wider uppercase shadow-[4px_4px_0px_rgba(28,25,23,1)] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(28,25,23,1)] transition-all active:translate-y-[4px] active:shadow-none"
                 >
                   Delete
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
