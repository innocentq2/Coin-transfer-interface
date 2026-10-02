const { expect } = require("chai");
const { ethers } = require("hardhat");

const E = ethers.parseEther;

describe("CurveCoin", () => {
  let coin, alice, bob;

  beforeEach(async () => {
    [, alice, bob] = await ethers.getSigners();
    coin = await ethers.deployContract("CurveCoin");
    await coin.waitForDeployment();
  });

  it("starts at zero supply and the starting price", async () => {
    expect(await coin.totalSupply()).to.equal(0n);
    expect(await coin.currentPrice()).to.equal(E("0.0001"));
  });

  it("buying mints coins, raises price, and fills the reserve", async () => {
    const before = await coin.currentPrice();
    const amt = E("100");
    const cost = await coin.quoteBuy(amt);

    await coin.connect(alice).buy(amt, cost, { value: cost });

    expect(await coin.balanceOf(alice.address)).to.equal(amt);
    expect(await coin.totalSupply()).to.equal(amt);
    expect(await coin.currentPrice()).to.be.gt(before);
    expect(await ethers.provider.getBalance(await coin.getAddress())).to.equal(cost);
  });

  it("selling burns coins, lowers price, and returns ETH", async () => {
    const amt = E("100");
    const cost = await coin.quoteBuy(amt);
    await coin.connect(alice).buy(amt, cost, { value: cost });

    const priceHigh = await coin.currentPrice();
    const refund = await coin.quoteSell(E("40"));
    await coin.connect(alice).sell(E("40"), refund);

    expect(await coin.totalSupply()).to.equal(E("60"));
    expect(await coin.currentPrice()).to.be.lt(priceHigh);
  });

  it("round trip never pays out more than was paid in", async () => {
    const amt = E("100");
    const cost = await coin.quoteBuy(amt);
    await coin.connect(alice).buy(amt, cost, { value: cost });
    await coin.connect(alice).sell(amt, 0);

    const left = await ethers.provider.getBalance(await coin.getAddress());
    expect(left).to.be.gte(0n);
    expect(left).to.be.lte(2n); // only rounding dust remains
    expect(await coin.totalSupply()).to.equal(0n);
  });

  it("transfers work between holders", async () => {
    const cost = await coin.quoteBuy(E("10"));
    await coin.connect(alice).buy(E("10"), cost, { value: cost });
    await coin.connect(alice).transfer(bob.address, E("4"));
    expect(await coin.balanceOf(bob.address)).to.equal(E("4"));
    expect(await coin.balanceOf(alice.address)).to.equal(E("6"));
  });

  it("holder burn lowers supply and price", async () => {
    const cost = await coin.quoteBuy(E("100"));
    await coin.connect(alice).buy(E("100"), cost, { value: cost });
    const before = await coin.totalSupply();
    await coin.connect(alice).burn(E("10"));
    expect(await coin.totalSupply()).to.equal(before - E("10"));
  });

  it("enforces slippage limits", async () => {
    const cost = await coin.quoteBuy(E("10"));
    await expect(
      coin.connect(alice).buy(E("10"), cost - 1n, { value: cost })
    ).to.be.revertedWith("slippage");
  });

  it("rejects underpayment", async () => {
    const cost = await coin.quoteBuy(E("10"));
    await expect(
      coin.connect(alice).buy(E("10"), cost, { value: cost - 1n })
    ).to.be.revertedWith("not enough ETH");
  });

  it("enforces the hard cap", async () => {
    await expect(
      coin.connect(alice).buy(E("10001"), ethers.MaxUint256, { value: 0 })
    ).to.be.revertedWith("cap exceeded");
  });

  it("cannot sell more than you own", async () => {
    const cost = await coin.quoteBuy(E("10"));
    await coin.connect(bob).buy(E("10"), cost, { value: cost });
    await expect(
      coin.connect(alice).sell(E("1"), 0)
    ).to.be.revertedWithCustomError(coin, "ERC20InsufficientBalance");
  });
});
