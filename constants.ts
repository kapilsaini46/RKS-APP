
import { SubscriptionPlan, QuestionType } from "./types";

export const APP_NAME = "RKS QP Maker";

export const CBSE_CLASSES = ['VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export const CBSE_SUBJECTS: Record<string, string[]> = {
  'VI': ['Mathematics', 'Science', 'Social Science', 'English', 'Hindi'],
  'VII': ['Mathematics', 'Science', 'Social Science', 'English', 'Hindi'],
  'VIII': ['Mathematics', 'Science', 'Social Science', 'English', 'Hindi'],
  'IX': ['Mathematics', 'Science', 'Social Science', 'English', 'Hindi'],
  'X': ['Mathematics', 'Science', 'Social Science', 'English', 'Hindi'],
  'XI': ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'Accountancy', 'Economics', 'English', 'Computer Science'],
  'XII': ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'Accountancy', 'Economics', 'English', 'Computer Science'],
};

export const QUESTION_TYPES = Object.values(QuestionType);

export const PRICING = {
  [SubscriptionPlan.FREE]: { price: 0, papers: 1, label: 'Free Trial' },
  [SubscriptionPlan.STARTER]: { price: 199, papers: 5, label: 'Starter Plan' },
  [SubscriptionPlan.PROFESSIONAL]: { price: 399, papers: 12, label: 'Professional Plan' },
  [SubscriptionPlan.PREMIUM]: { price: 699, papers: 25, label: 'Premium Plan' },
};

export const UPI_QR_IMAGE = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=mock-merchant@upi&pn=CBSEGenerator&am=0&cu=INR";

export const MOCK_ADMIN_EMAIL = "admin@cbse.com";
export const MOCK_TEACHER_EMAIL = "teacher@cbse.com";
