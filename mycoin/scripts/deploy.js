const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer ETH:", ethers.formatEther(bal));
  if (bal === 0n) throw new Error("No test ETH. Use a faucet first.");

  const coin = await ethers.deployContract("MyCoin", [deployer.address]);
  await coin.waitForDeployment();
  const address = await coin.getAddress();

  fs.writeFileSync("deployed.json", JSON.stringify({ address }, null, 2));
  console.log("MyCoin deployed to:", address);
  console.log("Cap:", ethers.formatEther(await coin.cap()), "MYC");
  console.log("https://sepolia.etherscan.io/token/" + address);
}

main().catch((e) => { console.error(e); process.exit(1); });
