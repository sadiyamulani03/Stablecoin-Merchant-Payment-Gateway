// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PaymentRouter
/// @notice Creates single-use payment intents and settles approved test tokens.
contract PaymentRouter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_FEE_BPS = 500;
    uint256 public constant DEFAULT_FEE_BPS = 30;
    uint256 public constant INTENT_TTL = 1 hours;
    uint256 public constant REFUND_WINDOW = 30 days;

    enum Status { None, Created, Paid, Refunded, Expired }

    struct Payment {
        address merchant;
        address customer;
        address token;
        uint128 amount;
        uint64 createdAt;
        uint64 paidAt;
        Status status;
    }

    mapping(bytes32 => Payment) public payments;
    mapping(address => bool) public supportedTokens;
    uint256 public feeBps = DEFAULT_FEE_BPS;
    address public treasury;
    uint256 private nonce;

    event PaymentCreated(bytes32 indexed paymentId, address indexed merchant, uint256 amount, address token, uint256 expiresAt);
    event PaymentConfirmed(bytes32 indexed paymentId, address indexed customer, uint256 amount);
    event PaymentSettled(bytes32 indexed paymentId, address indexed merchant, uint256 merchantAmount, uint256 feeAmount);
    event PaymentRefunded(bytes32 indexed paymentId, address indexed customer, uint256 amount);
    event FeeCollected(bytes32 indexed paymentId, uint256 feeAmount);
    event TokenSupportUpdated(address indexed token, bool supported);

    constructor(address initialOwner, address initialTreasury) Ownable(initialOwner) {
        require(initialTreasury != address(0), "PaymentRouter: zero treasury");
        treasury = initialTreasury;
    }

    function setSupportedToken(address token, bool supported) external onlyOwner {
        require(token != address(0), "PaymentRouter: zero token");
        supportedTokens[token] = supported;
        emit TokenSupportUpdated(token, supported);
    }

    function setTreasury(address nextTreasury) external onlyOwner {
        require(nextTreasury != address(0), "PaymentRouter: zero treasury");
        treasury = nextTreasury;
    }

    function setFee(uint256 nextFeeBps) external onlyOwner {
        require(nextFeeBps <= MAX_FEE_BPS, "PaymentRouter: fee too high");
        feeBps = nextFeeBps;
    }

    /// @notice Merchant creates an intent for a supported stablecoin.
    function createIntent(address merchant, uint256 amount, IERC20 token) external returns (bytes32 paymentId) {
        require(merchant != address(0), "PaymentRouter: zero merchant");
        require(amount > 0 && amount <= type(uint128).max, "PaymentRouter: invalid amount");
        require(supportedTokens[address(token)], "PaymentRouter: unsupported token");
        paymentId = keccak256(abi.encode(block.chainid, address(this), msg.sender, merchant, amount, address(token), nonce++));
        payments[paymentId] = Payment({merchant: merchant, customer: address(0), token: address(token), amount: uint128(amount), createdAt: uint64(block.timestamp), paidAt: 0, status: Status.Created});
        emit PaymentCreated(paymentId, merchant, amount, address(token), block.timestamp + INTENT_TTL);
    }

    /// @notice Customer pays; merchant receives principal less fee atomically.
    function pay(bytes32 paymentId, IERC20 token) external nonReentrant {
        Payment storage p = payments[paymentId];
        require(p.status == Status.Created, "PaymentRouter: not payable");
        require(block.timestamp <= uint256(p.createdAt) + INTENT_TTL, "PaymentRouter: intent expired");
        require(address(token) == p.token && supportedTokens[address(token)], "PaymentRouter: wrong token");
        p.status = Status.Paid;
        p.customer = msg.sender;
        p.paidAt = uint64(block.timestamp);
        uint256 amount = uint256(p.amount);
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 merchantAmount = amount - fee;
        token.safeTransferFrom(msg.sender, p.merchant, merchantAmount);
        if (fee > 0) token.safeTransferFrom(msg.sender, treasury, fee);
        emit PaymentConfirmed(paymentId, msg.sender, amount);
        emit PaymentSettled(paymentId, p.merchant, merchantAmount, fee);
        if (fee > 0) emit FeeCollected(paymentId, fee);
    }

    /// @notice Owner can refund within 30 days; funds are pulled from treasury/merchant only if approved.
    /// @dev The customer must approve this contract for the refund amount; the refund is paid by owner-funded escrow.
    function refund(bytes32 paymentId, IERC20 token) external onlyOwner nonReentrant {
        Payment storage p = payments[paymentId];
        require(p.status == Status.Paid, "PaymentRouter: not refundable");
        require(block.timestamp <= uint256(p.paidAt) + REFUND_WINDOW, "PaymentRouter: refund window closed");
        require(address(token) == p.token, "PaymentRouter: wrong token");
        p.status = Status.Refunded;
        token.safeTransferFrom(msg.sender, p.customer, uint256(p.amount));
        emit PaymentRefunded(paymentId, p.customer, p.amount);
    }

    function getPayment(bytes32 paymentId) external view returns (Payment memory) {
        return payments[paymentId];
    }
}
