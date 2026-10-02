import crypto from "crypto";

export const UNIT = 100_000_000; // 1 coin = 100,000,000 satoshis

export interface BlockchainConfig {
  difficulty: number;
  initialReward: number;
  halvingInterval: number;
}

export const CONFIG: BlockchainConfig = {
  difficulty: 4,
  initialReward: 50 * UNIT,
  halvingInterval: 5,
};

export const sha256 = (d: string): string =>
  crypto.createHash("sha256").update(d).digest("hex");

export const fmt = (n: number): string =>
  (n / UNIT).toFixed(8).replace(/\.?0+$/, "") || "0";

export const short = (h: string): string =>
  h.length > 12 ? h.slice(0, 8) + "…" : h;

export function merkleRoot(ids: string[]): string {
  if (ids.length === 0) return sha256("");
  let level = ids.slice();
  while (level.length > 1) {
    if (level.length % 2) level.push(level[level.length - 1]);
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256(level[i] + level[i + 1]));
    }
    level = next;
  }
  return level[0];
}

export class Wallet {
  name: string;
  pubHex: string;
  priv: crypto.KeyObject;
  address: string;

  constructor(name: string) {
    this.name = name;
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "secp256k1",
    });
    this.pubHex = publicKey.export({ type: "spki", format: "der" }).toString("hex");
    this.priv = privateKey;
    this.address = Wallet.addressOf(this.pubHex);
  }

  static addressOf(pubHex: string): string {
    return "ADDR" + sha256(pubHex).slice(0, 36);
  }

  sign(msgHex: string): string {
    return crypto
      .sign("sha256", Buffer.from(msgHex, "hex"), this.priv)
      .toString("hex");
  }
}

export function verifySig(pubHex: string, msgHex: string, sigHex: string): boolean {
  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(pubHex, "hex"),
      format: "der",
      type: "spki",
    });
    return crypto.verify(
      "sha256",
      Buffer.from(msgHex, "hex"),
      key,
      Buffer.from(sigHex, "hex")
    );
  } catch {
    return false;
  }
}

export interface TxInput {
  txid: string;
  index: number;
  pubKey: string;
  signature: string;
}

export interface TxOutput {
  address: string;
  amount: number;
}

export interface Transaction {
  id: string;
  inputs: TxInput[];
  outputs: TxOutput[];
  coinbaseHeight?: number | null;
}

export interface Block {
  index: number;
  prevHash: string;
  timestamp: number;
  txs: Transaction[];
  merkle: string;
  nonce: number;
  hash: string;
}

export interface UTXOItem {
  k: string;
  address: string;
  amount: number;
}

export function txIdOf(tx: {
  inputs: { txid: string; index: number }[];
  outputs: TxOutput[];
  coinbaseHeight?: number | null;
}): string {
  return sha256(
    JSON.stringify({
      ins: tx.inputs.map((i) => [i.txid, i.index]),
      outs: tx.outputs,
      coinbaseHeight: tx.coinbaseHeight ?? null,
    })
  );
}

export function makeCoinbase(
  address: string,
  amount: number,
  height: number
): Transaction {
  const tx: Transaction = {
    id: "",
    inputs: [],
    outputs: [{ address, amount }],
    coinbaseHeight: height,
  };
  tx.id = txIdOf(tx);
  return tx;
}

export const isCoinbase = (tx: Transaction): boolean => tx.inputs.length === 0;
export const key = (txid: string, index: number): string => `${txid}:${index}`;

export class Blockchain {
  blocks: Block[];
  utxo: Map<string, { address: string; amount: number }>;
  mempool: Transaction[];

  constructor() {
    this.blocks = [];
    this.utxo = new Map();
    this.mempool = [];
    const genesisData = {
      index: 0,
      prevHash: "0".repeat(64),
      timestamp: 0,
      txs: [],
      merkle: merkleRoot([]),
      nonce: 0,
    };
    const fullGenesis: Block = {
      ...genesisData,
      hash: Blockchain.hashBlock(genesisData),
    };
    this.blocks.push(fullGenesis);
  }

  static hashBlock(b: {
    index: number;
    prevHash: string;
    timestamp: number;
    merkle: string;
    nonce: number;
  }): string {
    return sha256(
      `${b.index}|${b.prevHash}|${b.timestamp}|${b.merkle}|${b.nonce}`
    );
  }

  rewardAt(height: number): number {
    const halvings = Math.floor((height - 1) / CONFIG.halvingInterval);
    return halvings >= 64
      ? 0
      : Math.floor(CONFIG.initialReward / 2 ** halvings);
  }

  validateTx(
    tx: Transaction,
    utxo: Map<string, { address: string; amount: number }>
  ): number {
    if (!tx.inputs.length) throw new Error("no inputs");
    if (!tx.outputs.length) throw new Error("no outputs");
    if (tx.id !== txIdOf(tx)) throw new Error("txid mismatch");
    const seen = new Set<string>();
    let inSum = 0;
    let outSum = 0;

    for (const inp of tx.inputs) {
      const k = key(inp.txid, inp.index);
      if (seen.has(k)) throw new Error("duplicate input inside tx");
      seen.add(k);
      const prev = utxo.get(k);
      if (!prev) {
        throw new Error(
          `input ${short(inp.txid)}:${inp.index} is missing or already spent`
        );
      }
      if (Wallet.addressOf(inp.pubKey) !== prev.address) {
        throw new Error("public key does not match the output's address");
      }
      if (!verifySig(inp.pubKey, tx.id, inp.signature)) {
        throw new Error("invalid signature");
      }
      inSum += prev.amount;
    }

    for (const o of tx.outputs) {
      if (!Number.isInteger(o.amount) || o.amount <= 0) {
        throw new Error("bad output amount");
      }
      outSum += o.amount;
    }

    if (outSum > inSum) throw new Error("outputs exceed inputs");
    return inSum - outSum;
  }

  applyTx(
    utxo: Map<string, { address: string; amount: number }>,
    tx: Transaction
  ): void {
    for (const i of tx.inputs) utxo.delete(key(i.txid, i.index));
    tx.outputs.forEach((o, idx) =>
      utxo.set(key(tx.id, idx), { address: o.address, amount: o.amount })
    );
  }

  validateBlock(
    block: Block,
    prev: Block,
    utxo: Map<string, { address: string; amount: number }>
  ): void {
    if (block.prevHash !== prev.hash) {
      throw new Error("prevHash does not link to previous block");
    }
    if (block.index !== prev.index + 1) throw new Error("bad block index");
    if (block.hash !== Blockchain.hashBlock(block)) {
      throw new Error("block hash mismatch (data was altered)");
    }
    if (!block.hash.startsWith("0".repeat(CONFIG.difficulty))) {
      throw new Error("proof of work missing");
    }
    if (block.merkle !== merkleRoot(block.txs.map((t) => t.id))) {
      throw new Error("merkle root mismatch");
    }
    if (!block.txs.length || !isCoinbase(block.txs[0])) {
      throw new Error("first tx must be coinbase");
    }

    let fees = 0;
    for (const tx of block.txs.slice(1)) {
      if (isCoinbase(tx)) throw new Error("extra coinbase");
      fees += this.validateTx(tx, utxo);
      this.applyTx(utxo, tx);
    }
    const cb = block.txs[0];
    const paid = cb.outputs.reduce((s, o) => s + o.amount, 0);
    if (paid > this.rewardAt(block.index) + fees) {
      throw new Error("coinbase pays too much");
    }
    this.applyTx(utxo, cb);
  }

  balanceOf(address: string): number {
    let s = 0;
    for (const o of this.utxo.values()) {
      if (o.address === address) s += o.amount;
    }
    return s;
  }

  utxosOf(address: string): UTXOItem[] {
    const list: UTXOItem[] = [];
    for (const [k, o] of this.utxo) {
      if (o.address === address) list.push({ k, ...o });
    }
    return list;
  }

  totalSupply(): number {
    let s = 0;
    for (const o of this.utxo.values()) s += o.amount;
    return s;
  }

  pendingSpent(): Set<string> {
    const s = new Set<string>();
    for (const tx of this.mempool) {
      for (const i of tx.inputs) s.add(key(i.txid, i.index));
    }
    return s;
  }

  createPayment(
    wallet: Wallet,
    toAddress: string,
    amount: number,
    fee: number = 0,
    avoid: Set<string> = this.pendingSpent()
  ): Transaction {
    const mine = this.utxosOf(wallet.address).filter((u) => !avoid.has(u.k));
    const picked: UTXOItem[] = [];
    let total = 0;
    for (const u of mine) {
      picked.push(u);
      total += u.amount;
      if (total >= amount + fee) break;
    }
    if (total < amount + fee) {
      throw new Error(`${wallet.name} has insufficient funds`);
    }

    const outputs: TxOutput[] = [{ address: toAddress, amount }];
    const change = total - amount - fee;
    if (change > 0) outputs.push({ address: wallet.address, amount: change });

    const tx: Transaction = {
      id: "",
      inputs: picked.map((u) => {
        const [txid, index] = u.k.split(":");
        return {
          txid,
          index: Number(index),
          pubKey: wallet.pubHex,
          signature: "",
        };
      }),
      outputs,
    };
    tx.id = txIdOf(tx);
    tx.inputs.forEach((i) => (i.signature = wallet.sign(tx.id)));
    return tx;
  }

  submitTx(tx: Transaction): string {
    const spent = this.pendingSpent();
    for (const i of tx.inputs) {
      if (spent.has(key(i.txid, i.index))) {
        throw new Error(
          "double spend: input already used by a pending transaction"
        );
      }
    }
    this.validateTx(tx, this.utxo);
    this.mempool.push(tx);
    return tx.id;
  }

  mine(minerAddress: string): Block {
    const prev = this.blocks[this.blocks.length - 1];
    const height = prev.index + 1;
    const scratch = new Map(this.utxo);
    const included: Transaction[] = [];
    let fees = 0;

    for (const tx of this.mempool) {
      try {
        fees += this.validateTx(tx, scratch);
        this.applyTx(scratch, tx);
        included.push(tx);
      } catch {
        /* skip invalid */
      }
    }

    const coinbase = makeCoinbase(
      minerAddress,
      this.rewardAt(height) + fees,
      height
    );
    const txs = [coinbase, ...included];
    const block: Block = {
      index: height,
      prevHash: prev.hash,
      timestamp: Date.now(),
      txs,
      merkle: merkleRoot(txs.map((t) => t.id)),
      nonce: 0,
      hash: "",
    };

    const target = "0".repeat(CONFIG.difficulty);
    do {
      block.nonce++;
      block.hash = Blockchain.hashBlock(block);
    } while (!block.hash.startsWith(target));

    this.addBlock(block);
    return block;
  }

  addBlock(block: Block): void {
    const scratch = new Map(this.utxo);
    this.validateBlock(block, this.blocks[this.blocks.length - 1], scratch);
    this.blocks.push(block);
    this.utxo = scratch;
    const done = new Set(block.txs.map((t) => t.id));
    this.mempool = this.mempool.filter((t) => !done.has(t.id));
  }

  verifyChain(): { ok: boolean; reason?: string } {
    const utxo = new Map<string, { address: string; amount: number }>();
    try {
      for (let i = 1; i < this.blocks.length; i++) {
        this.validateBlock(this.blocks[i], this.blocks[i - 1], utxo);
      }
      return { ok: true };
    } catch (e: unknown) {
      const err = e as Error;
      return { ok: false, reason: err.message };
    }
  }
}
