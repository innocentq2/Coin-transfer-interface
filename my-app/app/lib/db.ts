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
  getDocs,
  deleteDoc,
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
  email?: string;
  role?: string;
  avatarColor: string;
  updatedAt?: unknown;
}

export interface FirestoreTransaction {
  id?: string;
  type: string;
  amount: string;
  fiatValue: string;
  details: string;
  senderAddress: string;
  recipientAddress: string;
  recipientName?: string;
  recipientOrg?: string;
  status: string;
  createdAt?: unknown;
}

// Default seeded accounts for the directory (Bob, Alice, Cold Vault)
export const DEFAULT_KNOWN_ACCOUNTS: KnownAccount[] = [
  {
    id: "acc-bob",
    name: "Bob",
    organization: "Apex Custody OTC Desk",
    address: "0xedEe7c1429505bcA418Cc48b8Cf8B37E8d602843",
    email: "bob.trader@apexcustody.com",
    role: "Senior OTC Liquidity Provider",
    avatarColor: "bg-blue-600",
  },
  {
    id: "acc-alice",
    name: "Alice",
    organization: "Consensus Capital Reserve",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    email: "alice@consensuscap.io",
    role: "Treasury Asset Manager",
    avatarColor: "bg-purple-600",
  },
  {
    id: "acc-vault",
    name: "Cold Vault 02",
    organization: "Institutional Treasury Reserve",
    address: "0x3F82d89F1283cE3048b29c9162E049860De978c4",
    email: "vault02@apexcustody.com",
    role: "Multi-Sig Cold Custodian",
    avatarColor: "bg-emerald-600",
  },
];

/**
 * Seeds default accounts (Bob, Alice, Cold Vault) into Firestore `accounts` collection if not present
 */
export async function seedDefaultAccountsToFirebase(): Promise<void> {
  try {
    for (const acc of DEFAULT_KNOWN_ACCOUNTS) {
      const docRef = doc(db, "accounts", acc.id);
      await setDoc(
        docRef,
        {
          ...acc,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (error) {
    console.warn("Firestore seedDefaultAccounts warning (may be using offline/local state):", error);
  }
}

/**
 * Real-time listener for Firestore `accounts` collection.
 * Automatically seeds Bob and counterparties if empty, and notifies callback with updated array.
 */
export function subscribeToAccounts(
  callback: (accounts: KnownAccount[]) => void
): () => void {
  try {
    const accountsCol = collection(db, "accounts");
    const unsubscribe = onSnapshot(
      accountsCol,
      async (snapshot) => {
        if (snapshot.empty) {
          // Auto-seed default accounts (Bob, Alice, Vault) into Firestore
          await seedDefaultAccountsToFirebase();
          callback(DEFAULT_KNOWN_ACCOUNTS);
          return;
        }

        const accountsList: KnownAccount[] = [];
        snapshot.forEach((d) => {
          accountsList.push(d.data() as KnownAccount);
        });

        // Ensure Bob always exists even if not in snapshot
        const hasBob = accountsList.some((a) => a.id === "acc-bob" || a.name.toLowerCase() === "bob");
        if (!hasBob) {
          accountsList.unshift(DEFAULT_KNOWN_ACCOUNTS[0]);
        }

        callback(accountsList);
      },
      (error) => {
        console.warn("Firestore subscribeToAccounts error, using default accounts:", error);
        callback(DEFAULT_KNOWN_ACCOUNTS);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.warn("Firestore subscription failed, falling back to local defaults:", error);
    callback(DEFAULT_KNOWN_ACCOUNTS);
    return () => {};
  }
}

/**
 * Creates or updates an account (such as Bob's name, organization, or permanent address) in Firestore
 */
export async function saveAccountToFirebase(account: KnownAccount): Promise<void> {
  try {
    const docRef = doc(db, "accounts", account.id);
    await setDoc(
      docRef,
      {
        ...account,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Firestore saveAccount error:", error);
    throw error;
  }
}

/**
 * Deletes an account from Firestore
 */
export async function deleteAccountFromFirebase(id: string): Promise<void> {
  try {
    const docRef = doc(db, "accounts", id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Firestore deleteAccount error:", error);
    throw error;
  }
}

/**
 * Stores or updates user account info and permanent address in Firestore `users/{uid}` and `accounts/{uid}`
 */
export async function syncUserProfileToFirebase(
  user: FirebaseUser,
  permanentAddress: string,
  mycBalance: number,
  ethBalance: number,
  organization: string = "Apex Institutional Custody",
  role: string = "Portfolio Manager"
): Promise<UserProfile> {
  const profile: UserProfile = {
    uid: user.uid,
    displayName: user.displayName || user.email?.split("@")[0] || "Trader",
    email: user.email || "",
    photoURL: user.photoURL || "",
    permanentAddress,
    organization,
    role,
    mycBalance,
    ethBalance,
    updatedAt: serverTimestamp(),
  };

  try {
    // 1. Update user profile document in Firestore
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, profile, { merge: true });

    // 2. Also register the user as an active account in the directory
    const accountRef = doc(db, "accounts", user.uid);
    await setDoc(
      accountRef,
      {
        id: user.uid,
        name: profile.displayName,
        organization: profile.organization,
        address: permanentAddress,
        email: profile.email,
        role: profile.role,
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
 * Real-time listener for user profile in Firestore `users/{uid}`
 */
export function subscribeToUserProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void
): () => void {
  try {
    const userRef = doc(db, "users", uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          callback(snap.data() as UserProfile);
        } else {
          callback(null);
        }
      },
      (error) => {
        console.warn("Firestore subscribeToUserProfile error:", error);
        callback(null);
      }
    );
    return unsubscribe;
  } catch (error) {
    console.warn("Firestore user profile subscription failed:", error);
    callback(null);
    return () => {};
  }
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

/**
 * Real-time listener for recent transactions from Firestore collection `transactions`
 */
export function subscribeToTransactions(
  callback: (transactions: FirestoreTransaction[]) => void
): () => void {
  try {
    const txCollection = collection(db, "transactions");
    const q = query(txCollection, orderBy("createdAt", "desc"), limit(25));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: FirestoreTransaction[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as FirestoreTransaction) });
        });
        callback(list);
      },
      (error) => {
        // Fallback query without orderBy if index is being built
        console.warn("Firestore ordered query failed, trying simple query:", error);
        const fallbackSub = onSnapshot(txCollection, (snap) => {
          const list: FirestoreTransaction[] = [];
          snap.forEach((d) => {
            list.push({ id: d.id, ...(d.data() as FirestoreTransaction) });
          });
          callback(list);
        });
        return fallbackSub;
      }
    );

    return unsubscribe;
  } catch (error) {
    console.warn("Firestore subscribeToTransactions error:", error);
    return () => {};
  }
}
