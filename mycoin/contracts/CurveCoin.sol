// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract CurveCoin is ERC20, ERC20Burnable, ReentrancyGuard {
    uint256 public constant P0 = 0.0001 ether;         // starting price per coin (wei)
    uint256 public constant M = 1e12;                  // price rise per coin (wei)
    uint256 public constant MAX_SUPPLY = 10_000 ether; // 10,000 coins (18 decimals)

    event Bought(address indexed buyer, uint256 amount, uint256 cost);
    event Sold(address indexed seller, uint256 amount, uint256 refund);

    constructor() ERC20("Curve Coin", "CRV") {}

    // Area under the price curve between supplies a and b (all in 1e18 units).
    // Buys round the cost UP and sells round the refund DOWN, so the
    // contract can never owe more ETH than it holds.
    function _area(uint256 a, uint256 b, Math.Rounding r) internal pure returns (uint256) {
        return Math.mulDiv(P0, b - a, 1 ether, r)
             + Math.mulDiv(M, b * b - a * a, 2e36, r);
    }

    function quoteBuy(uint256 amount) public view returns (uint256) {
        uint256 s = totalSupply();
        return _area(s, s + amount, Math.Rounding.Ceil);
    }

    function quoteSell(uint256 amount) public view returns (uint256) {
        uint256 s = totalSupply();
        return _area(s - amount, s, Math.Rounding.Floor);
    }

    function currentPrice() external view returns (uint256) {
        return P0 + Math.mulDiv(M, totalSupply(), 1 ether);
    }

    function buy(uint256 amount, uint256 maxCost) external payable nonReentrant {
        require(amount > 0, "amount is 0");
        require(totalSupply() + amount <= MAX_SUPPLY, "cap exceeded");
        uint256 cost = quoteBuy(amount);
        require(cost <= maxCost, "slippage");
        require(msg.value >= cost, "not enough ETH");

        _mint(msg.sender, amount);
        emit Bought(msg.sender, amount, cost);

        if (msg.value > cost) {
            (bool ok, ) = msg.sender.call{value: msg.value - cost}("");
            require(ok, "refund failed");
        }
    }

    function sell(uint256 amount, uint256 minRefund) external nonReentrant {
        require(amount > 0, "amount is 0");
        uint256 refund = quoteSell(amount);
        require(refund >= minRefund, "slippage");

        _burn(msg.sender, amount); // reverts if the seller doesn't own enough
        emit Sold(msg.sender, amount, refund);

        (bool ok, ) = msg.sender.call{value: refund}("");
        require(ok, "payout failed");
    }
}
