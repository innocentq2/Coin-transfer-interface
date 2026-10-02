const { ethers } = require("hardhat");
const fs = require("fs");

const deployer = ethers.Wallet.createRandom();
const receiver = ethers.Wallet.createRandom();

fs.writeFileSync("wallets.json", JSON.stringify({
  deployerKey: deployer.privateKey,
  receiverKey: receiver.privateKey,
}, null, 2));

console.log("Deployer address:", deployer.address);
console.log("Receiver address:", receiver.address);
