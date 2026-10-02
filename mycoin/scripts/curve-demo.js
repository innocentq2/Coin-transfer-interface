const { ethers } = require("hardhat");

async function main() {
  const [user] = await ethers.getSigners();
  const coin = await ethers.deployContract("CurveCoin");
  await coin.waitForDeployment();
  const f = ethers.formatEther;

  const show = async (label) =>
    console.log(
      label.padEnd(12),
      "| supply:",
      f(await coin.totalSupply()),
      "| price:",
      f(await coin.currentPrice()),
      "ETH",
      "| reserve:",
      f(await ethers.provider.getBalance(await coin.getAddress())),
      "ETH"
    );

  await show("start");

  const buyAmt = ethers.parseEther("100");
  const cost = await coin.quoteBuy(buyAmt);
  console.log("Cost to buy 100 CRV:", f(cost), "ETH");
  await (await coin.buy(buyAmt, cost, { value: cost })).wait();
  await show("after buy");

  const sellAmt = ethers.parseEther("40");
  const refund = await coin.quoteSell(sellAmt);
  console.log("Refund for selling 40 CRV:", f(refund), "ETH");
  await (await coin.sell(sellAmt, refund)).wait();
  await show("after sell");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
