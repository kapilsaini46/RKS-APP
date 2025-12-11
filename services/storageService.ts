
import { User, QuestionPaper, PaymentRequest, UserRole, SubscriptionStatus, SubscriptionPlan, SamplePattern, QuestionType, ContentPage } from "../types";
import { MOCK_ADMIN_EMAIL, MOCK_TEACHER_EMAIL, PRICING, CBSE_SUBJECTS } from "../constants";
import { db } from "../firebaseConfig";
import { collection, doc, getDoc, setDoc, getDocs, updateDoc, deleteDoc, query, where } from "firebase/firestore";

// Collection Names
const USERS_COL = 'users';
const PAPERS_COL = 'papers';
const REQUESTS_COL = 'requests';
const PATTERNS_COL = 'patterns';
const CONFIG_COL = 'config'; 
const CONTENT_COL = 'content';

// Initial Setup Helper (Runs on admin login mostly)
const ensureAdminExists = async () => {
    const adminRef = doc(db, USERS_COL, MOCK_ADMIN_EMAIL);
    const snap = await getDoc(adminRef);
    if (!snap.exists()) {
        const adminUser: User = {
            email: MOCK_ADMIN_EMAIL,
            role: UserRole.ADMIN,
            name: 'Principal Admin',
            password: 'admin',
            credits: 9999,
            subscriptionPlan: SubscriptionPlan.PREMIUM,
            subscriptionStatus: SubscriptionStatus.ACTIVE,
            schoolName: 'Central Admin School',
            mobile: '9999999999',
            city: 'Delhi',
            state: 'Delhi'
        };
        await setDoc(adminRef, adminUser);
        
        // Also create demo teacher if needed
        const teacherRef = doc(db, USERS_COL, MOCK_TEACHER_EMAIL);
        const tSnap = await getDoc(teacherRef);
        if(!tSnap.exists()) {
             const demoTeacher: User = {
                email: MOCK_TEACHER_EMAIL,
                role: UserRole.TEACHER,
                name: 'Ravi Kumar',
                password: 'password123',
                credits: 1,
                subscriptionPlan: SubscriptionPlan.FREE,
                subscriptionStatus: SubscriptionStatus.ACTIVE,
                schoolName: 'Kendriya Vidyalaya',
                mobile: '9876543210',
                city: 'Mumbai',
                state: 'Maharashtra'
             };
             await setDoc(teacherRef, demoTeacher);
        }
    }
};

export const StorageService = {
  // --- CMS Content Management ---
  getAllContentPages: async (): Promise<ContentPage[]> => {
      const snap = await getDocs(collection(db, CONTENT_COL));
      const pages: ContentPage[] = [];
      snap.forEach(doc => pages.push(doc.data() as ContentPage));
      
      // Seed default content if empty
      if (pages.length === 0) {
          const defaultPages: ContentPage[] = [
              { id: 'about', title: 'About Us', content: 'Welcome to RKS QP Maker.', lastUpdated: new Date().toISOString() },
              { id: 'plans', title: 'Subscription Plans', content: 'Free, Starter, Professional, Premium.', lastUpdated: new Date().toISOString() },
              { id: 'policy', title: 'Policy', content: 'Non-refundable.', lastUpdated: new Date().toISOString() },
              { id: 'contact', title: 'Contact Us', content: 'Contact support.', lastUpdated: new Date().toISOString() }
          ];
          for (const p of defaultPages) {
              await setDoc(doc(db, CONTENT_COL, p.id), p);
              pages.push(p);
          }
      }
      return pages;
  },

  getPageContent: async (id: string): Promise<ContentPage | undefined> => {
      const snap = await getDoc(doc(db, CONTENT_COL, id));
      return snap.exists() ? (snap.data() as ContentPage) : undefined;
  },

  savePageContent: async (page: ContentPage) => {
      await setDoc(doc(db, CONTENT_COL, page.id), { ...page, lastUpdated: new Date().toISOString() });
  },

  // --- Question Types Management ---
  getQuestionTypes: async (): Promise<string[]> => {
    const ref = doc(db, CONFIG_COL, 'questionTypes');
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data().types || [];
    
    // Default
    const defaultTypes = Object.values(QuestionType);
    await setDoc(ref, { types: defaultTypes });
    return defaultTypes;
  },

  addQuestionType: async (type: string) => {
    const types = await StorageService.getQuestionTypes();
    if (types.includes(type)) throw new Error("Question Type already exists");
    types.push(type);
    await setDoc(doc(db, CONFIG_COL, 'questionTypes'), { types });
  },

  deleteQuestionType: async (type: string) => {
    let types = await StorageService.getQuestionTypes();
    types = types.filter(t => t !== type);
    await setDoc(doc(db, CONFIG_COL, 'questionTypes'), { types });
  },

  // --- Curriculum Config (Classes & Subjects) ---
  getConfig: async (): Promise<Record<string, string[]>> => {
    const ref = doc(db, CONFIG_COL, 'curriculum');
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data().data || {};
    
    // Default
    await setDoc(ref, { data: CBSE_SUBJECTS });
    return CBSE_SUBJECTS;
  },

  addClass: async (className: string) => {
    const config = await StorageService.getConfig();
    if (config[className]) throw new Error("Class already exists");
    config[className] = [];
    await setDoc(doc(db, CONFIG_COL, 'curriculum'), { data: config });
  },

  deleteClass: async (className: string) => {
    const config = await StorageService.getConfig();
    delete config[className];
    await setDoc(doc(db, CONFIG_COL, 'curriculum'), { data: config });
  },

  addSubject: async (className: string, subject: string) => {
    const config = await StorageService.getConfig();
    if (!config[className]) throw new Error("Class does not exist");
    if (config[className].includes(subject)) throw new Error("Subject already exists");
    config[className].push(subject);
    await setDoc(doc(db, CONFIG_COL, 'curriculum'), { data: config });
  },

  deleteSubject: async (className: string, subject: string) => {
    const config = await StorageService.getConfig();
    if (config[className]) {
        config[className] = config[className].filter(s => s !== subject);
        await setDoc(doc(db, CONFIG_COL, 'curriculum'), { data: config });
    }
  },

  // --- Users ---
  getUser: async (email: string): Promise<User | undefined> => {
    if (email === MOCK_ADMIN_EMAIL) await ensureAdminExists();
    const snap = await getDoc(doc(db, USERS_COL, email));
    return snap.exists() ? (snap.data() as User) : undefined;
  },
  
  getAllUsers: async (): Promise<User[]> => {
    const snap = await getDocs(collection(db, USERS_COL));
    const users: User[] = [];
    snap.forEach(d => users.push(d.data() as User));
    return users;
  },

  updateUser: async (updatedUser: User, originalEmail?: string) => {
    // If email changed, we need to create new doc and delete old
    if (originalEmail && originalEmail !== updatedUser.email) {
        await setDoc(doc(db, USERS_COL, updatedUser.email), updatedUser);
        await deleteDoc(doc(db, USERS_COL, originalEmail));
    } else {
        await setDoc(doc(db, USERS_COL, updatedUser.email), updatedUser);
    }
  },

  createUser: async (newUser: User) => {
     const snap = await getDoc(doc(db, USERS_COL, newUser.email));
     if(snap.exists()) {
         throw new Error("User with this email already exists");
     }
     if (newUser.role === UserRole.TEACHER && !newUser.credits) {
         newUser.credits = 1;
         newUser.subscriptionPlan = SubscriptionPlan.FREE;
         newUser.subscriptionStatus = SubscriptionStatus.ACTIVE;
     }
     await setDoc(doc(db, USERS_COL, newUser.email), newUser);
  },

  deleteUser: async (email: string) => {
    await deleteDoc(doc(db, USERS_COL, email));
  },

  // --- Papers ---
  savePaper: async (paper: QuestionPaper) => {
    const paperRef = doc(db, PAPERS_COL, paper.id);
    const snap = await getDoc(paperRef);
    
    if (snap.exists()) {
      await updateDoc(paperRef, { ...paper });
    } else {
      const newPaper = {
        ...paper,
        visibleToTeacher: true,
        visibleToAdmin: true,
        editCount: 0,
        downloadCount: 0
      };
      await setDoc(paperRef, newPaper);
    }
  },

  getPapersByUser: async (email: string): Promise<QuestionPaper[]> => {
    const q = query(collection(db, PAPERS_COL), where("createdBy", "==", email));
    const snap = await getDocs(q);
    const papers: QuestionPaper[] = [];
    snap.forEach(d => {
        const p = d.data() as QuestionPaper;
        if (p.visibleToTeacher !== false) papers.push(p);
    });
    return papers;
  },

  getAllPapers: async (): Promise<QuestionPaper[]> => { 
     const snap = await getDocs(collection(db, PAPERS_COL));
     const papers: QuestionPaper[] = [];
     snap.forEach(d => {
         const p = d.data() as QuestionPaper;
         if (p.visibleToAdmin !== false) papers.push(p);
     });
     return papers;
  },

  deletePaper: async (id: string, target: 'TEACHER' | 'ADMIN' | 'PERMANENT' = 'PERMANENT') => {
    const ref = doc(db, PAPERS_COL, id);
    if (target === 'PERMANENT') {
        await deleteDoc(ref);
    } else {
        const updateData = target === 'TEACHER' ? { visibleToTeacher: false } : { visibleToAdmin: false };
        await updateDoc(ref, updateData);
    }
  },

  // --- Sample Patterns ---
  saveSamplePattern: async (pattern: SamplePattern) => {
    // Composite ID to enforce uniqueness per class/subject
    const id = `${pattern.classNum}_${pattern.subject}`; 
    await setDoc(doc(db, PATTERNS_COL, id), pattern);
  },

  getSamplePattern: async (classNum: string, subject: string): Promise<SamplePattern | undefined> => {
    const id = `${classNum}_${subject}`;
    const snap = await getDoc(doc(db, PATTERNS_COL, id));
    return snap.exists() ? (snap.data() as SamplePattern) : undefined;
  },

  getAdminPattern: async (classNum: string, subject: string): Promise<QuestionPaper | undefined> => {
    // This is complex query, simplified: fetch all, filter in JS or rely on basic pattern
    const usersSnap = await getDocs(query(collection(db, USERS_COL), where("role", "==", UserRole.ADMIN)));
    const adminEmails: string[] = [];
    usersSnap.forEach(u => adminEmails.push(u.id));

    // Firebase "IN" query limited to 10. Fetching paper by Class/Subject is better index.
    const q = query(collection(db, PAPERS_COL), where("classNum", "==", classNum), where("subject", "==", subject));
    const snap = await getDocs(q);
    
    let adminPaper: QuestionPaper | undefined;
    snap.forEach(d => {
        const p = d.data() as QuestionPaper;
        if (adminEmails.includes(p.createdBy) && p.visibleToAdmin !== false) {
            adminPaper = p; // Just take the last found
        }
    });

    return adminPaper;
  },

  getStyleContext: async (classNum: string, subject: string): Promise<{ 
    text: string, 
    attachment?: { data: string, mimeType: string },
    syllabusAttachment?: { data: string, mimeType: string } 
  }> => {
    const pattern = await StorageService.getSamplePattern(classNum, subject);
    if (pattern) {
        let text = "";
        if (pattern.content.trim().length > 0) {
            text += `Use the following sample paper text as a strict style and difficulty guide:\n\n${pattern.content}\n`;
        }
        if (pattern.attachment) {
            text += `\nRefer to the attached Sample Paper document for the exact question style, difficulty, and format. Mimic it closely.`;
        }
        if (pattern.syllabusAttachment) {
            text += `\nRefer to the attached Syllabus/Blueprint document. Ensure all generated questions strictly fall within the topics and scope defined in this syllabus.`;
        }
        
        return { 
          text, 
          attachment: pattern.attachment,
          syllabusAttachment: pattern.syllabusAttachment
        };
    }

    const adminPaper = await StorageService.getAdminPattern(classNum, subject);
    if (adminPaper) {
       const sampleQs = adminPaper.sections.flatMap(s => s.questions).slice(0, 10);
       const text = `Follow the style of these previous questions generated by admin:\n` + 
              sampleQs.map(q => `- (${q.type}) ${q.text}`).join('\n');
       return { text };
    }
    
    return { text: "" };
  },

  // --- Subscriptions ---
  createPaymentRequest: async (email: string, plan: SubscriptionPlan, proofUrl: string) => {
    const id = Date.now().toString();
    const newReq: PaymentRequest = {
      id,
      userEmail: email,
      plan,
      amount: PRICING[plan].price,
      proofUrl,
      status: SubscriptionStatus.PENDING,
      date: new Date().toISOString()
    };
    await setDoc(doc(db, REQUESTS_COL, id), newReq);
    
    const user = await StorageService.getUser(email);
    if (user) {
      await StorageService.updateUser({ ...user, subscriptionStatus: SubscriptionStatus.PENDING });
    }
  },

  getAllRequests: async (): Promise<PaymentRequest[]> => {
    const snap = await getDocs(collection(db, REQUESTS_COL));
    const reqs: PaymentRequest[] = [];
    snap.forEach(d => reqs.push(d.data() as PaymentRequest));
    return reqs;
  },

  processRequest: async (reqId: string, approved: boolean) => {
    const reqRef = doc(db, REQUESTS_COL, reqId);
    const snap = await getDoc(reqRef);
    if (!snap.exists()) return;

    const request = snap.data() as PaymentRequest;
    const newStatus = approved ? SubscriptionStatus.ACTIVE : SubscriptionStatus.REJECTED;
    
    await updateDoc(reqRef, { status: newStatus });

    const user = await StorageService.getUser(request.userEmail);
    if (user) {
      if (approved) {
          const now = new Date();
          if (request.plan === SubscriptionPlan.STARTER) now.setDate(now.getDate() + 30);
          else if (request.plan === SubscriptionPlan.PROFESSIONAL) now.setDate(now.getDate() + 60);
          else if (request.plan === SubscriptionPlan.PREMIUM) now.setDate(now.getDate() + 180);
          
          await StorageService.updateUser({
              ...user,
              subscriptionPlan: request.plan,
              subscriptionStatus: SubscriptionStatus.ACTIVE,
              credits: user.credits + PRICING[request.plan].papers,
              subscriptionExpiryDate: now.toISOString()
          });
      } else {
           await StorageService.updateUser({ ...user, subscriptionStatus: SubscriptionStatus.REJECTED });
      }
    }
  }
};
