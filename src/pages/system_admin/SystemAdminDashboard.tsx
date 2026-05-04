import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, getDocs, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { ShieldAlert, Database, Users, Server, HardDrive, RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { logSystemAction } from '../../utils/auditLogger';

export default function SystemAdminDashboard({ profile }: { profile: any }) {
  const [activeTab, setActiveTab] = useState<'audit' | 'rbac' | 'config' | 'status'>('audit');
  const [logs, setLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [officialQuizzes, setOfficialQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedUserForRole, setSelectedUserForRole] = useState<any>(null);
  const [newRole, setNewRole] = useState<string>('');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  const [selectedQuizConfig, setSelectedQuizConfig] = useState<any>(null);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);

  const [expandedArchiveQuizId, setExpandedArchiveQuizId] = useState<string | null>(null);
  const [archiveQuestions, setArchiveQuestions] = useState<any[]>([]);
  const [loadingArchiveQuestions, setLoadingArchiveQuestions] = useState(false);

  const [backupStatus, setBackupStatus] = useState<'HEALTHY' | 'RUNNING' | 'RESTORING' | 'ERROR'>('HEALTHY');
  const [lastAutomatedBackup, setLastAutomatedBackup] = useState(new Date().toLocaleDateString() + " 03:00 AM");
  const [totalBackupSize, setTotalBackupSize] = useState("1.2 GB");
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const logsSnap = await getDocs(query(collection(db, 'audit_logs'), orderBy('created_at', 'desc'), limit(50)));
      setLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      const usersSnap = await getDocs(query(collection(db, 'users')));
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      const quizzesSnap = await getDocs(query(collection(db, 'quizzes')));
      const quizzesData = quizzesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const approvedQuizzes = quizzesData.filter((q: any) => q.alignmentStatus === 'aligned' && q.type === 'instructor');
      setOfficialQuizzes(approvedQuizzes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
     if (status === 'SUCCESS') return 'text-emerald-500';
     if (status === 'WARNING') return 'text-amber-500';
     return 'text-red-500';
  };

  const handleRoleUpdate = async () => {
    if (!selectedUserForRole || !newRole) return;
    setIsUpdatingRole(true);
    try {
      const userRef = doc(db, 'users', selectedUserForRole.id);
      const oldRole = selectedUserForRole.role;
      await updateDoc(userRef, { role: newRole });
      await logSystemAction('RBAC_ROLE_UPDATED', `Role for ${selectedUserForRole.email} changed from ${oldRole} to ${newRole}`);
      await fetchData(); // Refresh data
      setSelectedUserForRole(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'users');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleConfigUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuizConfig) return;
    setIsUpdatingConfig(true);
    try {
       const quizRef = doc(db, 'quizzes', selectedQuizConfig.id);
       await updateDoc(quizRef, {
          timeLimit: selectedQuizConfig.timeLimit,
          difficultyConfig: selectedQuizConfig.difficultyConfig,
       });
       await logSystemAction('QUIZ_CONFIG_UPDATED', `Updated configurations for official quiz: ${selectedQuizConfig.quizName || selectedQuizConfig.id}`);
       await fetchData();
       setSelectedQuizConfig(null);
    } catch (err) {
       handleFirestoreError(err, OperationType.UPDATE, `quizzes/${selectedQuizConfig.id}`);
    } finally {
       setIsUpdatingConfig(false);
    }
  };

  const fetchArchiveQuestions = async (quizId: string) => {
     if (expandedArchiveQuizId === quizId) {
        setExpandedArchiveQuizId(null);
        return;
     }
     setExpandedArchiveQuizId(quizId);
     setLoadingArchiveQuestions(true);
     try {
        const qSnap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
        setArchiveQuestions(qSnap.docs.map(d => ({ id: d.id, ...d.data() })));
     } catch (err) {
        console.error(err);
     } finally {
        setLoadingArchiveQuestions(false);
     }
  };

  const handleManualBackup = async () => {
    setBackupStatus('RUNNING');
    await logSystemAction('MANUAL_BACKUP_STARTED', `System automated backup initiated manually`);
    
    // Simulate backup process
    setTimeout(async () => {
       setBackupStatus('HEALTHY');
       const now = new Date();
       setLastAutomatedBackup(now.toLocaleDateString() + " " + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
       // slightly increase size
       const newSize = (parseFloat(totalBackupSize) + 0.1).toFixed(1);
       setTotalBackupSize(newSize + " GB");
       await logSystemAction('MANUAL_BACKUP_COMPLETED', `System backup completed successfully (${newSize} GB)`);
       fetchData(); // Refresh the logs table
    }, 2000);
  };

  const handleRestoreBackup = () => {
    setShowRestoreConfirm(true);
  };

  const confirmRestore = async () => {
    setShowRestoreConfirm(false);
    setBackupStatus('RESTORING');
    await logSystemAction('SYSTEM_RESTORE_STARTED', `System restore initiated from latest backup`);
    
    // Simulate restore process
    setTimeout(async () => {
       setBackupStatus('HEALTHY');
       await logSystemAction('SYSTEM_RESTORE_COMPLETED', `System restore completed successfully`);
       fetchData(); // Refresh the logs table
    }, 3000);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-serif italic font-bold text-stone-900 flex items-center gap-3">
            <Server className="text-red-600" size={32} />
            System IT Administrator
          </h1>
          <p className="text-stone-500 font-mono mt-2">Manage RBAC, System Configurations, and Audit Trails.</p>
        </div>
      </div>

      <div className="flex gap-2 border-b-2 border-stone-200 mb-8 overflow-x-auto pb-1">
        <button 
           onClick={() => setActiveTab('audit')}
           className={`px-4 py-2 font-bold font-mono tracking-wider uppercase text-sm whitespace-nowrap ${activeTab === 'audit' ? 'border-b-4 border-stone-900 text-stone-900' : 'text-stone-400 hover:text-stone-600'}`}
        >
           Audit Logs
        </button>
        <button 
           onClick={() => setActiveTab('rbac')}
           className={`px-4 py-2 font-bold font-mono tracking-wider uppercase text-sm whitespace-nowrap ${activeTab === 'rbac' ? 'border-b-4 border-stone-900 text-stone-900' : 'text-stone-400 hover:text-stone-600'}`}
        >
           RBAC Management
        </button>
        <button 
           onClick={() => setActiveTab('config')}
           id="quiz-config-tab"
           className={`px-4 py-2 font-bold font-mono tracking-wider uppercase text-sm whitespace-nowrap ${activeTab === 'config' ? 'border-b-4 border-stone-900 text-stone-900' : 'text-stone-400 hover:text-stone-600'}`}
        >
           Quiz Configuration
        </button>
        <button 
           onClick={() => setActiveTab('status')}
           className={`px-4 py-2 font-bold font-mono tracking-wider uppercase text-sm whitespace-nowrap ${activeTab === 'status' ? 'border-b-4 border-stone-900 text-stone-900' : 'text-stone-400 hover:text-stone-600'}`}
        >
           System Status
        </button>
      </div>

      <div className="space-y-8">
        {activeTab === 'audit' && (
           <div className="bg-white brutal-border p-6 shadow-[4px_4px_0px_rgba(28,25,23,1)]">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><ShieldAlert size={20} className="text-amber-500"/> System Audit Trail</h3>
              <div className="overflow-x-auto">
                 <table className="w-full text-left font-mono text-sm">
                    <thead>
                       <tr className="bg-stone-900 text-white">
                          <th className="p-2">Timestamp</th>
                          <th className="p-2">Action</th>
                          <th className="p-2">User/System</th>
                          <th className="p-2">Details</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                       {loading ? (
                         <tr><td colSpan={4} className="p-4 text-center">Loading...</td></tr>
                       ) : logs.length > 0 ? logs.map(l => {
                          const user = users.find(u => u.id === l.user_id) || users.find(u => u.uid === l.user_id);
                          return (
                            <tr key={l.id} className="hover:bg-stone-50">
                               <td className="p-2 text-stone-500">{new Date(l.created_at).toLocaleString()}</td>
                               <td className="p-2 font-bold">{l.action_type}</td>
                               <td className="p-2">
                                  {user ? (
                                    <div className="flex items-center gap-2">
                                      <span>{user.fullName}</span>
                                      <span className="text-[10px] font-mono bg-stone-200 px-1 rounded uppercase">{user.role}</span>
                                    </div>
                                  ) : (
                                    'SYSTEM'
                                  )}
                               </td>
                               <td className="p-2 truncate max-w-[400px]">{l.description}</td>
                            </tr>
                          );
                       }) : (
                         <tr><td colSpan={4} className="p-4 text-center text-stone-500">No logs found.</td></tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        )}

        {activeTab === 'rbac' && (
           <div className="bg-white brutal-border p-6 shadow-[4px_4px_0px_rgba(28,25,23,1)]">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Users size={20} className="text-blue-500"/> Role-Based Access Control</h3>
              <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm">
                    <thead>
                       <tr className="border-b-2 border-stone-900 bg-stone-50">
                          <th className="p-3 font-mono text-xs text-stone-500 uppercase">User</th>
                          <th className="p-3 font-mono text-xs text-stone-500 uppercase">Email</th>
                          <th className="p-3 font-mono text-xs text-stone-500 uppercase">Current Role</th>
                          <th className="p-3 font-mono text-xs text-stone-500 uppercase">Actions</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                       {loading ? (
                         <tr><td colSpan={4} className="p-4 text-center font-mono">Loading...</td></tr>
                       ) : users.map(u => (
                          <tr key={u.id} className="hover:bg-stone-50">
                             <td className="p-3 font-bold">{u.fullName}</td>
                             <td className="p-3 font-mono text-stone-500">{u.email}</td>
                             <td className="p-3">
                                <span className="bg-stone-200 text-stone-800 px-2 py-1 rounded text-xs font-mono font-bold uppercase">{u.role}</span>
                             </td>
                             <td className="p-3">
                                <button 
                                   onClick={() => {
                                     setSelectedUserForRole(u);
                                     setNewRole(u.role);
                                   }}
                                   className="text-[10px] font-mono bg-stone-900 text-white px-2 py-1 uppercase tracking-widest hover:bg-stone-700"
                                >
                                   Modify Role
                                </button>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        )}

        {activeTab === 'config' && (
           <div className="bg-white brutal-border p-6 shadow-[4px_4px_0px_rgba(28,25,23,1)]">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
                 <h3 className="font-bold text-lg flex items-center gap-2"><Database size={20} className="text-emerald-600"/> Official Quizzes Configuration</h3>
              </div>
              <p className="text-stone-500 font-mono text-sm mb-6">Manage time limits and difficulty configurations for quizzes that have been declared official (approved) by the Academic Admin.</p>
              
              <div className="overflow-x-auto">
                 <table className="w-full text-left font-mono text-sm">
                    <thead>
                       <tr className="border-b-2 border-stone-900 bg-stone-50">
                          <th className="p-3 uppercase text-stone-500 text-xs">Quiz Name</th>
                          <th className="p-3 uppercase text-stone-500 text-xs">Topic</th>
                          <th className="p-3 uppercase text-stone-500 text-xs">Time Limit (mins)</th>
                          <th className="p-3 uppercase text-stone-500 text-xs">Difficulty Config</th>
                          <th className="p-3 uppercase text-stone-500 text-xs">Actions</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                       {loading ? (
                         <tr><td colSpan={5} className="p-4 text-center">Loading...</td></tr>
                       ) : officialQuizzes.length > 0 ? officialQuizzes.map(quiz => (
                          <tr key={quiz.id} className="hover:bg-stone-50">
                             <td className="p-3 font-bold">{quiz.quizName || 'Untitled'}</td>
                             <td className="p-3 uppercase text-xs">{quiz.topic || 'Uncategorized'}</td>
                             <td className="p-3">{quiz.timeLimit || 'None'}</td>
                             <td className="p-3 uppercase text-xs">{quiz.difficultyConfig || 'mixed'}</td>
                             <td className="p-3">
                                <button 
                                   onClick={() => setSelectedQuizConfig({
                                      id: quiz.id,
                                      quizName: quiz.quizName,
                                      timeLimit: quiz.timeLimit || '',
                                      difficultyConfig: quiz.difficultyConfig || 'mixed'
                                   })}
                                   className="text-[10px] bg-stone-900 text-white px-2 py-1 uppercase tracking-widest hover:bg-stone-700"
                                >
                                   Configure
                                </button>
                             </td>
                          </tr>
                       )) : (
                         <tr><td colSpan={5} className="p-4 text-center text-stone-500">No official (approved) quizzes found.</td></tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        )}

        {activeTab === 'status' && (
           <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-[#f5f5f5] brutal-border p-6 shadow-[4px_4px_0px_rgba(28,25,23,1)]">
                 <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><HardDrive size={20} className="text-emerald-600"/> Data Backup & Recovery</h3>
                 <div className="space-y-4 mb-6">
                    <p className="text-sm font-mono text-stone-500">Securely store quizzes and student data to prevent data loss. The system automatically maintains rolling backups.</p>
                    <div className="flex justify-between items-center border-b border-stone-300 pb-2">
                       <span className="font-mono text-sm">Last Automated Backup</span>
                       <span className="text-emerald-600 font-bold text-sm">{lastAutomatedBackup}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-stone-300 pb-2">
                       <span className="font-mono text-sm">Total Backup Size</span>
                       <span className="text-blue-600 font-bold text-sm">{totalBackupSize}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-stone-300 pb-2">
                       <span className="font-mono text-sm">Status</span>
                       <span className={`font-bold text-sm ${backupStatus === 'HEALTHY' ? 'text-emerald-600' : backupStatus === 'ERROR' ? 'text-red-600' : 'text-amber-500 animate-pulse'}`}>{backupStatus}</span>
                    </div>
                 </div>
                 <div className="flex flex-col gap-3">
                     <button 
                        onClick={handleManualBackup}
                        disabled={backupStatus !== 'HEALTHY'}
                        className="w-full font-bold font-mono uppercase bg-stone-900 flex justify-center items-center gap-2 text-white hover:bg-stone-800 text-sm py-3 transition-colors border-2 border-stone-900 shadow-[2px_2px_0px_rgba(28,25,23,1)] disabled:opacity-50 disabled:cursor-not-allowed">
                        <RefreshCw size={16} className={backupStatus === 'RUNNING' ? 'animate-spin' : ''} /> {backupStatus === 'RUNNING' ? 'Backing Up...' : 'Run Manual Backup'}
                     </button>
                     <button 
                        onClick={handleRestoreBackup}
                        disabled={backupStatus !== 'HEALTHY'}
                        className="w-full font-bold font-mono uppercase bg-red-50 text-red-600 border-2 border-red-200 flex justify-center items-center gap-2 hover:bg-red-100 text-sm py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <HardDrive size={16} className={backupStatus === 'RESTORING' ? 'animate-pulse' : ''} /> {backupStatus === 'RESTORING' ? 'Restoring...' : 'Restore from Backup'}
                     </button>
                 </div>
              </div>

              <div className="bg-white brutal-border p-6 shadow-[4px_4px_0px_rgba(28,25,23,1)] max-h-[600px] overflow-y-auto">
                 <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Database size={20} className="text-blue-600"/> Quizzes Archive & Secure Storage</h3>
                 <p className="text-sm font-mono text-stone-500 mb-6">View past official quizzes stored in the database, including questions and answer explanations.</p>
                 <div className="space-y-4">
                    {loading ? (
                       <div className="text-center text-stone-500 font-mono text-sm">Loading archive...</div>
                    ) : officialQuizzes.length > 0 ? officialQuizzes.map(quiz => (
                       <div key={quiz.id} className="border-2 border-stone-200 bg-stone-50 p-4">
                          <div 
                             onClick={() => fetchArchiveQuestions(quiz.id)}
                             className="flex justify-between items-center cursor-pointer group"
                          >
                             <div>
                                <h4 className="font-bold flex items-center gap-2 group-hover:text-stone-600">
                                   {quiz.quizName || 'Untitled Quiz'} 
                                </h4>
                                <p className="text-xs text-stone-500 font-mono uppercase">Topic: {quiz.topic || 'N/A'}</p>
                             </div>
                             <div className="text-stone-400 group-hover:text-stone-900">
                                {expandedArchiveQuizId === quiz.id ? 'Hide' : 'View'}
                             </div>
                          </div>
                          
                          {expandedArchiveQuizId === quiz.id && (
                             <div className="mt-4 pt-4 border-t-2 border-stone-200 space-y-4">
                                {loadingArchiveQuestions ? (
                                   <div className="text-xs font-mono text-stone-500 text-center">Loading questions...</div>
                                ) : archiveQuestions.length > 0 ? archiveQuestions.map((q, idx) => (
                                   <div key={q.id} className="bg-white p-3 brutal-border">
                                      <p className="font-bold text-sm mb-2"><span className="text-stone-400 mr-2">{idx + 1}.</span>{q.questionText}</p>
                                      <div className="ml-5">
                                         <div className="mb-2 space-y-1">
                                            {q.options && q.options.map((opt: string, oIdx: number) => (
                                               <p key={oIdx} className={`text-xs font-mono p-1 ${opt === q.correctAnswer ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200' : 'text-stone-600 bg-stone-50 border border-stone-200'}`}>
                                                  {String.fromCharCode(65 + oIdx)}. {opt}
                                               </p>
                                            ))}
                                         </div>
                                         <p className="text-xs font-mono text-emerald-600 font-bold mb-1">Correct Answer: {q.correctAnswer}</p>
                                         <p className="text-xs font-mono text-stone-500">Explanation: {q.explanation || 'No explanation provided.'}</p>
                                      </div>
                                   </div>
                                )) : (
                                   <div className="text-xs font-mono text-stone-500 text-center">No questions found.</div>
                                )}
                             </div>
                          )}
                       </div>
                    )) : (
                       <div className="text-center text-stone-500 font-mono text-sm">No official quizzes stored.</div>
                    )}
                 </div>
              </div>
           </div>
        )}

      </div>

      {/* Modify Role Modal */}
      <AnimatePresence>
        {selectedUserForRole && (
          <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white p-6 max-w-sm w-full brutal-border shadow-[8px_8px_0px_rgba(28,25,23,1)]"
            >
              <div className="flex justify-between items-center border-b-2 border-stone-200 pb-3 mb-4">
                <h3 className="font-bold text-lg font-serif">Modify Role</h3>
                <button onClick={() => setSelectedUserForRole(null)} className="text-stone-500 hover:text-stone-900"><X size={20}/></button>
              </div>
              <div className="mb-4 text-sm font-mono text-stone-600">
                <p>User: <span className="font-bold text-stone-900">{selectedUserForRole.fullName}</span></p>
                <p>Email: <span className="text-stone-900">{selectedUserForRole.email}</span></p>
              </div>
              <div className="mb-6">
                 <label className="block text-xs font-bold font-mono uppercase tracking-wider mb-2 text-stone-500">New Role</label>
                 <select 
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full p-3 brutal-border bg-stone-50 text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
                 >
                    <option value="student">Student</option>
                    <option value="instructor">Instructor</option>
                    <option value="academic_admin">Academic Admin</option>
                    <option value="system_admin">System Admin</option>
                 </select>
              </div>
              <div className="flex justify-end gap-3">
                 <button 
                    onClick={() => setSelectedUserForRole(null)}
                    disabled={isUpdatingRole}
                    className="px-4 py-2 font-bold font-mono text-sm tracking-wider uppercase text-stone-600 hover:bg-stone-100 brutal-border disabled:opacity-50"
                 >
                   Cancel
                 </button>
                 <button 
                    onClick={handleRoleUpdate}
                    disabled={isUpdatingRole || newRole === selectedUserForRole.role}
                    className="px-6 py-2 bg-blue-600 text-white font-bold font-mono text-sm tracking-wider uppercase shadow-[4px_4px_0px_rgba(28,25,23,1)] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(28,25,23,1)] transition-all active:translate-y-[4px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_rgba(28,25,23,1)]"
                 >
                   {isUpdatingRole ? 'Updating...' : 'Save Role'}
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quiz Config Modal */}
      <AnimatePresence>
        {selectedQuizConfig && (
          <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white p-6 max-w-md w-full brutal-border shadow-[8px_8px_0px_rgba(28,25,23,1)] max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center border-b-2 border-stone-200 pb-3 mb-4">
                <h3 className="font-bold text-lg font-serif">Configure Quiz</h3>
                <button onClick={() => setSelectedQuizConfig(null)} className="text-stone-500 hover:text-stone-900"><X size={20}/></button>
              </div>
              <div className="mb-4 text-sm font-mono text-stone-600">
                <p>Quiz: <span className="font-bold text-stone-900">{selectedQuizConfig.quizName || selectedQuizConfig.id}</span></p>
              </div>
              
              <form onSubmit={handleConfigUpdate} className="space-y-4">
                 <div>
                    <label className="block text-xs font-bold font-mono uppercase tracking-wider mb-2 text-stone-500">Time Limit (Minutes)</label>
                    <input 
                       type="number"
                       min="1"
                       value={selectedQuizConfig.timeLimit}
                       onChange={(e) => setSelectedQuizConfig({...selectedQuizConfig, timeLimit: e.target.value})}
                       placeholder="Leave blank for no limit"
                       className="w-full p-3 brutal-border bg-stone-50 text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
                    />
                 </div>
                 <div className="mb-6">
                    <label className="block text-xs font-bold font-mono uppercase tracking-wider mb-2 text-stone-500">Difficulty Configuration</label>
                    <select 
                       value={selectedQuizConfig.difficultyConfig}
                       onChange={(e) => setSelectedQuizConfig({...selectedQuizConfig, difficultyConfig: e.target.value})}
                       className="w-full p-3 brutal-border bg-stone-50 text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
                    >
                       <option value="mixed">Mixed</option>
                       <option value="easy">Easy Only</option>
                       <option value="medium">Medium Only</option>
                       <option value="hard">Hard Only</option>
                    </select>
                    <p className="text-xs text-stone-400 mt-1">Select the pool of questions difficulty you want for this quiz.</p>
                 </div>

                 <div className="flex justify-end gap-3 pt-4 border-t border-stone-200">
                    <button 
                       type="button"
                       onClick={() => setSelectedQuizConfig(null)}
                       disabled={isUpdatingConfig}
                       className="px-4 py-2 font-bold font-mono text-sm tracking-wider uppercase text-stone-600 hover:bg-stone-100 brutal-border disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button 
                       type="submit"
                       disabled={isUpdatingConfig}
                       className="px-6 py-2 bg-emerald-600 text-white font-bold font-mono text-sm tracking-wider uppercase shadow-[4px_4px_0px_rgba(28,25,23,1)] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(28,25,23,1)] transition-all active:translate-y-[4px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_rgba(28,25,23,1)]"
                    >
                      {isUpdatingConfig ? 'Saving...' : 'Save Configuration'}
                    </button>
                 </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Restore Confirm Modal */}
      <AnimatePresence>
        {showRestoreConfirm && (
          <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white p-6 max-w-sm w-full brutal-border shadow-[8px_8px_0px_rgba(28,25,23,1)]"
            >
              <div className="flex justify-between items-center border-b-2 border-stone-200 pb-3 mb-4">
                <h3 className="font-bold text-lg font-serif text-red-600 flex items-center gap-2"><ShieldAlert size={20}/> Confirm Restore</h3>
                <button onClick={() => setShowRestoreConfirm(false)} className="text-stone-500 hover:text-stone-900"><X size={20}/></button>
              </div>
              <p className="font-mono text-sm text-stone-600 mb-6">
                 Are you sure you want to restore from the latest backup? 
                 <br/><br/>
                 <strong className="text-stone-900">This will overwrite current data and cannot be undone.</strong>
              </p>
              <div className="flex justify-end gap-3 pt-4 border-t border-stone-200">
                 <button 
                    onClick={() => setShowRestoreConfirm(false)}
                    className="px-4 py-2 font-bold font-mono text-sm tracking-wider uppercase text-stone-600 hover:bg-stone-100 brutal-border"
                 >
                   Cancel
                 </button>
                 <button 
                    onClick={confirmRestore}
                    className="px-6 py-2 bg-red-600 text-white font-bold font-mono text-sm tracking-wider uppercase shadow-[4px_4px_0px_rgba(28,25,23,1)] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(28,25,23,1)] transition-all active:translate-y-[4px] active:shadow-none"
                 >
                   Restore Data
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
