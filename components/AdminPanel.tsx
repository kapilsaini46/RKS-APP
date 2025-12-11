
import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { PaymentRequest, User, QuestionPaper, SubscriptionStatus, UserRole, SubscriptionPlan, ContentPage } from '../types';
import PaperGenerator from './PaperGenerator';

interface Props {
  user: User;
}

const AdminPanel: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'users' | 'papers' | 'patterns' | 'curriculum' | 'content'>('requests');
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [papers, setPapers] = useState<QuestionPaper[]>([]);
  const [view, setView] = useState<'dashboard' | 'create'>('dashboard');
  const [selectedPaper, setSelectedPaper] = useState<QuestionPaper | null>(null);

  // Curriculum Data
  const [curriculumConfig, setCurriculumConfig] = useState<Record<string, string[]>>({});
  const [newClassInput, setNewClassInput] = useState('');
  const [selectedCurriculumClass, setSelectedCurriculumClass] = useState<string>('');
  const [newSubjectInput, setNewSubjectInput] = useState('');
  
  // Question Types Data
  const [questionTypes, setQuestionTypes] = useState<string[]>([]);
  const [newQTypeInput, setNewQTypeInput] = useState('');

  // Content Management Data
  const [contentPages, setContentPages] = useState<ContentPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('about');
  const [pageContent, setPageContent] = useState('');
  const [pageTitle, setPageTitle] = useState('');

  // Edit User State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [originalEmail, setOriginalEmail] = useState<string>('');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Create User State
  const [creatingUser, setCreatingUser] = useState<User | null>(null);

  // Delete Paper State
  const [paperToDelete, setPaperToDelete] = useState<QuestionPaper | null>(null);

  // Sample Pattern State
  const [patternClass, setPatternClass] = useState('');
  const [patternSubject, setPatternSubject] = useState('');
  const [patternText, setPatternText] = useState('');
  const [patternFile, setPatternFile] = useState<{name: string, data: string, mimeType: string} | null>(null);
  const [syllabusFile, setSyllabusFile] = useState<{name: string, data: string, mimeType: string} | null>(null);
  const [saveStatus, setSaveStatus] = useState('');

  const refreshData = async () => {
    try {
        const reqs = await StorageService.getAllRequests();
        setRequests(reqs);
        const users = await StorageService.getAllUsers();
        setAllUsers(users);
        const paps = await StorageService.getAllPapers();
        setPapers(paps);
        const config = await StorageService.getConfig();
        setCurriculumConfig(config);
        const qTypes = await StorageService.getQuestionTypes();
        setQuestionTypes(qTypes);
        const pages = await StorageService.getAllContentPages();
        setContentPages(pages);
        
        // Set default selected class/subject if empty and config exists
        const classes = Object.keys(config);
        if (classes.length > 0 && !patternClass) {
            setPatternClass(classes[0]);
        }
    } catch (e) {
        console.error("Refresh failed", e);
    }
  };

  const loadPattern = async () => {
    if (!patternClass || !patternSubject) {
        setPatternText('');
        setPatternFile(null);
        setSyllabusFile(null);
        return;
    }
    const p = await StorageService.getSamplePattern(patternClass, patternSubject);
    setPatternText(p ? p.content : '');
    setPatternFile(p?.attachment ? { name: p.attachment.name, data: p.attachment.data, mimeType: p.attachment.mimeType } : null);
    setSyllabusFile(p?.syllabusAttachment ? { name: p.syllabusAttachment.name, data: p.syllabusAttachment.data, mimeType: p.syllabusAttachment.mimeType } : null);
    setSaveStatus('');
  };

  useEffect(() => {
    refreshData();
  }, [view, selectedPaper, activeTab]); 

  // CMS: Load page content when selection changes
  useEffect(() => {
      if (activeTab === 'content') {
          const page = contentPages.find(p => p.id === selectedPageId);
          if (page) {
              setPageTitle(page.title);
              setPageContent(page.content);
          }
      }
  }, [selectedPageId, activeTab, contentPages]);

  // Update subject dropdown when class changes in patterns/curriculum logic
  useEffect(() => {
    if (patternClass && curriculumConfig[patternClass]) {
        const subjects = curriculumConfig[patternClass];
        if (subjects.length > 0 && (!patternSubject || !subjects.includes(patternSubject))) {
             setPatternSubject(subjects[0]);
        }
    }
  }, [patternClass, curriculumConfig]);

  // Load pattern when selecting class/subject in patterns tab
  useEffect(() => {
    if (activeTab === 'patterns') {
        loadPattern();
    }
  }, [patternClass, patternSubject, activeTab]);

  const handleApproval = async (reqId: string, approve: boolean) => {
    await StorageService.processRequest(reqId, approve);
    refreshData();
  };

  const togglePasswordVisibility = (email: string) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [email]: !prev[email]
    }));
  };

  const openEditModal = (u: User) => {
    setEditingUser({ ...u });
    setOriginalEmail(u.email);
  };

  const saveUserChanges = async () => {
    if (editingUser) {
      await StorageService.updateUser(editingUser, originalEmail);
      setEditingUser(null);
      refreshData();
      alert("User details updated successfully.");
    }
  };

  const openCreateModal = () => {
      setCreatingUser({
          email: '',
          name: '',
          role: UserRole.TEACHER,
          password: '',
          credits: 1, // Default 1 for Free Plan
          subscriptionPlan: SubscriptionPlan.FREE,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          mobile: '',
          city: '',
          state: '',
          schoolName: ''
      });
  };

  const saveNewUser = async () => {
      if (!creatingUser?.email || !creatingUser?.name || !creatingUser?.password) {
          alert("Please fill all required fields");
          return;
      }
      try {
          await StorageService.createUser(creatingUser);
          setCreatingUser(null);
          refreshData();
          alert("New user created successfully.");
      } catch (e: any) {
          alert(e.message);
      }
  };

  const handleDeleteUser = async (u: User) => {
      if (u.email === user.email) {
          alert("You cannot delete your own admin account.");
          return;
      }
      if (window.confirm(`Are you sure you want to delete user ${u.name} (${u.email})? This action cannot be undone.`)) {
          await StorageService.deleteUser(u.email);
          refreshData();
      }
  };

  const confirmDeletePaper = async (target: 'ADMIN' | 'TEACHER') => {
    if (paperToDelete) {
        await StorageService.deletePaper(paperToDelete.id, target);
        setPaperToDelete(null);
        refreshData();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'pattern' | 'syllabus') => {
    const file = e.target.files?.[0];
    if (file) {
        if (file.size > 2 * 1024 * 1024) { // 2MB Limit
            alert("File too large. Please upload a PDF under 2MB.");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            const fileData = {
                name: file.name,
                mimeType: file.type,
                data: base64String
            };
            
            if (type === 'pattern') {
                setPatternFile(fileData);
            } else {
                setSyllabusFile(fileData);
            }
        };
        reader.readAsDataURL(file);
    }
  };

  const handleSavePattern = async () => {
    if (!patternClass || !patternSubject) return alert("Please select a Class and Subject.");
    if (!patternText.trim() && !patternFile && !syllabusFile) return alert("Please provide sample text or upload a document.");
    
    await StorageService.saveSamplePattern({
        id: Date.now().toString(),
        classNum: patternClass,
        subject: patternSubject,
        content: patternText,
        attachment: patternFile ? {
            name: patternFile.name,
            data: patternFile.data,
            mimeType: patternFile.mimeType
        } : undefined,
        syllabusAttachment: syllabusFile ? {
            name: syllabusFile.name,
            data: syllabusFile.data,
            mimeType: syllabusFile.mimeType
        } : undefined,
        updatedAt: new Date().toISOString()
    });
    setSaveStatus('Pattern & Syllabus saved successfully!');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const handleSaveContent = async () => {
      await StorageService.savePageContent({
          id: selectedPageId,
          title: pageTitle,
          content: pageContent,
          lastUpdated: new Date().toISOString()
      });
      refreshData();
      alert("Page content saved successfully!");
  };

  // Curriculum Handlers
  const handleAddClass = async () => {
      if (!newClassInput.trim()) return;
      try {
          await StorageService.addClass(newClassInput.trim());
          setNewClassInput('');
          refreshData();
      } catch (e: any) {
          alert(e.message);
      }
  };

  const handleDeleteClass = async (className: string) => {
      if (window.confirm(`Delete Class ${className} and all its subjects?`)) {
          await StorageService.deleteClass(className);
          if (selectedCurriculumClass === className) setSelectedCurriculumClass('');
          refreshData();
      }
  };

  const handleAddSubject = async () => {
      if (!selectedCurriculumClass || !newSubjectInput.trim()) return;
      try {
          await StorageService.addSubject(selectedCurriculumClass, newSubjectInput.trim());
          setNewSubjectInput('');
          refreshData();
      } catch (e: any) {
          alert(e.message);
      }
  };

  const handleDeleteSubject = async (subject: string) => {
      if (window.confirm(`Delete Subject ${subject} from Class ${selectedCurriculumClass}?`)) {
          await StorageService.deleteSubject(selectedCurriculumClass, subject);
          refreshData();
      }
  };

  const handleAddQType = async () => {
      if (!newQTypeInput.trim()) return;
      try {
          await StorageService.addQuestionType(newQTypeInput.trim());
          setNewQTypeInput('');
          refreshData();
      } catch (e: any) {
          alert(e.message);
      }
  };

  const handleDeleteQType = async (type: string) => {
      if (window.confirm(`Delete Question Type "${type}"?`)) {
          await StorageService.deleteQuestionType(type);
          refreshData();
      }
  };

  const getDaysRemaining = (expiryDate?: string) => {
      if (!expiryDate) return '-';
      const now = new Date();
      const expiry = new Date(expiryDate);
      if (isNaN(expiry.getTime())) return '-';
      
      const diffMs = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) return <span className="text-red-500 font-bold">Expired</span>;
      return <span className={diffDays < 7 ? 'text-red-500 font-bold' : 'text-green-600'}>{diffDays} Days</span>;
  };


  if (view === 'create' || selectedPaper) {
    return (
      <PaperGenerator 
        userEmail={user.email}
        existingPaper={selectedPaper || undefined}
        onClose={() => { setView('dashboard'); setSelectedPaper(null); }} 
        onSuccess={() => { setView('dashboard'); setSelectedPaper(null); refreshData(); }} 
      />
    );
  }

  const classList = Object.keys(curriculumConfig);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Admin Dashboard</h1>
        <button 
          onClick={() => setView('create')}
          className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-bold flex justify-center items-center gap-2 shadow-md transition-all"
        >
          <i className="fas fa-plus"></i> Generate Paper
        </button>
      </div>

      {/* Tabs - Added explicit overflow class and touch handling */}
      <div className="flex space-x-4 border-b overflow-x-auto pb-1 w-full">
        {[
          { id: 'requests', label: 'Subscription Requests' },
          { id: 'users', label: 'All Users' },
          { id: 'papers', label: 'All Papers' },
          { id: 'patterns', label: 'Sample Patterns' },
          { id: 'curriculum', label: 'Curriculum & Config' },
          { id: 'content', label: 'Website Content' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-2 px-4 font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
              activeTab === tab.id 
                ? 'border-b-2 border-purple-600 text-purple-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content - Added overflow handling for main content area */}
      <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6 min-h-[500px]">
        
        {activeTab === 'requests' && (
          <div className="overflow-x-auto w-full">
            <div className="inline-block min-w-full align-middle">
                <table className="min-w-full text-left">
                <thead>
                    <tr className="border-b bg-gray-50">
                    <th className="p-3 text-sm font-bold text-gray-600">User</th>
                    <th className="p-3 text-sm font-bold text-gray-600">Plan</th>
                    <th className="p-3 text-sm font-bold text-gray-600">Amount</th>
                    <th className="p-3 text-sm font-bold text-gray-600">Proof</th>
                    <th className="p-3 text-sm font-bold text-gray-600">Status</th>
                    <th className="p-3 text-sm font-bold text-gray-600">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {requests.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-500">No pending requests</td></tr>}
                    {requests.map((req) => (
                    <tr key={req.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-sm whitespace-nowrap">{req.userEmail}</td>
                        <td className="p-3"><span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded whitespace-nowrap">{req.plan}</span></td>
                        <td className="p-3 text-sm whitespace-nowrap">₹{req.amount}</td>
                        <td className="p-3 text-sm whitespace-nowrap">
                        <a href={req.proofUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">View</a>
                        </td>
                        <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                            req.status === SubscriptionStatus.PENDING ? 'bg-yellow-100 text-yellow-800' :
                            req.status === SubscriptionStatus.ACTIVE ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                            {req.status}
                        </span>
                        </td>
                        <td className="p-3 space-x-2 whitespace-nowrap">
                        {req.status === SubscriptionStatus.PENDING && (
                            <>
                            <button onClick={() => handleApproval(req.id, true)} className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">Approve</button>
                            <button onClick={() => handleApproval(req.id, false)} className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700">Reject</button>
                            </>
                        )}
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
           <div className="w-full">
             <div className="flex justify-end mb-4">
                 <button 
                     onClick={openCreateModal}
                     className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 shadow flex items-center gap-2"
                 >
                     <i className="fas fa-user-plus"></i> Create User
                 </button>
             </div>
             {/* Robust Mobile Scrolling for Table */}
             <div className="overflow-x-auto w-full border rounded-lg">
               <div className="min-w-max">
                  <table className="w-full text-left">
                      <thead>
                      <tr className="border-b bg-gray-50">
                          <th className="p-3 text-sm font-bold text-gray-600 whitespace-nowrap">Name</th>
                          <th className="p-3 text-sm font-bold text-gray-600 whitespace-nowrap">School Name</th> {/* Added School Name */}
                          <th className="p-3 text-sm font-bold text-gray-600 whitespace-nowrap">Email</th>
                          <th className="p-3 text-sm font-bold text-gray-600 whitespace-nowrap">Mobile</th>
                          <th className="p-3 text-sm font-bold text-gray-600 whitespace-nowrap">City</th>
                          <th className="p-3 text-sm font-bold text-gray-600 whitespace-nowrap">State</th>
                          <th className="p-3 text-sm font-bold text-gray-600 whitespace-nowrap">Password</th>
                          <th className="p-3 text-sm font-bold text-gray-600 whitespace-nowrap">Role</th>
                          <th className="p-3 text-sm font-bold text-gray-600 whitespace-nowrap">Credits</th>
                          <th className="p-3 text-sm font-bold text-gray-600 whitespace-nowrap">Plan</th>
                          <th className="p-3 text-sm font-bold text-gray-600 whitespace-nowrap">Validity</th>
                          <th className="p-3 text-sm font-bold text-gray-600 whitespace-nowrap">Actions</th>
                      </tr>
                      </thead>
                      <tbody>
                      {allUsers.map((u) => (
                          <tr key={u.email} className="border-b hover:bg-gray-50">
                          <td className="p-3 font-medium whitespace-nowrap">{u.name}</td>
                          <td className="p-3 text-sm text-gray-800 whitespace-nowrap font-medium">{u.schoolName || '-'}</td> {/* School Name Data */}
                          <td className="p-3 text-sm text-gray-600 whitespace-nowrap">{u.email}</td>
                          <td className="p-3 text-sm whitespace-nowrap">{u.mobile || '-'}</td>
                          <td className="p-3 text-sm whitespace-nowrap">{u.city || '-'}</td>
                          <td className="p-3 text-sm whitespace-nowrap">{u.state || '-'}</td>
                          <td className="p-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded w-20 truncate inline-block text-center">
                                  {visiblePasswords[u.email] ? u.password || 'N/A' : '••••••••'}
                                  </span>
                                  <button 
                                  onClick={() => togglePasswordVisibility(u.email)}
                                  className="text-gray-400 hover:text-blue-600"
                                  >
                                  <i className={`fas ${visiblePasswords[u.email] ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                  </button>
                              </div>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                              <span className={`text-xs px-2 py-1 rounded font-bold ${u.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                                  {u.role}
                              </span>
                          </td>
                          <td className="p-3 font-bold">{u.credits}</td>
                          <td className="p-3 text-sm">{u.subscriptionPlan}</td>
                          <td className="p-3 text-sm font-mono whitespace-nowrap">{getDaysRemaining(u.subscriptionExpiryDate)}</td>
                          <td className="p-3 whitespace-nowrap flex gap-2">
                              <button 
                                  onClick={() => openEditModal(u)}
                                  className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1 rounded transition-colors"
                              >
                                  <i className="fas fa-edit mr-1"></i> Edit
                              </button>
                              <button 
                                  onClick={() => handleDeleteUser(u)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded transition-colors"
                                  title="Delete User"
                              >
                                  <i className="fas fa-trash"></i>
                              </button>
                          </td>
                          </tr>
                      ))}
                      </tbody>
                  </table>
               </div>
             </div>
           </div>
        )}

        {activeTab === 'papers' && (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {/* ... Papers Grid ... */}
             {papers.map((p) => (
               <div key={p.id} className="border p-4 rounded-lg bg-gray-50 flex flex-col h-full">
                 <h3 className="font-bold text-gray-800 line-clamp-2">{p.title}</h3>
                 <p className="text-sm text-gray-600 mb-2">Class {p.classNum} • {p.subject}</p>
                 <div className="mt-auto flex justify-between items-end">
                    <div>
                        <p className="text-xs text-gray-400">By: {p.createdBy}</p>
                        <span className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setSelectedPaper(p)} 
                            className="text-blue-500 hover:text-blue-700 p-2 hover:bg-blue-50 rounded"
                            title="View/Edit Paper"
                        >
                            <i className="fas fa-edit"></i>
                        </button>
                        <button 
                            onClick={() => setPaperToDelete(p)} 
                            className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded"
                            title="Delete Paper"
                        >
                            <i className="fas fa-trash"></i>
                        </button>
                    </div>
                 </div>
               </div>
             ))}
             {papers.length === 0 && <p className="text-gray-400 col-span-3 text-center py-10">No papers generated yet.</p>}
           </div>
        )}

        {/* ... Rest of Tabs (Patterns, Curriculum, Content) follow same async pattern ... */}
        {activeTab === 'patterns' && (
            <div className="space-y-6">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <h3 className="font-bold text-blue-800 mb-2">Configure Style & Syllabus</h3>
                    <p className="text-sm text-blue-600 mb-4">
                        Provide a style guide and syllabus for the AI. You can paste text manually, upload a sample PDF (style), and upload a Syllabus PDF (scope).
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Class</label>
                            <select 
                                className="w-full border rounded p-2 bg-white"
                                value={patternClass}
                                onChange={(e) => setPatternClass(e.target.value)}
                            >
                                {classList.length === 0 && <option>No classes found</option>}
                                {classList.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Subject</label>
                            <select 
                                className="w-full border rounded p-2 bg-white"
                                value={patternSubject}
                                onChange={(e) => setPatternSubject(e.target.value)}
                            >
                                {!patternClass || !curriculumConfig[patternClass] || curriculumConfig[patternClass].length === 0 ? <option>No subjects found</option> : null}
                                {patternClass && curriculumConfig[patternClass]?.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1">
                        <label className="font-bold text-gray-700 mb-2 block">Option 1: Paste Text</label>
                        <textarea 
                            className="w-full h-64 p-4 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Paste sample questions here..."
                            value={patternText}
                            onChange={(e) => setPatternText(e.target.value)}
                        ></textarea>
                    </div>
                    
                    <div className="lg:col-span-1">
                         <label className="font-bold text-gray-700 mb-2 block">Option 2: Sample Paper (PDF)</label>
                         <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors h-64">
                             <input 
                                type="file" 
                                accept="application/pdf"
                                onChange={(e) => handleFileUpload(e, 'pattern')}
                                className="hidden" 
                                id="pattern-file-upload"
                             />
                             <label htmlFor="pattern-file-upload" className="cursor-pointer text-center w-full">
                                 <i className="fas fa-file-pdf text-4xl text-blue-400 mb-3"></i>
                                 <p className="font-bold text-gray-600 mb-1">Upload Sample Paper</p>
                                 <p className="text-xs text-gray-400">Max size: 2MB</p>
                             </label>
                             
                             {patternFile && (
                                <div className="mt-4 flex items-center gap-2 bg-blue-100 px-3 py-2 rounded text-blue-800 text-sm w-full max-w-xs truncate mx-auto">
                                    <i className="fas fa-file-pdf shrink-0"></i>
                                    <span className="truncate">{patternFile.name}</span>
                                    <button onClick={() => setPatternFile(null)} className="ml-auto text-red-500 hover:text-red-700 shrink-0">
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                             )}
                         </div>
                    </div>

                    <div className="lg:col-span-1">
                         <label className="font-bold text-gray-700 mb-2 block">Option 3: Syllabus / Blueprint (PDF)</label>
                         <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors h-64">
                             <input 
                                type="file" 
                                accept="application/pdf"
                                onChange={(e) => handleFileUpload(e, 'syllabus')}
                                className="hidden" 
                                id="syllabus-file-upload"
                             />
                             <label htmlFor="syllabus-file-upload" className="cursor-pointer text-center w-full">
                                 <i className="fas fa-book text-4xl text-purple-400 mb-3"></i>
                                 <p className="font-bold text-gray-600 mb-1">Upload Syllabus</p>
                                 <p className="text-xs text-gray-400">Max size: 2MB</p>
                             </label>
                             
                             {syllabusFile && (
                                <div className="mt-4 flex items-center gap-2 bg-purple-100 px-3 py-2 rounded text-purple-800 text-sm w-full max-w-xs truncate mx-auto">
                                    <i className="fas fa-file-pdf shrink-0"></i>
                                    <span className="truncate">{syllabusFile.name}</span>
                                    <button onClick={() => setSyllabusFile(null)} className="ml-auto text-red-500 hover:text-red-700 shrink-0">
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                             )}
                         </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4 border-t">
                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                        {saveStatus && <span className="text-green-600 text-sm font-bold animate-pulse">{saveStatus}</span>}
                        <button 
                            onClick={handleSavePattern}
                            className="w-full sm:w-auto bg-green-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-green-700 shadow-lg flex items-center justify-center gap-2"
                        >
                            <i className="fas fa-save"></i> Save Configuration
                        </button>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'curriculum' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {/* Manage Classes */}
                <div className="border rounded-lg p-6 bg-gray-50">
                    <h3 className="font-bold text-lg text-gray-800 mb-4 border-b pb-2">Manage Classes</h3>
                    <div className="flex gap-2 mb-4">
                        <input 
                            type="text" 
                            className="flex-1 border rounded p-2" 
                            placeholder="e.g. Class IX"
                            value={newClassInput}
                            onChange={(e) => setNewClassInput(e.target.value)}
                        />
                        <button 
                            onClick={handleAddClass}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                        >
                            Add
                        </button>
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {classList.map(cls => (
                            <div key={cls} className={`flex justify-between items-center p-3 rounded border cursor-pointer ${selectedCurriculumClass === cls ? 'bg-blue-100 border-blue-400' : 'bg-white'}`} onClick={() => setSelectedCurriculumClass(cls)}>
                                <span className="font-medium">{cls}</span>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteClass(cls); }} className="text-red-400 hover:text-red-600">
                                    <i className="fas fa-trash"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Manage Subjects */}
                <div className="border rounded-lg p-6 bg-gray-50">
                    <h3 className="font-bold text-lg text-gray-800 mb-4 border-b pb-2">
                        Manage Subjects {selectedCurriculumClass ? `for ${selectedCurriculumClass}` : ''}
                    </h3>
                    {!selectedCurriculumClass ? (
                        <div className="text-center text-gray-500 py-10">Select a Class from the left to manage subjects.</div>
                    ) : (
                        <>
                            <div className="flex gap-2 mb-4">
                                <input 
                                    type="text" 
                                    className="flex-1 border rounded p-2" 
                                    placeholder="e.g. Mathematics"
                                    value={newSubjectInput}
                                    onChange={(e) => setNewSubjectInput(e.target.value)}
                                />
                                <button 
                                    onClick={handleAddSubject}
                                    className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
                                >
                                    Add
                                </button>
                            </div>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {curriculumConfig[selectedCurriculumClass]?.map(sub => (
                                    <div key={sub} className="flex justify-between items-center p-3 rounded border bg-white">
                                        <span>{sub}</span>
                                        <button onClick={() => handleDeleteSubject(sub)} className="text-red-400 hover:text-red-600">
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                ))}
                                {(!curriculumConfig[selectedCurriculumClass] || curriculumConfig[selectedCurriculumClass].length === 0) && (
                                    <p className="text-gray-400 text-sm text-center">No subjects added yet.</p>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Manage Question Types */}
                <div className="border rounded-lg p-6 bg-gray-50">
                    <h3 className="font-bold text-lg text-gray-800 mb-4 border-b pb-2">Question Types</h3>
                    <div className="flex gap-2 mb-4">
                        <input 
                            type="text" 
                            className="flex-1 border rounded p-2" 
                            placeholder="e.g. Case Study"
                            value={newQTypeInput}
                            onChange={(e) => setNewQTypeInput(e.target.value)}
                        />
                        <button 
                            onClick={handleAddQType}
                            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                        >
                            Add
                        </button>
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {questionTypes.map(type => (
                            <div key={type} className="flex justify-between items-center p-3 rounded border bg-white">
                                <span>{type}</span>
                                <button onClick={() => handleDeleteQType(type)} className="text-red-400 hover:text-red-600">
                                    <i className="fas fa-trash"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'content' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-1 space-y-2">
                    <h3 className="font-bold text-gray-700 mb-2">Select Page</h3>
                    {contentPages.map(page => (
                        <button 
                            key={page.id}
                            onClick={() => setSelectedPageId(page.id)}
                            className={`w-full text-left p-3 rounded border transition-colors ${selectedPageId === page.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}
                        >
                            {page.title}
                        </button>
                    ))}
                </div>
                <div className="lg:col-span-3">
                    <div className="mb-4">
                        <label className="block text-sm font-bold text-gray-700 mb-1">Page Title</label>
                        <input 
                            type="text" 
                            className="w-full border rounded p-2 font-bold"
                            value={pageTitle}
                            onChange={(e) => setPageTitle(e.target.value)}
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-sm font-bold text-gray-700 mb-1">Content</label>
                        <textarea 
                            className="w-full h-80 p-4 border rounded bg-white"
                            value={pageContent}
                            onChange={(e) => setPageContent(e.target.value)}
                        />
                        <p className="text-xs text-gray-500 mt-1">Basic text formatting is supported. Use new lines for paragraphs.</p>
                    </div>
                    <div className="flex justify-end">
                        <button 
                            onClick={handleSaveContent}
                            className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 flex items-center gap-2"
                        >
                            <i className="fas fa-save"></i> Save Page Content
                        </button>
                    </div>
                </div>
            </div>
        )}

      </div>
      
      {/* Create User Modal - Updated Mobile Responsiveness */}
      {creatingUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[95vh]">
             <div className="bg-green-700 p-4 text-white flex justify-between items-center shrink-0">
               <h3 className="text-lg sm:text-xl font-bold">Create New User</h3>
               <button onClick={() => setCreatingUser(null)} className="text-green-200 hover:text-white p-2">
                 <i className="fas fa-times"></i>
               </button>
             </div>
             
             <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Name</label>
                    <input 
                      type="text" 
                      className="w-full border rounded p-2"
                      value={creatingUser.name}
                      onChange={(e) => setCreatingUser({...creatingUser, name: e.target.value})}
                      placeholder="Full Name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Role</label>
                    <select 
                      className="w-full border rounded p-2"
                      value={creatingUser.role}
                      onChange={(e) => setCreatingUser({...creatingUser, role: e.target.value as UserRole})}
                    >
                       <option value={UserRole.TEACHER}>TEACHER</option>
                       <option value={UserRole.ADMIN}>ADMIN</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-1">School Name</label>
                    <input 
                      type="text" 
                      className="w-full border rounded p-2"
                      value={creatingUser.schoolName}
                      onChange={(e) => setCreatingUser({...creatingUser, schoolName: e.target.value})}
                      placeholder="School Name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                    <input 
                      type="email" 
                      className="w-full border rounded p-2"
                      value={creatingUser.email}
                      onChange={(e) => setCreatingUser({...creatingUser, email: e.target.value})}
                      placeholder="user@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
                    <input 
                      type="text" 
                      className="w-full border rounded p-2 font-mono text-sm"
                      value={creatingUser.password || ''}
                      onChange={(e) => setCreatingUser({...creatingUser, password: e.target.value})}
                      placeholder="Initial Password"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Mobile</label>
                    <input 
                      type="text" 
                      className="w-full border rounded p-2"
                      value={creatingUser.mobile}
                      onChange={(e) => setCreatingUser({...creatingUser, mobile: e.target.value})}
                      placeholder="Mobile Number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">City</label>
                    <input 
                      type="text" 
                      className="w-full border rounded p-2"
                      value={creatingUser.city}
                      onChange={(e) => setCreatingUser({...creatingUser, city: e.target.value})}
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">State</label>
                    <input 
                      type="text" 
                      className="w-full border rounded p-2"
                      value={creatingUser.state}
                      onChange={(e) => setCreatingUser({...creatingUser, state: e.target.value})}
                      placeholder="State"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Credits</label>
                    <input 
                      type="number" 
                      className="w-full border rounded p-2"
                      value={creatingUser.credits}
                      onChange={(e) => setCreatingUser({...creatingUser, credits: parseInt(e.target.value) || 0})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Subscription Plan</label>
                    <select 
                      className="w-full border rounded p-2"
                      value={creatingUser.subscriptionPlan}
                      onChange={(e) => setCreatingUser({...creatingUser, subscriptionPlan: e.target.value as SubscriptionPlan})}
                    >
                       <option value={SubscriptionPlan.FREE}>FREE</option>
                       <option value={SubscriptionPlan.STARTER}>STARTER</option>
                       <option value={SubscriptionPlan.PROFESSIONAL}>PROFESSIONAL</option>
                       <option value={SubscriptionPlan.PREMIUM}>PREMIUM</option>
                    </select>
                  </div>
               </div>
             </div>

             <div className="p-4 bg-gray-50 border-t flex justify-end gap-3 shrink-0">
                <button 
                  onClick={() => setCreatingUser(null)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  onClick={saveNewUser}
                  className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow"
                >
                  Create User
                </button>
             </div>
          </div>
        </div>
      )}

      {editingUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[95vh]">
             <div className="bg-purple-800 p-4 text-white flex justify-between items-center shrink-0">
               <h3 className="text-lg sm:text-xl font-bold">Edit User Details</h3>
               <button onClick={() => setEditingUser(null)} className="text-purple-200 hover:text-white p-2">
                 <i className="fas fa-times"></i>
               </button>
             </div>
             
             <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Name</label>
                    <input 
                      type="text" 
                      className="w-full border rounded p-2"
                      value={editingUser.name}
                      onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Role</label>
                    <select 
                      className="w-full border rounded p-2"
                      value={editingUser.role}
                      onChange={(e) => setEditingUser({...editingUser, role: e.target.value as UserRole})}
                    >
                       <option value={UserRole.TEACHER}>TEACHER</option>
                       <option value={UserRole.ADMIN}>ADMIN</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-1">School Name</label>
                    <input 
                      type="text" 
                      className="w-full border rounded p-2"
                      value={editingUser.schoolName || ''}
                      onChange={(e) => setEditingUser({...editingUser, schoolName: e.target.value})}
                      placeholder="School Name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                    <input 
                      type="email" 
                      className="w-full border rounded p-2"
                      value={editingUser.email}
                      onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
                    <input 
                      type="text" 
                      className="w-full border rounded p-2 font-mono text-sm"
                      value={editingUser.password || ''}
                      onChange={(e) => setEditingUser({...editingUser, password: e.target.value})}
                      placeholder="Set password"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Mobile</label>
                    <input 
                      type="text" 
                      className="w-full border rounded p-2"
                      value={editingUser.mobile || ''}
                      onChange={(e) => setEditingUser({...editingUser, mobile: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">City</label>
                    <input 
                      type="text" 
                      className="w-full border rounded p-2"
                      value={editingUser.city || ''}
                      onChange={(e) => setEditingUser({...editingUser, city: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">State</label>
                    <input 
                      type="text" 
                      className="w-full border rounded p-2"
                      value={editingUser.state || ''}
                      onChange={(e) => setEditingUser({...editingUser, state: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Credits</label>
                    <input 
                      type="number" 
                      className="w-full border rounded p-2"
                      value={editingUser.credits}
                      onChange={(e) => setEditingUser({...editingUser, credits: parseInt(e.target.value) || 0})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Subscription Plan</label>
                    <select 
                      className="w-full border rounded p-2"
                      value={editingUser.subscriptionPlan}
                      onChange={(e) => setEditingUser({...editingUser, subscriptionPlan: e.target.value as SubscriptionPlan})}
                    >
                       <option value={SubscriptionPlan.FREE}>FREE</option>
                       <option value={SubscriptionPlan.STARTER}>STARTER</option>
                       <option value={SubscriptionPlan.PROFESSIONAL}>PROFESSIONAL</option>
                       <option value={SubscriptionPlan.PREMIUM}>PREMIUM</option>
                    </select>
                  </div>
               </div>
             </div>

             <div className="p-4 bg-gray-50 border-t flex justify-end gap-3 shrink-0">
                <button 
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  onClick={saveUserChanges}
                  className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 shadow"
                >
                  Save Changes
                </button>
             </div>
          </div>
        </div>
      )}
      
      {paperToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                    <i className="fas fa-trash-alt text-2xl"></i>
                </div>
                <h3 className="text-xl font-bold mb-2">Delete Paper?</h3>
                <p className="text-gray-600 mb-6 text-sm">Where do you want to delete <br/><strong>"{paperToDelete.title}"</strong> from?</p>
                
                <div className="space-y-3">
                    <button 
                        onClick={() => confirmDeletePaper('ADMIN')}
                        className="w-full py-3 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium transition-colors"
                    >
                        Delete from Admin Panel Only
                    </button>
                    <button 
                        onClick={() => confirmDeletePaper('TEACHER')}
                        className="w-full py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors"
                    >
                        Delete from Teacher's Account
                    </button>
                    <button 
                        onClick={() => setPaperToDelete(null)}
                        className="w-full py-2 text-gray-400 hover:text-gray-600 text-sm"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
