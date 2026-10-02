const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MyCoin with Supply Controls", function () {
  let coin, owner, alice, bob;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    coin = await ethers.deployContract("MyCoin", [owner.address]);
    await coin.waitForDeployment();
  });

  it("has correct name, symbol, initial supply, and cap", async () => {
    expect(await coin.name()).to.equal("My Coin");
    expect(await coin.symbol()).to.equal("MYC");
    expect(await coin.totalSupply()).to.equal(ethers.parseEther("1000000"));
    expect(await coin.cap()).to.equal(ethers.parseEther("10000000"));
  });

  it("gives the initial supply to the owner", async () => {
    expect(await coin.balanceOf(owner.address)).to.equal(ethers.parseEther("1000000"));
  });

  it("sends coins: balances update on both sides", async () => {
    await coin.transfer(alice.address, ethers.parseEther("100"));
    expect(await coin.balanceOf(alice.address)).to.equal(ethers.parseEther("100"));
    expect(await coin.balanceOf(owner.address)).to.equal(ethers.parseEther("999900"));
  });

  it("lets a receiver send coins onward to anyone with a specific address", async () => {
    await coin.transfer(alice.address, ethers.parseEther("100"));
    await coin.connect(alice).transfer(bob.address, ethers.parseEther("40"));
    expect(await coin.balanceOf(alice.address)).to.equal(ethers.parseEther("60"));
    expect(await coin.balanceOf(bob.address)).to.equal(ethers.parseEther("40"));
  });

  it("rejects sending more than you own", async () => {
    await expect(
      coin.connect(alice).transfer(bob.address, ethers.parseEther("1"))
    ).to.be.revertedWithCustomError(coin, "ERC20InsufficientBalance");
  });

  it("cannot mint above the cap", async () => {
    // Current supply is 1,000,000, cap is 10,000,000. Minting 9,000,001 should revert.
    await expect(
      coin.mint(owner.address, ethers.parseEther("9000001"))
    ).to.be.revertedWithCustomError(coin, "ERC20ExceededCap");
  });

  it("only the owner can mint", async () => {
    await expect(
      coin.connect(alice).mint(alice.address, ethers.parseEther("100"))
    ).to.be.revertedWithCustomError(coin, "OwnableUnauthorizedAccount");
  });

  it("owner can mint within the cap", async () => {
    await coin.mint(alice.address, ethers.parseEther("500000"));
    expect(await coin.balanceOf(alice.address)).to.equal(ethers.parseEther("500000"));
    expect(await coin.totalSupply()).to.equal(ethers.parseEther("1500000"));
  });

  it("burning reduces total supply", async () => {
    const before = await coin.totalSupply();
    await coin.burn(ethers.parseEther("10"));
    expect(await coin.totalSupply()).to.equal(before - ethers.parseEther("10"));
  });

  it("pausing halts transfers and unpausing resumes them", async () => {
    await coin.pause();
    await expect(
      coin.transfer(alice.address, ethers.parseEther("50"))
    ).to.be.revertedWithCustomError(coin, "EnforcedPause");

    await coin.unpause();
    await coin.transfer(alice.address, ethers.parseEther("50"));
    expect(await coin.balanceOf(alice.address)).to.equal(ethers.parseEther("50"));
  });
});
