// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IBridgedToken.sol";

/**
 * @title KujiraTokenBridge
 * @notice Bridge contract for Kujira-BSC token transfers with single relayer model
 * @dev Implements burn-and-mint mechanism with rate limiting and timelock security
 */
contract KujiraTokenBridge is Ownable, ReentrancyGuard, Pausable {

    IBridgedToken public immutable bridgedToken;

    address public relayer;
    address public pendingRelayer;
    uint256 public relayerChangeTimestamp;
    uint256 public constant RELAYER_CHANGE_DELAY = 2 days;

    uint256 public minBridgeAmount;
    uint256 public maxBridgeAmount;
    uint256 public dailyLimit;

    mapping(uint256 => uint256) public dailyBridged; // day => amount bridged
    mapping(bytes32 => bool) public processedTransactions;

    uint256 public totalBridged;
    uint256 public bridgeNonce;

    struct BridgeStatistics {
        uint256 totalTransactions;
        uint256 totalAmount;
        uint256 lastBridgeTime;
    }

    BridgeStatistics public stats;

    event TokensBridged(
        address indexed recipient,
        uint256 amount,
        bytes32 indexed kujiraTxHash,
        uint256 nonce,
        uint256 timestamp
    );

    event RelayerChangeProposed(
        address indexed currentRelayer,
        address indexed proposedRelayer,
        uint256 changeTimestamp
    );

    event RelayerChanged(
        address indexed oldRelayer,
        address indexed newRelayer
    );

    event BridgeLimitsUpdated(
        uint256 minAmount,
        uint256 maxAmount,
        uint256 dailyLimit
    );

    event DailyLimitExceeded(
        uint256 attemptedAmount,
        uint256 currentDailyTotal,
        uint256 dailyLimit
    );

    event EmergencyPause(address indexed by, string reason);
    event EmergencyUnpause(address indexed by);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "Not authorized relayer");
        _;
    }

    modifier validAmount(uint256 amount) {
        require(amount >= minBridgeAmount, "Below minimum");
        require(amount <= maxBridgeAmount, "Above maximum");
        _;
    }

    /**
     * @notice Initialize the bridge contract
     * @param _bridgedToken Address of the bridged token contract
     * @param _relayer Initial relayer address
     * @param _minAmount Minimum bridge amount
     * @param _maxAmount Maximum bridge amount
     * @param _dailyLimit Daily bridge limit
     */
    constructor(
        address _bridgedToken,
        address _relayer,
        uint256 _minAmount,
        uint256 _maxAmount,
        uint256 _dailyLimit
    ) Ownable(msg.sender) {
        require(_bridgedToken != address(0), "Invalid token");
        require(_relayer != address(0), "Invalid relayer");
        require(_minAmount > 0 && _minAmount < _maxAmount, "Invalid limits");
        require(_dailyLimit >= _maxAmount, "Daily limit too low");

        bridgedToken = IBridgedToken(_bridgedToken);
        relayer = _relayer;
        minBridgeAmount = _minAmount;
        maxBridgeAmount = _maxAmount;
        dailyLimit = _dailyLimit;
    }

    /**
     * @notice Process a bridge request from Kujira
     * @param recipient Address to receive tokens on BSC
     * @param amount Amount of tokens to mint
     * @param kujiraTxHash Transaction hash from Kujira burn
     * @dev Only callable by relayer
     */
    function processBridge(
        address recipient,
        uint256 amount,
        bytes32 kujiraTxHash
    ) external onlyRelayer whenNotPaused nonReentrant validAmount(amount) {
        require(recipient != address(0), "Invalid recipient");
        require(kujiraTxHash != bytes32(0), "Invalid tx hash");
        require(!processedTransactions[kujiraTxHash], "Already processed");

        uint256 currentDay = block.timestamp / 1 days;
        uint256 currentDailyTotal = dailyBridged[currentDay];

        require(currentDailyTotal + amount <= dailyLimit, "Daily limit exceeded");

        processedTransactions[kujiraTxHash] = true;
        dailyBridged[currentDay] = currentDailyTotal + amount;
        totalBridged += amount;
        bridgeNonce++;

        stats.totalTransactions++;
        stats.totalAmount += amount;
        stats.lastBridgeTime = block.timestamp;

        bridgedToken.mintBridged(recipient, amount, kujiraTxHash);

        emit TokensBridged(recipient, amount, kujiraTxHash, bridgeNonce, block.timestamp);
    }

    /**
     * @notice Propose a new relayer address with timelock
     * @param _newRelayer Address of the proposed new relayer
     * @dev Only callable by owner
     */
    function proposeRelayerChange(address _newRelayer) external onlyOwner {
        require(_newRelayer != address(0), "Invalid relayer");
        require(_newRelayer != relayer, "Same relayer");
        require(_newRelayer != pendingRelayer, "Already proposed");

        pendingRelayer = _newRelayer;
        relayerChangeTimestamp = block.timestamp + RELAYER_CHANGE_DELAY;

        emit RelayerChangeProposed(relayer, _newRelayer, relayerChangeTimestamp);
    }

    /**
     * @notice Execute the relayer change after timelock
     * @dev Only callable by owner after timelock expires
     */
    function executeRelayerChange() external onlyOwner {
        require(pendingRelayer != address(0), "No pending relayer");
        require(block.timestamp >= relayerChangeTimestamp, "Timelock not expired");
        require(block.timestamp < relayerChangeTimestamp + 1 days, "Change expired");

        address oldRelayer = relayer;
        relayer = pendingRelayer;
        pendingRelayer = address(0);
        relayerChangeTimestamp = 0;

        emit RelayerChanged(oldRelayer, relayer);
    }

    /**
     * @notice Cancel a pending relayer change
     * @dev Only callable by owner
     */
    function cancelRelayerChange() external onlyOwner {
        require(pendingRelayer != address(0), "No pending relayer");

        pendingRelayer = address(0);
        relayerChangeTimestamp = 0;
    }

    /**
     * @notice Update bridge limits
     * @param _minAmount New minimum bridge amount
     * @param _maxAmount New maximum bridge amount
     * @param _dailyLimit New daily bridge limit
     * @dev Only callable by owner
     */
    function updateBridgeLimits(
        uint256 _minAmount,
        uint256 _maxAmount,
        uint256 _dailyLimit
    ) external onlyOwner {
        require(_minAmount > 0 && _minAmount < _maxAmount, "Invalid limits");
        require(_dailyLimit >= _maxAmount, "Daily limit too low");

        minBridgeAmount = _minAmount;
        maxBridgeAmount = _maxAmount;
        dailyLimit = _dailyLimit;

        emit BridgeLimitsUpdated(_minAmount, _maxAmount, _dailyLimit);
    }

    /**
     * @notice Get current day's bridged amount
     * @return uint256 Amount bridged today
     */
    function getCurrentDayBridged() external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        return dailyBridged[currentDay];
    }

    /**
     * @notice Get remaining daily limit
     * @return uint256 Remaining amount that can be bridged today
     */
    function getRemainingDailyLimit() external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        uint256 used = dailyBridged[currentDay];
        return used < dailyLimit ? dailyLimit - used : 0;
    }

    /**
     * @notice Check if transaction has been processed
     * @param kujiraTxHash Transaction hash to check
     * @return bool True if processed
     */
    function isProcessed(bytes32 kujiraTxHash) external view returns (bool) {
        return processedTransactions[kujiraTxHash];
    }

    /**
     * @notice Emergency pause
     * @param reason Reason for pausing
     * @dev Only callable by owner
     */
    function emergencyPause(string calldata reason) external onlyOwner {
        _pause();
        emit EmergencyPause(msg.sender, reason);
    }

    /**
     * @notice Emergency unpause
     * @dev Only callable by owner
     */
    function emergencyUnpause() external onlyOwner {
        _unpause();
        emit EmergencyUnpause(msg.sender);
    }

    /**
     * @notice Get bridge statistics
     * @return totalTransactions Total number of bridge transactions
     * @return totalAmount Total amount bridged
     * @return lastBridgeTime Timestamp of last bridge
     */
    function getBridgeStats() external view returns (
        uint256 totalTransactions,
        uint256 totalAmount,
        uint256 lastBridgeTime
    ) {
        return (stats.totalTransactions, stats.totalAmount, stats.lastBridgeTime);
    }
}