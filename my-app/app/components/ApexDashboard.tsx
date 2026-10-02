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
  ExternalLink,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { auth, googleProvider } from "../lib/firebase";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import { deriveUserWallet } from "../lib/wallet";

interface Transaction {
  id: string;
  type: "Deposit" | "Send" | "Mint" | "Burn" | "AMM Swap";
  amount: string;
  fiatValue: string;
  details: string;
  sender?: string;
  recipientFull?: string;
  date: string;
  status: "Completed" | "Pending";
}

export default function ApexDashboard() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"Portfolio" | "Market" | "Activity" | "Settings">("Portfolio");
  const [timeframe, setTimeframe] = useState<"1D" | "1W" | "1M" | "1Y">("1W");
  const [txFilter, setTxFilter] = useState<"All" | "Received" | "Sent">("All");

  // Firebase Authentication State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [userAddress, setUserAddress] = useState<string>("0x3F82d89F1283cE3048b29c9162E049860De978c4");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Network State
  const [selectedNetwork, setSelectedNetwork] = useState<string>("Sepolia Testnet");
  const [isNetworkOpen, setIsNetworkOpen] = useState<boolean>(false);

  // Deposit address states
  const [copied, setCopied] = useState<boolean>(false);
  const [requestedAmount, setRequestedAmount] = useState<string>("");

  // Modals state
  const [isSendOpen, setIsSendOpen] = useState<boolean>(false);
  const [isSwapOpen, setIsSwapOpen] = useState<boolean>(false);
  const [isMintOpen, setIsMintOpen] = useState<boolean>(false);
  const [isBurnOpen, setIsBurnOpen] = useState<boolean>(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);

  // Form State for Send
  const [sendRecipient, setSendRecipient] = useState<string>("");
  const [sendAmount, setSendAmount] = useState<string>("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);

  // Form State for Mint
  const [mintAmount, setMintAmount] = useState<string>("50000");
  const [mintRecipient, setMintRecipient] = useState<string>("");
  const [isMinting, setIsMinting] = useState<boolean>(false);
  const [mintSuccessMsg, setMintSuccessMsg] = useState<string | null>(null);

  // Form State for Burn
  const [burnAmount, setBurnAmount] = useState<string>("1000");
  const [isBurning, setIsBurning] = useState<boolean>(false);
  const [burnSuccessMsg, setBurnSuccessMsg] = useState<string | null>(null);

  // User Vault Balances
  const hardCap = 10000000.0;
  const [balanceMYC, setBalanceMYC] = useState<number>(100000.0);
  const [balanceETH, setBalanceETH] = useState<number>(12.5);
  const [totalBurned, setTotalBurned] = useState<number>(0.0);

  // ==========================================
  // AMM CONSTANT PRODUCT POOL STATE (x * y = k)
  // ==========================================
  const ethUsdRate = 3400.0; // 1 ETH = $3,400 USD
  const [poolETH, setPoolETH] = useState<number>(100.0);
  const [poolMYC, setPoolMYC] = useState<number>(1000000.0);

  // Live Spot Price from AMM pool ratio
  const spotPriceInETH = poolETH / poolMYC;
  const spotPriceInUSD = spotPriceInETH * ethUsdRate;

  // Swap Form State
  const [swapDirection, setSwapDirection] = useState<"ETH_TO_MYC" | "MYC_TO_ETH">("ETH_TO_MYC");
  const [swapInputAmt, setSwapInputAmt] = useState<string>("1.0");
  const [isSwapping, setIsSwapping] = useState<boolean>(false);
  const [swapSuccessMsg, setSwapSuccessMsg] = useState<string | null>(null);

  // Listen to Firebase Auth Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthLoading(false);
      if (user) {
        setCurrentUser(user);
        // Deterministically derive unique Ethereum address from Firebase UID
        const { address } = deriveUserWallet(user.uid);
        setUserAddress(address);
        setMintRecipient(address);
      } else {
        setCurrentUser(null);
        // Default institutional fallback address
        const fallback = "0x0337116bAFAfAD3D2186643943E0Fe71b56867AE";
        setUserAddress(fallback);
        setMintRecipient(fallback);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const { address } = deriveUserWallet(user.uid);
      setUserAddress(address);
      setIsAuthModalOpen(false);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      console.error("Firebase Google Auth Error:", error);
      if (error?.code === "auth/popup-blocked") {
        setAuthError("Popup was blocked by your browser. Please allow popups or try again.");
      } else {
        setAuthError(error?.message || "Failed to sign in with Google.");
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  // AMM Swap Calculations (with 0.3% Uniswap LP fee)
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

  // Recent Transactions
  const [transactions, setTransactions] = useState<Transaction[]>([
    {
      id: "tx-init-mint",
      type: "Mint",
      amount: "+100,000.00 MYC",
      fiatValue: `$${(100000 * spotPriceInUSD).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      details: "Initial User Vault Allocation",
      recipientFull: userAddress,
      date: "Just now",
      status: "Completed",
    },
    {
      id: "tx-pool-init",
      type: "AMM Swap",
      amount: "Pool Active",
      fiatValue: "$680,000.00 TVL",
      details: "AMM Reserve: 100 ETH & 1,000,000 MYC",
      date: "1 hour ago",
      status: "Completed",
    },
    {
      id: "tx-1",
      type: "Send",
      amount: "-1,000.00 MYC",
      fiatValue: `$${(1000 * spotPriceInUSD).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      details: "To: Community Faucet Receiver",
      recipientFull: "0xedEe7c1429505bcA418Cc48b8Cf8B37E8d602843",
      date: "2 hours ago",
      status: "Completed",
    },
  ]);

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
    } else if (trimmed.length < 20) {
      setAddressError("Address appears too short");
      return false;
    }
    setAddressError(null);
    return true;
  };

  const handleSendTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAddress(sendRecipient)) return;

    const amt = parseFloat(sendAmount);
    if (isNaN(amt) || amt <= 0) {
      alert("Please enter a valid amount greater than 0");
      return;
    }

    if (amt > balanceMYC) {
      alert(`Insufficient MYC balance. Available: ${balanceMYC.toLocaleString()} MYC`);
      return;
    }

    setIsSending(true);

    setTimeout(() => {
      setBalanceMYC((prev) => prev - amt);

      const targetDisplay =
        sendRecipient.length > 12
          ? `${sendRecipient.slice(0, 6)}...${sendRecipient.slice(-4)}`
          : sendRecipient;

      const newTx: Transaction = {
        id: `tx-${Date.now()}`,
        type: "Send",
        amount: `-${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })} MYC`,
        fiatValue: `$${(amt * spotPriceInUSD).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        details: `From: ${userAddress.slice(0, 6)}... to ${targetDisplay}`,
        sender: userAddress,
        recipientFull: sendRecipient,
        date: "Just now",
        status: "Completed",
      };

      setTransactions((prev) => [newTx, ...prev]);
      setIsSending(false);
      setSendSuccessMsg(`Sent ${amt.toLocaleString()} MYC to ${targetDisplay} successfully!`);
      setSendAmount("");
      setSendRecipient("");

      setTimeout(() => {
        setIsSendOpen(false);
        setSendSuccessMsg(null);
      }, 2000);
    }, 800);
  };

  const handleExecuteSwap = (e: React.FormEvent) => {
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

    setTimeout(() => {
      const output = swapResult.outputAmount;

      if (swapDirection === "ETH_TO_MYC") {
        setBalanceETH((prev) => prev - parsedSwapInput);
        setBalanceMYC((prev) => prev + output);
        setPoolETH((prev) => prev + parsedSwapInput);
        setPoolMYC((prev) => prev - output);

        const newTx: Transaction = {
          id: `tx-swap-${Date.now()}`,
          type: "AMM Swap",
          amount: `+${output.toLocaleString(undefined, { maximumFractionDigits: 2 })} MYC`,
          fiatValue: `$${(parsedSwapInput * ethUsdRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          details: `Bought via AMM Pool (x·y=k)`,
          date: "Just now",
          status: "Completed",
        };
        setTransactions((prev) => [newTx, ...prev]);
        setSwapSuccessMsg(
          `Bought ${output.toLocaleString(undefined, { maximumFractionDigits: 2 })} MYC! Pool updated.`
        );
      } else {
        setBalanceMYC((prev) => prev - parsedSwapInput);
        setBalanceETH((prev) => prev + output);
        setPoolMYC((prev) => prev + parsedSwapInput);
        setPoolETH((prev) => prev - output);

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

  const handleMintTokens = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(mintAmount);
    if (isNaN(amt) || amt <= 0) return;

    if (balanceMYC + amt > hardCap) {
      alert(`Cannot mint above hard cap of ${hardCap.toLocaleString()} MYC!`);
      return;
    }

    setIsMinting(true);
    setTimeout(() => {
      setBalanceMYC((prev) => prev + amt);

      const target = mintRecipient || userAddress;
      const newTx: Transaction = {
        id: `tx-mint-${Date.now()}`,
        type: "Mint",
        amount: `+${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })} MYC`,
        fiatValue: `$${(amt * spotPriceInUSD).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        details: `Mint to: ${target.slice(0, 6)}...${target.slice(-4)}`,
        recipientFull: target,
        date: "Just now",
        status: "Completed",
      };

      setTransactions((prev) => [newTx, ...prev]);
      setIsMinting(false);
      setMintSuccessMsg(`Successfully minted ${amt.toLocaleString()} MYC to your address!`);
      setTimeout(() => {
        setIsMintOpen(false);
        setMintSuccessMsg(null);
      }, 1800);
    }, 800);
  };

  const handleBurnTokens = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(burnAmount);
    if (isNaN(amt) || amt <= 0) return;

    if (amt > balanceMYC) {
      alert(`Cannot burn more than available balance (${balanceMYC.toLocaleString()} MYC)!`);
      return;
    }

    setIsBurning(true);
    setTimeout(() => {
      setBalanceMYC((prev) => prev - amt);
      setTotalBurned((prev) => prev + amt);

      const newTx: Transaction = {
        id: `tx-burn-${Date.now()}`,
        type: "Burn",
        amount: `-${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })} MYC`,
        fiatValue: `$${(amt * spotPriceInUSD).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        details: "Burned via ERC20Burnable (Supply Reduced)",
        date: "Just now",
        status: "Completed",
      };

      setTransactions((prev) => [newTx, ...prev]);
      setIsBurning(false);
      setBurnSuccessMsg(`Successfully burned ${amt.toLocaleString()} MYC!`);
      setTimeout(() => {
        setIsBurnOpen(false);
        setBurnSuccessMsg(null);
      }, 1800);
    }, 800);
  };

  // Filtered transactions
  const filteredTxs = transactions.filter((tx) => {
    if (txFilter === "Received") return tx.type === "Deposit" || tx.type === "Mint";
    if (txFilter === "Sent") return tx.type === "Send" || tx.type === "Burn";
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
              <span className="text-[11px] font-semibold text-teal-600 tracking-wide uppercase">Institutional</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab("Portfolio")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "Portfolio"
                  ? "bg-[#e8f8f0] text-[#00875a]"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Portfolio & Vault
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
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "Activity"
                  ? "bg-[#e8f8f0] text-[#00875a]"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
              }`}
            >
              <History className="w-4 h-4" />
              Activity
            </button>

            <button
              onClick={() => setActiveTab("Settings")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "Settings"
                  ? "bg-[#e8f8f0] text-[#00875a]"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
              }`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </nav>
        </div>

        {/* Unique User Wallet Card */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Your Unique Wallet
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="font-mono text-xs text-slate-800 break-all select-all font-semibold">
            {userAddress.slice(0, 8)}...{userAddress.slice(-6)}
          </div>
          <button
            onClick={() => copyToClipboard(userAddress)}
            className="w-full text-center text-[11px] font-semibold text-[#00875a] hover:underline flex items-center justify-center gap-1 cursor-pointer pt-1"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy Full Address"}
          </button>
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
              placeholder="Search MYC token transfers, addresses, or transactions..."
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
                  <div className="text-[11px] text-slate-400 font-medium">
                    {currentUser.email}
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
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 bg-teal-500/20 text-teal-300 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-teal-500/30">
                  <KeyRound className="w-3.5 h-3.5" />
                  {currentUser ? "Firebase Gmail Account Connected" : "Guest Vault Access"}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                  {currentUser
                    ? `Welcome back, ${currentUser.displayName || currentUser.email}!`
                    : "Institutional Digital Asset Vault"}
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                  {currentUser
                    ? "Your Gmail account is linked to your permanent unique Ethereum address below. All MYC coins received here are exclusively in your custody."
                    : "Sign in with Google to automatically generate your dedicated unique Ethereum address for sending and receiving MYC coins."}
                </p>
              </div>

              {/* Unique Address Callout Box */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-3.5 border border-white/15 shrink-0 space-y-1.5 max-w-md">
                <div className="flex items-center justify-between text-[11px] text-teal-200">
                  <span className="font-semibold uppercase tracking-wider">Your Unique Coin Address:</span>
                  <span className="font-mono text-[10px] bg-teal-500/20 px-2 py-0.5 rounded">
                    {currentUser ? "Permanent UID Derivation" : "Default Vault"}
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
                    {copied ? "Copied to clipboard!" : "Copy Address"}
                  </button>
                  {!currentUser && (
                    <button
                      onClick={handleGoogleSignIn}
                      className="text-xs text-white font-bold bg-[#00875a] hover:bg-[#00754e] px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-xs"
                    >
                      Connect Gmail →
                    </button>
                  )}
                </div>
              </div>
            </div>
            {/* Background design glow */}
            <div className="absolute right-0 top-0 -mr-16 -mt-16 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
          </div>

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
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                          timeframe === t
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
                  Deterministic Wallet Generator Active
                </span>
              </div>
            </div>

            {/* Right 4 Cols: Quick Actions Card */}
            <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Quick Actions</h2>
                <p className="text-xs text-slate-400 mb-5">Transfers, AMM execution, and supply controls</p>

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
                    <span className="text-[11px] text-slate-400">To any address</span>
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

                {/* AMM Swap and Mint Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setIsSwapOpen(true)}
                    className="border border-blue-200 bg-blue-50 hover:bg-blue-100/70 rounded-xl py-2.5 px-3 text-xs font-semibold text-blue-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                    AMM Swap
                  </button>

                  <button
                    onClick={() => setIsMintOpen(true)}
                    className="border border-purple-200 bg-purple-50 hover:bg-purple-100/70 rounded-xl py-2.5 px-3 text-xs font-semibold text-purple-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    Mint (Cap)
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
                    {balanceMYC.toLocaleString()} MYC
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-slate-900 text-sm">
                  ${(balanceMYC * spotPriceInUSD).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs font-semibold text-purple-600">In Custody</div>
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
                    {balanceETH.toFixed(2)} ETH
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-slate-900 text-sm">
                  ${(balanceETH * ethUsdRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs font-semibold text-amber-600">For Gas &amp; Swaps</div>
              </div>
            </div>
          </div>

          {/* ROW 3: DEPOSIT & RECEIVE SECTION - LINKED TO UNIQUE USER ADDRESS */}
          <div
            id="deposit-receive-section"
            className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs scroll-mt-20"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Deposit & Receive MYC</h3>
                <p className="text-xs text-slate-400">
                  Scan or copy your account&apos;s unique Ethereum address to receive My Coin (MYC)
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-[#00875a] border border-emerald-200/60 rounded-full px-3 py-1 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-[#00875a]" />
                  Token: MYC (ERC-20)
                </div>
              </div>
            </div>

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
                      Your Unique Account Address
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 font-semibold">
                        {currentUser ? `Linked: ${currentUser.email}` : "Guest Mode"}
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

                {/* Informational Checkmarks */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8 pt-1 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-[#00875a]" />
                    <span>Unique deterministic address generated per account</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-medium">
                    <RefreshCw className="w-4 h-4 text-emerald-600" />
                    <span>Instant wallet-to-wallet settlement</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ROW 4: RECENT TRANSACTIONS */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Recent MYC &amp; AMM Activity</h3>
                <p className="text-xs text-slate-400">Latest portfolio transfers, swaps, and settlement activity</p>
              </div>

              {/* Filters */}
              <div className="bg-slate-100/90 p-1 rounded-xl flex items-center gap-1 self-start sm:self-auto">
                {(["All", "Received", "Sent"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setTxFilter(filter)}
                    className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      txFilter === filter
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
                    <th className="py-3 px-2">Details</th>
                    <th className="py-3 px-2">Date</th>
                    <th className="py-3 px-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80 text-xs sm:text-sm">
                  {filteredTxs.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* TYPE */}
                      <td className="py-3.5 px-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              tx.type === "Deposit"
                                ? "bg-emerald-50 text-[#00875a]"
                                : tx.type === "Send"
                                ? "bg-blue-50 text-blue-600"
                                : tx.type === "AMM Swap"
                                ? "bg-indigo-50 text-indigo-600"
                                : tx.type === "Mint"
                                ? "bg-purple-50 text-purple-600"
                                : "bg-rose-50 text-rose-600"
                            }`}
                          >
                            {tx.type === "Deposit" && <Check className="w-4 h-4" />}
                            {tx.type === "Send" && <ArrowUpRight className="w-4 h-4" />}
                            {tx.type === "AMM Swap" && <ArrowLeftRight className="w-4 h-4" />}
                            {tx.type === "Mint" && <Sparkles className="w-4 h-4" />}
                            {tx.type === "Burn" && <Flame className="w-4 h-4" />}
                          </div>
                          <span className="font-semibold text-slate-900">{tx.type}</span>
                        </div>
                      </td>

                      {/* AMOUNT */}
                      <td className="py-3.5 px-2">
                        <div className="font-bold text-slate-900">{tx.amount}</div>
                        <div className="text-[11px] text-slate-400">{tx.fiatValue}</div>
                      </td>

                      {/* DETAILS */}
                      <td className="py-3.5 px-2 text-slate-600 font-medium">
                        <div>{tx.details}</div>
                        {tx.recipientFull && (
                          <div className="font-mono text-[10px] text-slate-400 select-all">
                            {tx.recipientFull}
                          </div>
                        )}
                      </td>

                      {/* DATE */}
                      <td className="py-3.5 px-2 text-slate-500 font-medium">{tx.date}</td>

                      {/* STATUS */}
                      <td className="py-3.5 px-2 text-right">
                        <span className="inline-flex items-center gap-1 bg-[#e8f8f0] text-[#00875a] border border-emerald-200/60 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                          <Check className="w-3 h-3" />
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Row */}
            <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-100 text-xs">
              <span className="text-slate-400 font-medium">
                Showing recent {filteredTxs.length} transactions
              </span>
              <button
                onClick={() => setActiveTab("Activity")}
                className="text-[#00875a] font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                View All Activity →
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* AMM SWAP MODAL (x * y = k) */}
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
                {/* AMM Pool Stats Bar */}
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

                {/* You Pay Input */}
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

                {/* Direction Switcher Button */}
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

                {/* You Receive Output */}
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

                {/* Price Impact & Slippage */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs space-y-1 text-slate-500">
                  <div className="flex justify-between">
                    <span>LP Fee (0.3%)</span>
                    <span className="font-semibold text-slate-700">
                      {parsedSwapInput > 0
                        ? `${(parsedSwapInput * 0.003).toFixed(4)} ${swapDirection === "ETH_TO_MYC" ? "ETH" : "MYC"}`
                        : "0.00"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>AMM Price Impact</span>
                    <span
                      className={`font-semibold ${
                        swapResult.priceImpact > 2.0 ? "text-amber-600" : "text-emerald-600"
                      }`}
                    >
                      {swapResult.priceImpact.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>New Spot Price After Swap</span>
                    <span className="font-semibold text-slate-800 font-mono">
                      ${swapResult.newSpotPrice.toFixed(4)} USD
                    </span>
                  </div>
                </div>

                {/* Submit Swap Button */}
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

      {/* SEND MODAL - SENDS FROM CURRENT USER TO ANY SPECIFIC ADDRESS */}
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
                  <p className="text-[11px] text-slate-400">From your unique wallet to any recipient address</p>
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
                <h4 className="font-bold text-slate-900 text-base">Transaction Confirmed!</h4>
                <p className="text-xs text-slate-600 max-w-xs mx-auto">{sendSuccessMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleSendTransaction} className="pt-4 space-y-4">
                {/* Sending From */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>Sending From:</span>
                    <span className="font-mono text-slate-800 font-semibold">
                      {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Available Balance:</span>
                    <strong className="font-mono text-emerald-700 font-bold">
                      {balanceMYC.toLocaleString()} MYC
                    </strong>
                  </div>
                </div>

                {/* Recipient Address */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-600">Specific Destination Address</label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSendRecipient("0xedEe7c1429505bcA418Cc48b8Cf8B37E8d602843");
                          setAddressError(null);
                        }}
                        className="text-[11px] text-[#00875a] font-semibold hover:underline cursor-pointer"
                      >
                        Test Receiver Wallet
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Enter recipient address (0x...)"
                    value={sendRecipient}
                    onChange={(e) => {
                      setSendRecipient(e.target.value);
                      if (addressError) setAddressError(null);
                    }}
                    className={`w-full bg-[#f8fafc] border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 ${
                      addressError
                        ? "border-rose-400 focus:ring-rose-200"
                        : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                    }`}
                  />
                  {addressError && (
                    <p className="text-[11px] text-rose-500 font-medium mt-1">{addressError}</p>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-600">Amount (MYC)</label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSendAmount("100")}
                        className="text-[11px] text-slate-500 font-semibold hover:underline cursor-pointer"
                      >
                        100
                      </button>
                      <button
                        type="button"
                        onClick={() => setSendAmount("1000")}
                        className="text-[11px] text-slate-500 font-semibold hover:underline cursor-pointer"
                      >
                        1,000
                      </button>
                      <button
                        type="button"
                        onClick={() => setSendAmount(balanceMYC.toString())}
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
                      className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      MYC
                    </span>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSending}
                  className="w-full bg-[#00875a] text-white hover:bg-[#00754e] font-bold text-sm py-3 rounded-xl transition-all shadow-sm shadow-emerald-900/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Sending {sendAmount} MYC...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send {sendAmount ? parseFloat(sendAmount).toLocaleString() : "0"} MYC</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MINT SUPPLY CONTROLS MODAL */}
      {isMintOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Mint My Coin (Supply Controls)</h3>
                  <p className="text-[11px] text-slate-400">Issue new tokens within the 10,000,000 hard cap</p>
                </div>
              </div>
              <button onClick={() => setIsMintOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {mintSuccessMsg ? (
              <div className="py-6 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-[#00875a] flex items-center justify-center mx-auto">
                  <Check className="w-5 h-5" />
                </div>
                <div className="font-bold text-slate-900 text-sm">{mintSuccessMsg}</div>
              </div>
            ) : (
              <form onSubmit={handleMintTokens} className="pt-4 space-y-3.5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Your Current Balance:</span>
                    <strong className="font-mono text-slate-900">{balanceMYC.toLocaleString()} MYC</strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>On-Chain Hard Cap:</span>
                    <strong className="font-mono text-purple-700">{hardCap.toLocaleString()} MYC</strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Remaining Mintable:</span>
                    <strong className="font-mono text-emerald-700">
                      {(hardCap - balanceMYC).toLocaleString()} MYC
                    </strong>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Mint Amount (MYC)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={hardCap - balanceMYC}
                    value={mintAmount}
                    onChange={(e) => setMintAmount(e.target.value)}
                    className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Recipient Address (Your Unique Address)</label>
                  <input
                    type="text"
                    required
                    value={mintRecipient || userAddress}
                    onChange={(e) => setMintRecipient(e.target.value)}
                    className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 select-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isMinting}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isMinting ? "Minting on-chain..." : `Execute Mint of ${parseFloat(mintAmount || "0").toLocaleString()} MYC`}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
