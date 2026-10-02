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
  deleteDoc,
} from "firebase/firestore";
import { ref, set, get, onValue, update, DatabaseReference } from "firebase/database";
import { db, rtdb } from "./firebase";
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

export interface WalletHoldings {
  uid: string;
  permanentAddress: string;
  mycBalance: number;
  ethBalance: number;
  organization: string;
  displayName?: string;
  email?: string;
  updatedAt?: number;
}

export interface KnownAccount {
  id: string;
  name: string;
  organization: string;
  address: string;
  email?: string;
  role?: string;
  avatarColor: string;
  mycBalance?: number;
  ethBalance?: number;
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
    mycBalance: 0, // Starts at 0, credited on UTXO payment
    ethBalance: 5.0,
  },
  {
    id: "acc-alice",
    name: "Alice",
    organization: "Consensus Capital Reserve",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    email: "alice@consensuscap.io",
    role: "Treasury Asset Manager",
    avatarColor: "bg-purple-600",
    mycBalance: 0, // Starts at 0, credited on UTXO payment
    ethBalance: 5.0,
  },
  {
    id: "acc-vault",
    name: "Cold Vault 02",
    organization: "Institutional Treasury Reserve",
    address: "0x3F82d89F1283cE3048b29c9162E049860De978c4",
    email: "vault02@apexcustody.com",
    role: "Multi-Sig Cold Custodian",
    avatarColor: "bg-emerald-600",
    mycBalance: 0,
    ethBalance: 10.0,
  },
];

// ============================================================================
// FIREBASE REALTIME DATABASE (RTDB) - WALLET HOLDINGS & ADDRESS STORAGE
// ============================================================================

/**
 * Subscribes to wallet address and token holdings directly from Firebase Realtime Database.
 * If the wallet doesn't exist yet in Realtime Database, it initializes it.
 */
export function subscribeWalletHoldingsFromRTDB(
  uid: string,
  permanentAddress: string,
  user: FirebaseUser | null,
  initialOrg: string,
  callback: (holdings: WalletHoldings) => void
): () => void {
  try {
    const walletRef = ref(rtdb, `wallets/${uid}`);
    
    const unsubscribe = onValue(
      walletRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val() as WalletHoldings;
          callback(data);
        } else if (permanentAddress) {
          // Initialize new wallet in Firebase Realtime Database
          const newWallet: WalletHoldings = {
            uid,
            permanentAddress,
            mycBalance: 0, // Zero initial mock balance: must be minted/received via UTXO
            ethBalance: 5.0,
            organization: initialOrg || "Apex Institutional Custody",
            displayName: user?.displayName || user?.email?.split("@")[0] || "Trader",
            email: user?.email || "",
            updatedAt: Date.now(),
          };
          try {
            await set(walletRef, newWallet);
            callback(newWallet);
          } catch (writeErr) {
            console.warn("RTDB initial set warning (using memory):", writeErr);
            callback(newWallet);
          }
        }
      },
      (error) => {
        console.warn("RTDB subscribeWalletHoldings error (falling back to Firestore):", error);
      }
    );

    return () => unsubscribe();
  } catch (error) {
    console.warn("RTDB subscription failed:", error);
    return () => {};
  }
}

/**
 * Updates wallet holdings (MYC & ETH balances) in Firebase Realtime Database
 */
export async function updateWalletHoldingsInRTDB(
  uid: string,
  mycBalance: number,
  ethBalance: number,
  permanentAddress?: string
): Promise<void> {
  try {
    const walletRef = ref(rtdb, `wallets/${uid}`);
    const updates: Partial<WalletHoldings> = {
      mycBalance,
      ethBalance,
      updatedAt: Date.now(),
    };
    if (permanentAddress) {
      updates.permanentAddress = permanentAddress;
    }
    await update(walletRef, updates);
  } catch (error) {
    console.warn("Firebase RTDB updateWalletHoldings error:", error);
  }
}

/**
 * Updates user organization in Firebase Realtime Database
 */
export async function updateWalletOrgInRTDB(uid: string, organization: string): Promise<void> {
  try {
    const walletRef = ref(rtdb, `wallets/${uid}`);
    await update(walletRef, {
      organization,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.warn("Firebase RTDB updateWalletOrg error:", error);
  }
}

// ============================================================================
// FIRESTORE DATABASE - COUNTERPARTIES (BOB), DIRECTORY & TRANSACTION LEDGER
// ============================================================================

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
 * Stores or updates user account info and permanent address in Firestore `users/{uid}`
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
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, profile, { merge: true });

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
