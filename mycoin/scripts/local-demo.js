const { ethers } = require("hardhat");

async function main() {
  const [owner, alice] = await ethers.getSigners();
  const coin = await ethers.deployContract("MyCoin", [owner.address]);
  await coin.waitForDeployment();
  const address = await coin.getAddress();
  console.log("Coin address:", address);
  console.log("Cap         :", ethers.formatEther(await coin.cap()), "MYC");
  console.log("Total Supply:", ethers.formatEther(await coin.totalSupply()), "MYC");

  const show = async (label) =>
    console.log(label,
      "| owner:", ethers.formatEther(await coin.balanceOf(owner.address)),
      "| alice:", ethers.formatEther(await coin.balanceOf(alice.address)));

  await show("Before Transfer");
  await (await coin.transfer(alice.address, ethers.parseEther("250"))).wait();
  await show("After Transfer ");

  console.log("\n--- Testing Minting by Owner ---");
  await (await coin.mint(alice.address, ethers.parseEther("500"))).wait();
  await show("After Minting  ");
  console.log("New Total Supply:", ethers.formatEther(await coin.totalSupply()), "MYC");
}

main().catch((e) => { console.error(e); process.exit(1); });
