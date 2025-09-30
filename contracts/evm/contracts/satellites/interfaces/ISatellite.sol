// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ISatellite
 * @notice Interface for LocalMoney satellite contracts deployed on various chains
 * @dev Defines the standard interface for satellite contracts that forward operations to BSC hub
 */
interface ISatellite {
    // ============ Structs ============

    struct OfferCache {
        address creator;
        address token;
        uint256 amount;
        uint256 price;
        bool isBuy;
        uint256 lastUpdate;
        bool isActive;
    }

    struct TradeCache {
        bytes32 offerId;
        address buyer;
        address seller;
        uint256 amount;
        uint8 status; // 0: Created, 1: Funded, 2: Completed, 3: Disputed, 4: Cancelled
        uint256 lastUpdate;
    }

    // ============ Events ============

    event MessageSent(bytes32 indexed messageId, uint8 messageType, address sender);
    event CallbackReceived(bytes32 indexed messageId, bool success, bytes data);
    event OfferCreated(bytes32 indexed offerId, address creator, uint256 amount, uint256 price);
    event TradeInitiated(bytes32 indexed tradeId, bytes32 offerId, address buyer, uint256 amount);
    event CacheUpdated(bytes32 indexed id, uint8 cacheType); // 0: offer, 1: trade
    event GasConfigUpdated(uint256 baseGasAmount, uint256 gasMultiplier);
    event HubAddressUpdated(string newHubAddress);

    // ============ User Functions ============

    /**
     * @notice Create a new offer on the hub via cross-chain messaging
     * @param token The token address for the offer
     * @param amount The amount of tokens
     * @param price The price in fiat per token
     * @param isBuy Whether this is a buy offer
     */
    function createOffer(
        address token,
        uint256 amount,
        uint256 price,
        bool isBuy
    ) external payable;

    /**
     * @notice Create a new trade from an existing offer
     * @param offerId The ID of the offer to trade
     * @param amount The amount to trade
     */
    function createTrade(
        bytes32 offerId,
        uint256 amount
    ) external payable;

    /**
     * @notice Fund the escrow for a trade
     * @param tradeId The ID of the trade
     * @param token The token to fund
     * @param amount The amount to fund
     */
    function fundEscrow(
        bytes32 tradeId,
        address token,
        uint256 amount
    ) external payable;

    /**
     * @notice Complete a trade and release funds
     * @param tradeId The ID of the trade to complete
     */
    function completeTrade(bytes32 tradeId) external payable;

    /**
     * @notice Dispute a trade
     * @param tradeId The ID of the trade to dispute
     * @param reason The reason for dispute
     */
    function disputeTrade(bytes32 tradeId, string calldata reason) external payable;

    /**
     * @notice Cancel an offer
     * @param offerId The ID of the offer to cancel
     */
    function cancelOffer(bytes32 offerId) external payable;

    // ============ Query Functions ============

    /**
     * @notice Estimate the gas fee for a cross-chain transaction
     * @return The estimated gas fee in native currency
     */
    function estimateGasFee() external view returns (uint256);

    /**
     * @notice Get cached offer details
     * @param offerId The ID of the offer
     * @return The cached offer details
     */
    function getOfferDetails(bytes32 offerId) external view returns (OfferCache memory);

    /**
     * @notice Get cached trade details
     * @param tradeId The ID of the trade
     * @return The cached trade details
     */
    function getTradeDetails(bytes32 tradeId) external view returns (TradeCache memory);

    /**
     * @notice Get the hub chain name (always "binance" for BSC)
     * @return The hub chain name
     */
    function HUB_CHAIN() external view returns (string memory);

    /**
     * @notice Get the hub contract address
     * @return The hub contract address
     */
    function hubAddress() external view returns (string memory);

    // ============ Admin Functions ============

    /**
     * @notice Set gas configuration for cross-chain transactions
     * @param _baseGasAmount Base gas amount for transactions
     * @param _gasMultiplier Gas multiplier percentage (e.g., 120 for 120%)
     */
    function setGasConfig(
        uint256 _baseGasAmount,
        uint256 _gasMultiplier
    ) external;

    /**
     * @notice Update the hub contract address
     * @param _hubAddress New hub address
     */
    function updateHubAddress(string memory _hubAddress) external;
}