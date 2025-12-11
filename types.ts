
export enum UserRole {
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER'
}

export enum SubscriptionPlan {
  FREE = 'FREE', // 0, 1 paper, Trial
  STARTER = 'STARTER', // 199, 5 papers, View Only
  PROFESSIONAL = 'PROFESSIONAL', // 399, 12 papers, 1 Edit/Download
  PREMIUM = 'PREMIUM' // 699, 25 papers, Unlimited
}

export enum SubscriptionStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED'
}

export interface User {
  email: string;
  password?: string;
  role: UserRole;
  name: string;
  credits: number;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  paymentProofUrl?: string;
  
  // Registration details
  schoolName?: string;
  mobile?: string;
  city?: string;
  state?: string;
  
  // Subscription Expiry
  subscriptionExpiryDate?: string; // ISO Date string
}

export enum QuestionType {
  MCQ = 'Multiple Choice',
  ASSERTION_REASON = 'Assertion-Reason',
  MATCH = 'Match the Following',
  VSA = 'Very Short Answer',
  SA = 'Short Answer',
  LA = 'Long Answer',
  NUMERICAL = 'Numerical',
  CASE_STUDY = 'Case Study',
  PARAGRAPH = 'Paragraph-based'
}

export interface BlueprintItem {
  id: string;
  topic: string;
  type: QuestionType;
  count: number;
  marks: number;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  marks: number;
  options?: string[];
  matchPairs?: { left: string; right: string }[];
  answer?: string;
  imageUrl?: string;
  imageWidth?: number;
  topic: string;
  customNumber?: string;
  regenerateCount?: number;
}

export interface Section {
  id: string;
  title: string;
  questions: Question[];
  totalMarks: number;
}

export interface QuestionPaper {
  id: string;
  title: string;
  schoolName: string;
  classNum: string;
  subject: string;
  session?: string;
  duration: string;
  maxMarks: number;
  generalInstructions?: string;
  sections: Section[];
  createdAt: string;
  createdBy: string;
  
  // Visibility flags for soft deletion
  visibleToTeacher: boolean;
  visibleToAdmin: boolean;

  // Usage tracking for Professional Plan enforcement
  editCount?: number;
  downloadCount?: number;
}

export interface SamplePattern {
  id: string;
  classNum: string;
  subject: string;
  content: string;
  // Attachment 1: Sample Question Paper style guide
  attachment?: {
    data: string;
    mimeType: string;
    name: string;
  };
  // Attachment 2: Syllabus or Blueprint guide
  syllabusAttachment?: {
    data: string;
    mimeType: string;
    name: string;
  };
  updatedAt: string;
}

export interface PaymentRequest {
  id: string;
  userEmail: string;
  plan: SubscriptionPlan;
  amount: number;
  proofUrl: string;
  status: SubscriptionStatus;
  date: string;
}

export interface ContentPage {
  id: string; // 'about', 'plans', 'policy', 'contact'
  title: string;
  content: string;
  lastUpdated: string;
}
