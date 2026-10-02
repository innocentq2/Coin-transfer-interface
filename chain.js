// Mini Bitcoin-style UTXO blockchain (educational demo, NOT for real money)
// Run: node chain.js      (Node 18+, no npm install needed)

const crypto = require("crypto");

// ---------- config ----------
const UNIT = 100_000_000;            // 1 coin = 100,000,000 base units (like satoshis)
const CONFIG = {
  difficulty: 4,                     // block hash must start with this many hex zeros
  initialReward: 50 * UNIT,          // first block reward
  halvingInterval: 5,                // blocks between halvings (Bitcoin: 210,000)
};

// ---------- helpers ----------
const sha256 = (d) => crypto.createHash("sha256").update(d).digest("hex");
const fmt = (n) => (n / UNIT).toFixed(8).replace(/\.?0+$/, "") || "0";
const short = (h) => h.slice(0, 8) + "…";

function merkleRoot(ids) {
  if (ids.length === 0) return sha256("");
  let level = ids.slice();
  while (level.length > 1) {
    if (level.length % 2) level.push(level[level.length - 1]);
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha256(level[i] + level[i + 1]));
    level = next;
  }
  return level[0];
}

// ---------- wallet (keys + address) ----------
class Wallet {
  constructor(name) {
    this.name = name;
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "secp256k1" });
    this.pubHex = publicKey.export({ type: "spki", format: "der" }).toString("hex");
    this.priv = privateKey;
    this.address = Wallet.addressOf(this.pubHex);
  }
  static addressOf(pubHex) {
    return "ADDR" + sha256(pubHex).slice(0, 36);
  }
  sign(msgHex) {
    return crypto.sign("sha256", Buffer.from(msgHex, "hex"), this.priv).toString("hex");
  }
}

function verifySig(pubHex, msgHex, sigHex) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(pubHex, "hex"), format: "der", type: "spki" });
    return crypto.verify("sha256", Buffer.from(msgHex, "hex"), key, Buffer.from(sigHex, "hex"));
  } catch {
    return false;
  }
}

// ---------- transactions ----------
// input  = { txid, index, pubKey, signature }   (points at an unspent output)
// output = { address, amount }
function txIdOf(tx) {
  return sha256(
    JSON.stringify({
      ins: tx.inputs.map((i) => [i.txid, i.index]),
      outs: tx.outputs,
      coinbaseHeight: tx.coinbaseHeight ?? null,
    })
  );
}

function makeCoinbase(address, amount, height) {
  const tx = { inputs: [], outputs: [{ address, amount }], coinbaseHeight: height };
  tx.id = txIdOf(tx);
  return tx;
}

const isCoinbase = (tx) => tx.inputs.length === 0;
const key = (txid, index) => `${txid}:${index}`;

// ---------- the blockchain ----------
class Blockchain {
  constructor() {
    this.blocks = [];
    this.utxo = new Map();           // "txid:index" -> { address, amount }
    this.mempool = [];
    const genesis = { index: 0, prevHash: "0".repeat(64), timestamp: 0, txs: [], nonce: 0 };
    genesis.merkle = merkleRoot([]);
    genesis.hash = Blockchain.hashBlock(genesis);
    this.blocks.push(genesis);
  }

  static hashBlock(b) {
    return sha256(`${b.index}|${b.prevHash}|${b.timestamp}|${b.merkle}|${b.nonce}`);
  }

  rewardAt(height) {
    const halvings = Math.floor((height - 1) / CONFIG.halvingInterval);
    return halvings >= 64 ? 0 : Math.floor(CONFIG.initialReward / 2 ** halvings);
  }

  // Validate one non-coinbase tx against a UTXO map. Returns the fee.
  validateTx(tx, utxo) {
    if (!tx.inputs.length) throw new Error("no inputs");
    if (!tx.outputs.length) throw new Error("no outputs");
    if (tx.id !== txIdOf(tx)) throw new Error("txid mismatch");
    const seen = new Set();
    let inSum = 0, outSum = 0;
    for (const inp of tx.inputs) {
      const k = key(inp.txid, inp.index);
      if (seen.has(k)) throw new Error("duplicate input inside tx");
      seen.add(k);
      const prev = utxo.get(k);
      if (!prev) throw new Error(`input ${short(inp.txid)}:${inp.index} is missing or already spent`);
      if (Wallet.addressOf(inp.pubKey) !== prev.address) throw new Error("public key does not match the output's address");
      if (!verifySig(inp.pubKey, tx.id, inp.signature)) throw new Error("invalid signature");
      inSum += prev.amount;
    }
    for (const o of tx.outputs) {
      if (!Number.isInteger(o.amount) || o.amount <= 0) throw new Error("bad output amount");
      outSum += o.amount;
    }
    if (outSum > inSum) throw new Error("outputs exceed inputs");
    return inSum - outSum;
  }

  applyTx(utxo, tx) {
    for (const i of tx.inputs) utxo.delete(key(i.txid, i.index));
    tx.outputs.forEach((o, idx) => utxo.set(key(tx.id, idx), { address: o.address, amount: o.amount }));
  }

  // Validate a whole block against a UTXO map (mutates the map). Throws on any problem.
  validateBlock(block, prev, utxo) {
    if (block.prevHash !== prev.hash) throw new Error("prevHash does not link to previous block");
    if (block.index !== prev.index + 1) throw new Error("bad block index");
    if (block.hash !== Blockchain.hashBlock(block)) throw new Error("block hash mismatch (data was altered)");
    if (!block.hash.startsWith("0".repeat(CONFIG.difficulty))) throw new Error("proof of work missing");
    if (block.merkle !== merkleRoot(block.txs.map((t) => t.id))) throw new Error("merkle root mismatch");
    if (!block.txs.length || !isCoinbase(block.txs[0])) throw new Error("first tx must be coinbase");

    let fees = 0;
    for (const tx of block.txs.slice(1)) {
      if (isCoinbase(tx)) throw new Error("extra coinbase");
      fees += this.validateTx(tx, utxo);
      this.applyTx(utxo, tx);        // allows chained spends inside one block
    }
    const cb = block.txs[0];
    const paid = cb.outputs.reduce((s, o) => s + o.amount, 0);
    if (paid > this.rewardAt(block.index) + fees) throw new Error("coinbase pays too much");
    this.applyTx(utxo, cb);
  }

  // ----- public API -----
  balanceOf(address) {
    let s = 0;
    for (const o of this.utxo.values()) if (o.address === address) s += o.amount;
    return s;
  }

  utxosOf(address) {
    const list = [];
    for (const [k, o] of this.utxo) if (o.address === address) list.push({ k, ...o });
    return list;
  }

  totalSupply() {
    let s = 0;
    for (const o of this.utxo.values()) s += o.amount;
    return s;
  }

  pendingSpent() {
    const s = new Set();
    for (const tx of this.mempool) for (const i of tx.inputs) s.add(key(i.txid, i.index));
    return s;
  }

  // Build + sign a payment. Picks UTXOs, adds a change output.
  createPayment(wallet, toAddress, amount, fee = 0, avoid = this.pendingSpent()) {
    const mine = this.utxosOf(wallet.address).filter((u) => !avoid.has(u.k));
    const picked = [];
    let total = 0;
    for (const u of mine) {
      picked.push(u);
      total += u.amount;
      if (total >= amount + fee) break;
    }
    if (total < amount + fee) throw new Error(`${wallet.name} has insufficient funds`);

    const outputs = [{ address: toAddress, amount }];
    const change = total - amount - fee;
    if (change > 0) outputs.push({ address: wallet.address, amount: change });

    const tx = {
      inputs: picked.map((u) => {
        const [txid, index] = u.k.split(":");
        return { txid, index: Number(index), pubKey: wallet.pubHex, signature: "" };
      }),
      outputs,
    };
    tx.id = txIdOf(tx);
    tx.inputs.forEach((i) => (i.signature = wallet.sign(tx.id)));
    return tx;
  }

  submitTx(tx) {
    const spent = this.pendingSpent();
    for (const i of tx.inputs) {
      if (spent.has(key(i.txid, i.index))) throw new Error("double spend: input already used by a pending transaction");
    }
    this.validateTx(tx, this.utxo);
    this.mempool.push(tx);
    return tx.id;
  }

  // Collect mempool txs, add coinbase (reward + fees), do proof of work, append.
  mine(minerAddress) {
    const prev = this.blocks[this.blocks.length - 1];
    const height = prev.index + 1;
    const scratch = new Map(this.utxo);
    const included = [];
    let fees = 0;
    for (const tx of this.mempool) {
      try {
        fees += this.validateTx(tx, scratch);
        this.applyTx(scratch, tx);
        included.push(tx);
      } catch { /* skip invalid */ }
    }
    const coinbase = makeCoinbase(minerAddress, this.rewardAt(height) + fees, height);
    const txs = [coinbase, ...included];
    const block = {
      index: height,
      prevHash: prev.hash,
      timestamp: Date.now(),
      txs,
      merkle: merkleRoot(txs.map((t) => t.id)),
      nonce: 0,
    };
    const target = "0".repeat(CONFIG.difficulty);
    do { block.nonce++; block.hash = Blockchain.hashBlock(block); } while (!block.hash.startsWith(target));

    this.addBlock(block);
    return block;
  }

  addBlock(block) {
    const scratch = new Map(this.utxo);
    this.validateBlock(block, this.blocks[this.blocks.length - 1], scratch);
    this.blocks.push(block);
    this.utxo = scratch;
    const done = new Set(block.txs.map((t) => t.id));
    this.mempool = this.mempool.filter((t) => !done.has(t.id));
  }

  // Re-verify the entire chain from genesis.
  verifyChain() {
    const utxo = new Map();
    try {
      for (let i = 1; i < this.blocks.length; i++) this.validateBlock(this.blocks[i], this.blocks[i - 1], utxo);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }
}

module.exports = { Blockchain, Wallet, CONFIG, UNIT, fmt, short };

// =====================================================================
// DEMO
// =====================================================================
if (require.main === module) {
  const line = (t) => console.log("\n" + "=".repeat(8) + " " + t + " " + "=".repeat(8));
  const chain = new Blockchain();
  const alice = new Wallet("Alice"), bob = new Wallet("Bob"), carol = new Wallet("Carol"), miner = new Wallet("Miner");
  const names = new Map([alice, bob, carol, miner].map((w) => [w.address, w.name]));
  const who = (a) => names.get(a) || short(a);

  const showUtxos = () => {
    console.log("UTXO set:");
    if (!chain.utxo.size) console.log("  (empty)");
    for (const [k, o] of chain.utxo) console.log(`  ${short(k.split(":")[0])}:${k.split(":")[1]}  ${who(o.address).padEnd(6)} ${fmt(o.amount)}`);
  };
  const showBalances = () =>
    console.log("Balances:", [alice, bob, carol, miner].map((w) => `${w.name}=${fmt(chain.balanceOf(w.address))}`).join("  "),
      `| total supply=${fmt(chain.totalSupply())}`);
  const tryIt = (label, fn) => {
    try { fn(); console.log(`  ✔ ${label}`); } catch (e) { console.log(`  ✖ ${label} -> REJECTED: ${e.message}`); }
  };

  line("1. Alice mines 3 blocks (earns block rewards)");
  for (let i = 0; i < 3; i++) {
    const b = chain.mine(alice.address);
    console.log(`  block ${b.index} hash=${short(b.hash)} nonce=${b.nonce} reward=${fmt(chain.rewardAt(b.index))}`);
  }
  showBalances(); showUtxos();

  line("2. Alice pays Bob 70 coins (fee 0.5) – note the CHANGE output");
  const t1 = chain.createPayment(alice, bob.address, 70 * UNIT, 0.5 * UNIT);
  chain.submitTx(t1);
  console.log(`  tx ${short(t1.id)}: ${t1.inputs.length} input(s) -> outputs:`,
    t1.outputs.map((o) => `${who(o.address)}:${fmt(o.amount)}`).join(", "));
  console.log("  mempool size:", chain.mempool.length);

  line("3. Miner mines the block (collects reward + fee)");
  const b4 = chain.mine(miner.address);
  console.log(`  block ${b4.index} mined, txs=${b4.txs.length}, miner earned ${fmt(b4.txs[0].outputs[0].amount)}`);
  showBalances(); showUtxos();

  line("4. Bob pays Carol 20 (fee 0.1), then it is mined");
  const t2 = chain.createPayment(bob, carol.address, 20 * UNIT, 0.1 * UNIT);
  chain.submitTx(t2);
  chain.mine(miner.address);
  showBalances();

  line("5. Attacks that must be rejected");
  const spentInput = t1.inputs[0];
  tryIt("Replay an already-confirmed transaction", () => chain.submitTx(t1));

  const fresh = chain.createPayment(carol, bob.address, 1 * UNIT, 0);
  chain.submitTx(fresh);
  const dbl = chain.createPayment(carol, alice.address, 1 * UNIT, 0, new Set()); // ignore mempool
  tryIt("Double-spend the same UTXO", () => chain.submitTx(dbl));

  const forged = chain.createPayment(bob, miner.address, 1 * UNIT, 0, new Set(chain.pendingSpent()));
  forged.inputs[0].pubKey = carol.pubHex;               // wrong key for Bob's coins
  tryIt("Spend someone else's coins (wrong key)", () => chain.submitTx(forged));

  const tooMuch = chain.createPayment(bob, miner.address, 1 * UNIT, 0, new Set(chain.pendingSpent()));
  tooMuch.outputs[0].amount = 9_999 * UNIT;
  tooMuch.id = txIdOf(tooMuch);
  tryIt("Create coins out of thin air (outputs > inputs)", () => chain.submitTx(tooMuch));
  chain.mine(miner.address);

  line("6. Halving (every " + CONFIG.halvingInterval + " blocks)");
  while (chain.blocks.length <= 12) chain.mine(miner.address);
  for (const h of [1, 5, 6, 10, 11]) console.log(`  block ${String(h).padStart(2)} reward = ${fmt(chain.rewardAt(h))}`);

  line("7. Final state");
  showBalances();
  console.log("Chain length:", chain.blocks.length, "| valid:", chain.verifyChain().ok);

  line("8. Tamper test – rewrite history");
  const victim = chain.blocks[4].txs[1];
  victim.outputs[0].amount = 1 * UNIT;                   // pretend Bob got less
  const res = chain.verifyChain();
  console.log("  after editing block 4:", res.ok ? "still valid (BAD)" : `INVALID -> ${res.reason}`);
}
