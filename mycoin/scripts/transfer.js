const { ethers } = require("hardhat");
const { receiverKey } = require("../wallets.json");
const { address } = require("../deployed.json");

async function main() {
  const [sender] = await ethers.getSigners();
  const receiver = new ethers.Wallet(receiverKey).address;
  const coin = await ethers.getContractAt("MyCoin", address);

  const fmt = (v) => ethers.formatEther(v);
  console.log("Sender before  :", fmt(await coin.balanceOf(sender.address)));
  console.log("Receiver before:", fmt(await coin.balanceOf(receiver)));

  const tx = await coin.transfer(receiver, ethers.parseEther("100"));
  console.log("Tx sent:", tx.hash);
  await tx.wait();

  console.log("Sender after   :", fmt(await coin.balanceOf(sender.address)));
  console.log("Receiver after :", fmt(await coin.balanceOf(receiver)));
  console.log("https://sepolia.etherscan.io/tx/" + tx.hash);
}

main().catch((e) => { console.error(e); process.exit(1); });
