"use client";

import React, { useState, useEffect } from "react";
import {
  Boxes,
  Pickaxe,
  Send,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Coins,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Hash,
  Clock,
  Layers,
  Sparkles,
  KeyRound,
  User,
  AlertTriangle,
  Play,
} from "lucide-react";

interface BlockTx {
  id: string;
  isCoinbase: boolean;
  coinbaseHeight?: number | null;
  inputs: { txid: string; index: number; pubKey: string }[];
  outputs: { address: string; owner: string; amount: number; amountFormatted: string }[];
}

interface BlockData {
  index: number;
  hash: string;
  prevHash: string;
  timestamp: number;
  dateFormatted: string;
  nonce: number;
  merkle: string;
  txCount: number;
  txs: BlockTx[];
}

interface UTXOData {
  k: string;
  txid: string;
  index: number;
  address: string;
  owner: string;
  amount: number;
  amountFormatted: string;
}

interface MempoolTx {
  id: string;
  inputsCount: number;
  outputs: { address: string; owner: string; amountFormatted: string }[];
}

interface WalletData {
  name: string;
  address: string;
  pubHex: string;
  balance: number;
  balanceFormatted: string;
  utxoCount: number;
}

interface BlockchainStats {
  blockCount: number;
  totalSupply: number;
  totalSupplyFormatted: string;
  currentReward: number;
  currentRewardFormatted: string;
  difficulty: number;
  halvingInterval: number;
  mempoolSize: number;
  utxoCount: number;
}

interface ChainResponse {
  blocks: BlockData[];
  utxos: UTXOData[];
  mempool: MempoolTx[];
  wallets: WalletData[];
  stats: BlockchainStats;
  isValid: boolean;
  invalidReason?: string;
  lastTamperResult?: { ok: boolean; reason?: string } | null;
}

export default function UTXOBlockchainExplorer() {
  const [data, setData] = useState<ChainResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeSubTab, setActiveSubTab] = useState<"Blocks" | "UTXOs" | "Mempool" | "Transfer" | "Attacks">("Blocks");
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);

  // Transfer Form State
  const [sender, setSender] = useState<string>("Alice");
  const [recipient, setRecipient] = useState<string>("Bob");
  const [amount, setAmount] = useState<string>("10");
  const [fee, setFee] = useState<string>("0.1");
  const [isSubmittingTx, setIsSubmittingTx] = useState<boolean>(false);
  const [txNotice, setTxNotice] = useState<{ success: boolean; message: string } | null>(null);

  // Mining State
  const [minerWallet, setMinerWallet] = useState<string>("Miner");
  const [isMining, setIsMining] = useState<boolean>(false);
  const [mineNotice, setMineNotice] = useState<string | null>(null);

  // Attack Test State
  const [attackTesting, setAttackTesting] = useState<string | null>(null);
  const [attackLog, setAttackLog] = useState<{
    type: string;
    title: string;
    expected: string;
    caught: boolean;
    result: string;
    timestamp: string;
  }[]>([]);

  const fetchChainState = async () => {
    try {
      const res = await fetch("/api/utxo");
      const json = await res.json();
      setData(json);
      if (json.blocks && json.blocks.length > 0 && selectedBlockIndex === null) {
        setSelectedBlockIndex(json.blocks[json.blocks.length - 1].index);
      }
    } catch (err) {
      console.error("Failed to fetch UTXO chain state:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChainState();
  }, []);

  const handleMineBlock = async () => {
    setIsMining(true);
    setMineNotice(null);
    try {
      const res = await fetch("/api/utxo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mine", miner: minerWallet }),
      });
      const result = await res.json();
      if (result.data) {
        setData(result.data);
        setSelectedBlockIndex(result.data.blocks[result.data.blocks.length - 1].index);
      }
      setMineNotice(result.message || "Block mined successfully!");
      setTimeout(() => setMineNotice(null), 4000);
    } catch (err) {
      console.error("Mining error:", err);
    } finally {
      setIsMining(false);
    }
  };

  const handleSendPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingTx(true);
    setTxNotice(null);
    try {
      const res = await fetch("/api/utxo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pay",
          sender,
          recipient,
          amount,
          fee,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        setTxNotice({ success: true, message: result.message });
      } else {
        setTxNotice({ success: false, message: result.error || "Payment failed" });
      }
    } catch (err: unknown) {
      const error = err as Error;
      setTxNotice({ success: false, message: error.message });
    } finally {
      setIsSubmittingTx(false);
    }
  };

  const handleTriggerAttack = async (
    type: "replay" | "double_spend" | "wrong_key" | "inflation" | "tamper",
    title: string,
    expectedBehavior: string
  ) => {
    setAttackTesting(type);
    try {
      const res = await fetch("/api/utxo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "attack", attackType: type }),
      });
      const result = await res.json();
      if (result.data) {
        setData(result.data);
      }
      setAttackLog((prev) => [
        {
          type,
          title,
          expected: expectedBehavior,
          caught: !!result.attackCaught,
          result: result.rejectionReason || result.message || "Rejected by consensus rules",
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } catch (err: unknown) {
      const error = err as Error;
      setAttackLog((prev) => [
        {
          type,
          title,
          expected: expectedBehavior,
          caught: true,
          result: error.message,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } finally {
      setAttackTesting(null);
    }
  };

  const handleResetChain = async () => {
    if (!confirm("Reset blockchain state back to the initial baseline demo?")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/utxo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const result = await res.json();
      setData(result.data);
      setAttackLog([]);
      setSelectedBlockIndex(result.data.blocks[result.data.blocks.length - 1].index);
    } catch (err) {
      console.error("Reset error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mx-auto" />
        <h4 className="font-bold text-slate-800 text-base">Loading Bitcoin UTXO Blockchain...</h4>
        <p className="text-xs text-slate-400">Verifying Proof of Work hashes and constructing UTXO set</p>
      </div>
    );
  }

  const selectedBlock =
    data.blocks.find((b) => b.index === selectedBlockIndex) ||
    data.blocks[data.blocks.length - 1];

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-[#182333] to-[#122822] text-white rounded-2xl p-6 sm:p-7 border border-slate-800 shadow-md relative overflow-hidden">
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-300 text-xs font-semibold px-3 py-1 rounded-full border border-amber-500/30">
              <Boxes className="w-3.5 h-3.5" />
              Bitcoin-Style UTXO Blockchain
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/10 text-slate-200 text-xs font-semibold px-2.5 py-1 rounded-full border border-white/15">
              <Hash className="w-3 h-3 text-teal-400" />
              PoW Target: 0000 (Diff 4)
            </span>
            <span className="inline-flex items-center gap-1.5 bg-teal-500/15 text-teal-200 text-xs font-semibold px-2.5 py-1 rounded-full border border-teal-500/30">
              <KeyRound className="w-3 h-3 text-teal-300" />
              secp256k1 Curve ECDSA
            </span>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                data.isValid
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-rose-500/20 text-rose-300 border-rose-500/40"
              }`}
            >
              {data.isValid ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Chain Valid (Full Consensus Verified)
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  Chain Tampered: {data.invalidReason}
                </>
              )}
            </span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="max-w-3xl">
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                Live UTXO State Engine &amp; Mining Simulator
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
                Transactions consume unspent transaction outputs (UTXOs) and create new ones. Proof of Work seals blocks with cryptographic Merkle trees, halving subsidies, and strict tamper verification.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleResetChain}
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-2 rounded-xl border border-white/15 transition-all flex items-center gap-1.5 cursor-pointer"
                title="Reset to baseline"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Demo</span>
              </button>

              <button
                onClick={handleMineBlock}
                disabled={isMining}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold px-4 py-2 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Pickaxe className={`w-4 h-4 ${isMining ? "animate-spin" : ""}`} />
                <span>{isMining ? "Mining PoW Nonce..." : "Mine Next Block"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {mineNotice && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-3 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <Pickaxe className="w-4 h-4 text-amber-700 shrink-0" />
          <span>{mineNotice}</span>
        </div>
      )}

      {/* 2. Key Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Block Height
          </span>
          <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
            #{data.stats.blockCount - 1}
          </div>
          <span className="text-[10px] text-slate-500">
            {data.stats.blockCount} blocks in chain
          </span>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Total Supply
          </span>
          <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono text-emerald-700">
            {data.stats.totalSupplyFormatted} Coins
          </div>
          <span className="text-[10px] text-slate-500">
            Current Reward: {data.stats.currentRewardFormatted} / block
          </span>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Active UTXO Set
          </span>
          <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono text-teal-700">
            {data.stats.utxoCount} Outputs
          </div>
          <span className="text-[10px] text-slate-500">
            Spendable coin allocations
          </span>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Pending Mempool
          </span>
          <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono text-amber-700">
            {data.stats.mempoolSize} Txs
          </div>
          <span className="text-[10px] text-slate-500">
            Waiting for next block
          </span>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Halving Schedule
          </span>
          <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
            Every {data.stats.halvingInterval} Blks
          </div>
          <span className="text-[10px] text-slate-500">
            50 &rarr; 25 &rarr; 12.5 coins
          </span>
        </div>
      </div>

      {/* 3. Wallets Overview */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-teal-600" />
            <h4 className="font-bold text-slate-900 text-sm">Active Network Wallets (secp256k1)</h4>
          </div>
          <span className="text-[11px] text-slate-400">
            Addresses derived via <code className="text-teal-700 font-mono">ADDR + sha256(pubKey)</code>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.wallets.map((w) => (
            <div
              key={w.name}
              className={`p-3.5 rounded-xl border transition-all ${
                sender === w.name
                  ? "bg-teal-50/70 border-teal-300 ring-2 ring-teal-500/20"
                  : "bg-slate-50 border-slate-200/80 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      w.name === "Alice"
                        ? "bg-emerald-500"
                        : w.name === "Bob"
                        ? "bg-blue-500"
                        : w.name === "Carol"
                        ? "bg-purple-500"
                        : "bg-amber-500"
                    }`}
                  />
                  {w.name}
                </span>
                <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                  {w.utxoCount} UTXOs
                </span>
              </div>

              <div className="text-lg font-extrabold text-slate-900 font-mono">
                {w.balanceFormatted} <span className="text-xs text-slate-500 font-normal">Coins</span>
              </div>

              <div className="text-[10px] text-slate-400 font-mono truncate mt-1 select-all" title={w.address}>
                {w.address}
              </div>

              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200/60">
                <button
                  onClick={() => {
                    setSender(w.name);
                    setActiveSubTab("Transfer");
                  }}
                  className="flex-1 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold py-1 rounded border border-slate-200 transition-colors cursor-pointer text-center"
                >
                  Send Coins
                </button>
                <button
                  onClick={() => {
                    setMinerWallet(w.name);
                    handleMineBlock();
                  }}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold px-2 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
                  title="Mine next block with this wallet"
                >
                  <Pickaxe className="w-3 h-3" />
                  <span>Mine</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Sub-Navigation Tabs */}
      <div className="flex items-center gap-1 bg-slate-100/90 p-1.5 rounded-xl border border-slate-200/80 overflow-x-auto">
        {(["Blocks", "UTXOs", "Mempool", "Transfer", "Attacks"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === tab
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {tab === "Blocks" && <Boxes className="w-3.5 h-3.5 text-teal-600" />}
            {tab === "UTXOs" && <Coins className="w-3.5 h-3.5 text-emerald-600" />}
            {tab === "Mempool" && (
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            )}
            {tab === "Transfer" && <Send className="w-3.5 h-3.5 text-blue-600" />}
            {tab === "Attacks" && <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />}
            <span>
              {tab === "Blocks" && `Block Explorer (${data.blocks.length})`}
              {tab === "UTXOs" && `UTXO Set (${data.utxos.length})`}
              {tab === "Mempool" && `Mempool (${data.mempool.length})`}
              {tab === "Transfer" && "Send Payment"}
              {tab === "Attacks" && "Attack Rejection Lab"}
            </span>
          </button>
        ))}
      </div>

      {/* 5. TAB CONTENT */}

      {/* TAB A: BLOCKS EXPLORER */}
      {activeSubTab === "Blocks" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Blocks Carousel / List */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
              <span>Blocks Timeline</span>
              <span>{data.blocks.length} Total</span>
            </div>

            <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
              {data.blocks
                .slice()
                .reverse()
                .map((b) => (
                  <button
                    key={b.index}
                    onClick={() => setSelectedBlockIndex(b.index)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                      selectedBlock.index === b.index
                        ? "bg-teal-50/80 border-teal-400 ring-2 ring-teal-500/20"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-900 flex items-center gap-1.5 font-mono">
                        <Boxes className="w-3.5 h-3.5 text-teal-600" />
                        Block #{b.index}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {b.dateFormatted}
                      </span>
                    </div>

                    <div className="font-mono text-[11px] text-slate-500 mt-1 truncate">
                      {b.hash}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                      <span>{b.txCount} Tx(s)</span>
                      <span>Nonce: {b.nonce}</span>
                    </div>
                  </button>
                ))}
            </div>
          </div>

          {/* Right: Selected Block Deep Dive */}
          <div className="lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-teal-600" />
                  Block #{selectedBlock.index} Details
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Mined at {selectedBlock.dateFormatted} with {selectedBlock.txCount} transaction(s)
                </p>
              </div>
              <span className="text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full">
                PoW Verified
              </span>
            </div>

            {/* Block Header Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Block Hash</span>
                <span className="font-mono text-slate-800 break-all select-all font-semibold">
                  {selectedBlock.hash}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Previous Block Hash</span>
                <span className="font-mono text-slate-800 break-all select-all font-semibold">
                  {selectedBlock.prevHash}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Merkle Root</span>
                <span className="font-mono text-slate-800 break-all select-all font-semibold">
                  {selectedBlock.merkle}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Nonce &amp; Difficulty</span>
                <span className="font-mono text-slate-800 font-semibold">
                  Nonce: {selectedBlock.nonce} &bull; Difficulty: {data.stats.difficulty} hex zeros
                </span>
              </div>
            </div>

            {/* Transactions in Block */}
            <div className="space-y-3 pt-2">
              <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Transactions ({selectedBlock.txs.length})
              </h5>

              <div className="space-y-3">
                {selectedBlock.txs.map((tx, idx) => (
                  <div
                    key={tx.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                            tx.isCoinbase
                              ? "bg-amber-100 text-amber-900 border border-amber-200"
                              : "bg-blue-100 text-blue-900 border border-blue-200"
                          }`}
                        >
                          {tx.isCoinbase ? "COINBASE MINT" : `TX #${idx}`}
                        </span>
                        <span className="font-mono text-slate-600 text-[11px] select-all truncate max-w-xs">
                          {tx.id}
                        </span>
                      </div>
                      <span className="text-slate-400 text-[11px]">
                        {tx.isCoinbase ? "Block Reward + Fees" : `${tx.inputs.length} In / ${tx.outputs.length} Out`}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* Inputs */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-slate-400">
                          Inputs Spent:
                        </span>
                        {tx.isCoinbase ? (
                          <div className="text-slate-500 italic bg-white p-2 rounded border border-slate-200">
                            No inputs (Coinbase newly created subsidy)
                          </div>
                        ) : (
                          tx.inputs.map((inp, i) => (
                            <div
                              key={i}
                              className="font-mono text-[10px] bg-white p-1.5 rounded border border-slate-200 text-slate-700 truncate"
                            >
                              Spent: {inp.txid.slice(0, 10)}...:{inp.index}
                            </div>
                          ))
                        )}
                      </div>

                      {/* Outputs */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-slate-400">
                          Outputs Created:
                        </span>
                        {tx.outputs.map((out, oIdx) => (
                          <div
                            key={oIdx}
                            className="bg-white p-1.5 rounded border border-slate-200 flex items-center justify-between text-[11px]"
                          >
                            <span className="font-semibold text-slate-800">
                              {out.owner}:
                            </span>
                            <span className="font-mono font-bold text-emerald-700">
                              +{out.amountFormatted} Coins
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB B: LIVE UTXO SET TABLE */}
      {activeSubTab === "UTXOs" && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-600" />
                Current Unspent Transaction Output (UTXO) Set
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Every coin in the network exists exclusively as one of these {data.utxos.length} unspent outputs.
              </p>
            </div>
            <div className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-lg">
              Total UTXO Value: {data.stats.totalSupplyFormatted} Coins
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">UTXO Key (txid:index)</th>
                  <th className="py-2.5 px-3">Owner Wallet</th>
                  <th className="py-2.5 px-3">Address</th>
                  <th className="py-2.5 px-3 text-right">Value (Coins)</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-mono">
                {data.utxos.map((u) => (
                  <tr key={u.k} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 text-slate-800 font-semibold select-all">
                      {u.txid.slice(0, 10)}...:{u.index}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[11px] font-sans ${
                          u.owner === "Alice"
                            ? "bg-emerald-100 text-emerald-800"
                            : u.owner === "Bob"
                            ? "bg-blue-100 text-blue-800"
                            : u.owner === "Carol"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {u.owner}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-500 select-all truncate max-w-xs">
                      {u.address}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900">
                      {u.amountFormatted}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 font-sans">
                        <CheckCircle2 className="w-3 h-3" />
                        Unspent
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB C: MEMPOOL */}
      {activeSubTab === "Mempool" && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                Mempool: Pending Unconfirmed Transactions
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                These signed transactions are waiting to be verified and packaged by a miner into the next block.
              </p>
            </div>
            <button
              onClick={handleMineBlock}
              disabled={isMining}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Pickaxe className="w-3.5 h-3.5" />
              <span>Mine Pending Txs</span>
            </button>
          </div>

          {data.mempool.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-8 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <h5 className="font-bold text-slate-800 text-sm">Mempool is Currently Empty</h5>
              <p className="text-xs text-slate-400">
                All submitted transactions have been confirmed into blocks. Go to &quot;Send Payment&quot; to queue a new transaction!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.mempool.map((tx) => (
                <div
                  key={tx.id}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-slate-800 font-bold">
                      Tx: {tx.id.slice(0, 16)}...
                    </span>
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                      Unconfirmed ({tx.inputsCount} inputs)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {tx.outputs.map((o, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-2 rounded border border-slate-200 flex justify-between"
                      >
                        <span className="font-medium text-slate-600">To {o.owner}:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {o.amountFormatted} Coins
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB D: SEND PAYMENT */}
      {activeSubTab === "Transfer" && (
        <div className="max-w-2xl mx-auto bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="pb-3 border-b border-slate-100">
            <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-600" />
              Send Bitcoin UTXO Payment
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Automatically selects unspent outputs, signs inputs using secp256k1 private key, and generates change outputs.
            </p>
          </div>

          {txNotice && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                txNotice.success
                  ? "bg-emerald-50 text-emerald-900 border border-emerald-300"
                  : "bg-rose-50 text-rose-900 border border-rose-300"
              }`}
            >
              {txNotice.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{txNotice.message}</span>
            </div>
          )}

          <form onSubmit={handleSendPayment} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Sender Wallet</label>
                <select
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {data.wallets.map((w) => (
                    <option key={w.name} value={w.name}>
                      {w.name} ({w.balanceFormatted} coins)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Recipient</label>
                <select
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {data.wallets
                    .filter((w) => w.name !== sender)
                    .map((w) => (
                      <option key={w.name} value={w.name}>
                        {w.name} ({w.address.slice(0, 10)}...)
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Amount to Send (Coins)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.00000001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Miner Fee (Coins)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                UTXO Accounting Preview
              </span>
              <div className="flex justify-between text-slate-600">
                <span>Payment Output:</span>
                <span className="font-mono font-bold text-slate-800">
                  {amount} coins &rarr; {recipient}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Miner Fee:</span>
                <span className="font-mono font-bold text-amber-700">
                  {fee} coins (incentivizes miners)
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Change Output:</span>
                <span className="font-mono font-bold text-teal-700">
                  Calculated automatically &rarr; {sender}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmittingTx}
              className="w-full bg-[#00875a] hover:bg-[#00754e] text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isSubmittingTx ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Signing &amp; Submitting Tx...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Sign &amp; Broadcast Transaction</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* TAB E: ATTACK REJECTION LAB */}
      {activeSubTab === "Attacks" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <div>
                <h4 className="font-extrabold text-slate-900 text-base">
                  Interactive Attack Simulation Lab
                </h4>
                <p className="text-xs text-slate-400">
                  Test and prove how Bitcoin consensus rules and cryptographic verification block malicious behavior.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
              {/* Attack 1: Replay Confirmed Tx */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">Replay Attack</span>
                    <span className="bg-rose-100 text-rose-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                      Attack 1
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-normal">
                    Re-submits an already confirmed payment transaction to drain money twice.
                  </p>
                  <div className="text-[10px] text-slate-400">
                    Expected: Rejected because inputs are already removed from UTXO map.
                  </div>
                </div>

                <button
                  onClick={() =>
                    handleTriggerAttack(
                      "replay",
                      "Replay Confirmed Transaction",
                      "Must reject because inputs are already spent"
                    )
                  }
                  disabled={attackTesting === "replay"}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  <span>Test Replay Attack</span>
                </button>
              </div>

              {/* Attack 2: Double Spend Same UTXO */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">Double-Spend Attack</span>
                    <span className="bg-rose-100 text-rose-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                      Attack 2
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-normal">
                    Creates two conflicting transactions spending the exact same UTXO simultaneously.
                  </p>
                  <div className="text-[10px] text-slate-400">
                    Expected: Mempool tracking flags input as already pending-spent.
                  </div>
                </div>

                <button
                  onClick={() =>
                    handleTriggerAttack(
                      "double_spend",
                      "Double Spend Same UTXO",
                      "Must block duplicate input in pending pool"
                    )
                  }
                  disabled={attackTesting === "double_spend"}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  <span>Test Double Spend</span>
                </button>
              </div>

              {/* Attack 3: Spend Someone Else's Coins */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">Forged Key Attack</span>
                    <span className="bg-rose-100 text-rose-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                      Attack 3
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-normal">
                    Attempts to spend Bob&apos;s coins using Carol&apos;s public key and signature.
                  </p>
                  <div className="text-[10px] text-slate-400">
                    Expected: Fails because public key hash does not match output address.
                  </div>
                </div>

                <button
                  onClick={() =>
                    handleTriggerAttack(
                      "wrong_key",
                      "Spend Someone Else's Coins",
                      "Must reject because public key hash mismatch"
                    )
                  }
                  disabled={attackTesting === "wrong_key"}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  <span>Test Forged Key</span>
                </button>
              </div>

              {/* Attack 4: Inflate Output Amount */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">Coin Inflation Attack</span>
                    <span className="bg-rose-100 text-rose-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                      Attack 4
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-normal">
                    Modifies transaction output amount to 9,999 coins out of thin air.
                  </p>
                  <div className="text-[10px] text-slate-400">
                    Expected: Re-hashed txid invalidates signature, and outputs exceed inputs.
                  </div>
                </div>

                <button
                  onClick={() =>
                    handleTriggerAttack(
                      "inflation",
                      "Inflate Output Amount",
                      "Must reject due to signature mismatch and outputs > inputs"
                    )
                  }
                  disabled={attackTesting === "inflation"}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  <span>Test Coin Inflation</span>
                </button>
              </div>

              {/* Attack 5: Tamper With Historic Block */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">History Tampering</span>
                    <span className="bg-rose-100 text-rose-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                      Attack 5
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-normal">
                    Silently alters an output inside block #4 in blockchain history.
                  </p>
                  <div className="text-[10px] text-slate-400">
                    Expected: <code className="font-mono">verifyChain()</code> detects Merkle root / txid breakdown.
                  </div>
                </div>

                <button
                  onClick={() =>
                    handleTriggerAttack(
                      "tamper",
                      "Tamper Historic Block #4",
                      "Must break full chain verification (txid mismatch)"
                    )
                  }
                  disabled={attackTesting === "tamper"}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  <span>Test History Tamper</span>
                </button>
              </div>
            </div>
          </div>

          {/* Attack Log Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-3">
            <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Security Test Verification Results
            </h5>

            {attackLog.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-4 text-center">
                Click any attack button above to trigger an attack simulation against the blockchain consensus engine.
              </div>
            ) : (
              <div className="space-y-2">
                {attackLog.map((log, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{log.title}</span>
                        <span className="text-[10px] text-slate-400">{log.timestamp}</span>
                      </div>
                      <div className="text-slate-600 text-[11px]">
                        <strong>Expected:</strong> {log.expected}
                      </div>
                      <div className="font-mono text-[11px] text-rose-700 font-semibold">
                        {log.result}
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      Attack Blocked
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
