
import React, { useState, useEffect } from 'react';
import { User, QuestionPaper, SubscriptionPlan, SubscriptionStatus, UserRole, ContentPage } from '../types';
import { StorageService } from '../services/storageService';
import PaperGenerator from './PaperGenerator';
import SubscriptionModal from './SubscriptionModal';
import { APP_NAME, MOCK_ADMIN_EMAIL } from '../constants';

interface Props {
  user: User;
  onLogout: () => void;
}

const TeacherDashboard: React.FC<Props> = ({ user, onLogout }) => {
  const [view, setView] = useState<'dashboard' | 'create'>('dashboard');
  const [papers, setPapers] = useState<QuestionPaper[]>([]);
  const [showSubModal, setShowSubModal] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [selectedPaper, setSelectedPaper] = useState<QuestionPaper | null>(null);
  
  // Folder View State
  const [isFolderOpen, setIsFolderOpen] = useState(false);

  // Content Modal State
  const [viewingPage, setViewingPage] = useState<ContentPage | null>(null);
  
  // Contact Form State
  const [contactMessage, setContactMessage] = useState('');

  const refreshUserData = async () => {
    try {
        const freshUser = await StorageService.getUser(user.email);
        if(freshUser) {
            setCurrentUser(freshUser);
            // Auto-downgrade check
            if (freshUser.subscriptionExpiryDate && freshUser.subscriptionPlan !== SubscriptionPlan.FREE && freshUser.role !== UserRole.ADMIN) {
                if (new Date(freshUser.subscriptionExpiryDate) < new Date()) {
                    await StorageService.updateUser({ ...freshUser, subscriptionPlan: SubscriptionPlan.FREE });
                    const downgradedUser = await StorageService.getUser(user.email);
                    if (downgradedUser) setCurrentUser(downgradedUser);
                }
            }
        }
        
        const userPapers = await StorageService.getPapersByUser(user.email);
        setPapers(userPapers);
    } catch (e) {
        console.error("Failed to refresh user data", e);
    }
  };

  useEffect(() => {
    refreshUserData();
  }, [view, selectedPaper]);

  const handlePaperCreated = () => {
    setView('dashboard');
    setSelectedPaper(null);
    refreshUserData();
  };

  const handleCloseGenerator = () => {
      setSelectedPaper(null);
      setView('dashboard');
      refreshUserData();
  };

  const handleDeletePaper = async (paperId: string, e: React.MouseEvent) => {
    e.stopPropagation(); 
    if(window.confirm("Are you sure you want to delete this paper?")) {
        await StorageService.deletePaper(paperId, 'TEACHER');
        refreshUserData();
    }
  };

  const handleShowPage = async (pageId: string) => {
      const page = await StorageService.getPageContent(pageId);
      if (page) {
          setViewingPage(page);
          setContactMessage(''); // Reset form
      }
  };
  
  const handleContactSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!contactMessage.trim()) return alert("Please enter a message.");
      
      // Simulate sending to Admin Email
      console.log(`[System] Sending Support Email to ADMIN (${MOCK_ADMIN_EMAIL})`);
      console.log(`[System] From: ${currentUser.email} (${currentUser.name})`);
      console.log(`[System] Message: ${contactMessage}`);
      
      alert("Your message has been sent successfully to our support team!");
      setContactMessage('');
      setViewingPage(null);
  };
  
  const isUpgradePending = currentUser.subscriptionStatus === SubscriptionStatus.PENDING;
  const hasCredits = currentUser.credits > 0;
  const isCreateBlockedByPending = !hasCredits && isUpgradePending;

  const getPaperAction = (p: QuestionPaper) => {
    const plan = currentUser.subscriptionPlan;
    const isAdmin = currentUser.role === UserRole.ADMIN;

    if (isAdmin || plan === SubscriptionPlan.PREMIUM) {
        return { label: 'Edit', readOnly: false };
    }

    if (plan === SubscriptionPlan.FREE || plan === SubscriptionPlan.STARTER || plan === SubscriptionPlan.PROFESSIONAL) {
        if ((p.downloadCount || 0) >= 1) {
            return { label: 'View', readOnly: true };
        }
        return { label: 'Edit', readOnly: false };
    }

    return { label: 'View', readOnly: true };
  };

  if (selectedPaper) {
      const { readOnly } = getPaperAction(selectedPaper);
      return (
          <PaperGenerator 
              userEmail={currentUser.email}
              existingPaper={selectedPaper}
              readOnly={readOnly}
              onClose={handleCloseGenerator} 
              onSuccess={handlePaperCreated} 
          />
      );
  }

  if (view === 'create') {
    if (currentUser.credits <= 0 && currentUser.role !== UserRole.ADMIN) { 
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
           <div className="bg-white p-8 rounded-xl max-w-md text-center shadow-2xl w-full">
              <i className="fas fa-lock text-4xl text-red-500 mb-4"></i>
              <h2 className="text-2xl font-bold mb-2">No Credits Left</h2>
              <p className="text-gray-600 mb-6">Upgrade to continue creating papers.</p>
              <button onClick={() => { setView('dashboard'); setShowSubModal(true); }} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">Upgrade Now</button>
              <button onClick={() => setView('dashboard')} className="block mt-4 text-gray-400 hover:text-gray-600 w-full">Cancel</button>
           </div>
        </div>
      );
    }
    return <PaperGenerator userEmail={currentUser.email} onClose={handleCloseGenerator} onSuccess={handlePaperCreated} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b shadow-sm px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 sticky top-0 z-20">
        <div className="flex items-center gap-3 w-full sm:w-auto">
           <div className="w-10 h-10 bg-blue-800 rounded-lg flex items-center justify-center text-white text-xs font-black border-2 border-blue-600">RKS</div>
           <div><h1 className="text-xl font-bold text-gray-800">{APP_NAME}</h1></div>
        </div>
        <div className="flex items-center gap-4">
           <div className="text-right">
               <div className="text-sm font-bold">{currentUser.name}</div>
               <div className="text-xs text-gray-500">{currentUser.subscriptionPlan} Plan</div>
               {currentUser.subscriptionExpiryDate && currentUser.subscriptionPlan !== SubscriptionPlan.FREE && (
                   <div className="text-[10px] text-green-600 font-bold">
                       Valid till: {new Date(currentUser.subscriptionExpiryDate).toLocaleDateString()}
                   </div>
               )}
           </div>
           <button onClick={onLogout} className="text-red-400 hover:text-red-500"><i className="fas fa-sign-out-alt fa-lg"></i></button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-8 flex-1 w-full">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white flex justify-between items-center shadow-lg">
           <div><h2 className="text-2xl font-bold">Welcome back!</h2><p className="text-blue-100">Manage your papers.</p></div>
           <div className="bg-white/10 p-4 rounded-xl text-center"><div className="text-xs uppercase">Credits</div><div className="text-4xl font-bold">{currentUser.credits}</div><button onClick={() => setShowSubModal(true)} className="text-xs bg-white text-blue-700 px-3 py-1 rounded-full font-bold mt-2">Upgrade</button></div>
        </div>
        
        <div className="flex justify-end items-center">
          <button disabled={isCreateBlockedByPending} onClick={() => setView('create')} className={`px-6 py-3 rounded-lg font-bold shadow-md transition-all ${isCreateBlockedByPending ? 'bg-gray-400 cursor-not-allowed text-gray-100' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
              <i className="fas fa-plus mr-2"></i>
              {isCreateBlockedByPending ? 'Request Sent for Approval' : 'Create New Paper'}
          </button>
        </div>

        <div className="space-y-4">
             {!isFolderOpen ? (
                 <div 
                    onClick={() => setIsFolderOpen(true)}
                    className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col items-center justify-center cursor-pointer hover:shadow-md transition-all group w-full sm:w-64"
                 >
                     <i className="fas fa-folder text-6xl text-yellow-400 mb-4 group-hover:scale-110 transition-transform"></i>
                     <h3 className="text-xl font-bold text-gray-800 group-hover:text-blue-600">Saved Papers</h3>
                     <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold mt-2">{papers.length} Files</span>
                 </div>
             ) : (
                 <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
                    <div className="bg-gray-50 border-b p-4 flex items-center justify-between sticky top-0 z-10">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setIsFolderOpen(false)} className="text-gray-500 hover:text-gray-700 mr-2">
                                <i className="fas fa-arrow-left"></i> Back
                            </button>
                            <div className="bg-yellow-100 p-2 rounded-lg text-yellow-600">
                                <i className="fas fa-folder-open text-xl"></i>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">Saved Papers</h3>
                                <p className="text-xs text-gray-500">{papers.length} files stored</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {papers.map(p => {
                            const action = getPaperAction(p);
                            return (
                            <div key={p.id} className="bg-white rounded-xl border p-6 flex flex-col h-full hover:shadow-lg transition-shadow group cursor-pointer" onClick={() => setSelectedPaper(p)}>
                                <div className="flex items-start justify-between mb-2">
                                    <div className="bg-blue-50 text-blue-600 w-10 h-10 rounded-lg flex items-center justify-center">
                                        <i className="fas fa-file-alt"></i>
                                    </div>
                                    {p.downloadCount && p.downloadCount > 0 ? (
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">Downloaded</span>
                                    ) : (
                                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-bold">Draft</span>
                                    )}
                                </div>
                                <h4 className="font-bold text-lg mb-1 line-clamp-1 group-hover:text-blue-600 transition-colors">{p.title}</h4>
                                <p className="text-sm text-gray-500 mb-4">{p.classNum} • {p.subject}</p>
                                <div className="mt-auto flex gap-2 pt-4 border-t border-dashed">
                                    <button 
                                        className={`flex-1 py-2 ${action.readOnly ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'} rounded-lg font-bold text-sm transition-colors`}
                                    >
                                        <i className={`fas ${action.readOnly ? 'fa-eye' : 'fa-edit'} mr-1`}></i>
                                        {action.label}
                                    </button>
                                    <button 
                                        onClick={(e) => handleDeletePaper(p.id, e)} 
                                        className="px-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors z-20 relative" 
                                        title="Delete Paper"
                                    >
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            )})}
                            {papers.length === 0 && (
                                <div className="col-span-3 py-12 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed rounded-xl">
                                    <i className="fas fa-folder-open text-4xl mb-3 opacity-30"></i>
                                    <p>No papers saved yet.</p>
                                    <button onClick={() => setView('create')} className="text-blue-500 hover:underline mt-2 text-sm">Create your first paper</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
             )}
        </div>
      </main>

      {/* Footer Content Links */}
      <footer className="bg-white border-t py-6 mt-8">
          <div className="max-w-7xl mx-auto px-6 text-center">
              <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-600 font-medium mb-4">
                  <button onClick={() => handleShowPage('about')} className="hover:text-blue-600 transition-colors">About Us</button>
                  <button onClick={() => handleShowPage('plans')} className="hover:text-blue-600 transition-colors">Subscription Plans</button>
                  <button onClick={() => handleShowPage('policy')} className="hover:text-blue-600 transition-colors">Payment & Refund Policy</button>
                  <button onClick={() => handleShowPage('contact')} className="hover:text-blue-600 transition-colors">Contact Us</button>
              </div>
              <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
          </div>
      </footer>

      {showSubModal && <SubscriptionModal user={currentUser} onClose={() => setShowSubModal(false)} onSuccess={() => refreshUserData()} />}
      
      {/* Content Page Modal */}
      {viewingPage && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden">
                  <div className="bg-gray-100 p-4 border-b flex justify-between items-center">
                      <h2 className="text-xl font-bold text-gray-800">{viewingPage.title}</h2>
                      <button onClick={() => setViewingPage(null)} className="text-gray-500 hover:text-red-500 p-2"><i className="fas fa-times"></i></button>
                  </div>
                  
                  {viewingPage.id === 'contact' ? (
                      <div className="p-6 overflow-y-auto">
                          <p className="text-gray-700 mb-4 whitespace-pre-wrap">{viewingPage.content}</p>
                          <form onSubmit={handleContactSubmit} className="space-y-4">
                              <div>
                                  <label className="block text-sm font-bold text-gray-700 mb-2">Describe your issue or query</label>
                                  <textarea 
                                      className="w-full border rounded-lg p-3 h-32 focus:ring-2 focus:ring-blue-500 outline-none"
                                      placeholder="Type your message here..."
                                      value={contactMessage}
                                      onChange={(e) => setContactMessage(e.target.value)}
                                      required
                                  ></textarea>
                              </div>
                              <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow">
                                  Send Message <i className="fas fa-paper-plane ml-2"></i>
                              </button>
                          </form>
                      </div>
                  ) : (
                      <div className="p-6 overflow-y-auto whitespace-pre-wrap leading-relaxed text-gray-700">
                          {viewingPage.content}
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
