import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyCxRgRcMTpBBwNm_5_1OSJIZDNnLf0Shas",
  authDomain: "coin-wallet-11860.firebaseapp.com",
  projectId: "coin-wallet-11860",
  storageBucket: "coin-wallet-11860.firebasestorage.app",
  messagingSenderId: "404621646615",
  appId: "1:404621646615:web:80ecff15760344fc38f552",
  measurementId: "G-8EY1R5MQZJ"
};

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
