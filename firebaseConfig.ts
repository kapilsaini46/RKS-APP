
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Robust helper to find environment variables across different build tools (Vite, CRA, Next.js)
const getEnv = (key: string): string => {
  // 1. Try standard process.env (Next.js / CRA)
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key] as string;
    if (typeof process !== 'undefined' && process.env && process.env[`REACT_APP_${key}`]) return process.env[`REACT_APP_${key}`] as string;
  } catch (e) {
    // Ignore process errors in browser
  }

  // 2. Try Vite import.meta.env
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      if (import.meta.env[key]) return import.meta.env[key];
      // @ts-ignore
      if (import.meta.env[`VITE_${key}`]) return import.meta.env[`VITE_${key}`];
    }
  } catch (e) {
    // Ignore import.meta errors
  }

  return "";
};

const firebaseConfig = {
  apiKey: getEnv("FIREBASE_API_KEY"),
  authDomain: getEnv("FIREBASE_AUTH_DOMAIN"),
  projectId: getEnv("FIREBASE_PROJECT_ID"),
  storageBucket: getEnv("FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnv("FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnv("FIREBASE_APP_ID")
};

// Log warning if config is missing (helps debugging in console)
if (!firebaseConfig.apiKey) {
  console.warn("Firebase Config is missing. Please check Vercel Environment Variables.");
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
