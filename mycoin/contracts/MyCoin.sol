// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyCoin is ERC20, ERC20Burnable, ERC20Capped, ERC20Pausable, Ownable {
    constructor(address initialOwner)
        ERC20("My Coin", "MYC")
        ERC20Capped(10_000_000 * 10 ** 18)   // hard cap: can never exceed 10M tokens
        Ownable(initialOwner)
    {
        _mint(initialOwner, 1_000_000 * 10 ** decimals()); // initial supply: 1M tokens
    }

    // Owner can mint more, but only up to the 10,000,000 cap
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    // Emergency stop for transfers
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Required override because several extensions touch _update
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Capped, ERC20Pausable)
    {
        super._update(from, to, value);
    }
}
