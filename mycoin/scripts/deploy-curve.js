const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Deployer ETH:", ethers.formatEther(bal));

  const coin = await ethers.deployContract("CurveCoin");
  await coin.waitForDeployment();
  const address = await coin.getAddress();
  fs.writeFileSync("deployed-curve.json", JSON.stringify({ address, network: "sepolia" }, null, 2));
  console.log("CurveCoin deployed to:", address);
  console.log("https://sepolia.etherscan.io/address/" + address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
