import UTXOBlockchainExplorer from "../components/UTXOBlockchainExplorer";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function UtxoPage() {
  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-800 p-6 md:p-10 font-sans antialiased">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3.5 py-2 rounded-xl transition-all shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>&larr; Back to Apex Custody &amp; Bonding Curve</span>
          </Link>
          <span className="text-xs font-semibold text-slate-400">
            Node: Local In-Memory Proof-of-Work Node
          </span>
        </div>

        <UTXOBlockchainExplorer />
      </div>
    </div>
  );
}
