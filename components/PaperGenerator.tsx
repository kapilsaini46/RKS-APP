
import React, { useState, useEffect, useRef } from 'react';
import { QuestionPaper, Section, Question, QuestionType, UserRole, BlueprintItem, SubscriptionPlan } from '../types';
import { QUESTION_TYPES } from '../constants';
import { generateQuestionsWithAI, generateImageForQuestion } from '../services/geminiService';
import { StorageService } from '../services/storageService';

interface Props {
  userEmail: string;
  existingPaper?: QuestionPaper;
  onClose: () => void;
  onSuccess: () => void;
  readOnly?: boolean;
  autoDownload?: 'paper' | 'key';
}

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

const cleanOptionText = (text: string): string => {
  if (!text) return "";
  return text.replace(/^(\([a-zA-Z0-9]+\)|[a-zA-Z0-9]+[.):]\s*)+/, '').trim();
};

const MathText: React.FC<{ text: string }> = ({ text }) => {
  const [parts, setParts] = useState<React.ReactNode[]>([]);
  const [katexLoaded, setKatexLoaded] = useState(false);

  useEffect(() => {
    // @ts-ignore
    if (typeof window.katex !== 'undefined') {
        setKatexLoaded(true);
        return;
    }
    const interval = setInterval(() => {
        // @ts-ignore
        if (typeof window.katex !== 'undefined') {
            setKatexLoaded(true);
            clearInterval(interval);
        }
    }, 100); 
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!text) { setParts([]); return; }
    if (!katexLoaded) { setParts([<span key="loading" className="opacity-75 font-mono text-sm">{text}</span>]); return; }
    
    const segments = text.split(/(\$[^$]+\$)/g);
    const renderedParts = segments.map((part, index) => {
        if (part.startsWith('$') && part.endsWith('$')) {
            const math = part.slice(1, -1); 
            try {
                // @ts-ignore
                const html = window.katex.renderToString(math, { throwOnError: false, output: 'html' });
                return <span key={index} dangerouslySetInnerHTML={{__html: html}} />;
            } catch (e) {
                return <span key={index} className="text-red-500 font-mono text-xs">{part}</span>;
            }
        } else {
            return <span key={index}>{part}</span>;
        }
    });
    setParts(renderedParts);
  }, [text, katexLoaded]);

  return <span className="math-content inline-block max-w-full break-words">{parts.length > 0 ? parts : text}</span>;
};

const ResizableImage: React.FC<{ 
  src: string; initialWidth?: number; onResize: (width: number) => void; onRemove: () => void; readOnly?: boolean;
}> = ({ src, initialWidth = 50, onResize, onRemove, readOnly }) => {
  const [width, setWidth] = useState(initialWidth);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => { setWidth(initialWidth); }, [initialWidth]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = containerRef.current?.offsetWidth || 0;
    const parentWidth = containerRef.current?.parentElement?.offsetWidth || 1;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      const deltaX = moveEvent.clientX - startX;
      const newPixelWidth = startWidth + deltaX;
      const newPercent = Math.min(100, Math.max(10, (newPixelWidth / parentWidth) * 100));
      setWidth(newPercent);
    };
    
    const handleMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      onResize(width); 
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div ref={containerRef} className={`relative inline-block group/img ${readOnly ? '' : 'cursor-default'}`} style={{ width: `${width}%`, minWidth: '100px', maxWidth: '100%' }}>
      <img src={src} alt="Diagram" className="w-full h-auto border rounded-lg bg-white p-1 shadow-sm select-none pointer-events-none" />
      {!readOnly && (
        <>
          <button onClick={onRemove} className="absolute -top-2 -right-2 bg-white text-red-500 border border-red-100 w-8 h-8 rounded-full shadow-md flex items-center justify-center hover:bg-red-50 z-10"><i className="fas fa-times"></i></button>
          <div onMouseDown={handleMouseDown} className="absolute bottom-0 right-0 w-6 h-6 bg-blue-500 rounded-tl-lg cursor-nwse-resize flex items-center justify-center shadow-md hover:bg-blue-600 transition-colors z-10"><i className="fas fa-expand-alt text-white text-[10px]"></i></div>
        </>
      )}
    </div>
  );
};

const PaperGenerator: React.FC<Props> = ({ userEmail, existingPaper: propExistingPaper, onClose, onSuccess, readOnly: propReadOnly, autoDownload }) => {
  const [internalExistingPaper, setInternalExistingPaper] = useState<QuestionPaper | undefined>(propExistingPaper);
  
  // Need to fetch user profile for roles/subscriptions
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [step, setStep] = useState(internalExistingPaper ? 3 : 1);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<'paper' | 'key'>('paper');
  const [generatingImageId, setGeneratingImageId] = useState<string | null>(null);
  const [regeneratingQuestionId, setRegeneratingQuestionId] = useState<string | null>(null);
  
  const [downloadedFiles, setDownloadedFiles] = useState<{paper: boolean, key: boolean}>({
      paper: false, 
      key: false
  });
  
  const [curriculumConfig, setCurriculumConfig] = useState<Record<string, string[]>>({});
  const [classList, setClassList] = useState<string[]>([]);
  const [availableQTypes, setAvailableQTypes] = useState<string[]>([]);
  
  const [meta, setMeta] = useState(internalExistingPaper ? {
    title: internalExistingPaper.title,
    schoolName: internalExistingPaper.schoolName,
    classNum: internalExistingPaper.classNum,
    subject: internalExistingPaper.subject,
    session: internalExistingPaper.session || '2024-25',
    duration: internalExistingPaper.duration,
    maxMarks: internalExistingPaper.maxMarks,
    generalInstructions: internalExistingPaper.generalInstructions || ''
  } : {
    title: 'Half Yearly Examination',
    schoolName: 'Kendriya Vidyalaya', // Default, will update on useEffect
    classNum: '',
    subject: '',
    session: '2024-25',
    duration: '3 Hours',
    maxMarks: 80,
    generalInstructions: '1. All questions are compulsory.\n2. The question paper consists of ...'
  });

  useEffect(() => {
      const loadInitialData = async () => {
        const u = await StorageService.getUser(userEmail);
        setUserProfile(u);
        setIsAdmin(u?.role === UserRole.ADMIN);

        const config = await StorageService.getConfig();
        setCurriculumConfig(config);
        const classes = Object.keys(config);
        setClassList(classes);
        
        if (!internalExistingPaper && classes.length > 0 && !meta.classNum) {
            setMeta(prev => ({ ...prev, classNum: classes[0], subject: config[classes[0]]?.[0] || '' }));
        }

        const qTypes = await StorageService.getQuestionTypes();
        setAvailableQTypes(qTypes);
      };
      loadInitialData();
  }, [userEmail]);

  // Sync School Name from profile if generating new paper
  useEffect(() => {
    if (userProfile?.schoolName && !internalExistingPaper) {
        setMeta(prev => ({ ...prev, schoolName: userProfile.schoolName }));
    }
  }, [userProfile, internalExistingPaper]);
  
  // Derived state from userProfile
  const isProfessional = userProfile?.subscriptionPlan === SubscriptionPlan.PROFESSIONAL;
  const isFree = userProfile?.subscriptionPlan === SubscriptionPlan.FREE;
  const isStarter = userProfile?.subscriptionPlan === SubscriptionPlan.STARTER;
  
  const readOnly = (!(!propExistingPaper) && propReadOnly && !isAdmin);

  const isHindiPaper = meta.subject === 'Hindi';

  useEffect(() => {
      if (autoDownload) {
          const timer = setTimeout(() => {
              handleDownloadPDF(autoDownload);
          }, 1500);
          return () => clearTimeout(timer);
      }
  }, [autoDownload]);

  useEffect(() => {
    if (meta.classNum && curriculumConfig[meta.classNum]) {
        const subjects = curriculumConfig[meta.classNum];
        if (!subjects.includes(meta.subject) && subjects.length > 0) {
            setMeta(prev => ({ ...prev, subject: subjects[0] }));
        }
    }
  }, [meta.classNum, curriculumConfig]);

  useEffect(() => {
    if (isHindiPaper) {
        setMeta(prev => ({
            ...prev,
            duration: prev.duration === '3 Hours' ? '3 घंटे' : prev.duration,
            generalInstructions: prev.generalInstructions.includes('All questions') 
                ? '1. सभी प्रश्न अनिवार्य हैं।\n2. प्रश्न पत्र में सभी खंडों के उत्तर देना अनिवार्य है।' 
                : prev.generalInstructions
        }));
    }
  }, [isHindiPaper]);


  const [blueprint, setBlueprint] = useState<BlueprintItem[]>([]);
  const [topic, setTopic] = useState('');
  const [qType, setQType] = useState<any>(QuestionType.MCQ);
  const [count, setCount] = useState(5);
  const [marksPerQ, setMarksPerQ] = useState(1);
  const [sections, setSections] = useState<Section[]>(internalExistingPaper?.sections || []);
  const [activeSectionId, setActiveSectionId] = useState<string>(internalExistingPaper?.sections[0]?.id || '');
  const [loadingAI, setLoadingAI] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  
  const handleClose = () => { onClose(); };
  const calculateTotalMarks = () => Number(sections.reduce((acc, s) => acc + s.totalMarks, 0).toFixed(2));

  const getGridClass = (options?: string[]) => {
    if (!options || options.length === 0) return 'grid-cols-1';
    const maxLength = Math.max(...options.map(o => cleanOptionText(o).length));
    const hasLatex = options.some(o => o.includes('$'));
    const singleLineThreshold = hasLatex ? 45 : 25;
    const twoColThreshold = hasLatex ? 80 : 45;
    if (maxLength < singleLineThreshold) return 'grid-cols-4';
    if (maxLength < twoColThreshold) return 'grid-cols-2';
    return 'grid-cols-1';
  };

  const handleAddToBlueprint = () => {
    const newItem: BlueprintItem = { id: generateId(), topic, type: qType, count, marks: marksPerQ };
    setBlueprint([...blueprint, newItem]);
    setCount(5);
  };
  const handleRemoveBlueprintItem = (id: string) => { setBlueprint(blueprint.filter(i => i.id !== id)); };

  const getHindiSectionLabel = (idx: number) => {
      const letters = ['अ', 'ब', 'स', 'द', 'इ', 'फ'];
      return letters[idx] || String.fromCharCode(65 + idx);
  };

  const handleGenerateFullPaper = async () => {
    if (blueprint.length === 0) return alert("Please add items to the blueprint first.");
    
    // Check Credits (using fresh user object if possible, but state is okay for this pass)
    if (!isAdmin && userProfile && userProfile.credits <= 0) {
        return alert("Insufficient credits! You need credits to generate a new paper. Please upgrade.");
    }

    setLoadingAI(true);
    setGenerationStatus("Initializing...");
    try {
      const styleContext = await StorageService.getStyleContext(meta.classNum, meta.subject);
      const generatedSections: Section[] = [];
      for (let i = 0; i < blueprint.length; i++) {
        const item = blueprint[i];
        
        let sectionLabel;
        let sectionTitle;
        
        if (isHindiPaper) {
             const label = getHindiSectionLabel(i);
             sectionLabel = label;
             sectionTitle = `खंड ${label}`;
        } else {
             const label = String.fromCharCode(65 + i);
             sectionLabel = label;
             sectionTitle = `SECTION ${label}`;
        }
        
        setGenerationStatus(`Generating Section ${sectionLabel}: ${item.count} ${item.type} questions for ${item.topic}...`);
        const generatedQs = await generateQuestionsWithAI(meta.classNum, meta.subject, item.topic, item.type, item.count, item.marks, styleContext);
        generatedSections.push({
            id: generateId(), title: sectionTitle, questions: generatedQs,
            totalMarks: Number(generatedQs.reduce((sum, q) => sum + q.marks, 0).toFixed(2))
        });
      }
      
      // Deduct credit
      if (!isAdmin && userProfile) {
          const updatedUser = { ...userProfile, credits: userProfile.credits - 1 };
          await StorageService.updateUser(updatedUser);
          setUserProfile(updatedUser); // Update local state
      }

      setSections(generatedSections);
      if (generatedSections.length > 0) setActiveSectionId(generatedSections[0].id);
      setStep(3); 
    } catch (e: any) { 
        console.error(e);
        alert(`Error generating paper: ${e.message || "Unknown error"}`);
    } finally { 
        setLoadingAI(false); 
        setGenerationStatus(""); 
    }
  };

  const handleRegenerateQuestion = async (sectionId: string, question: Question) => {
      let maxRegenerations = 0;
      if (isStarter) maxRegenerations = 1;
      else if (isProfessional) maxRegenerations = 2;
      else if (userProfile?.subscriptionPlan === SubscriptionPlan.PREMIUM || isAdmin) maxRegenerations = 3;
      else if (isFree) maxRegenerations = 1;

      const currentRegenCount = (question as any).regenerateCount || 0;
      
      if (currentRegenCount >= maxRegenerations) {
          return alert(`Limit Reached: You can regenerate a question ${maxRegenerations} time(s) on your current plan.`);
      }

      setRegeneratingQuestionId(question.id);
      try {
          const styleContext = await StorageService.getStyleContext(meta.classNum, meta.subject);
          const newQuestions = await generateQuestionsWithAI(meta.classNum, meta.subject, question.topic, question.type, 1, question.marks, styleContext);
          
          if (newQuestions.length > 0) {
              const newQ = { 
                  ...newQuestions[0], 
                  id: question.id, 
                  regenerateCount: currentRegenCount + 1
              }; 
              setSections(prev => prev.map(s => {
                  if (s.id !== sectionId) return s;
                  return {
                      ...s,
                      questions: s.questions.map(q => q.id === question.id ? newQ : q)
                  };
              }));
          }
      } catch (e: any) {
          alert(`Failed to regenerate question: ${e.message}`);
      } finally {
          setRegeneratingQuestionId(null);
      }
  };

  const handleDeleteSection = (secId: string) => {
      if (window.confirm("Delete this ENTIRE section?")) setSections(prev => prev.filter(s => s.id !== secId));
  };
  const handleAddQuestionToSection = (sectionId: string) => {
    const newQ: Question = { id: generateId(), type: QuestionType.SA, text: "New Question (Edit me)", marks: 2, topic: meta.subject };
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, questions: [...s.questions, newQ], totalMarks: Number((s.totalMarks + newQ.marks).toFixed(2)) } : s));
  };
  const handleUpdateSectionTitle = (sectionId: string, newTitle: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, title: newTitle } : s));
  };
  const handleUpdateQuestion = (sectionId: string, qId: string, field: keyof Question, value: any) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const updatedQs = s.questions.map(q => q.id === qId ? { ...q, [field]: value } : q);
      const newTotal = updatedQs.reduce((sum, q) => sum + q.marks, 0);
      return { ...s, questions: updatedQs, totalMarks: Number(newTotal.toFixed(2)) };
    }));
  };
  const handleDeleteQuestion = (sectionId: string, qId: string) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newQuestions = s.questions.filter(q => q.id !== qId);
      const newTotal = newQuestions.reduce((sum, q) => sum + q.marks, 0);
      return { ...s, questions: newQuestions, totalMarks: Number(newTotal.toFixed(2)) };
    }));
  };
  const handleGenerateImage = async (sectionId: string, qId: string, prompt: string) => {
    const section = sections.find(s => s.id === sectionId); if (!section) return;
    const question = section.questions.find(q => q.id === qId); if (!question) return;
    
    setGeneratingImageId(qId);
    try {
      const imgUrl = await generateImageForQuestion(prompt || question.text);
      setSections(prev => prev.map(s => {
          if (s.id !== sectionId) return s;
          return {
              ...s,
              questions: s.questions.map(q => q.id === qId ? { ...q, imageUrl: imgUrl, imageWidth: 50 } : q)
          };
      }));
    } catch (e) { 
        alert("Image generation failed. Please try again."); 
    } finally {
        setGeneratingImageId(null);
    }
  };
  const handleUploadImage = (sectionId: string, qId: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
          setSections(prev => prev.map(s => {
              if (s.id !== sectionId) return s;
              return {
                  ...s,
                  questions: s.questions.map(q => q.id === qId ? { ...q, imageUrl: reader.result as string, imageWidth: 50 } : q)
              };
          }));
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  const savePaperInternal = async (paper: QuestionPaper) => {
     await StorageService.savePaper(paper);
  };

  const handleSavePaper = async () => {
    if (readOnly) return; 
    
    if (!userProfile) return;

    // We no longer check credits here for creation, as they were paid at Blueprint step
    const newPaper: QuestionPaper = {
      id: internalExistingPaper ? internalExistingPaper.id : generateId(),
      ...meta,
      sections,
      createdAt: internalExistingPaper ? internalExistingPaper.createdAt : new Date().toISOString(),
      createdBy: internalExistingPaper ? internalExistingPaper.createdBy : userEmail,
      visibleToTeacher: internalExistingPaper ? internalExistingPaper.visibleToTeacher : true,
      visibleToAdmin: internalExistingPaper ? internalExistingPaper.visibleToAdmin : true,
      editCount: internalExistingPaper ? (internalExistingPaper.editCount || 0) + 1 : 0,
      downloadCount: internalExistingPaper ? (internalExistingPaper.downloadCount || 0) : 0
    };

    await savePaperInternal(newPaper);
    
    setInternalExistingPaper(newPaper); 
    alert("Paper saved successfully. You can continue editing or download PDF.");
  };

  const handleDownloadPDF = async (type: 'paper' | 'key' = 'paper') => {
    if (readOnly) return alert("Download not available in View-Only mode.");
    if (!userProfile) return;

    if (internalExistingPaper && userProfile.role !== UserRole.ADMIN && (
        userProfile.subscriptionPlan === SubscriptionPlan.PROFESSIONAL || 
        userProfile.subscriptionPlan === SubscriptionPlan.FREE ||
        userProfile.subscriptionPlan === SubscriptionPlan.STARTER
    )) {
        const currentCount = internalExistingPaper.downloadCount || 0;
        if (currentCount >= 1) {
            return alert("Subscription Plan Limit Reached: You have already used your 1 download for this paper.");
        }
    }

    const isEdit = !!internalExistingPaper;

    if (!isEdit) {
        // Saving new paper before download.
        const newPaper: QuestionPaper = {
          id: generateId(),
          ...meta,
          sections,
          createdAt: new Date().toISOString(),
          createdBy: userEmail,
          visibleToTeacher: true,
          visibleToAdmin: true,
          editCount: 0,
          downloadCount: 0
        };
        await savePaperInternal(newPaper);
        setInternalExistingPaper(newPaper); 
    } 

    const element = document.getElementById('print-area');
    if (!element) return;
    
    element.style.display = 'block';
    setPreviewMode(type);
    
    setTimeout(async () => {
        const sanitizedTitle = meta.title.replace(/[^a-zA-Z0-9-_]/g, '_');
        const filename = `${sanitizedTitle}_${meta.classNum}_${meta.subject}${type === 'key' ? '_AnswerKey' : ''}.pdf`;
        const opt = { 
            margin: 0, 
            filename: filename, 
            image: { type: 'jpeg', quality: 0.98 }, 
            html2canvas: { scale: 2, useCORS: true, x: 0, y: 0, scrollX: 0, scrollY: 0, windowWidth: 850, logging: false }, 
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } 
        };

        const cleanup = async () => {
            element.style.display = 'none';
            setIsGeneratingPdf(false);
            
            const currentPaperId = internalExistingPaper?.id;
            
            if (currentPaperId && !isAdmin && !autoDownload) {
                const userPapers = await StorageService.getPapersByUser(userEmail);
                const p = userPapers.find(p => p.id === currentPaperId);
                if (p) {
                    const updatedPaper = { ...p, downloadCount: (p.downloadCount || 0) + 1 };
                    await StorageService.savePaper(updatedPaper);
                }
            }

            if (autoDownload) {
                onClose();
                return;
            }

            if (type === 'key') {
                if (downloadedFiles.paper) {
                    onClose(); 
                } else {
                    setDownloadedFiles(prev => ({ ...prev, key: true })); 
                }
            } else {
                if (downloadedFiles.key) {
                    onClose(); 
                } else {
                    setDownloadedFiles(prev => ({ ...prev, paper: true })); 
                }
            }
        };

        // @ts-ignore
        if (window.html2pdf) {
            // @ts-ignore
            window.html2pdf().set(opt).from(element).save().then(cleanup).catch(cleanup);
        } else {
            window.print();
            cleanup();
        }
    }, 500); 
  };
  
  const renderHeader = () => (
      <div className="text-center mb-2 border-b-2 border-black pb-1">
        <h1 className="text-2xl font-bold uppercase mb-1 leading-tight">{meta.schoolName || (isHindiPaper ? 'विद्यालय का नाम' : 'SCHOOL NAME')}</h1>
        <h2 className="text-lg font-semibold uppercase mb-2">{meta.title || (isHindiPaper ? 'परीक्षा' : 'EXAMINATION')}</h2>
        <div className="font-bold text-sm border-t-2 border-black pt-1 uppercase w-full">
           <div className="text-center text-base mb-1">{isHindiPaper ? 'विषय' : 'SUBJECT'}: {isHindiPaper ? 'हिंदी' : meta.subject}</div>
           <div className="flex items-center w-full px-1">
               <div className="w-1/4 text-left">{isHindiPaper ? 'समय' : 'TIME'}: {meta.duration}</div>
               <div className="w-1/2 text-center"><span className="mr-6">{isHindiPaper ? 'कक्षा' : 'CLASS'}: {meta.classNum}</span><span>{isHindiPaper ? 'सत्र' : 'SESSION'}: {meta.session}</span></div>
               <div className="w-1/4 text-right">{isHindiPaper ? 'पूर्णांक' : 'MAX. MARKS'}: {calculateTotalMarks()}</div>
           </div>
        </div>
      </div>
  );

  // ... (renderPrintContent and renderAnswerKeyContent remain largely identical, just removed for brevity) ...
  const renderPrintContent = () => {
    let printViewQuestionCounter = 0; 
    return (
    <div className="bg-white text-black w-[210mm] min-h-[297mm] text-base leading-snug box-border shadow-none break-words" style={{ padding: '0.5in' }}>
      {renderHeader()}
      {meta.generalInstructions && meta.generalInstructions.trim() && (
        <div className="mb-1 text-sm"><h3 className="font-bold underline mb-1 uppercase">{isHindiPaper ? 'सामान्य निर्देश' : 'General Instructions'}:</h3><p className="whitespace-pre-wrap leading-snug">{meta.generalInstructions}</p></div>
      )}
      {sections.map((section) => (
        <div key={section.id} className="mb-3">
           {section.title && section.title.trim() && (
             <div className="text-center mb-2 border-b border-gray-400 pb-1"><h3 className="uppercase text-lg font-bold whitespace-pre-wrap"><MathText text={section.title} /></h3></div>
           )}
           <div className="space-y-1">
             {section.questions.map((q) => {
                const qNum = ++printViewQuestionCounter;
                return (
                <div key={q.id} className="break-inside-avoid relative">
                   <div className="flex gap-2"><span className="font-bold">{q.customNumber || (isHindiPaper ? `प्र. ${qNum}` : `${qNum}.`)}</span><div className="flex-1"><p className="whitespace-pre-wrap leading-snug text-justify break-words"><MathText text={q.text} /></p>
                       {q.options && q.options.length > 0 && (
                         <div className={`grid gap-x-8 gap-y-1 mt-1 ml-2 ${q.type === QuestionType.ASSERTION_REASON ? 'grid-cols-1' : getGridClass(q.options)}`}>
                            {q.options.map((opt, oIdx) => (<div key={oIdx} className="flex gap-2"><span className="font-semibold">({String.fromCharCode(97 + oIdx)})</span><span><MathText text={cleanOptionText(opt)} /></span></div>))}
                         </div>
                       )}
                       {q.type === QuestionType.MATCH && q.matchPairs && (
                           <div className="mt-2 ml-2 w-full">
                               <div className="font-bold mb-1">Match the Following:</div>
                               <table className="w-full text-sm border-collapse">
                                   <thead>
                                       <tr>
                                           <th className="text-left p-1 w-1/2 border-b-2 border-black">Column A</th>
                                           <th className="text-left p-1 w-1/2 border-b-2 border-black">Column B</th>
                                       </tr>
                                   </thead>
                                   <tbody>
                                       {q.matchPairs.map((pair, idx) => (
                                           <tr key={idx}>
                                               <td className="p-1 align-top border-b border-gray-100">
                                                   <span className="font-bold mr-2">{String.fromCharCode(65 + idx)}.</span>
                                                   <MathText text={cleanOptionText(pair.left)} />
                                               </td>
                                               <td className="p-1 align-top border-b border-gray-100">
                                                   <span className="font-bold mr-2">{idx + 1}.</span>
                                                   <MathText text={cleanOptionText(pair.right)} />
                                               </td>
                                           </tr>
                                       ))}
                                   </tbody>
                               </table>
                           </div>
                       )}
                       {q.imageUrl && (<div className="mt-2 flex justify-center"><ResizableImage src={q.imageUrl} initialWidth={q.imageWidth} onResize={() => {}} onRemove={() => {}} readOnly /></div>)}
                     </div><span className="font-bold text-sm w-8 text-right align-top">[{q.marks}]</span></div>
                </div>
             );
            })}
           </div>
        </div>
      ))}
    </div>
  )};
  
  const renderAnswerKeyContent = () => {
    let qCounter = 0;
    return (
      <div className="bg-white text-black w-[210mm] min-h-[297mm] text-base leading-snug box-border shadow-none break-words" style={{ padding: '0.5in' }}>
         <div className="text-center mb-6"><h1 className="text-2xl font-bold uppercase underline">{isHindiPaper ? 'उत्तर कुंजी' : 'ANSWER KEY'}</h1><h2 className="text-lg font-bold">{meta.schoolName}</h2><div className="text-sm font-bold mt-2">{isHindiPaper ? 'कक्षा' : 'CLASS'}: {meta.classNum} | {isHindiPaper ? 'विषय' : 'SUBJECT'}: {meta.subject} | {meta.title}</div></div>
         {sections.map((section) => (
            <div key={section.id} className="mb-4">
               {section.title && section.title.trim() && <div className="font-bold uppercase underline mb-2 text-sm">{section.title}</div>}
               <div className="space-y-2">
                   {section.questions.map((q) => {
                       const qNum = ++qCounter;
                       return (<div key={q.id} className="flex gap-2 break-inside-avoid"><span className="font-bold w-10">{q.customNumber || (isHindiPaper ? `प्र. ${qNum}` : `${qNum}.`)}</span><div className="flex-1"><div className="font-medium text-gray-900"><MathText text={q.answer || "Answer not available"} /></div></div><span className="text-xs font-bold text-gray-500">[{q.marks}]</span></div>)
                   })}
               </div>
            </div>
         ))}
      </div>
    );
  };

  if (loadingAI) return <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center"><h2 className="text-2xl font-bold animate-pulse">Generating Paper...</h2><p>{generationStatus}</p></div>;

  let editViewQuestionCounter = 0;

  if (autoDownload) {
      return (
          <>
            <div className="fixed inset-0 bg-white z-[9999] opacity-0 pointer-events-none" aria-hidden="true"></div>
            <div id="print-area" className="hidden print-only"><div style={{ width: '210mm' }}>{autoDownload === 'key' ? renderAnswerKeyContent() : renderPrintContent()}</div></div>
          </>
      );
  }

  return (
    <>
    <div className="fixed inset-0 bg-white z-50 flex flex-col overflow-hidden no-print">
      <div className="bg-white border-b px-4 py-3 flex justify-between items-center shadow-sm shrink-0 z-10">
        <div className="flex items-center gap-2">
           <h2 className="text-lg font-bold text-gray-800">{internalExistingPaper ? (readOnly ? 'View Paper (Read Only)' : 'Edit Paper') : (step === 1 ? 'Exam Details' : step === 2 ? 'Blueprint' : 'Preview & Edit')}</h2>
           {!readOnly && (isProfessional || isFree || isStarter) && !isAdmin && internalExistingPaper && (
               <div className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                   Downloads Used: {internalExistingPaper.downloadCount || 0}/1
               </div>
           )}
        </div>
        <div className="flex items-center gap-3">
            {step === 3 && !readOnly && <button onClick={() => setStep(2)} className="text-blue-600 font-bold hover:bg-blue-50 px-3 py-1 rounded"><i className="fas fa-arrow-left"></i> Back to Blueprint</button>}
            <button onClick={handleClose} className="text-gray-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-full transition-colors shrink-0"><i className="fas fa-times fa-lg"></i></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 p-4 pb-32">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm p-4 md:p-8 min-h-[400px]">
          
          {step === 1 && (
            <div className="space-y-6">
              {readOnly && <div className="bg-yellow-100 text-yellow-800 p-2 rounded mb-4 text-center font-bold">You are in Read-Only Mode.</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium mb-1">Class</label>
                    <select disabled={readOnly} className="w-full border rounded p-2" value={meta.classNum} onChange={(e) => setMeta({...meta, classNum: e.target.value})}>
                        {classList.length === 0 && <option>No classes available</option>}
                        {classList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Subject</label>
                    <select disabled={readOnly} className="w-full border rounded p-2" value={meta.subject} onChange={(e) => setMeta({...meta, subject: e.target.value})}>
                        {!meta.classNum || !curriculumConfig[meta.classNum] || curriculumConfig[meta.classNum].length === 0 ? <option>No subjects available</option> : null}
                        {meta.classNum && curriculumConfig[meta.classNum]?.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div><label className="block text-sm font-medium mb-1">Session</label><input disabled={readOnly} className="w-full border rounded p-2" value={meta.session} onChange={e => setMeta({...meta, session: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">School Name</label><input disabled={readOnly} className="w-full border rounded p-2" value={meta.schoolName} onChange={e => setMeta({...meta, schoolName: e.target.value})} placeholder={isHindiPaper ? "विद्यालय का नाम" : "SCHOOL NAME"} /></div>
                <div><label className="block text-sm font-medium mb-1">Exam Title</label><input disabled={readOnly} className="w-full border rounded p-2" value={meta.title} onChange={e => setMeta({...meta, title: e.target.value})} placeholder={isHindiPaper ? "परीक्षा का नाम" : "EXAM TITLE"} /></div>
                <div><label className="block text-sm font-medium mb-1">Duration</label><input disabled={readOnly} className="w-full border rounded p-2" value={meta.duration} onChange={e => setMeta({...meta, duration: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">Max Marks</label><input disabled={readOnly} type="number" className="w-full border rounded p-2" value={meta.maxMarks} onChange={e => setMeta({...meta, maxMarks: parseInt(e.target.value)})} /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">General Instructions</label><textarea disabled={readOnly} className="w-full border rounded p-2 h-32" value={meta.generalInstructions} onChange={e => setMeta({...meta, generalInstructions: e.target.value})} /></div>

              <div className="pt-6 flex justify-end">
                {!readOnly ? (
                    <button onClick={() => setStep(2)} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700">Next <i className="fas fa-arrow-right"></i></button>
                ) : (
                    <button onClick={() => setStep(3)} className="bg-gray-800 text-white px-6 py-2 rounded">Go to Preview</button>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8">
              {!readOnly && (
              <div className="bg-blue-50 p-4 sm:p-6 rounded-xl border border-blue-100">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                  <div className="lg:col-span-1"><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Topic</label><input type="text" className="w-full border rounded p-2" value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
                  <div className="lg:col-span-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Type</label>
                      <select className="w-full border rounded p-2 bg-white" value={qType} onChange={(e) => setQType(e.target.value)}>
                          {availableQTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:col-span-2">
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Count</label><input type="number" className="w-full border rounded p-2" value={count} min="1" onChange={(e) => setCount(parseInt(e.target.value) || 0)} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Marks</label><input type="number" className="w-full border rounded p-2" value={marksPerQ} min="0.5" step="0.5" onChange={(e) => setMarksPerQ(parseFloat(e.target.value) || 0)} /></div>
                  </div>
                  <div className="lg:col-span-1"><button onClick={handleAddToBlueprint} className="w-full bg-blue-600 text-white py-2 rounded font-bold">Add</button></div>
                </div>
              </div>
              )}
              <div className="border rounded-lg overflow-hidden shadow-sm">
                 {blueprint.map((item, idx) => (
                     <div key={item.id} className="flex justify-between items-center p-4 border-b">
                         <div className="flex items-center gap-3"><div className="bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded">{isHindiPaper ? getHindiSectionLabel(idx) : String.fromCharCode(65 + idx)}</div><div><div className="font-bold">{item.topic}</div><div className="text-sm">{item.count} x {item.type}</div></div></div>
                         {!readOnly && <button onClick={() => handleRemoveBlueprintItem(item.id)}><i className="fas fa-trash text-red-400"></i></button>}
                     </div>
                 ))}
              </div>
              {!readOnly && <div className="pt-6 border-t"><button onClick={handleGenerateFullPaper} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg" disabled={blueprint.length === 0}>Generate Question Paper</button></div>}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col space-y-8">
              {readOnly && <div className="bg-yellow-100 text-yellow-800 p-2 rounded text-center font-bold">Read-Only Mode: Viewing Paper</div>}
              <div className="text-center border-b pb-6 space-y-4">
                 <input disabled={readOnly} className="block w-full text-center text-xl font-bold uppercase border-none" value={meta.schoolName} onChange={(e) => setMeta({...meta, schoolName: e.target.value})} placeholder={isHindiPaper ? "विद्यालय का नाम" : "SCHOOL NAME"} />
              </div>

              <div className="space-y-10">
                {sections.map((section) => (
                  <div key={section.id} className="relative group/section">
                    <div className="flex flex-col items-center justify-center mb-6 gap-2">
                      <div className="relative w-full flex items-start gap-2">
                          <textarea disabled={readOnly} className="flex-1 text-center font-bold text-lg uppercase resize-none overflow-hidden font-mono" value={section.title} onChange={(e) => handleUpdateSectionTitle(section.id, e.target.value)} placeholder="SECTION TITLE" rows={Math.max(1, Math.ceil(section.title.length / 40))} />
                          {!readOnly && (
                          <div className="flex gap-1">
                            <button type="button" onClick={() => handleUpdateSectionTitle(section.id, "")} className="p-2 border" title="Clear Heading"><i className="fas fa-eraser"></i></button>
                            <button type="button" onClick={(e) => {e.stopPropagation(); handleDeleteSection(section.id)}} className="p-2 border text-red-500 z-10 cursor-pointer" title="Delete Section"><i className="fas fa-trash-alt"></i></button>
                          </div>
                          )}
                      </div>
                    </div>
                    <div className="space-y-6">
                      {section.questions.map((q, idx) => {
                        const currentQNum = ++editViewQuestionCounter;
                        
                        let maxRegenerations = 0;
                        if (isStarter) maxRegenerations = 1;
                        else if (isProfessional) maxRegenerations = 2;
                        else if (userProfile?.subscriptionPlan === SubscriptionPlan.PREMIUM || isAdmin) maxRegenerations = 3;
                        else if (isFree) maxRegenerations = 1;
                        
                        const regenCount = (q as any).regenerateCount || 0;
                        const isRegenLimitReached = regenCount >= maxRegenerations;

                        return (
                        <div key={q.id} className="flex gap-3 border-b border-gray-100 pb-6 last:border-0">
                            <input disabled={readOnly} className="font-bold w-10 text-right" value={q.customNumber || (isHindiPaper ? `प्र. ${currentQNum}` : `Q${currentQNum}.`)} onChange={(e) => handleUpdateQuestion(section.id, q.id, 'customNumber', e.target.value)} />
                            <div className="flex-1 space-y-3">
                              <textarea disabled={readOnly} className="w-full p-2 border rounded font-mono" value={q.text} onChange={(e) => handleUpdateQuestion(section.id, q.id, 'text', e.target.value)} rows={Math.max(2, Math.ceil(q.text.length / 45))} />
                              {q.options && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{q.options.map((opt, optIdx) => (<div key={optIdx} className="flex gap-2"><span className="font-bold">{String.fromCharCode(65 + optIdx)}.</span><input disabled={readOnly} className="w-full border-none" value={cleanOptionText(opt)} onChange={(e) => { const newOpts = [...q.options!]; newOpts[optIdx] = e.target.value; handleUpdateQuestion(section.id, q.id, 'options', newOpts); }} /></div>))}</div>}
                              
                              {q.type === QuestionType.MATCH && q.matchPairs && (
                                <div className="border rounded p-3 bg-gray-50">
                                    <div className="font-bold text-xs uppercase text-gray-500 mb-2">Match Pairs Editor</div>
                                    {q.matchPairs.map((pair, pIdx) => (
                                        <div key={pIdx} className="flex gap-2 mb-2">
                                            <div className="flex-1 flex gap-1">
                                                <span className="font-bold p-1 bg-gray-200 text-xs rounded">{String.fromCharCode(65 + pIdx)}</span>
                                                <input 
                                                    disabled={readOnly} 
                                                    className="w-full border rounded p-1 text-sm" 
                                                    value={pair.left} 
                                                    onChange={(e) => {
                                                        const newPairs = [...q.matchPairs!];
                                                        newPairs[pIdx].left = e.target.value;
                                                        handleUpdateQuestion(section.id, q.id, 'matchPairs', newPairs);
                                                    }}
                                                    placeholder="Left Item"
                                                />
                                            </div>
                                            <div className="flex-1 flex gap-1">
                                                <span className="font-bold p-1 bg-gray-200 text-xs rounded">{pIdx + 1}</span>
                                                <input 
                                                    disabled={readOnly} 
                                                    className="w-full border rounded p-1 text-sm" 
                                                    value={pair.right} 
                                                    onChange={(e) => {
                                                        const newPairs = [...q.matchPairs!];
                                                        newPairs[pIdx].right = e.target.value;
                                                        handleUpdateQuestion(section.id, q.id, 'matchPairs', newPairs);
                                                    }}
                                                    placeholder="Right Item"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                              )}

                              {!readOnly && (
                                <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-gray-50">
                                    <button onClick={() => handleDeleteQuestion(section.id, q.id)} className="p-2 text-red-500 hover:bg-red-50 rounded" title="Delete Question"><i className="fas fa-trash"></i></button>
                                    
                                    <button 
                                      onClick={() => handleRegenerateQuestion(section.id, q)} 
                                      className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1 transition-colors ${isRegenLimitReached ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'}`}
                                      disabled={regeneratingQuestionId === q.id || isRegenLimitReached}
                                      title={isRegenLimitReached ? "Regeneration limit reached for this question" : "Generate new question"}
                                    >
                                      <i className={`fas fa-sync-alt ${regeneratingQuestionId === q.id ? 'fa-spin' : ''}`}></i>
                                      Regenerate {regenCount > 0 && `(${regenCount}/${maxRegenerations})`}
                                    </button>

                                    <button 
                                      onClick={() => handleGenerateImage(section.id, q.id, q.text)} 
                                      className="px-3 py-1 bg-purple-50 text-purple-600 rounded hover:bg-purple-100 text-xs font-bold flex items-center gap-1 transition-colors"
                                      disabled={generatingImageId === q.id}
                                    >
                                      {generatingImageId === q.id ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-magic"></i>}
                                      {generatingImageId === q.id ? ' Generating...' : ' AI Diagram'}
                                    </button>

                                    <div className="relative">
                                      <input type="file" id={`upload-${q.id}`} className="hidden" accept="image/*" onChange={(e) => handleUploadImage(section.id, q.id, e)} />
                                      <label htmlFor={`upload-${q.id}`} className="px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 text-xs font-bold cursor-pointer flex items-center gap-1 transition-colors h-full">
                                        <i className="fas fa-upload"></i> Upload Image
                                      </label>
                                    </div>
                                </div>
                              )}
                              {q.imageUrl && <div className="mt-2 w-64"><ResizableImage src={q.imageUrl} initialWidth={q.imageWidth} onResize={(w) => handleUpdateQuestion(section.id, q.id, 'imageWidth', w)} onRemove={() => handleUpdateQuestion(section.id, q.id, 'imageUrl', undefined)} readOnly={readOnly} /></div>}
                            </div>
                        </div>
                      )})}
                    </div>
                    {!readOnly && <button onClick={() => handleAddQuestionToSection(section.id)} className="mt-4 w-full border-2 border-dashed p-2 text-gray-400">Add Question</button>}
                  </div>
                ))}
              </div>

              <div className="mt-12 pt-8 border-t flex flex-col gap-4">
                 {!readOnly && <button onClick={handleSavePaper} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">{internalExistingPaper ? 'Update Paper' : 'Save Paper'}</button>}
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                   <button 
                       className="py-3 bg-gray-100 rounded-xl font-bold hover:bg-gray-200 transition-colors" 
                       onClick={() => { setPreviewMode('paper'); setShowPreview(true); }}
                   >
                       Preview PDF
                   </button>
                   <button 
                       className="py-3 bg-gray-100 rounded-xl font-bold text-gray-700 hover:bg-gray-200 transition-colors" 
                       onClick={() => { setPreviewMode('key'); setShowPreview(true); }}
                   >
                       Preview Answer Key
                   </button>
                   
                   {!readOnly && (
                       <button 
                           className={`py-3 border border-red-200 rounded-xl font-bold transition-all ${downloadedFiles.key ? 'opacity-50 cursor-not-allowed bg-red-50 text-gray-400' : 'text-red-600 hover:bg-red-50'}`} 
                           onClick={() => !downloadedFiles.key && handleDownloadPDF('key')} 
                           disabled={isGeneratingPdf || downloadedFiles.key}
                       >
                           {isGeneratingPdf && previewMode === 'key' ? 'Generating...' : downloadedFiles.key ? 'Key Downloaded' : 'Download Answer Key'}
                       </button>
                   )}
                   {!readOnly && (
                       <button 
                           className={`py-3 rounded-xl font-bold text-white transition-all ${downloadedFiles.paper ? 'bg-red-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`} 
                           onClick={() => !downloadedFiles.paper && handleDownloadPDF('paper')} 
                           disabled={isGeneratingPdf || downloadedFiles.paper}
                       >
                           {isGeneratingPdf && previewMode === 'paper' ? 'Generating...' : downloadedFiles.paper ? 'Paper Downloaded' : 'Download Paper'}
                       </button>
                   )}
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    
    <div id="print-area" className="hidden print-only"><div style={{ width: '210mm' }}>{previewMode === 'key' ? renderAnswerKeyContent() : renderPrintContent()}</div></div>
    
    {showPreview && (
      <div className="fixed inset-0 z-[100] bg-black bg-opacity-80 flex items-start pt-8 overflow-auto">
         <div className="w-fit mx-auto relative px-4 pb-10">
             <div className="sticky top-4 right-4 flex gap-2 z-[110] justify-end mb-2 bg-white/10 backdrop-blur-md p-2 rounded-lg">
                <button onClick={() => setShowPreview(false)} className="bg-white w-10 h-10 rounded-full"><i className="fas fa-times"></i></button>
                {!readOnly && !downloadedFiles[previewMode] && <button onClick={() => handleDownloadPDF(previewMode)} className="bg-red-600 text-white w-10 h-10 rounded-full" title={`Download ${previewMode === 'key' ? 'Answer Key' : 'Question Paper'}`}><i className="fas fa-download"></i></button>}
             </div>
             <div className="bg-white shadow-2xl overflow-hidden rounded-sm">
                 <div className="p-2 bg-gray-100 text-center font-bold border-b text-gray-500 uppercase text-xs">
                     {previewMode === 'key' ? 'Answer Key Preview' : 'Question Paper Preview'}
                 </div>
                 {previewMode === 'key' ? renderAnswerKeyContent() : renderPrintContent()}
             </div>
         </div>
      </div>
    )}
    </>
  );
};

export default PaperGenerator;
