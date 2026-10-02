"use client";

import React, { useState, useEffect } from "react";
import {
  LayoutGrid,
  TrendingUp,
  History,
  Settings,
  Search,
  ChevronDown,
  Bell,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Copy,
  Check,
  CheckCircle2,
  RefreshCw,
  Coins,
  X,
  Send,
  Sparkles,
  QrCode,
  Flame,
  ShieldCheck,
  Activity,
  LogOut,
  User,
  KeyRound,
  Building2,
  Users,
  Edit2,
  Database,
  Lock,
  Scale,
  ArrowRight,
  Boxes,
  Pickaxe,
} from "lucide-react";
import UTXOBlockchainExplorer from "./UTXOBlockchainExplorer";
import { QRCodeSVG } from "qrcode.react";
import { auth, googleProvider } from "../lib/firebase";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import { deriveUserWallet } from "../lib/wallet";
import {
  syncUserProfileToFirebase,
  getUserProfileFromFirebase,
  recordTransactionToFirebase,
  subscribeToTransactions,
  subscribeToAccounts,
  saveAccountToFirebase,
  seedDefaultAccountsToFirebase,
  subscribeWalletHoldingsFromRTDB,
  updateWalletHoldingsInRTDB,
  updateWalletOrgInRTDB,
  DEFAULT_KNOWN_ACCOUNTS,
  KnownAccount,
} from "../lib/db";
import {
  executeUTXOPayment,
  mintUTXOCoins,
  getUTXOBalance,
  getUnspentUTXOsForAddress,
} from "../lib/utxoService";

interface Transaction {
  id: string;
  type:
  | "Deposit"
  | "Send"
  | "Mint"
  | "Burn"
  | "AMM Swap"
  | "Bonding Buy"
  | "Bonding Sell"
  | "Send (UTXO)"
  | "Mint (UTXO)"
  | "Deposit (UTXO)";
  amount: string;
  fiatValue: string;
  details: string;
  sender?: string;
  recipientFull?: string;
  recipientOrg?: string;
  date: string;
  status: "Completed" | "Pending";
}

export default function ApexDashboard() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"Portfolio" | "Market" | "Activity" | "Settings" | "Directory" | "Curve" | "UTXO">("Portfolio");
  const [timeframe, setTimeframe] = useState<"1D" | "1W" | "1M" | "1Y">("1W");
  const [txFilter, setTxFilter] = useState<"All" | "Received" | "Sent">("All");

  // Firebase Authentication & User Profile State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userAddress, setUserAddress] = useState<string>("");
  const [userOrg, setUserOrg] = useState<string>("Apex Institutional Custody");
  const [isEditingOrg, setIsEditingOrg] = useState<boolean>(false);
  const [editedOrg, setEditedOrg] = useState<string>("");
  const [dbSynced, setDbSynced] = useState<boolean>(false);

  // Network State
  const [selectedNetwork, setSelectedNetwork] = useState<string>("Sepolia Testnet");
  const [isNetworkOpen, setIsNetworkOpen] = useState<boolean>(false);

  // Directory of Contacts / Organizations (e.g. BOB, Alice, Cold Vault) - Synced with Firebase
  const [contacts, setContacts] = useState<KnownAccount[]>(DEFAULT_KNOWN_ACCOUNTS);

  // Counterparty / Account creation & editing modal state (stored in Firebase)
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [editingAccount, setEditingAccount] = useState<KnownAccount | null>(null);
  const [accountFormName, setAccountFormName] = useState<string>("");
  const [accountFormOrg, setAccountFormOrg] = useState<string>("");
  const [accountFormAddress, setAccountFormAddress] = useState<string>("");
  const [accountFormRole, setAccountFormRole] = useState<string>("");
  const [accountFormEmail, setAccountFormEmail] = useState<string>("");
  const [isSavingAccount, setIsSavingAccount] = useState<boolean>(false);
  const [accountSaveSuccess, setAccountSaveSuccess] = useState<string | null>(null);

  // Deposit address states
  const [copied, setCopied] = useState<boolean>(false);
  const [requestedAmount, setRequestedAmount] = useState<string>("");

  // Modals state
  const [isSendOpen, setIsSendOpen] = useState<boolean>(false);
  const [isSwapOpen, setIsSwapOpen] = useState<boolean>(false);
  const [isMintOpen, setIsMintOpen] = useState<boolean>(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);

  // Form State for Send
  const [sendRecipient, setSendRecipient] = useState<string>("");
  const [recipientName, setRecipientName] = useState<string>("");
  const [recipientOrg, setRecipientOrg] = useState<string>("");
  const [sendAmount, setSendAmount] = useState<string>("");
  const [sendFee, setSendFee] = useState<string>("0.1");
  const [sendStage, setSendStage] = useState<"idle" | "signing" | "mempool" | "mining" | "confirmed">("idle");
  const [isMiningFaucet, setIsMiningFaucet] = useState<boolean>(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);

  // Form State for Mint
  const [mintAmount, setMintAmount] = useState<string>("50000");
  const [mintRecipient, setMintRecipient] = useState<string>("");
  const [isMinting, setIsMinting] = useState<boolean>(false);
  const [mintSuccessMsg, setMintSuccessMsg] = useState<string | null>(null);

  // User Vault Balances - Stored & Streamed Live from Firebase Realtime Database
  const hardCap = 10000000.0;
  const [balanceMYC, setBalanceMYC] = useState<number>(100);
  const [balanceETH, setBalanceETH] = useState<number>(2.5);

  // ==========================================
  // AMM CONSTANT PRODUCT POOL STATE (x * y = k)
  // ==========================================
  const ethUsdRate = 3400.0; // 1 ETH = $3,400 USD
  const [poolETH, setPoolETH] = useState<number>(100.0);
  const [poolMYC, setPoolMYC] = useState<number>(1000000.0);

  const spotPriceInETH = poolETH / poolMYC;
  const spotPriceInUSD = spotPriceInETH * ethUsdRate;

  // Swap Form State
  const [swapDirection, setSwapDirection] = useState<"ETH_TO_MYC" | "MYC_TO_ETH">("ETH_TO_MYC");
  const [swapInputAmt, setSwapInputAmt] = useState<string>("1.0");
  const [isSwapping, setIsSwapping] = useState<boolean>(false);
  const [swapSuccessMsg, setSwapSuccessMsg] = useState<string | null>(null);

  // ==========================================
  // BONDING CURVE PARAMETERS (P(S) = P0 + M * S)
  // ==========================================
  const P0 = 0.0001; // Starting price: 0.0001 ETH
  const M = 0.000001; // Slope: 1e12 wei = 0.000001 ETH per coin
  const MAX_CURVE_SUPPLY = 10000.0; // 10,000 coins hard cap
  const [curveSupply, setCurveSupply] = useState<number>(60.0);
  const [curveTradeMode, setCurveTradeMode] = useState<"BUY" | "SELL">("BUY");
  const [curveAmountInput, setCurveAmountInput] = useState<string>("40");
  const [isCurveTrading, setIsCurveTrading] = useState<boolean>(false);
  const [curveSuccessMsg, setCurveSuccessMsg] = useState<string | null>(null);

  // Bonding Curve Math: P(S) = P0 + M * S
  const currentCurvePriceETH = P0 + M * curveSupply;
  const currentCurvePriceUSD = currentCurvePriceETH * ethUsdRate;
  const currentCurveReserveETH = P0 * curveSupply + (M / 2) * (curveSupply ** 2);

  // Cost to buy Δ coins: Area = P0 * Δ + (M/2) * ((S+Δ)^2 - S^2)
  const calcCurveBuyCost = (amt: number, s: number = curveSupply) => {
    if (isNaN(amt) || amt <= 0) return 0;
    return P0 * amt + (M / 2) * ((s + amt) ** 2 - s ** 2);
  };

  // Refund to sell Δ coins: Area = P0 * Δ + (M/2) * (S^2 - (S-Δ)^2)
  const calcCurveSellRefund = (amt: number, s: number = curveSupply) => {
    if (isNaN(amt) || amt <= 0 || amt > s) return 0;
    return P0 * amt + (M / 2) * (s ** 2 - (s - amt) ** 2);
  };

  // Listen to Firebase Auth Changes & Real-Time Sync with Firestore Database
  useEffect(() => {
    let unsubRTDBWallet: (() => void) | null = null;

    // 1. Auth state listener
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubRTDBWallet) {
        unsubRTDBWallet();
        unsubRTDBWallet = null;
      }

      if (user) {
        setCurrentUser(user);
        const { address } = deriveUserWallet(user.uid);
        setUserAddress(address);
        setMintRecipient(address);

        // Fetch existing profile from Firebase Firestore if available
        const existingProfile = await getUserProfileFromFirebase(user.uid);
        const orgToUse = existingProfile?.organization || userOrg;
        if (existingProfile?.organization) {
          setUserOrg(existingProfile.organization);
        }

        // 2. Real-Time Stream from Firebase Realtime Database (RTDB) for Wallet Holdings & Address
        unsubRTDBWallet = subscribeWalletHoldingsFromRTDB(
          user.uid,
          address,
          user,
          orgToUse,
          (holdings) => {
            if (holdings) {
              if (holdings.permanentAddress) {
                setUserAddress(holdings.permanentAddress);
              }
              if (typeof holdings.mycBalance === "number") {
                setBalanceMYC(holdings.mycBalance);
              }
              if (typeof holdings.ethBalance === "number") {
                setBalanceETH(holdings.ethBalance);
              }
              if (holdings.organization) {
                setUserOrg(holdings.organization);
              }
              setDbSynced(true);
            }
          }
        );

        // Also sync profile to Firestore
        await syncUserProfileToFirebase(
          user,
          address,
          balanceMYC,
          balanceETH,
          orgToUse
        );
        setDbSynced(true);
      } else {
        setCurrentUser(null);
        setUserAddress("");
        setMintRecipient("");
        setBalanceMYC(100);
        setBalanceETH(2.5);
        setDbSynced(false);
      }
    });

    // 2. Real-time subscription to accounts in Firebase (Bob, Alice, Vault, and new accounts)
    const unsubAccounts = subscribeToAccounts(async (firebaseAccounts) => {
      if (firebaseAccounts && firebaseAccounts.length > 0) {
        const enriched = await Promise.all(
          firebaseAccounts.map(async (acc) => {
            const utxoBal = await getUTXOBalance(acc.address);
            return {
              ...acc,
              mycBalance: utxoBal > 0 ? utxoBal : (acc.mycBalance ?? 0),
            };
          })
        );
        setContacts(enriched);
        setDbSynced(true);
      }
    });

    // 3. Real-time subscription to transactions in Firebase Firestore
    const unsubTransactions = subscribeToTransactions((fbTxs) => {
      if (fbTxs && fbTxs.length > 0) {
        const mapped: Transaction[] = fbTxs.map((t) => ({
          id: t.id || `tx-${Math.random()}`,
          type: (t.type as "Deposit" | "Send" | "Mint" | "Burn" | "AMM Swap") || "Send",
          amount: t.amount,
          fiatValue: t.fiatValue,
          details: t.details,
          sender: t.senderAddress,
          recipientFull: t.recipientAddress,
          recipientOrg: t.recipientOrg,
          date: "Firebase Cloud Sync",
          status: (t.status as "Completed" | "Pending") || "Completed",
        }));
        setTransactions(mapped);
      }
    });

    return () => {
      if (unsubRTDBWallet) unsubRTDBWallet();
      unsubAuth();
      unsubAccounts();
      unsubTransactions();
    };
  }, []);

  const handleSaveOrganization = async () => {
    if (!editedOrg.trim()) return;
    setUserOrg(editedOrg);
    setIsEditingOrg(false);

    if (currentUser) {
      await updateWalletOrgInRTDB(currentUser.uid, editedOrg);
      await syncUserProfileToFirebase(currentUser, userAddress, balanceMYC, balanceETH, editedOrg);
    }
  };

  const handleOpenEditAccount = (acc: KnownAccount) => {
    setEditingAccount(acc);
    setAccountFormName(acc.name);
    setAccountFormOrg(acc.organization);
    setAccountFormAddress(acc.address);
    setAccountFormRole(acc.role || "");
    setAccountFormEmail(acc.email || "");
    setIsAccountModalOpen(true);
  };

  const handleOpenCreateAccount = () => {
    setEditingAccount(null);
    setAccountFormName("");
    setAccountFormOrg("");
    setAccountFormAddress("");
    setAccountFormRole("Institutional Counterparty");
    setAccountFormEmail("");
    setIsAccountModalOpen(true);
  };

  const handleSaveAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountFormName.trim() || !accountFormAddress.trim()) {
      alert("Name and Address are required");
      return;
    }

    setIsSavingAccount(true);
    try {
      const accId = editingAccount ? editingAccount.id : `acc-${Date.now()}`;
      const updatedAcc: KnownAccount = {
        id: accId,
        name: accountFormName.trim(),
        organization: accountFormOrg.trim() || "Apex OTC Desk",
        address: accountFormAddress.trim(),
        role: accountFormRole.trim() || "Counterparty",
        email: accountFormEmail.trim() || "",
        avatarColor: editingAccount ? editingAccount.avatarColor : "bg-teal-600",
      };

      await saveAccountToFirebase(updatedAcc);

      // Optimistic update in state
      setContacts((prev) => {
        const idx = prev.findIndex((a) => a.id === accId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updatedAcc;
          return next;
        }
        return [...prev, updatedAcc];
      });

      setAccountSaveSuccess(`Saved ${updatedAcc.name} (${updatedAcc.organization}) to Firebase Firestore!`);
      setTimeout(() => {
        setIsAccountModalOpen(false);
        setAccountSaveSuccess(null);
      }, 1200);
    } catch (err) {
      console.error("Failed to save account to Firebase:", err);
      alert("Failed to save to Firebase.");
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleReseedBob = async () => {
    try {
      await seedDefaultAccountsToFirebase();
      alert("Bob ('Apex Custody OTC Desk') and default counterparties synced to Firebase Firestore!");
    } catch (err) {
      console.error("Reseed error:", err);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const { address } = deriveUserWallet(user.uid);
      setUserAddress(address);
      await syncUserProfileToFirebase(user, address, balanceMYC, balanceETH, userOrg);
      setDbSynced(true);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      console.error("Firebase Google Auth Error:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      setUserAddress("");
      setMintRecipient("");
      setDbSynced(false);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  // AMM Swap Calculations
  const calculateSwapOutput = (inputAmount: number, direction: "ETH_TO_MYC" | "MYC_TO_ETH") => {
    if (isNaN(inputAmount) || inputAmount <= 0) return { outputAmount: 0, priceImpact: 0, newSpotPrice: spotPriceInUSD };

    const feeMultiplier = 0.997; // 0.3% LP fee
    const inputWithFee = inputAmount * feeMultiplier;

    if (direction === "ETH_TO_MYC") {
      const outputMYC = (poolMYC * inputWithFee) / (poolETH + inputWithFee);
      const newPoolETH = poolETH + inputAmount;
      const newPoolMYC = poolMYC - outputMYC;
      const newSpotETH = newPoolETH / newPoolMYC;
      const newSpotUSD = newSpotETH * ethUsdRate;
      const executionPrice = (inputAmount * ethUsdRate) / outputMYC;
      const priceImpact = ((executionPrice - spotPriceInUSD) / spotPriceInUSD) * 100;
      return { outputAmount: outputMYC, priceImpact, newSpotPrice: newSpotUSD };
    } else {
      const outputETH = (poolETH * inputWithFee) / (poolMYC + inputWithFee);
      const newPoolMYC = poolMYC + inputAmount;
      const newPoolETH = poolETH - outputETH;
      const newSpotETH = newPoolETH / newPoolMYC;
      const newSpotUSD = newSpotETH * ethUsdRate;
      const executionPrice = (outputETH * ethUsdRate) / inputAmount;
      const priceImpact = ((spotPriceInUSD - executionPrice) / spotPriceInUSD) * 100;
      return { outputAmount: outputETH, priceImpact, newSpotPrice: newSpotUSD };
    }
  };

  const parsedSwapInput = parseFloat(swapInputAmt) || 0;
  const swapResult = calculateSwapOutput(parsedSwapInput, swapDirection);

  // Recent Transactions (Live from Firebase Firestore & Real UTXO Ledger)
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const validateAddress = (addr: string): boolean => {
    const trimmed = addr.trim();
    if (!trimmed) {
      setAddressError("Please enter a destination address");
      return false;
    }
    if (trimmed.startsWith("0x")) {
      if (trimmed.length !== 42 || !/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
        setAddressError("Invalid EVM address format (expected 0x + 40 hex chars)");
        return false;
      }
    } else if (trimmed.startsWith("ADDR")) {
      if (trimmed.length < 15) {
        setAddressError("Invalid UTXO chain address format");
        return false;
      }
    } else if (trimmed.length < 3) {
      setAddressError("Address appears too short");
      return false;
    }
    setAddressError(null);
    return true;
  };

  const handleMineFaucet = async () => {
    setIsMiningFaucet(true);
    try {
      const recipientAddr = userAddress || "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
      const recipientOwner = currentUser?.displayName || currentUser?.email || "Vault Custody";
      
      const res = await fetch("/api/utxo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "faucet",
          recipient: recipientAddr,
        }),
      });
      const data = await res.json();
      
      // Also mint directly to RTDB ledger
      await mintUTXOCoins(recipientAddr, recipientOwner, 50, "Faucet Coinbase Block Mining");
      setBalanceMYC((prev) => prev + 50);
      alert(`Mined 50 MYC via Proof of Work! Created new spendable UTXO for ${recipientOwner}.`);
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Faucet mining error: ${error.message}`);
    } finally {
      setIsMiningFaucet(false);
    }
  };

  const handleSelectContact = (account: KnownAccount) => {
    setSendRecipient(account.address);
    setRecipientName(account.name);
    setRecipientOrg(account.organization);
    setAddressError(null);
    setIsSendOpen(true);
  };

  const handleSendTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAddress(sendRecipient)) return;

    const amt = parseFloat(sendAmount);
    if (isNaN(amt) || amt <= 0) {
      alert("Please enter a valid amount greater than 0");
      return;
    }

    const feeNum = parseFloat(sendFee) || 0.1;
    const senderAddr = userAddress || "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
    const senderName = currentUser?.displayName || currentUser?.email || "Vault Custody";

    setIsSending(true);
    setSendStage("signing");

    // If balance is insufficient, automatically mine block reward to fund unspent UTXOs
    if (balanceMYC < amt + feeNum) {
      const needed = amt + feeNum - balanceMYC;
      const mintAmt = Math.max(100, Math.ceil(needed / 50) * 50);
      await mintUTXOCoins(
        senderAddr,
        senderName,
        mintAmt,
        "Auto-Mined Block Subsidy (Proof of Work)"
      );
      setBalanceMYC((prev) => prev + mintAmt);
    }

    const targetDisplay = recipientName
      ? `${recipientName} (${recipientOrg || "External Org"})`
      : sendRecipient.length > 12
        ? `${sendRecipient.slice(0, 6)}...${sendRecipient.slice(-4)}`
        : sendRecipient;

    try {
      await new Promise((r) => setTimeout(r, 350));
      setSendStage("mempool");
      await new Promise((r) => setTimeout(r, 400));
      setSendStage("mining");

      // 1. Execute REAL UTXO transfer (Consumes unspent inputs, creates recipient output, creates change)
      const result = await executeUTXOPayment({
        senderAddress: senderAddr,
        senderName: senderName,
        senderUid: currentUser?.uid,
        recipientAddress: sendRecipient,
        recipientName: recipientName || "Recipient",
        amount: amt,
        fee: feeNum,
        ethRate: spotPriceInUSD,
      });

      if (!result.success) {
        alert(result.error || "Payment failed to execute on UTXO ledger");
        setIsSending(false);
        setSendStage("idle");
        return;
      }

      setSendStage("confirmed");

      // 2. DEBIT: Update Sender's coin balance
      const newBal = result.newSenderBalance ?? Math.max(0, balanceMYC - amt - feeNum);
      setBalanceMYC(newBal);

      // 3. CREDIT: Update Recipient's coin balance in Directory contacts list
      setContacts((prev) =>
        prev.map((c) => {
          if (c.address.toLowerCase() === sendRecipient.toLowerCase()) {
            return {
              ...c,
              mycBalance: result.newRecipientBalance ?? ((c.mycBalance || 0) + amt),
            };
          }
          return c;
        })
      );

      const changeStr =
        result.changeAmount && result.changeAmount > 0
          ? ` • Change refund: ${result.changeAmount.toFixed(2)} MYC`
          : "";
      const inputsStr = result.inputsSpent
        ? ` (${result.inputsSpent.length} UTXO input(s) spent${changeStr})`
        : "";

      const newTx: Transaction = {
        id: result.txid || `tx-${Date.now()}`,
        type: "Send (UTXO)",
        amount: `-${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })} MYC`,
        fiatValue: `-$${(amt * spotPriceInUSD).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        details: `To: ${targetDisplay}${inputsStr}`,
        sender: senderAddr,
        recipientFull: sendRecipient,
        recipientOrg: recipientOrg || undefined,
        date: "Just now",
        status: "Completed",
      };

      setTransactions((prev) => [newTx, ...prev]);
      setIsSending(false);
      setSendSuccessMsg(
        `Transferred ${amt.toLocaleString()} MYC to ${targetDisplay}! Tx: ${result.txid?.slice(0, 8) || "tx"}… (1 Confirmation, Mined). Sender debited, recipient credited.`
      );
      setSendAmount("");
      setSendRecipient("");
      setRecipientName("");
      setRecipientOrg("");

      setTimeout(() => {
        setIsSendOpen(false);
        setSendSuccessMsg(null);
        setSendStage("idle");
      }, 2500);
    } catch (err: unknown) {
      const error = err as Error;
      alert(`UTXO Transfer Failed: ${error.message}`);
      setIsSending(false);
      setSendStage("idle");
    }
  };

  const handleExecuteSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedSwapInput <= 0) return;

    if (swapDirection === "ETH_TO_MYC") {
      if (parsedSwapInput > balanceETH) {
        alert(`Insufficient ETH balance (${balanceETH.toFixed(4)} ETH available)`);
        return;
      }
    } else {
      if (parsedSwapInput > balanceMYC) {
        alert(`Insufficient MYC balance (${balanceMYC.toLocaleString()} MYC available)`);
        return;
      }
    }

    setIsSwapping(true);

    setTimeout(async () => {
      const output = swapResult.outputAmount;

      if (swapDirection === "ETH_TO_MYC") {
        const nextETH = balanceETH - parsedSwapInput;
        const nextMYC = balanceMYC + output;
        setBalanceETH(nextETH);
        setBalanceMYC(nextMYC);
        setPoolETH((prev) => prev + parsedSwapInput);
        setPoolMYC((prev) => prev - output);

        await recordTransactionToFirebase({
          type: "AMM Swap",
          amount: `+${output.toLocaleString(undefined, { maximumFractionDigits: 2 })} MYC`,
          fiatValue: `$${(parsedSwapInput * ethUsdRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          details: "Bought MYC via AMM Pool (x·y=k)",
          senderAddress: userAddress,
          recipientAddress: "AMM_POOL",
          status: "Completed",
        });

        if (currentUser) {
          updateWalletHoldingsInRTDB(currentUser.uid, nextMYC, nextETH, userAddress);
          syncUserProfileToFirebase(currentUser, userAddress, nextMYC, nextETH, userOrg);
        }

        const newTx: Transaction = {
          id: `tx-swap-${Date.now()}`,
          type: "AMM Swap",
          amount: `+${output.toLocaleString(undefined, { maximumFractionDigits: 2 })} MYC`,
          fiatValue: `$${(parsedSwapInput * ethUsdRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          details: "Bought MYC via AMM Pool (x·y=k)",
          date: "Just now",
          status: "Completed",
        };
        setTransactions((prev) => [newTx, ...prev]);
        setSwapSuccessMsg(
          `Bought ${output.toLocaleString(undefined, { maximumFractionDigits: 2 })} MYC! Pool updated.`
        );
      } else {
        const nextMYC = balanceMYC - parsedSwapInput;
        const nextETH = balanceETH + output;
        setBalanceMYC(nextMYC);
        setBalanceETH(nextETH);
        setPoolMYC((prev) => prev + parsedSwapInput);
        setPoolETH((prev) => prev - output);

        await recordTransactionToFirebase({
          type: "AMM Swap",
          amount: `-${parsedSwapInput.toLocaleString(undefined, { maximumFractionDigits: 2 })} MYC`,
          fiatValue: `$${(output * ethUsdRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          details: "Sold MYC for ETH via AMM Pool (x·y=k)",
          senderAddress: userAddress,
          recipientAddress: "AMM_POOL",
          status: "Completed",
        });

        if (currentUser) {
          updateWalletHoldingsInRTDB(currentUser.uid, nextMYC, nextETH, userAddress);
          syncUserProfileToFirebase(currentUser, userAddress, nextMYC, nextETH, userOrg);
        }

        const newTx: Transaction = {
          id: `tx-swap-${Date.now()}`,
          type: "AMM Swap",
          amount: `-${parsedSwapInput.toLocaleString(undefined, { maximumFractionDigits: 2 })} MYC`,
          fiatValue: `$${(output * ethUsdRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          details: `Sold for ${output.toFixed(4)} ETH via AMM Pool (x·y=k)`,
          date: "Just now",
          status: "Completed",
        };
        setTransactions((prev) => [newTx, ...prev]);
        setSwapSuccessMsg(
          `Sold ${parsedSwapInput.toLocaleString()} MYC for ${output.toFixed(4)} ETH! Pool updated.`
        );
      }

      setIsSwapping(false);
      setTimeout(() => {
        setIsSwapOpen(false);
        setSwapSuccessMsg(null);
      }, 2000);
    }, 850);
  };

  const handleExecuteCurveTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(curveAmountInput);
    if (isNaN(amt) || amt <= 0) return;

    if (!currentUser) {
      alert("Please sign in with Google to trade on the bonding curve.");
      return;
    }

    setIsCurveTrading(true);

    if (curveTradeMode === "BUY") {
      if (curveSupply + amt > MAX_CURVE_SUPPLY) {
        alert(`Cap exceeded! Maximum curve supply is ${MAX_CURVE_SUPPLY.toLocaleString()} CRV`);
        setIsCurveTrading(false);
        return;
      }
      const costETH = calcCurveBuyCost(amt);
      if (costETH > balanceETH) {
        alert(`Insufficient ETH. Cost is ${costETH.toFixed(5)} ETH but available balance is ${balanceETH.toFixed(4)} ETH`);
        setIsCurveTrading(false);
        return;
      }

      try {
        const nextETH = balanceETH - costETH;
        const nextCurveSupply = curveSupply + amt;

        // Mint fresh UTXO to user's address
        const { txid } = await mintUTXOCoins(
          userAddress,
          currentUser.displayName || "Curve Trader",
          amt,
          "Bonding Curve Buy"
        );

        const nextBal = await getUTXOBalance(userAddress);
        setBalanceETH(nextETH);
        setBalanceMYC(nextBal);
        setCurveSupply(nextCurveSupply);

        if (currentUser) {
          await updateWalletHoldingsInRTDB(currentUser.uid, nextBal, nextETH, userAddress);
          syncUserProfileToFirebase(currentUser, userAddress, nextBal, nextETH, userOrg);
        }

        const newTx: Transaction = {
          id: txid,
          type: "Bonding Buy",
          amount: `+${amt.toFixed(2)} CRV`,
          fiatValue: `-$${(costETH * ethUsdRate).toFixed(2)}`,
          details: `Bought via Curve (P = P0 + M·S) • Minted new UTXO`,
          date: "Just now",
          status: "Completed",
        };
        setTransactions((prev) => [newTx, ...prev]);

        setIsCurveTrading(false);
        setCurveSuccessMsg(`Bought ${amt} CRV for ${costETH.toFixed(4)} ETH! UTXO minted. Supply now ${nextCurveSupply} CRV.`);
        setTimeout(() => setCurveSuccessMsg(null), 3000);
      } catch (err: unknown) {
        const error = err as Error;
        alert(`Curve Buy failed: ${error.message}`);
        setIsCurveTrading(false);
      }
    } else {
      if (amt > curveSupply) {
        alert(`Cannot sell more than total circulating supply (${curveSupply} CRV)`);
        setIsCurveTrading(false);
        return;
      }
      if (amt > balanceMYC) {
        alert(`Insufficient coins. You hold ${balanceMYC.toLocaleString()} CRV`);
        setIsCurveTrading(false);
        return;
      }
      const refundETH = calcCurveSellRefund(amt);

      try {
        // Burn UTXOs by sending to burn address
        const burnRes = await executeUTXOPayment({
          senderAddress: userAddress,
          senderName: currentUser.displayName || "Curve Trader",
          senderUid: currentUser.uid,
          recipientAddress: "0x000000000000000000000000000000000000dEaD",
          recipientName: "Curve Reserve Burn",
          amount: amt,
          fee: 0,
        });

        if (!burnRes.success) {
          alert(burnRes.error || "Failed to burn coins via UTXO");
          setIsCurveTrading(false);
          return;
        }

        const nextETH = balanceETH + refundETH;
        const nextCurveSupply = Math.max(0, curveSupply - amt);
        const nextBal = burnRes.newSenderBalance ?? Math.max(0, balanceMYC - amt);

        setBalanceMYC(nextBal);
        setBalanceETH(nextETH);
        setCurveSupply(nextCurveSupply);

        if (currentUser) {
          await updateWalletHoldingsInRTDB(currentUser.uid, nextBal, nextETH, userAddress);
          syncUserProfileToFirebase(currentUser, userAddress, nextBal, nextETH, userOrg);
        }

        const newTx: Transaction = {
          id: burnRes.txid || `tx-burn-${Date.now()}`,
          type: "Bonding Sell",
          amount: `-${amt.toFixed(2)} CRV`,
          fiatValue: `+$${(refundETH * ethUsdRate).toFixed(2)}`,
          details: `Sold via Bonding Curve • Refund: ${refundETH.toFixed(4)} ETH`,
          date: "Just now",
          status: "Completed",
        };
        setTransactions((prev) => [newTx, ...prev]);

        setIsCurveTrading(false);
        setCurveSuccessMsg(`Sold ${amt} CRV for ${refundETH.toFixed(4)} ETH refund! UTXOs burned.`);
        setTimeout(() => setCurveSuccessMsg(null), 3000);
      } catch (err: unknown) {
        const error = err as Error;
        alert(`Curve Sell failed: ${error.message}`);
        setIsCurveTrading(false);
      }
    }
  };

  const handleMintTokens = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(mintAmount);
    if (isNaN(amt) || amt <= 0) return;

    if (balanceMYC + amt > hardCap) {
      alert(`Cannot mint above hard cap of ${hardCap.toLocaleString()} MYC!`);
      return;
    }

    setIsMinting(true);
    try {
      const target = mintRecipient || userAddress;
      const { txid } = await mintUTXOCoins(
        target,
        currentUser?.displayName || "Vault User",
        amt,
        "Vault Token Mint"
      );

      const nextBal = await getUTXOBalance(target);
      if (target.toLowerCase() === userAddress.toLowerCase()) {
        setBalanceMYC(nextBal);
      }

      if (currentUser) {
        updateWalletHoldingsInRTDB(currentUser.uid, nextBal, balanceETH, userAddress);
        syncUserProfileToFirebase(currentUser, userAddress, nextBal, balanceETH, userOrg);
      }

      const newTx: Transaction = {
        id: txid,
        type: "Mint (UTXO)",
        amount: `+${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })} MYC`,
        fiatValue: `+$${(amt * spotPriceInUSD).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        details: `Mint to: ${target.slice(0, 6)}...${target.slice(-4)} (New UTXO Created)`,
        recipientFull: target,
        date: "Just now",
        status: "Completed",
      };

      setTransactions((prev) => [newTx, ...prev]);
      setIsMinting(false);
      setMintSuccessMsg(`Successfully minted ${amt.toLocaleString()} MYC as a fresh unspent UTXO!`);
      setTimeout(() => {
        setIsMintOpen(false);
        setMintSuccessMsg(null);
      }, 1800);
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Minting error: ${error.message}`);
      setIsMinting(false);
    }
  };

  // Filtered transactions
  const filteredTxs = transactions.filter((tx) => {
    if (txFilter === "Received") return tx.type === "Deposit" || tx.type === "Mint";
    if (txFilter === "Sent") return tx.type === "Send";
    return true;
  });

  const totalVaultValueUSD = balanceMYC * spotPriceInUSD + balanceETH * ethUsdRate;
  const qrCodeValue = requestedAmount
    ? `ethereum:${userAddress}?value=${requestedAmount}`
    : userAddress;

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-800 flex font-sans antialiased">
      {/* LEFT SIDEBAR */}
      <aside className="w-64 bg-white border-r border-slate-200/90 flex flex-col justify-between p-5 shrink-0 hidden md:flex">
        <div className="space-y-8">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 px-2 pt-1">
            <div className="w-10 h-10 rounded-xl bg-[#091522] border border-slate-700/60 flex items-center justify-center shadow-sm">
              <div className="relative w-5 h-5 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-teal-400 rotate-45 rounded-xs" />
                <div className="absolute w-2 h-2 bg-emerald-400 rounded-full" />
              </div>
            </div>
            <div>
              <h1 className="font-bold text-slate-900 text-base leading-tight tracking-tight">Apex Custody</h1>
              <span className="text-[11px] font-semibold text-teal-600 tracking-wide uppercase">
                {userOrg || "Institutional"}
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab("Portfolio")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === "Portfolio"
                  ? "bg-[#e8f8f0] text-[#00875a]"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
                }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Portfolio & Vault
            </button>

            <button
              onClick={() => setActiveTab("Curve")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === "Curve"
                  ? "bg-[#e8f8f0] text-[#00875a]"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
                }`}
            >
              <TrendingUp className="w-4 h-4" />
              Bonding Curve (CRV)
            </button>

            <button
              onClick={() => setActiveTab("UTXO")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === "UTXO"
                  ? "bg-[#e8f8f0] text-[#00875a]"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
                }`}
            >
              <Boxes className="w-4 h-4" />
              Bitcoin UTXO Chain
            </button>

            <button
              onClick={() => setActiveTab("Directory")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === "Directory"
                  ? "bg-[#e8f8f0] text-[#00875a]"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
                }`}
            >
              <Users className="w-4 h-4" />
              Directory &amp; Bob Org
            </button>

            <button
              onClick={() => setIsSwapOpen(true)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100/60 transition-all cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
              AMM Pool Swap
            </button>

            <button
              onClick={() => setActiveTab("Activity")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === "Activity"
                  ? "bg-[#e8f8f0] text-[#00875a]"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
                }`}
            >
              <History className="w-4 h-4" />
              Activity
            </button>
          </nav>
        </div>

        {/* Firebase Database Connection Status Badge */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-teal-600" />
              <span className="text-[11px] font-bold text-slate-700">Firebase Database</span>
            </div>
            <span
              className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${dbSynced ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                }`}
            >
              {dbSynced ? "LIVE SYNC" : "CONNECTED"}
            </span>
          </div>
          {currentUser && userAddress ? (
            <div className="text-[11px] text-slate-500 font-mono">
              {userAddress.slice(0, 8)}...{userAddress.slice(-6)}
            </div>
          ) : (
            <div className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
              <KeyRound className="w-3 h-3" />
              <span>Sign in to view address</span>
            </div>
          )}
          <div className="text-[10px] text-slate-400 truncate">
            Org: <strong className="text-slate-600">{currentUser ? userOrg : "Guest Mode"}</strong>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* TOP HEADER */}
        <header className="bg-white border-b border-slate-200/80 px-6 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-20">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search MYC transfers, Bob's address, or organizations..."
              className="w-full bg-[#f8fafc] border border-slate-200/90 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {/* Network Selector */}
            <div className="relative">
              <button
                onClick={() => setIsNetworkOpen(!isNetworkOpen)}
                className="bg-slate-50 border border-slate-200/90 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 flex items-center gap-2 hover:bg-slate-100/70 transition-colors shadow-2xs cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{selectedNetwork}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
              </button>

              {isNetworkOpen && (
                <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-30 animate-in fade-in slide-in-from-top-1">
                  {[
                    { name: "Sepolia Testnet", color: "bg-purple-500" },
                    { name: "Hardhat Local (31337)", color: "bg-emerald-500" },
                    { name: "Ethereum Mainnet", color: "bg-blue-500" },
                  ].map((net) => (
                    <button
                      key={net.name}
                      onClick={() => {
                        setSelectedNetwork(net.name);
                        setIsNetworkOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <span className={`w-2 h-2 rounded-full ${net.color}`} />
                      {net.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notification Bell */}
            <button className="relative p-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full" />
            </button>

            {/* FIREBASE AUTH PROFILE OR LOGIN BUTTON */}
            {currentUser ? (
              <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
                {currentUser.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || "User"}
                    className="w-9 h-9 rounded-full border border-emerald-500/40 object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    <span>{currentUser.displayName?.charAt(0) || "U"}</span>
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-bold text-slate-900 leading-tight">
                    {currentUser.displayName || "Google Account"}
                  </div>
                  <div className="text-[11px] text-teal-700 font-semibold truncate max-w-[130px]">
                    {userOrg}
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  title="Sign Out"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="pl-2 border-l border-slate-200">
                <button
                  onClick={handleGoogleSignIn}
                  className="bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Sign In with Google</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* DASHBOARD BODY */}
        <main className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
          {/* USER WELCOME & ADDRESS BANNER */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 text-white rounded-2xl p-6 shadow-sm border border-slate-800 relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 bg-teal-500/20 text-teal-300 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-teal-500/30">
                    <Database className="w-3.5 h-3.5" />
                    Firebase Firestore Linked
                  </span>
                  <div className="inline-flex items-center gap-1.5 text-xs text-slate-300 bg-white/10 px-2.5 py-0.5 rounded-full">
                    <Building2 className="w-3.5 h-3.5 text-teal-400" />
                    {isEditingOrg ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editedOrg}
                          onChange={(e) => setEditedOrg(e.target.value)}
                          placeholder="Enter Org Name"
                          className="bg-black/50 text-white px-2 py-0.5 text-xs rounded border border-teal-500 outline-none"
                        />
                        <button
                          onClick={handleSaveOrganization}
                          className="bg-teal-600 px-2 py-0.5 rounded text-[10px] font-bold"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <>
                        <span>{userOrg}</span>
                        <button
                          onClick={() => {
                            setEditedOrg(userOrg);
                            setIsEditingOrg(true);
                          }}
                          className="text-teal-300 hover:text-white"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                  {currentUser
                    ? `Account: ${currentUser.displayName || currentUser.email}`
                    : "Institutional Digital Asset Vault"}
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                  Your permanent address and organization details are stored in Firebase. You can send MYC coins directly to registered contacts like Bob or any specific address.
                </p>
              </div>

              {/* Unique Address Callout Box - ONLY SHOWN IF LOGGED IN */}
              {currentUser && userAddress ? (
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-3.5 border border-white/15 shrink-0 space-y-1.5 max-w-md animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-[11px] text-teal-200">
                    <span className="font-semibold uppercase tracking-wider">Your Permanent Address:</span>
                    <span className="font-mono text-[10px] bg-teal-500/20 px-2 py-0.5 rounded">
                      Firebase UID Seed
                    </span>
                  </div>
                  <div className="font-mono text-xs sm:text-sm text-white select-all break-all bg-black/30 p-2 rounded-lg border border-white/10">
                    {userAddress}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => copyToClipboard(userAddress)}
                      className="text-xs text-teal-300 hover:text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied" : "Copy Address"}
                    </button>
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                      Active Account
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-amber-400/20 shrink-0 space-y-2 max-w-md">
                  <div className="flex items-center justify-between text-[11px] text-amber-200">
                    <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      Account Address Protected
                    </span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-200 px-2 py-0.5 rounded font-bold">
                      Login Required
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Sign in with Google to reveal your permanent EVM account address derived from your Firebase UID.
                  </p>
                  <button
                    onClick={handleGoogleSignIn}
                    className="w-full bg-[#00875a] hover:bg-[#00754e] text-white font-bold text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Sign In to Unlock Address →</span>
                  </button>
                </div>
              )}
            </div>
            <div className="absolute right-0 top-0 -mr-16 -mt-16 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
          </div>

          {/* TAB: DIRECTORY & BOB'S ORGANIZATION (STORED IN FIREBASE DATABASE) */}
          {activeTab === "Directory" ? (
            <div className="space-y-6">
              {/* Firebase Firestore Connection Banner */}
              <div className="bg-gradient-to-r from-teal-900 to-slate-900 text-white rounded-2xl p-6 border border-teal-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 bg-teal-500/20 text-teal-300 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-teal-500/30">
                    <Database className="w-3.5 h-3.5" />
                    <span>Firebase Cloud Firestore Database</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight">
                    Accounts, Permanent Addresses &amp; Counterparty Directory
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
                    Connected to Firebase project <code className="bg-black/30 px-1.5 py-0.5 rounded text-teal-300 font-mono">coin-wallet-11860</code>. All accounts, permanent EVM addresses, organizations (including Bob and your profile), and transactions are stored and synchronized directly with Firebase.
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={handleReseedBob}
                    className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-white/15 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reseed Bob to Firebase</span>
                  </button>
                  <button
                    onClick={handleOpenCreateAccount}
                    className="bg-[#00875a] hover:bg-[#00754e] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>+ Add Counterparty / Account</span>
                  </button>
                </div>
              </div>

              {/* Current Logged-In User Account Stored in Firebase */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        Your Account Information (Firebase Firestore: <code className="font-mono text-teal-700">users/{currentUser?.uid || "guest"}</code>)
                      </h4>
                      <p className="text-xs text-slate-400">
                        Your permanent address is derived deterministically from your Firebase authentication UID
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    Stored in Firebase
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Account Name / Email</span>
                    <div className="font-bold text-slate-900 text-sm mt-0.5 truncate">
                      {currentUser?.displayName || currentUser?.email || "Guest Custody Trader"}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{currentUser?.email || "Connect Google Account"}</div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-semibold block text-[10px] uppercase">Your Organization</span>
                      <button
                        onClick={() => {
                          setEditedOrg(userOrg);
                          setIsEditingOrg(true);
                        }}
                        className="text-teal-700 hover:text-teal-900 font-bold text-[10px] flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                    </div>
                    <div className="font-bold text-teal-700 text-sm mt-0.5 truncate">{userOrg}</div>
                    <div className="text-[11px] text-slate-500">Role: Portfolio Manager</div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-semibold block text-[10px] uppercase">Permanent EVM Address</span>
                      {currentUser && userAddress && (
                        <button
                          onClick={() => copyToClipboard(userAddress)}
                          className="text-teal-700 hover:text-teal-900 font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                        >
                          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          {copied ? "Copied" : "Copy"}
                        </button>
                      )}
                    </div>
                    {currentUser && userAddress ? (
                      <div className="font-mono text-xs text-slate-900 font-bold mt-1 break-all select-all">
                        {userAddress}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
                          <KeyRound className="w-3 h-3" />
                          Sign in to reveal permanent EVM address
                        </span>
                        <button
                          onClick={handleGoogleSignIn}
                          className="bg-[#00875a] hover:bg-[#00754e] text-white px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors shadow-2xs"
                        >
                          Sign In
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Registered Counterparties (Bob, Alice, Vault, etc.) */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-5 h-5 text-teal-600" />
                      Registered Counterparties &amp; Accounts in Firebase
                    </h3>
                    <p className="text-xs text-slate-400">
                      Stored in Firestore collection <code className="font-mono text-slate-600">accounts</code> with permanent addresses and organizations
                    </p>
                  </div>
                  <span className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full">
                    {contacts.length} Accounts in Database
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {contacts.map((acc) => {
                    const isBob = acc.id === "acc-bob" || acc.name.toLowerCase() === "bob";
                    return (
                      <div
                        key={acc.id}
                        className={`border rounded-2xl p-5 hover:shadow-md transition-all flex flex-col justify-between space-y-4 group ${isBob
                            ? "border-teal-500/80 bg-gradient-to-b from-teal-50/50 to-white ring-1 ring-teal-500/20"
                            : "border-slate-200 bg-slate-50/50 hover:border-teal-500"
                          }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-11 h-11 rounded-xl ${acc.avatarColor || "bg-teal-600"} text-white flex items-center justify-center font-bold text-base shadow-xs`}
                              >
                                {acc.name.charAt(0)}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900 text-sm">{acc.name}</span>
                                  {isBob && (
                                    <span className="text-[9px] font-extrabold bg-teal-600 text-white px-1.5 py-0.5 rounded">
                                      BOB VERIFIED
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-teal-700 font-semibold flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  {acc.organization}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleOpenEditAccount(acc)}
                              title="Edit in Firebase"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {acc.role && (
                            <div className="text-[11px] text-slate-500 font-medium">
                              Role: <span className="text-slate-800">{acc.role}</span>
                            </div>
                          )}

                          <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              <span>Permanent Address</span>
                              <button
                                onClick={() => copyToClipboard(acc.address)}
                                className="text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer"
                              >
                                <Copy className="w-2.5 h-2.5" /> Copy
                              </button>
                            </div>
                            <div className="font-mono text-xs text-slate-700 break-all select-all font-medium">
                              {acc.address}
                            </div>
                          </div>

                          <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-xl p-2.5 flex items-center justify-between">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                                UTXO Coin Balance
                              </span>
                              <span className="text-sm font-extrabold text-slate-900 font-mono">
                                {(acc.mycBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} MYC
                              </span>
                            </div>
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                              <Coins className="w-3 h-3 text-emerald-600" />
                              UTXO Ledger
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                          <button
                            onClick={() => handleSelectContact(acc)}
                            className="flex-1 bg-[#00875a] hover:bg-[#00754e] text-white font-bold text-xs py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Send MYC to {acc.name}</span>
                          </button>
                          <button
                            onClick={() => handleOpenEditAccount(acc)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-3 py-2.5 rounded-xl transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : activeTab === "Curve" ? (
            /* ======================================================== */
            /* TAB: BONDING CURVE PRICING & SUPPLY CONTROL (CurveCoin)   */
            /* ======================================================== */
            <div className="space-y-6">
              {/* Curve Header Banner */}
              <div className="bg-gradient-to-r from-slate-950 via-[#0d222e] to-[#043324] text-white rounded-2xl p-6 sm:p-7 border border-slate-800 shadow-md relative overflow-hidden">
                <div className="relative z-10 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 text-xs font-semibold px-3 py-1 rounded-full border border-emerald-500/30">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Bonding-Curve Autonomous Token (CRV)
                    </span>
                    <span className="inline-flex items-center gap-1.5 bg-white/10 text-slate-200 text-xs font-semibold px-2.5 py-1 rounded-full border border-white/15">
                      <Lock className="w-3 h-3 text-teal-400" />
                      Zero Admin Key &bull; No Owner
                    </span>
                    <span className="inline-flex items-center gap-1.5 bg-teal-500/15 text-teal-200 text-xs font-semibold px-2.5 py-1 rounded-full border border-teal-500/30">
                      <Scale className="w-3 h-3 text-teal-300" />
                      Solvent by Design (Ceil/Floor)
                    </span>
                    <span className="inline-flex items-center gap-1.5 bg-emerald-500/15 text-emerald-200 text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-500/30">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                      10/10 Hardhat Tests Passed
                    </span>
                  </div>

                  <div className="max-w-3xl">
                    <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                      Curve Coin (CRV): Deterministic Price Formula of Supply
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
                      Buying with ETH mints coins and elevates supply &amp; price. Selling coins burns them and refunds ETH from the contract reserve. There is no owner, no pre-mine, and no admin key. Supply can only change through the curve, eliminating trust and governance risk.
                    </p>
                  </div>

                  <div className="pt-1 flex items-center gap-4 text-xs font-mono text-emerald-300/90 flex-wrap">
                    <div className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/10">
                      <span className="text-slate-400">Formula: </span>
                      <strong>Price(S) = P₀ + M &times; S</strong>
                    </div>
                    <div className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/10">
                      <span className="text-slate-400">P₀: </span>
                      <strong>0.0001 ETH</strong>
                    </div>
                    <div className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/10">
                      <span className="text-slate-400">M: </span>
                      <strong>1e12 wei (0.000001 ETH)</strong>
                    </div>
                    <div className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/10">
                      <span className="text-slate-400">Hard Cap: </span>
                      <strong>10,000 CRV</strong>
                    </div>
                  </div>
                </div>
                <div className="absolute right-0 top-0 -mr-16 -mt-16 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              </div>

              {/* 4 KPI Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Current Spot Price */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Current Spot Price
                    </span>
                    <span className="bg-emerald-50 text-[#00875a] border border-emerald-200/60 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      +{(((currentCurvePriceETH - P0) / P0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="my-3">
                    <div className="text-2xl font-extrabold text-slate-900 tracking-tight font-mono">
                      {currentCurvePriceETH.toFixed(6)} ETH
                    </div>
                    <div className="text-xs font-semibold text-slate-500 mt-0.5">
                      &asymp; ${currentCurvePriceUSD.toFixed(2)} USD
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100">
                    <span>Base P₀: 0.0001 ETH</span>
                    <span className="font-semibold text-slate-600">Slope: +1&mu; ETH/coin</span>
                  </div>
                </div>

                {/* 2. Circulating Supply vs Hard Cap */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Circulating Supply
                    </span>
                    <span className="bg-teal-50 text-teal-700 border border-teal-200/60 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      {((curveSupply / MAX_CURVE_SUPPLY) * 100).toFixed(1)}% Minted
                    </span>
                  </div>
                  <div className="my-3">
                    <div className="text-2xl font-extrabold text-slate-900 tracking-tight font-mono">
                      {curveSupply.toLocaleString()} CRV
                    </div>
                    <div className="text-xs font-semibold text-slate-500 mt-0.5">
                      Hard Cap: 10,000 CRV
                    </div>
                  </div>
                  <div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (curveSupply / MAX_CURVE_SUPPLY) * 100)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 pt-1.5 flex justify-between">
                      <span>{(MAX_CURVE_SUPPLY - curveSupply).toLocaleString()} CRV to cap</span>
                      <span>Max: 10k</span>
                    </div>
                  </div>
                </div>

                {/* 3. ETH Contract Reserve Backing */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Contract ETH Reserve
                    </span>
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      100% Backed
                    </span>
                  </div>
                  <div className="my-3">
                    <div className="text-2xl font-extrabold text-slate-900 tracking-tight font-mono">
                      {currentCurveReserveETH.toFixed(5)} ETH
                    </div>
                    <div className="text-xs font-semibold text-slate-500 mt-0.5">
                      &asymp; ${(currentCurveReserveETH * ethUsdRate).toFixed(2)} USD
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100">
                    <span>Dust Invariant: &le; 2 wei</span>
                    <span className="font-semibold text-emerald-700">Fully Solvent</span>
                  </div>
                </div>

                {/* 4. Your Realtime Holdings (Firebase RTDB) */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Your Vault Holdings
                    </span>
                    <span className="bg-slate-100 text-slate-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      Firebase RTDB
                    </span>
                  </div>
                  <div className="my-3">
                    <div className="text-2xl font-extrabold text-slate-900 tracking-tight font-mono">
                      {balanceMYC.toLocaleString()} CRV
                    </div>
                    <div className="text-xs font-semibold text-slate-500 mt-0.5">
                      ETH Balance: {balanceETH.toFixed(4)} ETH
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100">
                    <span>Account:</span>
                    <span className="font-mono text-slate-700 font-semibold truncate max-w-[120px]">
                      {currentUser && userAddress ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : "Guest"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Main 2-Column Grid: Visualizer & Trading Station */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column (8 cols): Interactive Bonding Curve Graph & Math Deep Dive */}
                <div className="lg:col-span-8 space-y-6">
                  {/* SVG Curve Chart Card */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-base">
                            Price vs. Supply Curve &amp; Reserve Integral
                          </h4>
                          <span className="bg-emerald-50 text-[#00875a] border border-emerald-200/60 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                            P(S) = P₀ + M&middot;S
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          The shaded area under the curve is the exact ETH reserve held to guarantee refunds.
                        </p>
                      </div>

                      {/* Legend */}
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500/30 border border-emerald-500" />
                          <span className="text-slate-600 font-medium">ETH Reserve Area</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#00875a]" />
                          <span className="text-slate-600 font-medium">Current Supply: {curveSupply} CRV</span>
                        </div>
                      </div>
                    </div>

                    {/* Interactive SVG Chart */}
                    <div className="h-64 w-full relative select-none">
                      {(() => {
                        // SVG Graph dimensions
                        const svgW = 700;
                        const svgH = 240;
                        const padL = 65;
                        const padR = 35;
                        const padT = 25;
                        const padB = 40;
                        const graphW = svgW - padL - padR; // 600
                        const graphH = svgH - padT - padB; // 175
                        const maxS = 10000;
                        const maxP = 0.011; // 0.011 ETH max scale

                        const getX = (s: number) => padL + (Math.max(0, Math.min(maxS, s)) / maxS) * graphW;
                        const getY = (p: number) => padT + graphH - (p / maxP) * graphH;

                        // Linear curve endpoints
                        const pStart = P0; // 0.0001
                        const pEnd = P0 + M * maxS; // 0.0101
                        const x0 = getX(0);
                        const y0 = getY(pStart);
                        const xEnd = getX(maxS);
                        const yEnd = getY(pEnd);

                        // Current supply point
                        const currentX = getX(curveSupply);
                        const currentY = getY(currentCurvePriceETH);
                        const baselineY = padT + graphH;

                        // Reserve Area Polygon (from 0 to current supply)
                        const reservePolygon = `M ${x0} ${baselineY} L ${x0} ${y0} L ${currentX} ${currentY} L ${currentX} ${baselineY} Z`;

                        // Delta trade preview (if input is valid)
                        const inputAmt = parseFloat(curveAmountInput) || 0;
                        let deltaPolygon = "";
                        let deltaColor = "";
                        if (inputAmt > 0) {
                          if (curveTradeMode === "BUY") {
                            const nextS = Math.min(maxS, curveSupply + inputAmt);
                            const nextX = getX(nextS);
                            const nextY = getY(P0 + M * nextS);
                            deltaPolygon = `M ${currentX} ${baselineY} L ${currentX} ${currentY} L ${nextX} ${nextY} L ${nextX} ${baselineY} Z`;
                            deltaColor = "fill-emerald-400/40 stroke-emerald-500";
                          } else {
                            const prevS = Math.max(0, curveSupply - inputAmt);
                            const prevX = getX(prevS);
                            const prevY = getY(P0 + M * prevS);
                            deltaPolygon = `M ${prevX} ${baselineY} L ${prevX} ${prevY} L ${currentX} ${currentY} L ${currentX} ${baselineY} Z`;
                            deltaColor = "fill-amber-400/40 stroke-amber-500";
                          }
                        }

                        return (
                          <svg className="w-full h-full" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none">
                            <defs>
                              <linearGradient id="curveReserveGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
                              </linearGradient>
                            </defs>

                            {/* Gridlines */}
                            {[0.002, 0.005, 0.008, 0.0101].map((pVal) => {
                              const y = getY(pVal);
                              return (
                                <g key={pVal}>
                                  <line
                                    x1={padL}
                                    y1={y}
                                    x2={padL + graphW}
                                    y2={y}
                                    stroke="#e2e8f0"
                                    strokeDasharray="4 4"
                                    strokeWidth="1"
                                  />
                                  <text
                                    x={padL - 8}
                                    y={y + 3.5}
                                    textAnchor="end"
                                    fontSize="10"
                                    fill="#94a3b8"
                                    fontFamily="monospace"
                                  >
                                    {pVal.toFixed(4)}
                                  </text>
                                </g>
                              );
                            })}

                            {/* X Axis Baseline */}
                            <line
                              x1={padL}
                              y1={baselineY}
                              x2={padL + graphW}
                              y2={baselineY}
                              stroke="#cbd5e1"
                              strokeWidth="1.5"
                            />

                            {/* Vertical X Grid & Labels */}
                            {[0, 2500, 5000, 7500, 10000].map((sVal) => {
                              const x = getX(sVal);
                              return (
                                <g key={sVal}>
                                  <line
                                    x1={x}
                                    y1={padT}
                                    x2={x}
                                    y2={baselineY}
                                    stroke="#f1f5f9"
                                    strokeWidth="1"
                                  />
                                  <text
                                    x={x}
                                    y={baselineY + 16}
                                    textAnchor="middle"
                                    fontSize="10"
                                    fill="#64748b"
                                    fontWeight="bold"
                                  >
                                    {sVal === 0 ? "0" : `${sVal.toLocaleString()} CRV`}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Shaded ETH Reserve Polygon */}
                            <path d={reservePolygon} fill="url(#curveReserveGrad)" />

                            {/* Delta Area for Pending Trade */}
                            {deltaPolygon && (
                              <path
                                d={deltaPolygon}
                                className={deltaColor}
                                strokeDasharray="3 3"
                                strokeWidth="1.5"
                              />
                            )}

                            {/* Linear Curve Stroke */}
                            <line
                              x1={x0}
                              y1={y0}
                              x2={xEnd}
                              y2={yEnd}
                              stroke="#00875a"
                              strokeWidth="3.5"
                              strokeLinecap="round"
                            />

                            {/* Current Supply Marker */}
                            <circle cx={currentX} cy={currentY} r="9" fill="#00875a" fillOpacity="0.2" className="animate-pulse" />
                            <circle cx={currentX} cy={currentY} r="5" fill="#00875a" />

                            {/* Callout box for Current Supply */}
                            <g transform={`translate(${Math.min(currentX, svgW - 130)}, ${Math.max(padT + 10, currentY - 32)})`}>
                              <rect width="115" height="26" rx="6" fill="#0f172a" fillOpacity="0.9" />
                              <text x="57" y="16" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">
                                {curveSupply} CRV &bull; {currentCurvePriceETH.toFixed(5)} ETH
                              </text>
                            </g>
                          </svg>
                        );
                      })()}
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                      <span>X-Axis: Supply in whole coins (0 &rarr; 10,000 CRV)</span>
                      <span>Y-Axis: Spot Price in ETH (0.0001 &rarr; 0.0101 ETH)</span>
                    </div>
                  </div>

                  {/* Math & Architectural Guarantees Card */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                        <Scale className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">
                          Autonomous Contract Architecture &amp; Solvency Math
                        </h4>
                        <p className="text-xs text-slate-500">
                          Why this bonding curve is safer than traditional tokens and algorithmic stablecoins
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-slate-900">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Strict Solvency Guarantee</span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                          In <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-800">CurveCoin.sol</code>, buys round costs <strong>UP (Ceil)</strong> and sells round refunds <strong>DOWN (Floor)</strong> using OpenZeppelin <code className="font-mono text-slate-800">Math.mulDiv</code>. The contract can mathematically never owe more ETH than it holds in reserve.
                        </p>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-slate-900">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Zero Admin Key / No Owner</span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                          There is no owner, no mint function, and no admin backdoor. Supply can <em>only</em> increase when real ETH is deposited into the reserve, and supply can <em>only</em> decrease when coins are burned.
                        </p>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-slate-900">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Slippage &amp; Sandwich Protection</span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                          The <code className="font-mono text-slate-800">buy(amount, maxCost)</code> and <code className="font-mono text-slate-800">sell(amount, minRefund)</code> methods enforce strict slippage limits on-chain, preventing front-running and MEV sandwich attacks.
                        </p>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-slate-900">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>ReentrancyGuard &amp; Call Pattern</span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                          State modifications (<code className="font-mono text-slate-800">_mint</code> / <code className="font-mono text-slate-800">_burn</code>) always precede ETH transfers using native <code className="font-mono text-slate-800">call</code> with OpenZeppelin v5 <code className="font-mono text-slate-800">nonReentrant</code> guard.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column (4 cols): Buy / Sell Interactive Trading Station */}
                <div className="lg:col-span-4 space-y-6">
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div>
                        <h4 className="font-bold text-slate-900 text-base">Trade on the Curve</h4>
                        <p className="text-xs text-slate-400">Mint or burn CRV with live quote</p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 px-2 py-1 rounded">
                        18 Decimals
                      </span>
                    </div>

                    {/* Mode Toggle: BUY vs SELL */}
                    <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => setCurveTradeMode("BUY")}
                        className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${curveTradeMode === "BUY"
                            ? "bg-[#00875a] text-white shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                          }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Buy (Mint CRV)</span>
                      </button>
                      <button
                        onClick={() => setCurveTradeMode("SELL")}
                        className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${curveTradeMode === "SELL"
                            ? "bg-amber-600 text-white shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                          }`}
                      >
                        <Flame className="w-3.5 h-3.5" />
                        <span>Sell (Burn CRV)</span>
                      </button>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-semibold text-slate-700">Amount of Coins (CRV)</label>
                        <span className="text-slate-400 text-[11px]">
                          Available:{" "}
                          <strong className="text-slate-700">
                            {curveTradeMode === "BUY"
                              ? `${balanceETH.toFixed(4)} ETH`
                              : `${balanceMYC.toLocaleString()} CRV`}
                          </strong>
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          max={curveTradeMode === "BUY" ? MAX_CURVE_SUPPLY - curveSupply : curveSupply}
                          step="1"
                          value={curveAmountInput}
                          onChange={(e) => setCurveAmountInput(e.target.value)}
                          placeholder="e.g. 40"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          CRV
                        </span>
                      </div>

                      {/* Quick Amount Chips */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {["10", "40", "100", "250"].map((chip) => (
                          <button
                            key={chip}
                            onClick={() => setCurveAmountInput(chip)}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            +{chip}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            if (curveTradeMode === "BUY") {
                              setCurveAmountInput("100");
                            } else {
                              setCurveAmountInput(String(Math.min(balanceMYC, curveSupply)));
                            }
                          }}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          Max
                        </button>
                      </div>
                    </div>

                    {/* Live Quote Breakdown Card */}
                    {(() => {
                      const inputAmt = parseFloat(curveAmountInput) || 0;
                      if (inputAmt <= 0) {
                        return (
                          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-xs text-slate-400 text-center">
                            Enter an amount above to see the bonding curve price quote.
                          </div>
                        );
                      }

                      if (curveTradeMode === "BUY") {
                        const buyCost = calcCurveBuyCost(inputAmt);
                        const avgPrice = buyCost / inputAmt;
                        const nextSupply = curveSupply + inputAmt;
                        const nextPrice = P0 + M * nextSupply;
                        const maxCostWithSlippage = buyCost * 1.01;

                        return (
                          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 space-y-2.5 text-xs">
                            <div className="flex items-center justify-between pb-2 border-b border-emerald-200/50">
                              <span className="font-bold text-emerald-950">Quoted Purchase Cost:</span>
                              <div className="text-right">
                                <div className="font-mono font-extrabold text-sm text-[#00875a]">
                                  {buyCost.toFixed(6)} ETH
                                </div>
                                <div className="text-[10px] text-slate-500 font-semibold">
                                  &asymp; ${(buyCost * ethUsdRate).toFixed(2)} USD
                                </div>
                              </div>
                            </div>

                            <div className="space-y-1.5 text-slate-600">
                              <div className="flex justify-between">
                                <span>Average Price / Coin:</span>
                                <span className="font-mono font-semibold text-slate-800">
                                  {avgPrice.toFixed(6)} ETH
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Next Curve Spot Price:</span>
                                <span className="font-mono font-semibold text-slate-800">
                                  {nextPrice.toFixed(6)} ETH
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Post-Trade Supply:</span>
                                <span className="font-mono font-semibold text-slate-800">
                                  {nextSupply.toLocaleString()} / 10,000 CRV
                                </span>
                              </div>
                              <div className="flex justify-between text-[11px] pt-1 border-t border-emerald-200/40 text-emerald-800">
                                <span>Max Cost (+1% Slippage):</span>
                                <span className="font-mono font-bold">
                                  {maxCostWithSlippage.toFixed(6)} ETH
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      } else {
                        const sellRefund = calcCurveSellRefund(inputAmt);
                        const avgRefund = sellRefund / inputAmt;
                        const nextSupply = Math.max(0, curveSupply - inputAmt);
                        const nextPrice = P0 + M * nextSupply;
                        const minRefundWithSlippage = sellRefund * 0.99;

                        return (
                          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 space-y-2.5 text-xs">
                            <div className="flex items-center justify-between pb-2 border-b border-amber-200/50">
                              <span className="font-bold text-amber-950">Quoted ETH Refund:</span>
                              <div className="text-right">
                                <div className="font-mono font-extrabold text-sm text-amber-700">
                                  {sellRefund.toFixed(6)} ETH
                                </div>
                                <div className="text-[10px] text-slate-500 font-semibold">
                                  &asymp; ${(sellRefund * ethUsdRate).toFixed(2)} USD
                                </div>
                              </div>
                            </div>

                            <div className="space-y-1.5 text-slate-600">
                              <div className="flex justify-between">
                                <span>Average Refund / Coin:</span>
                                <span className="font-mono font-semibold text-slate-800">
                                  {avgRefund.toFixed(6)} ETH
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Next Curve Spot Price:</span>
                                <span className="font-mono font-semibold text-slate-800">
                                  {nextPrice.toFixed(6)} ETH
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Post-Trade Supply:</span>
                                <span className="font-mono font-semibold text-slate-800">
                                  {nextSupply.toLocaleString()} CRV
                                </span>
                              </div>
                              <div className="flex justify-between text-[11px] pt-1 border-t border-amber-200/40 text-amber-800">
                                <span>Min Refund (-1% Slippage):</span>
                                <span className="font-mono font-bold">
                                  {minRefundWithSlippage.toFixed(6)} ETH
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    })()}

                    {/* Success Notice */}
                    {curveSuccessMsg && (
                      <div className="bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl p-3 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                        <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>{curveSuccessMsg}</span>
                      </div>
                    )}

                    {/* Action Execution Button */}
                    <button
                      onClick={handleExecuteCurveTrade}
                      disabled={isCurveTrading || !currentUser}
                      className={`w-full font-bold text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer ${!currentUser
                          ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                          : curveTradeMode === "BUY"
                            ? "bg-[#00875a] hover:bg-[#00754e] text-white"
                            : "bg-amber-600 hover:bg-amber-700 text-white"
                        }`}
                    >
                      {isCurveTrading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Executing Bonding Curve Trade...</span>
                        </>
                      ) : !currentUser ? (
                        <>
                          <KeyRound className="w-4 h-4" />
                          <span>Sign In to Trade on Curve</span>
                        </>
                      ) : curveTradeMode === "BUY" ? (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Buy &amp; Mint {curveAmountInput || "0"} CRV</span>
                        </>
                      ) : (
                        <>
                          <Flame className="w-4 h-4" />
                          <span>Burn &amp; Refund {curveAmountInput || "0"} CRV</span>
                        </>
                      )}
                    </button>

                    <div className="text-[10px] text-slate-400 text-center leading-normal">
                      Tokens are minted/burned on the spot. Reserves and balances are stored and synced in real-time with Firebase Realtime Database.
                    </div>
                  </div>

                  {/* Local Hardhat Demo & Sepolia Deploy Command Reference */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                        Smart Contract &amp; Tests
                      </h5>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Local Hardhat Ready
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 font-mono bg-slate-950 text-slate-200 p-3 rounded-xl text-[11px] overflow-x-auto">
                      <div className="text-slate-400"># Run automated tests (10/10 passing)</div>
                      <div className="text-emerald-400">npx hardhat test test/CurveCoin.test.js</div>
                      <div className="text-slate-400 pt-1"># Run local bonding curve demo</div>
                      <div className="text-teal-400">npx hardhat run scripts/curve-demo.js</div>
                      <div className="text-slate-400 pt-1"># Deploy to Sepolia testnet</div>
                      <div className="text-amber-300">npx hardhat run scripts/deploy-curve.js --network sepolia</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "UTXO" ? (
            <UTXOBlockchainExplorer />
          ) : (
            <>
              {/* ROW 1: TOTAL PORTFOLIO VALUE & QUICK ACTIONS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left 8 Cols: Portfolio Chart Card */}
                <div className="lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Total Vault Holdings (MYC &amp; Reserves)
                        </span>
                        <span className="bg-emerald-100 text-[#00875a] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          AMM Live Valuation
                        </span>
                      </div>
                      {/* Timeframe Selector */}
                      <div className="bg-slate-100/90 p-1 rounded-xl flex items-center gap-1">
                        {(["1D", "1W", "1M", "1Y"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setTimeframe(t)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-all cursor-pointer ${timeframe === t
                                ? "bg-white text-slate-900 shadow-2xs font-bold"
                                : "text-slate-500 hover:text-slate-800"
                              }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-baseline gap-3 mb-6 flex-wrap">
                      <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                        ${totalVaultValueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-sm font-semibold text-slate-500">
                        ({balanceMYC.toLocaleString()} MYC + {balanceETH.toFixed(2)} ETH)
                      </span>
                      <span className="inline-flex items-center gap-1 bg-[#e8f8f0] text-[#00875a] text-xs font-bold px-2.5 py-0.5 rounded-full">
                        <TrendingUp className="w-3.5 h-3.5" />
                        Spot: ${spotPriceInUSD.toFixed(4)}
                      </span>
                    </div>

                    {/* SVG Curve Chart */}
                    <div className="h-44 w-full relative">
                      <svg className="w-full h-full overflow-visible" viewBox="0 0 700 180" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M 0 110 C 80 120, 160 80, 240 100 C 320 120, 400 60, 480 90 C 560 120, 620 20, 700 40 L 700 180 L 0 180 Z"
                          fill="url(#chartGradient)"
                        />
                        <path
                          d="M 0 110 C 80 120, 160 80, 240 100 C 320 120, 400 60, 480 90 C 560 120, 620 20, 700 40"
                          fill="none"
                          stroke="#00875a"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                        />
                        <circle cx="700" cy="40" r="5" fill="#00875a" />
                        <circle cx="700" cy="40" r="9" fill="#00875a" fillOpacity="0.2" />
                      </svg>
                    </div>
                  </div>

                  {/* Bottom footer row */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs mt-4">
                    <span className="text-slate-500 font-medium">
                      Authentication: <strong className="text-[#00875a] font-bold">Firebase Google OAuth</strong>
                    </span>
                    <span className="text-slate-400 font-medium hidden sm:inline">
                      Database: Firebase Firestore (Active)
                    </span>
                  </div>
                </div>

                {/* Right 4 Cols: Quick Actions Card */}
                <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Quick Actions</h2>
                    <p className="text-xs text-slate-400 mb-5">Transfers, AMM execution, and directory</p>

                    {/* Send and Receive Grid */}
                    <div className="grid grid-cols-2 gap-3.5 mb-4">
                      {/* SEND BUTTON */}
                      <button
                        onClick={() => {
                          setIsSendOpen(true);
                          setAddressError(null);
                        }}
                        className="border border-slate-200/90 rounded-2xl p-4.5 bg-white hover:bg-slate-50/80 hover:border-emerald-500/40 hover:shadow-xs transition-all flex flex-col items-center justify-center text-center cursor-pointer group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-[#00875a] group-hover:scale-110 transition-transform">
                          <ArrowUpRight className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-slate-900 text-sm mt-3">Send MYC</span>
                        <span className="text-[11px] text-slate-400">To Bob or any address</span>
                      </button>

                      {/* RECEIVE BUTTON */}
                      <button
                        onClick={() => {
                          document.getElementById("deposit-receive-section")?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="bg-[#00875a] text-white rounded-2xl p-4.5 hover:bg-[#00754e] shadow-sm shadow-emerald-900/10 transition-all flex flex-col items-center justify-center text-center cursor-pointer group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                          <ArrowDownLeft className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-white text-sm mt-3">Receive</span>
                        <span className="text-[11px] text-emerald-100">Deposit QR</span>
                      </button>
                    </div>

                    {/* AMM Swap and Directory Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setIsSwapOpen(true)}
                        className="border border-blue-200 bg-blue-50 hover:bg-blue-100/70 rounded-xl py-2.5 px-3 text-xs font-semibold text-blue-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                        AMM Swap
                      </button>

                      <button
                        onClick={() => setActiveTab("Directory")}
                        className="border border-teal-200 bg-teal-50 hover:bg-teal-100/70 rounded-xl py-2.5 px-3 text-xs font-semibold text-teal-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5 text-teal-600" />
                        Bob &amp; Orgs
                      </button>
                    </div>
                  </div>

                  {/* Token Info Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                      <Coins className="w-3.5 h-3.5 text-emerald-600" />
                      <span>My Coin (MYC)</span>
                    </div>
                    <span className="font-mono font-bold text-slate-800">
                      {balanceMYC.toLocaleString()} / 10M Cap
                    </span>
                  </div>
                </div>
              </div>

              {/* ROW 2: METRIC CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                {/* Card 1: AMM Spot Price */}
                <div className="bg-white border-2 border-emerald-500/30 rounded-2xl p-5 shadow-xs flex items-center justify-between relative overflow-hidden">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-[#00875a] font-bold text-xl">
                      $
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm">AMM Spot Price</span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono font-semibold">
                        ${spotPriceInUSD.toFixed(4)} USD
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900 text-xs font-mono">{spotPriceInETH.toFixed(6)} ETH</div>
                    <div className="text-[11px] font-semibold text-emerald-600">x · y = k</div>
                  </div>
                </div>

                {/* Card 2: AMM Pool Reserves */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600 font-bold">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm">Pool Reserves</span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        {poolETH.toFixed(2)} ETH + {(poolMYC / 1000).toFixed(0)}k MYC
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900 text-sm">
                      ${((poolETH * ethUsdRate) * 2).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-xs font-semibold text-blue-600">Total TVL</div>
                  </div>
                </div>

                {/* Card 3: User's MYC Balance */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-200/60 flex items-center justify-center text-purple-600 font-bold">
                      🪙
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm">Your MYC Balance</span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        {currentUser ? `${balanceMYC.toLocaleString()} MYC` : "Sign in to view"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900 text-sm">
                      {currentUser
                        ? `$${(balanceMYC * spotPriceInUSD).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : "—"}
                    </div>
                    <div className="text-[10px] font-semibold text-purple-600">Firebase RTDB</div>
                  </div>
                </div>

                {/* Card 4: User's ETH Balance */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600 font-bold">
                      Ξ
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm">Your ETH Balance</span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        {currentUser ? `${balanceETH.toFixed(2)} ETH` : "Sign in to view"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900 text-sm">
                      {currentUser
                        ? `$${(balanceETH * ethUsdRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : "—"}
                    </div>
                    <div className="text-[10px] font-semibold text-amber-600">Firebase RTDB</div>
                  </div>
                </div>
              </div>

              {/* ROW 3: DEPOSIT & RECEIVE SECTION */}
              <div
                id="deposit-receive-section"
                className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs scroll-mt-20"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Deposit & Receive MYC</h3>
                    <p className="text-xs text-slate-400">
                      Scan or copy your permanent address to receive My Coin (MYC) tokens
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-[#00875a] border border-emerald-200/60 rounded-full px-3 py-1 text-xs font-semibold">
                      <span className="w-2 h-2 rounded-full bg-[#00875a]" />
                      Token: MYC (ERC-20)
                    </div>
                  </div>
                </div>

                {currentUser && userAddress ? (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-6 items-center">
                    {/* QR Code Container */}
                    <div className="md:col-span-4 lg:col-span-3 flex flex-col items-center">
                      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs hover:shadow-xs transition-shadow">
                        <QRCodeSVG
                          value={qrCodeValue}
                          size={168}
                          level="H"
                          includeMargin={true}
                          fgColor="#0f172a"
                        />
                      </div>
                      <span className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5" /> Scannable on any mobile wallet
                      </span>
                    </div>

                    {/* Deposit Address & Controls */}
                    <div className="md:col-span-8 lg:col-span-9 space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Your Permanent Account Address
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-teal-700 font-semibold flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {userOrg}
                            </span>
                          </div>
                        </div>

                        <div className="bg-[#f8fafc] border border-slate-200 rounded-xl p-2.5 sm:p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <input
                            type="text"
                            readOnly
                            value={userAddress}
                            className="font-mono text-xs sm:text-sm text-slate-800 bg-transparent border-0 outline-none w-full font-medium select-all"
                          />
                          <button
                            onClick={() => copyToClipboard(userAddress)}
                            className="bg-[#00875a] text-white hover:bg-[#00754e] font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 shrink-0 transition-all active:scale-95 cursor-pointer shadow-2xs"
                          >
                            {copied ? (
                              <>
                                <Check className="w-4 h-4 text-emerald-200" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                <span>Copy Address</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Optional Request Amount */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                        <div className="text-xs text-slate-500 font-medium">Request Specific Amount (Optional):</div>
                        <input
                          type="number"
                          placeholder="e.g. 500 MYC"
                          value={requestedAmount}
                          onChange={(e) => setRequestedAmount(e.target.value)}
                          className="w-36 bg-[#f8fafc] border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        {requestedAmount && (
                          <span className="text-[11px] text-emerald-600 font-semibold">
                            QR updated for {requestedAmount} MYC
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center space-y-3 bg-slate-50/80 border border-dashed border-slate-200 rounded-2xl mt-6">
                    <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-900 text-sm">Permanent Deposit Address Hidden</h4>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        Your permanent receiving address and QR code are only accessible when authenticated. Sign in with Google to view your address.
                      </p>
                    </div>
                    <button
                      onClick={handleGoogleSignIn}
                      className="bg-[#00875a] hover:bg-[#00754e] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all inline-flex items-center gap-2 cursor-pointer"
                    >
                      <User className="w-4 h-4" />
                      <span>Sign In with Google to Reveal Address</span>
                    </button>
                  </div>
                )}
              </div>

              {/* ROW 4: RECENT TRANSACTIONS */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Recent MYC &amp; AMM Activity</h3>
                    <p className="text-xs text-slate-400">Stored and synchronized with Firebase database</p>
                  </div>

                  {/* Filters */}
                  <div className="bg-slate-100/90 p-1 rounded-xl flex items-center gap-1 self-start sm:self-auto">
                    {(["All", "Received", "Sent"] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setTxFilter(filter)}
                        className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer ${txFilter === filter
                            ? "bg-white text-slate-900 shadow-2xs font-bold"
                            : "text-slate-500 hover:text-slate-800"
                          }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transactions Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse mt-2">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-2">Type</th>
                        <th className="py-3 px-2">Amount</th>
                        <th className="py-3 px-2">Details &amp; Org</th>
                        <th className="py-3 px-2">Date</th>
                        <th className="py-3 px-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/80 text-xs sm:text-sm">
                      {filteredTxs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-xs text-slate-400">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <Coins className="w-5 h-5" />
                              </div>
                              <span className="font-bold text-slate-700 text-sm">No transactions yet</span>
                              <span className="text-slate-400 max-w-sm">
                                Send coins to Bob or any contact to generate verified on-chain UTXO debit &amp; credit records.
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredTxs.map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3.5 px-2">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tx.type === "Deposit" || tx.type === "Deposit (UTXO)"
                                      ? "bg-emerald-50 text-[#00875a]"
                                      : tx.type === "Send" || tx.type === "Send (UTXO)"
                                        ? "bg-blue-50 text-blue-600"
                                        : tx.type === "AMM Swap"
                                          ? "bg-indigo-50 text-indigo-600"
                                          : tx.type === "Bonding Buy"
                                            ? "bg-teal-50 text-teal-600"
                                            : tx.type === "Bonding Sell"
                                              ? "bg-amber-50 text-amber-600"
                                              : "bg-purple-50 text-purple-600"
                                    }`}
                                >
                                  {(tx.type === "Deposit" || tx.type === "Deposit (UTXO)") && <Check className="w-4 h-4" />}
                                  {(tx.type === "Send" || tx.type === "Send (UTXO)") && <ArrowUpRight className="w-4 h-4" />}
                                  {tx.type === "AMM Swap" && <ArrowLeftRight className="w-4 h-4" />}
                                  {(tx.type === "Mint" || tx.type === "Mint (UTXO)") && <Sparkles className="w-4 h-4" />}
                                  {(tx.type === "Bonding Buy" || tx.type === "Bonding Sell") && <TrendingUp className="w-4 h-4" />}
                                </div>
                                <span className="font-semibold text-slate-900">{tx.type}</span>
                              </div>
                            </td>

                            <td className="py-3.5 px-2">
                              <div className="font-bold text-slate-900">{tx.amount}</div>
                              <div className="text-[11px] text-slate-400">{tx.fiatValue}</div>
                            </td>

                            <td className="py-3.5 px-2 text-slate-600 font-medium">
                              <div>{tx.details}</div>
                              {tx.recipientFull && (
                                <div className="font-mono text-[10px] text-slate-400 select-all">
                                  {tx.recipientFull}
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-2 text-slate-500 font-medium">{tx.date}</td>

                            <td className="py-3.5 px-2 text-right">
                              <span className="inline-flex items-center gap-1 bg-[#e8f8f0] text-[#00875a] border border-emerald-200/60 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                                <Check className="w-3 h-3" />
                                {tx.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* SEND MODAL - SENDS TO BOB OR ANY SPECIFIC ADDRESS */}
      {isSendOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#00875a] flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base leading-tight">Send My Coin (MYC)</h3>
                  <p className="text-[11px] text-slate-400">Transfer from {userOrg} to any address</p>
                </div>
              </div>
              <button
                onClick={() => setIsSendOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {sendSuccessMsg ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-[#00875a] flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-900 text-base">UTXO Transfer Confirmed!</h4>
                <p className="text-xs text-slate-600 max-w-xs mx-auto">{sendSuccessMsg}</p>
                <div className="flex items-center justify-center gap-2 pt-2 text-[10px] font-mono text-emerald-800">
                  <span className="bg-emerald-100 px-2 py-0.5 rounded font-bold">1 Confirmation</span>
                  <span className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded font-bold border border-teal-200">
                    UTXO Ledger Updated
                  </span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendTransaction} className="pt-4 space-y-4">
                {/* Sending From & Faucet Banner */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Sending From:</span>
                    <span className="font-mono text-slate-800 font-semibold truncate max-w-[200px]">
                      {userAddress ? `${userAddress.slice(0, 8)}...${userAddress.slice(-4)}` : "0x90F7...b906 (Custodial Vault)"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Wallet Owner:</span>
                    <span className="font-semibold text-teal-700">
                      {currentUser?.displayName || currentUser?.email || "Apex Custody Trader"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200/80">
                    <span className="text-slate-600">Available UTXO Balance:</span>
                    <strong className="font-mono text-emerald-700 font-bold text-sm">
                      {balanceMYC.toLocaleString()} MYC
                    </strong>
                  </div>

                  {/* 1-Click Mine Faucet for quick testing */}
                  <div className="pt-1.5 flex items-center justify-between bg-emerald-100/60 -mx-1 -mb-1 px-2.5 py-1.5 rounded-lg border border-emerald-200/70">
                    <span className="text-[11px] text-emerald-900 font-medium">
                      Need coins to transfer?
                    </span>
                    <button
                      type="button"
                      onClick={handleMineFaucet}
                      disabled={isMiningFaucet}
                      className="bg-[#00875a] hover:bg-[#00754e] text-white text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                    >
                      <Pickaxe className="w-3 h-3" />
                      <span>{isMiningFaucet ? "Mining..." : "+ Mine 50 MYC"}</span>
                    </button>
                  </div>
                </div>

                {/* Quick Select: Bob, Cold Vault, Alice */}
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1.5">
                    Quick Select Recipient:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {contacts.slice(0, 2).map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => {
                          setSendRecipient(c.address);
                          setRecipientName(c.name);
                          setRecipientOrg(c.organization);
                          setAddressError(null);
                        }}
                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${sendRecipient === c.address
                            ? "bg-teal-50 border-teal-500 shadow-2xs"
                            : "bg-slate-50/70 border-slate-200 hover:bg-slate-100"
                          }`}
                      >
                        <div className="font-bold text-xs text-slate-900">{c.name}</div>
                        <div className="text-[10px] text-teal-700 truncate">{c.organization}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Recipient Address */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-600">Destination Address</label>
                    {recipientName && (
                      <span className="text-[11px] font-semibold text-teal-700">
                        {recipientName} ({recipientOrg})
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Enter recipient address (0x... or ADDR...)"
                    value={sendRecipient}
                    onChange={(e) => {
                      setSendRecipient(e.target.value);
                      setRecipientName("");
                      setRecipientOrg("");
                      if (addressError) setAddressError(null);
                    }}
                    className={`w-full bg-[#f8fafc] border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 ${addressError
                        ? "border-rose-400 focus:ring-rose-200"
                        : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                      }`}
                  />
                  {addressError && (
                    <p className="text-[11px] text-rose-500 font-medium mt-1">{addressError}</p>
                  )}
                </div>

                {/* Amount & Quick Fill */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-600">Amount (MYC)</label>
                    <div className="flex items-center gap-1.5">
                      {["10", "50", "70"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setSendAmount(v)}
                          className="text-[11px] text-slate-500 font-semibold hover:underline cursor-pointer"
                        >
                          {v}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSendAmount(balanceMYC > 0 ? balanceMYC.toString() : "50")}
                        className="text-[11px] text-[#00875a] font-bold hover:underline cursor-pointer"
                      >
                        Max
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="0.00"
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      MYC
                    </span>
                  </div>
                </div>

                {/* Fee Estimation Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-600">Miner Fee (Proof of Work)</label>
                    <span className="text-[11px] text-slate-400">Goes to block miner</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Standard", fee: "0.1", desc: "Recommended" },
                      { label: "Priority", fee: "0.5", desc: "Fast Block" },
                      { label: "Zero Fee", fee: "0", desc: "Demo Only" },
                    ].map((f) => (
                      <button
                        key={f.fee}
                        type="button"
                        onClick={() => setSendFee(f.fee)}
                        className={`p-1.5 rounded-lg border text-center transition-all cursor-pointer ${sendFee === f.fee
                            ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                      >
                        <div className="font-bold text-xs">{f.fee} MYC</div>
                        <div className={`text-[9px] ${sendFee === f.fee ? "text-slate-300" : "text-slate-400"}`}>
                          {f.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Real UTXO Blueprint Calculation Card */}
                {parseFloat(sendAmount || "0") > 0 && (
                  <div className="bg-slate-900 text-slate-200 rounded-xl p-3 space-y-1.5 text-xs font-mono border border-slate-800">
                    <div className="text-[10px] text-emerald-400 uppercase font-bold flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      <span>UTXO Transaction Composition</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Inputs Spent:</span>
                      <strong className="text-white">
                        {Math.max(1, Math.ceil((parseFloat(sendAmount || "0") + parseFloat(sendFee || "0.1")) / 50))} &times; 50-coin UTXOs ({Math.max(50, Math.ceil((parseFloat(sendAmount || "0") + parseFloat(sendFee || "0.1")) / 50) * 50)} MYC)
                      </strong>
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>Output &rarr; Recipient:</span>
                      <strong>{parseFloat(sendAmount || "0").toFixed(2)} MYC</strong>
                    </div>
                    <div className="flex justify-between text-teal-300">
                      <span>Output &rarr; Change Refund:</span>
                      <strong>
                        {Math.max(
                          0,
                          Math.max(50, Math.ceil((parseFloat(sendAmount || "0") + parseFloat(sendFee || "0.1")) / 50) * 50) -
                          parseFloat(sendAmount || "0") -
                          parseFloat(sendFee || "0.1")
                        ).toFixed(2)}{" "}
                        MYC
                      </strong>
                    </div>
                    <div className="flex justify-between text-amber-400">
                      <span>Miner Subsidy Fee:</span>
                      <strong>{sendFee} MYC</strong>
                    </div>
                  </div>
                )}

                {/* Sending Stepper Stages */}
                {isSending && (
                  <div className="bg-emerald-50 border border-emerald-200/90 rounded-xl p-3 space-y-2 text-xs">
                    <div className="flex items-center gap-2 font-bold text-emerald-950">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                      <span>Executing Real UTXO Lifecycle...</span>
                    </div>
                    <div className="space-y-1 text-[11px] font-mono">
                      <div className={sendStage === "signing" ? "text-emerald-700 font-bold flex items-center gap-1" : "text-slate-400"}>
                        <span>&bull;</span>
                        <span>1. Signing UTXO inputs with Secp256k1 key</span>
                      </div>
                      <div className={sendStage === "mempool" ? "text-emerald-700 font-bold flex items-center gap-1" : "text-slate-400"}>
                        <span>&bull;</span>
                        <span>2. Broadcasting transaction to Mempool</span>
                      </div>
                      <div className={sendStage === "mining" ? "text-emerald-700 font-bold flex items-center gap-1" : "text-slate-400"}>
                        <span>&bull;</span>
                        <span>3. Mining block with Proof of Work (Hash: 0000…)</span>
                      </div>
                      <div className={sendStage === "confirmed" ? "text-emerald-700 font-bold flex items-center gap-1" : "text-slate-400"}>
                        <span>&bull;</span>
                        <span>4. Block confirmed: UTXO set updated &amp; change returned</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSending}
                  className="w-full bg-[#00875a] text-white hover:bg-[#00754e] font-bold text-sm py-3 rounded-xl transition-all shadow-sm shadow-emerald-900/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Processing UTXO Block...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>
                        Send {sendAmount ? parseFloat(sendAmount).toLocaleString() : "0"} MYC{" "}
                        {recipientName ? `to ${recipientName}` : ""}
                      </span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* AMM SWAP MODAL */}
      {isSwapOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ArrowLeftRight className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base leading-tight">AMM Liquidity Pool Swap</h3>
                  <p className="text-[11px] text-slate-400">Constant Product Invariant: x · y = k</p>
                </div>
              </div>
              <button onClick={() => setIsSwapOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {swapSuccessMsg ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-[#00875a] flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-900 text-base">Swap Executed!</h4>
                <p className="text-xs text-slate-600 max-w-xs mx-auto">{swapSuccessMsg}</p>
                <div className="text-[11px] font-mono text-emerald-600 font-semibold">
                  New Spot Price: ${spotPriceInUSD.toFixed(4)} USD
                </div>
              </div>
            ) : (
              <form onSubmit={handleExecuteSwap} className="pt-4 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Pool Reserves (ETH):</span>
                    <strong className="font-mono text-slate-900">{poolETH.toFixed(2)} ETH</strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Pool Reserves (MYC):</span>
                    <strong className="font-mono text-slate-900">{poolMYC.toLocaleString()} MYC</strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Current Spot Price:</span>
                    <strong className="font-mono text-emerald-700">${spotPriceInUSD.toFixed(4)} / MYC</strong>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-600">You Pay</label>
                    <span className="text-[11px] text-slate-400">
                      Balance:{" "}
                      <strong className="text-slate-700 font-mono">
                        {swapDirection === "ETH_TO_MYC"
                          ? `${balanceETH.toFixed(4)} ETH`
                          : `${balanceMYC.toLocaleString()} MYC`}
                      </strong>
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      required
                      value={swapInputAmt}
                      onChange={(e) => setSwapInputAmt(e.target.value)}
                      className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl px-3.5 py-2.5 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      {swapDirection === "ETH_TO_MYC" ? "ETH" : "MYC"}
                    </span>
                  </div>
                </div>

                <div className="flex justify-center -my-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSwapDirection((prev) => (prev === "ETH_TO_MYC" ? "MYC_TO_ETH" : "ETH_TO_MYC"));
                      setSwapInputAmt("1000");
                    }}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-600 transition-transform hover:rotate-180 cursor-pointer shadow-2xs"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1.5">You Receive (Estimated)</label>
                  <div className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-base font-bold text-slate-900">
                    <span>
                      {swapResult.outputAmount > 0
                        ? swapResult.outputAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4,
                        })
                        : "0.00"}
                    </span>
                    <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      {swapDirection === "ETH_TO_MYC" ? "MYC" : "ETH"}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSwapping || parsedSwapInput <= 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSwapping ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Swapping via Pool...</span>
                    </>
                  ) : (
                    <>
                      <ArrowLeftRight className="w-4 h-4" />
                      <span>
                        Swap {parsedSwapInput > 0 ? parsedSwapInput : "0"}{" "}
                        {swapDirection === "ETH_TO_MYC" ? "ETH" : "MYC"}
                      </span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ACCOUNT EDIT / CREATE MODAL (STORED IN FIREBASE DATABASE) */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base leading-tight">
                    {editingAccount ? `Edit ${editingAccount.name} in Firebase` : "Add Account to Firebase"}
                  </h3>
                  <p className="text-[11px] text-slate-400">Stores permanent address &amp; org in Cloud Firestore</p>
                </div>
              </div>
              <button
                onClick={() => setIsAccountModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {accountSaveSuccess ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-[#00875a] flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-900 text-base">Account Stored in Firebase!</h4>
                <p className="text-xs text-slate-600 max-w-xs mx-auto">{accountSaveSuccess}</p>
                <span className="text-[10px] text-teal-600 font-bold bg-teal-50 px-2 py-0.5 rounded">
                  Synchronized with collection accounts
                </span>
              </div>
            ) : (
              <form onSubmit={handleSaveAccountSubmit} className="pt-4 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Account / Contact Name</label>
                  <input
                    type="text"
                    required
                    value={accountFormName}
                    onChange={(e) => setAccountFormName(e.target.value)}
                    placeholder="e.g. Bob"
                    className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Organization Name</label>
                  <input
                    type="text"
                    required
                    value={accountFormOrg}
                    onChange={(e) => setAccountFormOrg(e.target.value)}
                    placeholder="e.g. Apex Custody OTC Desk"
                    className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Permanent EVM Address</label>
                  <input
                    type="text"
                    required
                    value={accountFormAddress}
                    onChange={(e) => setAccountFormAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">Role / Desk</label>
                    <input
                      type="text"
                      value={accountFormRole}
                      onChange={(e) => setAccountFormRole(e.target.value)}
                      placeholder="OTC Liquidity Provider"
                      className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">Email (Optional)</label>
                    <input
                      type="email"
                      value={accountFormEmail}
                      onChange={(e) => setAccountFormEmail(e.target.value)}
                      placeholder="bob@apexcustody.com"
                      className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSavingAccount}
                  className="w-full bg-[#00875a] text-white hover:bg-[#00754e] font-bold text-sm py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingAccount ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving to Firebase Firestore...</span>
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4" />
                      <span>Save to Firebase Database</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
