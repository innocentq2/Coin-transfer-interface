import { NextResponse } from "next/server";
import {
  Blockchain,
  Wallet,
  UNIT,
  fmt,
  CONFIG,
  txIdOf,
} from "../../lib/utxoChain";

// Singleton chain instance in server memory
interface StateContainer {
  chain: Blockchain;
  wallets: Record<string, Wallet>;
  lastTamperResult: { ok: boolean; reason?: string } | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __utxoChainState: StateContainer | undefined;
}

function initChain(): StateContainer {
  const chain = new Blockchain();
  const alice = new Wallet("Alice");
  const bob = new Wallet("Bob");
  const carol = new Wallet("Carol");
  const miner = new Wallet("Miner");

  const wallets: Record<string, Wallet> = {
    Alice: alice,
    Bob: bob,
    Carol: carol,
    Miner: miner,
  };

  // Pre-mine 3 blocks for Alice
  for (let i = 0; i < 3; i++) {
    chain.mine(alice.address);
  }

  // Alice pays Bob 70 coins (fee 0.5)
  const t1 = chain.createPayment(alice, bob.address, 70 * UNIT, 0.5 * UNIT);
  chain.submitTx(t1);
  chain.mine(miner.address);

  // Bob pays Carol 20 (fee 0.1)
  const t2 = chain.createPayment(bob, carol.address, 20 * UNIT, 0.1 * UNIT);
  chain.submitTx(t2);
  chain.mine(miner.address);

  return { chain, wallets, lastTamperResult: null };
}

function getState(): StateContainer {
  if (!global.__utxoChainState) {
    global.__utxoChainState = initChain();
  }
  return global.__utxoChainState;
}

function serializeState(container: StateContainer) {
  const { chain, wallets, lastTamperResult } = container;
  const utxosList = [];
  for (const [k, o] of chain.utxo) {
    const owner =
      Object.values(wallets).find((w) => w.address === o.address)?.name ||
      o.address.slice(0, 10);
    utxosList.push({
      k,
      txid: k.split(":")[0],
      index: Number(k.split(":")[1]),
      address: o.address,
      owner,
      amount: o.amount,
      amountFormatted: fmt(o.amount),
    });
  }

  const walletSummaries = Object.entries(wallets).map(([name, w]) => ({
    name,
    address: w.address,
    pubHex: w.pubHex,
    balance: chain.balanceOf(w.address),
    balanceFormatted: fmt(chain.balanceOf(w.address)),
    utxoCount: chain.utxosOf(w.address).length,
  }));

  const validation = chain.verifyChain();

  return {
    blocks: chain.blocks.map((b) => ({
      index: b.index,
      hash: b.hash,
      prevHash: b.prevHash,
      timestamp: b.timestamp,
      dateFormatted: b.timestamp ? new Date(b.timestamp).toLocaleTimeString() : "Genesis",
      nonce: b.nonce,
      merkle: b.merkle,
      txCount: b.txs.length,
      txs: b.txs.map((t) => ({
        id: t.id,
        isCoinbase: t.inputs.length === 0,
        coinbaseHeight: t.coinbaseHeight,
        inputs: t.inputs.map((inp) => ({
          txid: inp.txid,
          index: inp.index,
          pubKey: inp.pubKey,
        })),
        outputs: t.outputs.map((out) => {
          const owner =
            Object.values(wallets).find((w) => w.address === out.address)?.name ||
            out.address.slice(0, 10);
          return {
            address: out.address,
            owner,
            amount: out.amount,
            amountFormatted: fmt(out.amount),
          };
        }),
      })),
    })),
    utxos: utxosList,
    mempool: chain.mempool.map((t) => ({
      id: t.id,
      inputsCount: t.inputs.length,
      outputs: t.outputs.map((out) => {
        const owner =
          Object.values(wallets).find((w) => w.address === out.address)?.name ||
          out.address.slice(0, 10);
        return {
          address: out.address,
          owner,
          amountFormatted: fmt(out.amount),
        };
      }),
    })),
    wallets: walletSummaries,
    stats: {
      blockCount: chain.blocks.length,
      totalSupply: chain.totalSupply(),
      totalSupplyFormatted: fmt(chain.totalSupply()),
      currentReward: chain.rewardAt(chain.blocks.length),
      currentRewardFormatted: fmt(chain.rewardAt(chain.blocks.length)),
      difficulty: CONFIG.difficulty,
      halvingInterval: CONFIG.halvingInterval,
      mempoolSize: chain.mempool.length,
      utxoCount: chain.utxo.size,
    },
    isValid: validation.ok,
    invalidReason: validation.reason,
    lastTamperResult,
  };
}

export async function GET() {
  const state = getState();
  return NextResponse.json(serializeState(state));
}

export async function POST(req: Request) {
  const state = getState();
  const body = await req.json().catch(() => ({}));
  const { action } = body;

  try {
    if (action === "reset") {
      global.__utxoChainState = initChain();
      return NextResponse.json({
        success: true,
        message: "Chain reset to initial baseline demo",
        data: serializeState(global.__utxoChainState),
      });
    }

    if (action === "mine") {
      const minerName = body.miner || "Miner";
      const minerWallet = state.wallets[minerName] || state.wallets.Miner;
      const block = state.chain.mine(minerWallet.address);
      return NextResponse.json({
        success: true,
        message: `Block #${block.index} mined by ${minerName} (Reward: ${fmt(
          state.chain.rewardAt(block.index)
        )} coins, Nonce: ${block.nonce})`,
        data: serializeState(state),
      });
    }

    if (action === "faucet") {
      const targetNameOrAddr = body.recipient || body.address || "Alice";
      let recipientAddress = targetNameOrAddr;
      if (state.wallets[targetNameOrAddr]) {
        recipientAddress = state.wallets[targetNameOrAddr].address;
      } else {
        // Register wallet if unknown
        const customW = new Wallet(targetNameOrAddr);
        state.wallets[targetNameOrAddr] = customW;
        recipientAddress = customW.address;
      }
      const block = state.chain.mine(recipientAddress);
      return NextResponse.json({
        success: true,
        message: `Mined 50 coins to ${targetNameOrAddr} (Block #${block.index})`,
        data: serializeState(state),
      });
    }

    if (action === "pay") {
      const { sender, recipient, amount, fee = 0.1, autoMine = true } = body;
      
      // 1. Resolve or dynamically register sender wallet
      let senderWallet: Wallet | undefined = state.wallets[sender];
      if (!senderWallet) {
        senderWallet = Object.values(state.wallets).find(
          (w) => w.address.toLowerCase() === (sender || "").toLowerCase()
        );
      }
      if (!senderWallet) {
        // Fallback to Alice if sender is empty or guest, or create deterministic wallet
        if (!sender || sender === "Guest" || sender === "Alice") {
          senderWallet = state.wallets.Alice;
        } else {
          senderWallet = new Wallet(sender);
          state.wallets[sender] = senderWallet;
        }
      }

      // 2. Resolve recipient address
      let toAddress = recipient;
      if (state.wallets[recipient]) {
        toAddress = state.wallets[recipient].address;
      } else if (!toAddress || toAddress === "Bob") {
        toAddress = state.wallets.Bob.address;
      }

      const parsedAmt = Math.round(Number(amount) * UNIT);
      const parsedFee = Math.round(Number(fee) * UNIT);

      if (parsedAmt <= 0) {
        return NextResponse.json(
          { success: false, error: "Amount must be greater than 0" },
          { status: 400 }
        );
      }

      // If sender wallet has insufficient balance, auto-mine blocks so they have spendable UTXOs
      const currentSenderBal = state.chain.balanceOf(senderWallet.address);
      if (currentSenderBal < parsedAmt + parsedFee) {
        const needed = parsedAmt + parsedFee - currentSenderBal;
        const blocksToMine = Math.ceil(needed / (50 * UNIT)) + 1;
        for (let b = 0; b < blocksToMine; b++) {
          state.chain.mine(senderWallet.address);
        }
      }

      // 3. Build & sign UTXO transaction (coin selection + change output)
      const tx = state.chain.createPayment(
        senderWallet,
        toAddress,
        parsedAmt,
        parsedFee
      );

      // 4. Broadcast to Mempool
      state.chain.submitTx(tx);

      // 5. If autoMine is requested, mine the block immediately with Proof of Work
      let minedBlock = null;
      if (autoMine) {
        minedBlock = state.chain.mine(state.wallets.Miner.address);
      }

      const senderBalanceAfter = state.chain.balanceOf(senderWallet.address);
      const recipientBalanceAfter = state.chain.balanceOf(toAddress);

      return NextResponse.json({
        success: true,
        txid: tx.id,
        isMined: !!minedBlock,
        blockIndex: minedBlock?.index,
        blockHash: minedBlock?.hash,
        inputsSpentCount: tx.inputs.length,
        outputsCount: tx.outputs.length,
        newSenderBalance: senderBalanceAfter / UNIT,
        newRecipientBalance: recipientBalanceAfter / UNIT,
        message: minedBlock
          ? `Confirmed: Transferred ${amount} coins from ${senderWallet.name} to ${recipient} in Block #${minedBlock.index}!`
          : `Broadcast: Payment of ${amount} coins is pending in mempool. Mine block to confirm.`,
        data: serializeState(state),
      });
    }

    if (action === "attack") {
      const { attackType } = body;

      if (attackType === "replay") {
        // Try replaying an old confirmed transaction
        const confirmedBlock = state.chain.blocks.find(
          (b) => b.txs.length > 1
        );
        if (!confirmedBlock || confirmedBlock.txs.length < 2) {
          throw new Error("No non-coinbase transaction available to replay");
        }
        const victimTx = confirmedBlock.txs[1];
        state.chain.submitTx(victimTx);
        return NextResponse.json({
          success: false,
          attackCaught: false,
          message: "Replay transaction was surprisingly accepted! (VULNERABILITY)",
        });
      }

      if (attackType === "double_spend") {
        // Create tx, submit, then create another tx using the SAME input ignoring pendingSpent
        const fresh = state.chain.createPayment(
          state.wallets.Carol,
          state.wallets.Bob.address,
          1 * UNIT,
          0
        );
        state.chain.submitTx(fresh);
        const dbl = state.chain.createPayment(
          state.wallets.Carol,
          state.wallets.Alice.address,
          1 * UNIT,
          0,
          new Set()
        );
        state.chain.submitTx(dbl);
        return NextResponse.json({
          success: false,
          attackCaught: false,
          message: "Double spend was accepted! (VULNERABILITY)",
        });
      }

      if (attackType === "wrong_key") {
        // Sign/claim coins with wrong key
        const forged = state.chain.createPayment(
          state.wallets.Bob,
          state.wallets.Miner.address,
          1 * UNIT,
          0,
          new Set(state.chain.pendingSpent())
        );
        forged.inputs[0].pubKey = state.wallets.Carol.pubHex;
        state.chain.submitTx(forged);
        return NextResponse.json({
          success: false,
          attackCaught: false,
          message: "Wrong key transaction accepted! (VULNERABILITY)",
        });
      }

      if (attackType === "inflation") {
        // Create coins out of thin air
        const tooMuch = state.chain.createPayment(
          state.wallets.Bob,
          state.wallets.Miner.address,
          1 * UNIT,
          0,
          new Set(state.chain.pendingSpent())
        );
        tooMuch.outputs[0].amount = 9_999 * UNIT;
        tooMuch.id = txIdOf(tooMuch);
        state.chain.submitTx(tooMuch);
        return NextResponse.json({
          success: false,
          attackCaught: false,
          message: "Inflated coins accepted! (VULNERABILITY)",
        });
      }

      if (attackType === "tamper") {
        // Modify a confirmed historic block output
        if (state.chain.blocks.length < 5) {
          throw new Error("Chain does not have enough blocks to tamper");
        }
        const victim = state.chain.blocks[4].txs[1];
        if (victim) {
          victim.outputs[0].amount = 1 * UNIT;
        }
        const verify = state.chain.verifyChain();
        state.lastTamperResult = verify;
        return NextResponse.json({
          success: true,
          attackCaught: true,
          attackType: "tamper",
          rejectionReason: verify.ok
            ? "Chain was still considered valid (BAD)"
            : `REJECTED: ${verify.reason}`,
          data: serializeState(state),
        });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({
      success: true, // caught as expected!
      attackCaught: true,
      rejectionReason: error.message,
      data: serializeState(state),
    });
  }
}
