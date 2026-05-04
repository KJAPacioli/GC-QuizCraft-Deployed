import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, getDocs, where, orderBy, limit, doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { BarChart3, Users, BookOpen, Shield, Download, BrainCircuit, Activity, BookMarked, TrendingUp, ChevronDown, ChevronUp, Trash2, X, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function AcademicAdminDashboard({ profile }: { profile: any }) {
  const [activeTab, setActiveTab] = useState<'usage' | 'curriculum' | 'reports'>('usage');
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rejectingQuizId, setRejectingQuizId] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [expandedQuizId, setExpandedQuizId] = useState<string | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<Record<string, any[]>>({});
  
  const [deleteQuizConfirmData, setDeleteQuizConfirmData] = useState<{ id: string, name: string } | null>(null);
  const [selectedModal, setSelectedModal] = useState<'courses' | 'students' | 'instructors' | 'student_performance' | null>(null);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalCurrentPage, setModalCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    setModalSearchQuery('');
    setModalCurrentPage(1);
  }, [selectedModal]);

  const fetchStats = async () => {
    try {
      // Fetch users
      const usersSnap = await getDocs(collection(db, 'users'));
      let studentsCount = 0;
      let instructorsCount = 0;
      const userMap: Record<string, any> = {};
      const usageByProgram: Record<string, { studentCount: number, totalAttempts: number }> = {};
      
      const studentsList: any[] = [];
      const instructorsList: any[] = [];

      usersSnap.forEach(doc => {
        const d = doc.data();
        userMap[doc.id] = { id: doc.id, ...d };
        if (d.role === 'student') {
          studentsCount++;
          studentsList.push({ id: doc.id, ...d });
          const prog = d.program || 'Unassigned';
          if (!usageByProgram[prog]) usageByProgram[prog] = { studentCount: 0, totalAttempts: 0 };
          usageByProgram[prog].studentCount++;
        }
        if (d.role === 'instructor') {
          instructorsCount++;
          instructorsList.push({ id: doc.id, ...d });
        }
      });

      // Fetch classrooms
      const classSnap = await getDocs(collection(db, 'classrooms'));
      const activeCourses = classSnap.docs.length;
      const usageByCourse: Record<string, { name: string, studentCount: number, totalAttempts: number }> = {};
      const allCourses: any[] = [];
      classSnap.forEach(doc => {
         const data = doc.data();
         allCourses.push({ id: doc.id, ...data });
         usageByCourse[doc.id] = { name: data.name || 'Unnamed', studentCount: data.studentIds?.length || 0, totalAttempts: 0 };
      });

      studentsList.forEach(student => {
         student.enrolledCourses = allCourses.filter(c => (c.studentIds || []).includes(student.uid || student.id));
      });
      instructorsList.forEach(instructor => {
         instructor.teachingCourses = allCourses.filter(c => c.instructorId === (instructor.uid || instructor.id));
      });
      allCourses.forEach(course => {
         course.instructorName = userMap[course.instructorId]?.fullName || 'Unknown Instructor';
      });

      // Fetch attempts
      const attemptsSnap = await getDocs(collection(db, 'attempts'));
      let totalAttempts = attemptsSnap.docs.length;
      let avgScore = 0;
      let totalPerc = 0;
      let aiIntegrationCount = 0;
      
      const allAttempts: any[] = [];

      attemptsSnap.forEach(doc => {
        const d = doc.data();
        allAttempts.push(d);
        
        if (d.userId && userMap[d.userId]) {
            const prog = userMap[d.userId].program || 'Unassigned';
            if (usageByProgram[prog]) usageByProgram[prog].totalAttempts++;
        }

        const cId = d.classroomId || d.quizInfo?.classroomId;
        if (cId && usageByCourse[cId]) {
            usageByCourse[cId].totalAttempts++;
        }

        if (d.aiInsights || d.practiceGenerated) {
           aiIntegrationCount++;
        }

        if (d.totalQuestions > 0) {
          totalPerc += (d.score / d.totalQuestions) * 100;
        }
      });
      if (totalAttempts > 0) avgScore = totalPerc / totalAttempts;
      
      const aiUsagePercent = totalAttempts > 0 ? Math.round((aiIntegrationCount / totalAttempts) * 100) : 0;

      studentsList.forEach(student => {
         student.officialAttempts = allAttempts.filter(a => a.userId === (student.uid || student.id) && a.quizInfo?.type === 'instructor');
      });

      // Fetch quizzes for curriculum alignment
      const quizzesSnap = await getDocs(query(collection(db, 'quizzes'), where('type', '==', 'instructor')));
      const recentQuizzes = quizzesSnap.docs
         .map(d => ({ 
             id: d.id, 
             ...d.data(),
             instructorName: userMap[d.data().userId]?.name || 'Unknown Instructor'
         }))
         .sort((a: any, b: any) => new Date(b.generationDate || 0).getTime() - new Date(a.generationDate || 0).getTime())
         .slice(0, 20);

      setStats({
        studentsCount,
        instructorsCount,
        activeCourses,
        totalAttempts,
        avgScore,
        aiUsagePercent,
        usageByProgram: Object.entries(usageByProgram).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.totalAttempts - a.totalAttempts),
        usageByCourse: Object.values(usageByCourse).sort((a, b) => b.totalAttempts - a.totalAttempts),
        recentQuizzes,
        studentsList,
        instructorsList,
        allCourses,
        allAttempts
      });
      setLoading(false);
    } catch (error) {
      console.error("Error fetching admin stats", error);
      setLoading(false);
    }
  };

  const exportEngagementDataCSV = () => {
    if (!stats?.studentsList) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Student Name,Email,Program,Year Level,Enrolled Courses,Total Official Attempts,Total Practice Attempts,Official Avg Score (%),Practice Avg Score (%),AI Interactions Count\n";

    stats.studentsList.forEach((student: any) => {
       const officialAttempts = student.officialAttempts || [];
       const practiceAttempts = (stats.allAttempts || []).filter((a: any) => a.userId === (student.uid || student.id) && a.quizInfo?.type !== 'instructor');
       
       const officialAvg = officialAttempts.length > 0
            ? officialAttempts.reduce((acc: number, val: any) => acc + (val.totalQuestions > 0 ? (val.score / val.totalQuestions) * 100 : 0), 0) / officialAttempts.length
            : 0;
            
       const practiceAvg = practiceAttempts.length > 0
            ? practiceAttempts.reduce((acc: number, val: any) => acc + (val.totalQuestions > 0 ? (val.score / val.totalQuestions) * 100 : 0), 0) / practiceAttempts.length
            : 0;

       // Count AI interactions (practice attempts where AI was used plus official with insights)
       const aiInteractions = [...officialAttempts, ...practiceAttempts].filter(a => a.aiInsights || a.practiceGenerated).length;

       const enrolledCourses = student.enrolledCourses?.map((c: any) => c.name).join('; ') || 'None';

       const escapeCsv = (str: string) => `"${(str || '').toString().replace(/"/g, '""')}"`;

       const row = [
         escapeCsv(student.fullName),
         escapeCsv(student.email),
         escapeCsv(student.program || 'N/A'),
         escapeCsv(student.yearLevel || 'N/A'),
         escapeCsv(enrolledCourses),
         officialAttempts.length,
         practiceAttempts.length,
         officialAvg.toFixed(2),
         practiceAvg.toFixed(2),
         aiInteractions
       ];

       csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `platform_engagement_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAlignmentUpdate = async (quizId: string, status: string, feedback?: string) => {
    try {
      const updateData: any = { alignmentStatus: status };
      if (feedback) {
        updateData.feedback = feedback;
      }
      const quizToUpdate = stats.recentQuizzes?.find((q: any) => q.id === quizId);

      await updateDoc(doc(db, 'quizzes', quizId), updateData);

      if (quizToUpdate) {
        const { logSystemAction } = await import('../../utils/auditLogger');
        await logSystemAction(
          status === 'aligned' ? 'QUIZ_APPROVED' : 'QUIZ_REJECTED', 
          `${status === 'aligned' ? 'Approved' : 'Rejected'} official quiz: ${quizToUpdate.quizName || quizId}`
        );
      }

      setRejectingQuizId(null);
      setRejectFeedback('');
      fetchStats(); // refresh the list
    } catch (error) {
       console.error("Failed to update alignment status:", error);
       alert("Failed to update alignment status. Please check your permissions.");
    }
  };

  const handleDeleteQuizConfirm = async () => {
    if (!deleteQuizConfirmData) return;
    try {
      await deleteDoc(doc(db, 'quizzes', deleteQuizConfirmData.id));
      setDeleteQuizConfirmData(null);
      fetchStats();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `quizzes/${deleteQuizConfirmData.id}`);
    }
  };

  const toggleExpand = async (quizId: string) => {
     if (expandedQuizId === quizId) {
        setExpandedQuizId(null);
        return;
     }
     setExpandedQuizId(quizId);
     
     if (!quizQuestions[quizId]) {
        try {
           const qsSnap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
           setQuizQuestions(prev => ({
              ...prev,
              [quizId]: qsSnap.docs.map(qd => qd.data())
           }));
        } catch (error) {
           console.error("Failed to fetch questions:", error);
        }
     }
  };

  if (loading) {
     return <div className="p-8 font-mono animate-pulse text-stone-500">Loading Administrative Data...</div>;
  }

  // Common pagination/search calculations
  const queryLower = modalSearchQuery.toLowerCase();
  
  const filteredCourses = stats?.allCourses?.filter((c: any) => 
    c.name?.toLowerCase().includes(queryLower) || 
    c.instructorName?.toLowerCase().includes(queryLower)
  ) || [];
  const paginatedCourses = filteredCourses.slice((modalCurrentPage - 1) * ITEMS_PER_PAGE, modalCurrentPage * ITEMS_PER_PAGE);

  const filteredStudents = stats?.studentsList?.filter((s: any) => 
    s.fullName?.toLowerCase().includes(queryLower) || 
    s.email?.toLowerCase().includes(queryLower)
  ) || [];
  const paginatedStudents = filteredStudents.slice((modalCurrentPage - 1) * ITEMS_PER_PAGE, modalCurrentPage * ITEMS_PER_PAGE);

  const filteredInstructors = stats?.instructorsList?.filter((i: any) => 
    i.fullName?.toLowerCase().includes(queryLower) || 
    i.email?.toLowerCase().includes(queryLower)
  ) || [];
  const paginatedInstructors = filteredInstructors.slice((modalCurrentPage - 1) * ITEMS_PER_PAGE, modalCurrentPage * ITEMS_PER_PAGE);

  const totalPagesForCurrentModal = 
    selectedModal === 'courses' ? Math.ceil(filteredCourses.length / ITEMS_PER_PAGE) :
    (selectedModal === 'students' || selectedModal === 'student_performance') ? Math.ceil(filteredStudents.length / ITEMS_PER_PAGE) :
    selectedModal === 'instructors' ? Math.ceil(filteredInstructors.length / ITEMS_PER_PAGE) : 0;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-serif italic font-bold text-stone-900 flex items-center gap-3">
            <Shield className="text-blue-600" size={32} />
            Academic Administrator Portal
          </h1>
          <p className="text-stone-500 font-mono mt-2">Monitor platform usage, curriculum alignment, and evaluate learning strategies.</p>
        </div>
        <div className="bg-white p-3 brutal-border flex gap-4 text-sm font-mono text-stone-600">
           <div 
              className="text-center px-4 border-r-2 border-stone-200 cursor-pointer hover:bg-stone-50 hover:underline transition-colors"
              onClick={() => setSelectedModal('courses')}
           >
              <span className="block text-2xl font-bold text-stone-900 no-underline">{stats?.activeCourses}</span>
              Active Courses
           </div>
           <div 
              className="text-center px-4 border-r-2 border-stone-200 cursor-pointer hover:bg-stone-50 hover:underline transition-colors"
              onClick={() => setSelectedModal('students')}
           >
              <span className="block text-2xl font-bold text-stone-900 no-underline">{stats?.studentsCount}</span>
              Students
           </div>
           <div 
              className="text-center px-4 cursor-pointer hover:bg-stone-50 hover:underline transition-colors"
              onClick={() => setSelectedModal('instructors')}
           >
              <span className="block text-2xl font-bold text-stone-900 no-underline">{stats?.instructorsCount}</span>
              Instructors
           </div>
        </div>
      </div>

      <div className="flex gap-2 border-b-2 border-stone-200 mb-8 overflow-x-auto pb-1">
        <button 
           onClick={() => setActiveTab('usage')}
           className={`px-4 py-2 font-bold font-mono tracking-wider uppercase text-sm whitespace-nowrap ${activeTab === 'usage' ? 'border-b-4 border-stone-900 text-stone-900' : 'text-stone-400 hover:text-stone-600'}`}
        >
           System Usage Dashboard
        </button>
        <button 
           onClick={() => setActiveTab('curriculum')}
           className={`px-4 py-2 font-bold font-mono tracking-wider uppercase text-sm whitespace-nowrap ${activeTab === 'curriculum' ? 'border-b-4 border-stone-900 text-stone-900' : 'text-stone-400 hover:text-stone-600'}`}
        >
           Curriculum Alignment
        </button>
        <button 
           onClick={() => setActiveTab('reports')}
           className={`px-4 py-2 font-bold font-mono tracking-wider uppercase text-sm whitespace-nowrap ${activeTab === 'reports' ? 'border-b-4 border-stone-900 text-stone-900' : 'text-stone-400 hover:text-stone-600'}`}
        >
           Reporting Tools
        </button>
      </div>

      <div className="space-y-8">
        {activeTab === 'usage' && (
           <div className="space-y-8">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white brutal-border p-6 shadow-[4px_4px_0px_rgba(28,25,23,1)]">
                   <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-lg">Overall Platform Engagement</h3>
                      <Activity className="text-emerald-500" />
                   </div>
                   <div className="space-y-4">
                      <div>
                        <p className="text-stone-500 font-mono text-xs uppercase mb-1">Total Quiz Attempts</p>
                        <p className="text-3xl font-bold">{stats?.totalAttempts}</p>
                      </div>
                      <div>
                        <p className="text-stone-500 font-mono text-xs uppercase mb-1">Average Submissions / Student</p>
                        <p className="text-xl font-bold">{(stats?.studentsCount > 0 ? (stats?.totalAttempts / stats?.studentsCount) : 0).toFixed(1)}</p>
                      </div>
                   </div>
                </div>

                <div className="bg-white brutal-border p-6 shadow-[4px_4px_0px_rgba(28,25,23,1)]">
                   <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-lg">Performance Metrics</h3>
                      <TrendingUp className="text-blue-500" />
                   </div>
                   <div className="space-y-4">
                      <div>
                        <p className="text-stone-500 font-mono text-xs uppercase mb-1">Institution Average Score</p>
                        <div className="flex items-end gap-2">
                            <p className="text-3xl font-bold">{stats?.avgScore?.toFixed(1) || '0.0'}%</p>
                            <span className={`text-sm mb-1 font-bold ${stats?.avgScore >= 70 ? 'text-emerald-500' : 'text-red-500'}`}>
                               {stats?.avgScore >= 70 ? 'Satisfactory' : 'Needs Intervention'}
                            </span>
                        </div>
                      </div>
                   </div>
                </div>
                
                <div className="bg-[#f5f5f5] brutal-border p-6 shadow-[4px_4px_0px_rgba(28,25,23,1)] border-purple-200">
                   <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-lg">AI Integration Usage</h3>
                      <BrainCircuit className="text-purple-600" />
                   </div>
                   <p className="text-sm text-stone-600 mb-4">Tracking how frequently AI is utilized for learning and content generation across the institution.</p>
                   <div className="w-full bg-stone-200 h-2 mb-2">
                      <div className="bg-purple-600 h-2" style={{width: `${stats?.aiUsagePercent || 0}%`}}></div>
                   </div>
                   <p className="text-xs font-mono text-stone-500 text-right">{stats?.aiUsagePercent || 0}% of recent attempts include AI insights</p>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white brutal-border p-6">
                   <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                      <BookOpen className="text-emerald-500" /> Usage by Course Class
                   </h3>
                   <div className="space-y-4">
                      {stats?.usageByCourse?.slice(0, 5).map((course: any, idx: number) => (
                         <div key={idx} className="flex justify-between items-center border-b border-stone-100 pb-3 last:border-0 last:pb-0">
                            <div>
                               <p className="font-bold text-stone-900">{course.name}</p>
                               <p className="text-xs font-mono text-stone-500 uppercase">{course.studentCount} Students</p>
                            </div>
                            <div className="text-right">
                               <p className="text-xl font-bold text-emerald-700">{course.totalAttempts}</p>
                               <p className="text-[10px] font-mono text-stone-400 uppercase">Attempts</p>
                            </div>
                         </div>
                      ))}
                      {stats?.usageByCourse?.length === 0 && <p className="text-sm text-stone-500 font-mono">No courses found.</p>}
                   </div>
                </div>

                <div className="bg-white brutal-border p-6">
                   <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                      <Users className="text-blue-500" /> Usage by Department (Program)
                   </h3>
                   <div className="space-y-4">
                      {stats?.usageByProgram?.slice(0, 5).map((prog: any, idx: number) => (
                         <div key={idx} className="flex justify-between items-center border-b border-stone-100 pb-3 last:border-0 last:pb-0">
                            <div>
                               <p className="font-bold text-stone-900">{prog.name}</p>
                               <p className="text-xs font-mono text-stone-500 uppercase">{prog.studentCount} User Accounts</p>
                            </div>
                            <div className="text-right">
                               <p className="text-xl font-bold text-blue-700">{prog.totalAttempts}</p>
                               <p className="text-[10px] font-mono text-stone-400 uppercase">Attempts</p>
                            </div>
                         </div>
                      ))}
                      {stats?.usageByProgram?.length === 0 && <p className="text-sm text-stone-500 font-mono">No programs found.</p>}
                   </div>
                </div>
             </div>
           </div>
        )}

        {activeTab === 'curriculum' && (
           <div className="bg-white brutal-border p-6 md:p-8">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold font-serif mb-2">Curriculum Alignment Audit</h3>
                  <p className="text-stone-500 text-sm">Review recently created assessments to ensure they meet required academic standards and course outcomes.</p>
                </div>
              </div>

               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                    <thead>
                       <tr className="border-b-2 border-stone-900 bg-stone-50">
                          <th className="p-3 font-mono text-xs text-stone-500 uppercase">Assessment Name</th>
                          <th className="p-3 font-mono text-xs text-stone-500 uppercase">Topics Covered</th>
                          <th className="p-3 font-mono text-xs text-stone-500 uppercase">Instructor</th>
                          <th className="p-3 font-mono text-xs text-stone-500 uppercase">Alignment Status</th>
                          <th className="p-3 font-mono text-xs text-stone-500 uppercase text-right">Actions</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                       {stats?.recentQuizzes?.map((quiz: any) => (
                           <React.Fragment key={quiz.id}>
                               <tr className="hover:bg-stone-50">
                                  <td className="p-3 font-bold text-sm">{quiz.quizName || 'Untitled Quiz'}</td>
                                  <td className="p-3"><span className="bg-stone-100 text-stone-600 px-2 py-0.5 rounded text-[10px] font-mono tracking-wider">{quiz.topic}</span></td>
                                  <td className="p-3 text-sm font-mono whitespace-nowrap">{quiz.instructorName}</td>
                                  <td className="p-3">
                                     {quiz.alignmentStatus === 'aligned' ? (
                                        <span className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold bg-emerald-50 px-2 py-1 w-max brutal-border border-emerald-200 uppercase">
                                           <Shield size={12} /> ALIGNED
                                        </span>
                                     ) : quiz.alignmentStatus === 'unaligned' ? (
                                        <span className="flex items-center gap-1 text-red-600 text-[10px] font-bold bg-red-50 px-2 py-1 w-max brutal-border border-red-200 uppercase">
                                           <Shield size={12} /> UNALIGNED
                                        </span>
                                     ) : (
                                        <span className="flex items-center gap-1 text-amber-600 text-[10px] font-bold bg-amber-50 px-2 py-1 w-max brutal-border border-amber-200 uppercase">
                                           <Shield size={12} /> PENDING
                                        </span>
                                     )}
                                  </td>
                                  <td className="p-3 text-right whitespace-nowrap">
                                     <div className="flex items-center gap-2 justify-end">
                                        <button
                                           onClick={() => toggleExpand(quiz.id)}
                                           className="text-[10px] font-mono bg-blue-100 text-blue-800 px-2 py-1 uppercase tracking-widest hover:bg-blue-200 border border-blue-200 flex flex-row items-center gap-1"
                                        >
                                           View Questions
                                           {expandedQuizId === quiz.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                        </button>
                                        <button 
                                           onClick={() => handleAlignmentUpdate(quiz.id, 'aligned')}
                                           disabled={quiz.alignmentStatus === 'aligned'}
                                           className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-1 uppercase tracking-widest hover:bg-emerald-200 border border-emerald-200 disabled:opacity-50"
                                        >
                                           Approve
                                        </button>
                                        <button 
                                           onClick={() => setRejectingQuizId(quiz.id)}
                                           disabled={quiz.alignmentStatus === 'unaligned'}
                                           className="text-[10px] font-mono bg-red-100 text-red-800 px-2 py-1 uppercase tracking-widest hover:bg-red-200 border border-red-200 disabled:opacity-50"
                                        >
                                           Reject
                                        </button>
                                        <button
                                           onClick={() => setDeleteQuizConfirmData({ id: quiz.id, name: quiz.name || 'Assessment' })}
                                           className="text-stone-400 hover:text-red-500 ml-2"
                                           title="Delete Assessment"
                                        >
                                           <Trash2 size={16} />
                                        </button>
                                     </div>
                                  </td>
                               </tr>
                               {expandedQuizId === quiz.id && (
                                  <tr>
                                     <td colSpan={5} className="p-4 bg-stone-50 border-t-0 shadow-[inset_0_4px_4px_-4px_rgba(0,0,0,0.1)]">
                                        <h4 className="text-sm font-bold font-mono mb-3 text-stone-700">Quiz Content Review</h4>
                                        {!quizQuestions[quiz.id] ? (
                                           <p className="text-sm text-stone-500 font-mono animate-pulse">Loading questions...</p>
                                        ) : quizQuestions[quiz.id].length === 0 ? (
                                           <p className="text-sm text-stone-500 font-mono">No questions found for this assessment.</p>
                                        ) : (
                                           <ul className="space-y-4">
                                              {quizQuestions[quiz.id].map((q, idx) => (
                                                 <li key={idx} className="bg-white p-4 brutal-border border-stone-300">
                                                    <p className="font-bold text-sm mb-2"><span className="text-stone-400 font-mono mr-2">{idx + 1}.</span>{q.questionText}</p>
                                                    <p className="text-xs font-mono text-stone-500 mb-2">Type: {q.questionType}</p>
                                                    {q.options && q.options.length > 0 && (
                                                       <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-stone-600">
                                                          {q.options.map((opt: string, optIdx: number) => (
                                                             <li key={optIdx} className={q.correctAnswer === opt ? "text-emerald-600 font-bold" : ""}>
                                                                {opt}
                                                             </li>
                                                          ))}
                                                       </ul>
                                                    )}
                                                 </li>
                                              ))}
                                           </ul>
                                        )}
                                     </td>
                                  </tr>
                               )}
                           </React.Fragment>
                       ))}
                       {stats?.recentQuizzes?.length === 0 && (
                          <tr><td colSpan={5} className="p-4 text-center text-stone-500 font-mono text-sm">No recent assessments found.</td></tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        )}

        {activeTab === 'reports' && (
           <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white brutal-border p-6">
                 <div className="w-12 h-12 bg-amber-100 flex items-center justify-center brutal-border mb-4">
                    <BarChart3 className="text-amber-600" />
                 </div>
                 <h3 className="text-xl font-bold mb-2">Student Performance Reports</h3>
                 <p className="text-stone-500 text-sm mb-4">Generate comprehensive reports on student assessment scores, longitudinal progress, and identified learning gaps across all departments.</p>
                 <button 
                    onClick={() => setSelectedModal('student_performance')}
                    className="brutal-btn bg-stone-900 text-white flex justify-center items-center gap-2 hover:bg-stone-800 w-full text-sm">
                    <BarChart3 size={16} /> View Performance Data
                 </button>
              </div>

              <div className="bg-white brutal-border p-6">
                 <div className="w-12 h-12 bg-blue-100 flex items-center justify-center brutal-border mb-4">
                    <Activity className="text-blue-600" />
                 </div>
                 <h3 className="text-xl font-bold mb-2">Platform Engagement Reports</h3>
                 <p className="text-stone-500 text-sm mb-4">Evaluate the effectiveness of learning strategies by analyzing time spent on practice quizzes, material interactions, and login frequencies.</p>
                 <button 
                    onClick={exportEngagementDataCSV}
                    className="brutal-btn bg-stone-900 text-white flex justify-center items-center gap-2 hover:bg-stone-800 w-full text-sm">
                    <Download size={16} /> Export Engagement Data (CSV)
                 </button>
              </div>
           </div>
        )}

      </div>

      <AnimatePresence>
         {rejectingQuizId && (
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="fixed inset-0 bg-stone-900/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
            >
               <motion.div 
                  initial={{ scale: 0.95, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 20 }}
                  className="bg-white brutal-border p-6 max-w-md w-full shadow-[8px_8px_0px_rgba(28,25,23,1)]"
               >
                  <h3 className="text-xl font-bold font-serif mb-4 flex items-center gap-2">
                     <Shield className="text-red-500" />
                     Feedback for Rejection
                  </h3>
                  <p className="text-sm text-stone-600 mb-4 font-mono">
                     Please provide feedback on why this quiz does not align with the curriculum. The instructor will see this feedback.
                  </p>
                  <textarea 
                     value={rejectFeedback}
                     onChange={(e) => setRejectFeedback(e.target.value)}
                     className="w-full h-32 p-3 text-sm font-mono brutal-border focus:outline-none mb-4"
                     placeholder="Missing required competencies, inaccurate questions..."
                  />
                  <div className="flex gap-2 justify-end">
                     <button
                        onClick={() => {
                           setRejectingQuizId(null);
                           setRejectFeedback('');
                        }}
                        className="px-4 py-2 text-sm font-bold font-mono uppercase hover:bg-stone-100 brutal-border"
                     >
                        Cancel
                     </button>
                     <button
                        onClick={() => handleAlignmentUpdate(rejectingQuizId, 'unaligned', rejectFeedback)}
                        disabled={!rejectFeedback.trim()}
                        className="px-4 py-2 text-sm font-bold font-mono uppercase bg-red-600 text-white brutal-border hover:bg-red-700 disabled:opacity-50"
                     >
                        Submit & Reject
                     </button>
                  </div>
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>
      
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

      {/* System Usage Modals */}
      <AnimatePresence>
        {selectedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm" onClick={() => setSelectedModal(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white p-6 md:p-8 brutal-border max-w-2xl w-full max-h-[80vh] flex flex-col"
            >
              <div className="flex justify-between items-start mb-6 shrink-0">
                <div>
                  <span className="text-[10px] font-mono bg-stone-100 text-stone-800 px-2 py-1 uppercase tracking-widest font-bold mb-2 inline-block">
                    {selectedModal === 'courses' ? 'Active Courses' : selectedModal === 'students' ? 'Students Directory' : selectedModal === 'instructors' ? 'Instructors Directory' : 'System Reports'}
                  </span>
                  <h2 className="text-3xl font-serif font-bold italic">
                    {selectedModal === 'courses' ? 'Course Classes' : selectedModal === 'students' ? 'Students' : selectedModal === 'instructors' ? 'Instructors' : 'Student Performance'}
                  </h2>
                </div>
                <button onClick={() => setSelectedModal(null)} className="p-2 bg-stone-100 hover:bg-stone-200 brutal-border transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Search Bar */}
              <div className="mb-4 shrink-0 relative">
                 <input 
                    type="text" 
                    placeholder="Search by name or email..."
                    value={modalSearchQuery}
                    onChange={(e) => {
                       setModalSearchQuery(e.target.value);
                       setModalCurrentPage(1);
                    }}
                    className="w-full p-3 pl-10 brutal-border text-sm"
                 />
                 <Search className="absolute left-3 top-3 text-stone-400" size={18} />
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {selectedModal === 'courses' && (
                  <>
                    {paginatedCourses.map((course: any, i: number) => (
                      <div key={i} className="bg-stone-50 p-4 brutal-border">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-lg text-stone-900">{course.name}</h3>
                          <span className="text-xs font-mono font-bold bg-stone-200 px-2 py-1 uppercase">{course.studentIds?.length || 0} Students</span>
                        </div>
                        <p className="text-sm font-mono text-stone-500">Instructor: <span className="font-bold text-stone-700">{course.instructorName}</span></p>
                      </div>
                    ))}
                    {paginatedCourses.length === 0 && <p className="text-stone-500 font-mono text-sm text-center py-8">No active courses found.</p>}
                  </>
                )}

                {selectedModal === 'students' && (
                  <>
                    {paginatedStudents.map((student: any, i: number) => (
                      <div key={i} className="bg-stone-50 p-4 brutal-border">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-bold text-lg text-stone-900">{student.fullName}</h3>
                            <p className="text-xs font-mono text-stone-500">{student.email}</p>
                          </div>
                          <div className="text-right">
                             <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-2 py-1 uppercase">{student.program || 'N/A'}</span>
                             <p className="text-[10px] font-mono text-stone-500 uppercase mt-1">{student.yearLevel || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-stone-200">
                          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold mb-2">Enrolled Classes</p>
                          {student.enrolledCourses?.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {student.enrolledCourses.map((c: any, j: number) => (
                                <span key={j} className="text-xs bg-white border border-stone-200 px-2 py-1 rounded">{c.name}</span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs font-mono text-stone-500 italic">No classes enrolled.</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {paginatedStudents.length === 0 && <p className="text-stone-500 font-mono text-sm text-center py-8">No students found.</p>}
                  </>
                )}

                {selectedModal === 'instructors' && (
                  <>
                    {paginatedInstructors.map((instructor: any, i: number) => (
                      <div key={i} className="bg-stone-50 p-4 brutal-border">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-bold text-lg text-stone-900">Prof. {instructor.fullName}</h3>
                            <p className="text-xs font-mono text-stone-500">{instructor.email}</p>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-stone-200">
                          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold mb-2">Teaching Classes</p>
                          {instructor.teachingCourses?.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {instructor.teachingCourses.map((c: any, j: number) => (
                                <span key={j} className="text-xs bg-white border border-stone-200 px-2 py-1 rounded text-stone-700 font-bold">{c.name}</span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs font-mono text-stone-500 italic">No classes currently assigned.</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {paginatedInstructors.length === 0 && <p className="text-stone-500 font-mono text-sm text-center py-8">No instructors found.</p>}
                  </>
                )}

                {selectedModal === 'student_performance' && (
                  <>
                    {paginatedStudents.map((student: any, i: number) => {
                       const officialAttempts = student.officialAttempts || [];
                       const avgScore = officialAttempts.length > 0
                          ? officialAttempts.reduce((acc: number, val: any) => acc + (val.totalQuestions > 0 ? (val.score / val.totalQuestions) * 100 : 0), 0) / officialAttempts.length
                          : 0;

                       return (
                          <div key={i} className="bg-stone-50 p-4 brutal-border">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h3 className="font-bold text-lg text-stone-900">{student.fullName}</h3>
                                <p className="text-xs font-mono text-stone-500">{student.email}</p>
                              </div>
                              <div className="text-right">
                                 <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-2 py-1 uppercase">{student.program || 'N/A'}</span>
                                 <p className="text-xs font-mono font-bold mt-1 text-stone-600">Official Avg: {avgScore.toFixed(0)}%</p>
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-stone-200">
                              <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold mb-2">Completed Quizzes ({officialAttempts.length})</p>
                              {officialAttempts.length > 0 ? (
                                <div className="space-y-2">
                                  {officialAttempts.map((att: any, j: number) => (
                                    <div key={j} className="bg-white p-3 border border-stone-200 text-sm flex flex-col gap-2">
                                       <div className="flex justify-between">
                                          <span className="font-bold text-stone-700">{att.quizInfo?.title || 'Unknown Quiz'}</span>
                                          <span className="font-mono text-stone-500">{att.score}/{att.totalQuestions}</span>
                                       </div>
                                       {att.aiInsights && (
                                          <div className="mt-1 text-xs text-purple-700 bg-purple-50 p-2 border border-purple-100">
                                            <span className="font-bold block mb-1">AI Insights:</span>
                                            {att.aiInsights}
                                          </div>
                                       )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs font-mono text-stone-500 italic">No official quizzes completed.</p>
                              )}
                            </div>
                          </div>
                       );
                    })}
                    {paginatedStudents.length === 0 && <p className="text-stone-500 font-mono text-sm text-center py-8">No students found.</p>}
                  </>
                )}
              </div>

              {/* Pagination Controls */}
              {totalPagesForCurrentModal > 1 && (
                 <div className="mt-6 flex items-center justify-between shrink-0 pt-4 border-t border-stone-200">
                    <button 
                       disabled={modalCurrentPage === 1}
                       onClick={() => setModalCurrentPage(prev => Math.max(1, prev - 1))}
                       className="p-2 bg-stone-100 hover:bg-stone-200 brutal-border disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                       <ChevronLeft size={20} />
                    </button>
                    <span className="text-xs font-mono font-bold text-stone-500">
                       Page {modalCurrentPage} of {totalPagesForCurrentModal}
                    </span>
                    <button 
                       disabled={modalCurrentPage === totalPagesForCurrentModal}
                       onClick={() => setModalCurrentPage(prev => Math.min(totalPagesForCurrentModal, prev + 1))}
                       className="p-2 bg-stone-100 hover:bg-stone-200 brutal-border disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                       <ChevronRight size={20} />
                    </button>
                 </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
