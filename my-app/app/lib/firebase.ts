import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCxRgRcMTpBBwNm_5_1OSJIZDNnLf0Shas",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "coin-wallet-11860.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "coin-wallet-11860",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "coin-wallet-11860.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "404621646615",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:404621646615:web:80ecff15760344fc38f552",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-8EY1R5MQZJ",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://coin-wallet-11860-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
