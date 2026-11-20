// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SubscriptionManager
/// @notice Pre-funded recurring payment escrow. No background/autonomous charges.
contract SubscriptionManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_PERIOD = 1 days;
    uint256 public constant MAX_FEE_BPS = 500;
    enum Status { None, Active, Paused, Cancelled, Exhausted }

    struct Subscription {
        address customer;
        address merchant;
        address token;
        uint128 amountPerPeriod;
        uint128 balance;
        uint64 period;
        uint64 nextChargeAt;
        Status status;
    }

    mapping(bytes32 => Subscription) public subscriptions;
    mapping(address => bool) public supportedTokens;
    uint256 public feeBps = 30;
    address public treasury;
    uint256 private nonce;

    event SubscriptionCreated(bytes32 indexed subId, address indexed customer, address indexed merchant, uint256 amount, uint256 nextChargeAt);
    event SubscriptionCharged(bytes32 indexed subId, uint256 amount, uint256 fee);
    event SubscriptionToppedUp(bytes32 indexed subId, uint256 amount, uint256 balance);
    event SubscriptionStatusChanged(bytes32 indexed subId, Status status);
    event SubscriptionCancelled(bytes32 indexed subId, uint256 refunded);

    constructor(address initialOwner, address initialTreasury) Ownable(initialOwner) {
        require(initialTreasury != address(0), "SubscriptionManager: zero treasury");
        treasury = initialTreasury;
    }

    function setSupportedToken(address token, bool supported) external onlyOwner {
        require(token != address(0), "SubscriptionManager: zero token");
        supportedTokens[token] = supported;
    }

    function setFee(uint256 nextFeeBps) external onlyOwner {
        require(nextFeeBps <= MAX_FEE_BPS, "SubscriptionManager: fee too high");
        feeBps = nextFeeBps;
    }

    function createSubscription(address merchant, IERC20 token, uint256 amountPerPeriod, uint256 period, uint256 initialTopUp, uint256 maxHeld) external nonReentrant returns (bytes32 subId) {
        require(merchant != address(0) && merchant != msg.sender, "SubscriptionManager: invalid merchant");
        require(supportedTokens[address(token)], "SubscriptionManager: unsupported token");
        require(amountPerPeriod > 0 && amountPerPeriod <= type(uint128).max, "SubscriptionManager: invalid amount");
        require(period >= MIN_PERIOD && period <= type(uint64).max, "SubscriptionManager: invalid period");
        require(initialTopUp >= amountPerPeriod && initialTopUp <= maxHeld && maxHeld <= type(uint128).max, "SubscriptionManager: invalid funding");
        subId = keccak256(abi.encode(block.chainid, address(this), msg.sender, merchant, nonce++));
        subscriptions[subId] = Subscription({customer: msg.sender, merchant: merchant, token: address(token), amountPerPeriod: uint128(amountPerPeriod), balance: uint128(initialTopUp), period: uint64(period), nextChargeAt: uint64(block.timestamp + period), status: Status.Active});
        token.safeTransferFrom(msg.sender, address(this), initialTopUp);
        emit SubscriptionCreated(subId, msg.sender, merchant, amountPerPeriod, block.timestamp + period);
    }

    function charge(bytes32 subId) external nonReentrant {
        Subscription storage s = subscriptions[subId];
        require(s.status == Status.Active, "SubscriptionManager: inactive");
        require(msg.sender == s.merchant, "SubscriptionManager: merchant only");
        require(block.timestamp >= s.nextChargeAt, "SubscriptionManager: not due");
        require(s.balance >= s.amountPerPeriod, "SubscriptionManager: insufficient balance");
        uint256 amount = s.amountPerPeriod;
        uint256 fee = amount * feeBps / 10_000;
        s.balance -= uint128(amount);
        s.nextChargeAt += s.period;
        IERC20 token = IERC20(s.token);
        token.safeTransfer(s.merchant, amount - fee);
        if (fee > 0) token.safeTransfer(treasury, fee);
        if (s.balance < s.amountPerPeriod) s.status = Status.Exhausted;
        emit SubscriptionCharged(subId, amount, fee);
        if (s.status == Status.Exhausted) emit SubscriptionStatusChanged(subId, s.status);
    }

    function topUp(bytes32 subId, uint256 amount) external nonReentrant {
        Subscription storage s = subscriptions[subId];
        require(msg.sender == s.customer, "SubscriptionManager: customer only");
        require(s.status == Status.Active || s.status == Status.Exhausted, "SubscriptionManager: cannot top up");
        require(amount > 0 && uint256(s.balance) + amount <= type(uint128).max, "SubscriptionManager: invalid amount");
        s.balance += uint128(amount);
        if (s.status == Status.Exhausted) s.status = Status.Active;
        IERC20(s.token).safeTransferFrom(msg.sender, address(this), amount);
        emit SubscriptionToppedUp(subId, amount, s.balance);
    }

    function pause(bytes32 subId) external {
        Subscription storage s = subscriptions[subId];
        require(msg.sender == s.customer, "SubscriptionManager: customer only");
        require(s.status == Status.Active, "SubscriptionManager: not active");
        s.status = Status.Paused;
        emit SubscriptionStatusChanged(subId, s.status);
    }

    function resume(bytes32 subId) external {
        Subscription storage s = subscriptions[subId];
        require(msg.sender == s.customer, "SubscriptionManager: customer only");
        require(s.status == Status.Paused, "SubscriptionManager: not paused");
        s.status = s.balance >= s.amountPerPeriod ? Status.Active : Status.Exhausted;
        emit SubscriptionStatusChanged(subId, s.status);
    }

    function cancel(bytes32 subId) external nonReentrant {
        Subscription storage s = subscriptions[subId];
        require(msg.sender == s.customer, "SubscriptionManager: customer only");
        require(s.status == Status.Active || s.status == Status.Paused || s.status == Status.Exhausted, "SubscriptionManager: cannot cancel");
        s.status = Status.Cancelled;
        uint256 refundAmount = s.balance;
        s.balance = 0;
        if (refundAmount > 0) IERC20(s.token).safeTransfer(s.customer, refundAmount);
        emit SubscriptionCancelled(subId, refundAmount);
        emit SubscriptionStatusChanged(subId, s.status);
    }
}
