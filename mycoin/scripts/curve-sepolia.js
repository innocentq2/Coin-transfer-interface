const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  if (!fs.existsSync("deployed-curve.json")) {
    throw new Error("deployed-curve.json not found. Run scripts/deploy-curve.js first.");
  }
  const { address } = JSON.parse(fs.readFileSync("deployed-curve.json", "utf8"));
  const [user] = await ethers.getSigners();
  const coin = await ethers.getContractAt("CurveCoin", address);
  const f = ethers.formatEther;

  const show = async (label) =>
    console.log(
      label.padEnd(12),
      "| supply:",
      f(await coin.totalSupply()),
      "| price:",
      f(await coin.currentPrice()),
      "ETH",
      "| my CRV:",
      f(await coin.balanceOf(user.address))
    );

  await show("before");
  const amt = ethers.parseEther("100");
  const cost = await coin.quoteBuy(amt);
  console.log("Cost of 100 CRV:", f(cost), "ETH");
  await (await coin.buy(amt, cost, { value: cost })).wait();
  await show("after buy");

  const sellAmt = ethers.parseEther("40");
  const refund = await coin.quoteSell(sellAmt);
  console.log("Refund for 40 CRV:", f(refund), "ETH");
  await (await coin.sell(sellAmt, refund)).wait();
  await show("after sell");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
