import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { User as FirebaseUser } from "firebase/auth";

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  permanentAddress: string;
  organization: string;
  role: string;
  mycBalance: number;
  ethBalance: number;
  updatedAt?: unknown;
}

export interface KnownAccount {
  id: string;
  name: string;
  organization: string;
  address: string;
  avatarColor: string;
}

// Default seeded accounts for the directory (e.g. BOB, Alice, Cold Vault)
export const DEFAULT_KNOWN_ACCOUNTS: KnownAccount[] = [
  {
    id: "acc-bob",
    name: "Bob",
    organization: "Apex Custody OTC Desk",
    address: "0xedEe7c1429505bcA418Cc48b8Cf8B37E8d602843",
    avatarColor: "bg-blue-600",
  },
  {
    id: "acc-alice",
    name: "Alice",
    organization: "Consensus Capital Reserve",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    avatarColor: "bg-purple-600",
  },
  {
    id: "acc-vault",
    name: "Cold Vault 02",
    organization: "Institutional Treasury",
    address: "0x3F82d89F1283cE3048b29c9162E049860De978c4",
    avatarColor: "bg-emerald-600",
  },
];

/**
 * Stores or updates user account info and permanent address in Firestore `users/{uid}`
 */
export async function syncUserProfileToFirebase(
  user: FirebaseUser,
  permanentAddress: string,
  mycBalance: number,
  ethBalance: number,
  organization: string = "Apex Institutional Custody"
): Promise<UserProfile> {
  const profile: UserProfile = {
    uid: user.uid,
    displayName: user.displayName || user.email?.split("@")[0] || "Trader",
    email: user.email || "",
    photoURL: user.photoURL || "",
    permanentAddress,
    organization,
    role: "Portfolio Manager",
    mycBalance,
    ethBalance,
    updatedAt: serverTimestamp(),
  };

  try {
    const userRef = doc(db, "users", user.uid);
    // Merge updates so existing custom fields are preserved
    await setDoc(userRef, profile, { merge: true });
    // Also save in directory collection `contacts`
    const contactRef = doc(db, "contacts", user.uid);
    await setDoc(
      contactRef,
      {
        id: user.uid,
        name: profile.displayName,
        organization: profile.organization,
        address: permanentAddress,
        avatarColor: "bg-teal-600",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.warn("Firestore syncUserProfile error (using local state):", error);
  }

  return profile;
}

/**
 * Fetches user profile from Firestore `users/{uid}`
 */
export async function getUserProfileFromFirebase(uid: string): Promise<UserProfile | null> {
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
  } catch (error) {
    console.warn("Firestore getUserProfile error:", error);
  }
  return null;
}

/**
 * Stores a transaction into Firestore collection `transactions`
 */
export async function recordTransactionToFirebase(txData: {
  type: string;
  amount: string;
  fiatValue: string;
  details: string;
  senderAddress: string;
  recipientAddress: string;
  recipientName?: string;
  recipientOrg?: string;
  status: string;
}) {
  try {
    const txCollection = collection(db, "transactions");
    await addDoc(txCollection, {
      ...txData,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn("Firestore recordTransaction error (using local state):", error);
  }
}
