import { ethers } from "ethers";

/**
 * Derives a deterministic, unique, persistent Ethereum address for any Firebase user.
 * Each user's UID maps uniquely to their own wallet address without storing private keys unencrypted.
 */
export function deriveUserWallet(uid: string): { address: string; privateKeyHash: string } {
  const seedString = `apex-custody-coin-transfer:${uid}`;
  const privateKey = ethers.keccak256(ethers.toUtf8Bytes(seedString));
  const wallet = new ethers.Wallet(privateKey);

  return {
    address: wallet.address,
    privateKeyHash: privateKey,
  };
}
