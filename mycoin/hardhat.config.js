require("@nomicfoundation/hardhat-toolbox");

let accounts = [];
try { accounts = [require("./wallets.json").deployerKey]; } catch (e) {}

module.exports = {
  solidity: "0.8.24",
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts,
    },
  },
};
