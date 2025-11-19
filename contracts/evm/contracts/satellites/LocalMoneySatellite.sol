// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol";
import "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "../crosschain/MessageTypes.sol";
import "./interfaces/ISatellite.sol";

/**
 * @title LocalMoneySatellite
 * @notice Satellite contract for LocalMoney Protocol on non-BSC chains
 * @dev Forwards user interactions to BSC hub via Axelar GMP
 */
contract LocalMoneySatellite is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    AxelarExecutable,
    ISatellite
{
    using MessageTypes for *;

    // ============ Roles ============
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // ============ Configuration ============
    IAxelarGasService public gasService;
    string public constant override HUB_CHAIN = "binance";
    string public override hubAddress;
    uint256 public messageNonce;

    // ============ Local Cache ============
    mapping(address => bytes32) public userProfiles;
    mapping(bytes32 => OfferCache) public offerCache;
    mapping(bytes32 => TradeCache) public tradeCache;
    mapping(address => uint256) public userNonces;

    // ============ Gas Management ============
    uint256 public baseGasAmount;
    uint256 public gasMultiplier;

    // ============ Message Tracking ============
    mapping(bytes32 => bool) public processedCallbacks;
    mapping(bytes32 => uint256) public messageSentTime;

    // ============ Constructor ============
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _gateway) AxelarExecutable(_gateway) {
        _disableInitializers();
    }

    // ============ Initialization ============
    function initialize(
        address _gasService,
        string memory _hubAddress
    ) external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        require(_gasService != address(0), "Invalid gas service");
        require(bytes(_hubAddress).length > 0, "Invalid hub address");

        gasService = IAxelarGasService(_gasService);
        hubAddress = _hubAddress;

        // Set default gas configuration
        baseGasAmount = 300000;
        gasMultiplier = 120; // 120%

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }

    // ============ User Functions ============

    /**
     * @notice Create a new offer on the hub
     */
    function createOffer(
        address token,
        uint256 amount,
        uint256 price,
        bool isBuy
    ) external payable override nonReentrant whenNotPaused {
        require(amount > 0, "Invalid amount");
        require(price > 0, "Invalid price");
        require(msg.value > 0, "Gas payment required");

        bytes32 offerId = keccak256(abi.encodePacked(
            msg.sender,
            token,
            amount,
            price,
            isBuy,
            block.timestamp,
            messageNonce++
        ));

        // Cache locally for quick queries
        offerCache[offerId] = OfferCache({
            creator: msg.sender,
            token: token,
            amount: amount,
            price: price,
            isBuy: isBuy,
            lastUpdate: block.timestamp,
            isActive: true
        });

        // Prepare cross-chain message
        bytes memory payload = abi.encode(
            MessageTypes.MessageType.CREATE_OFFER,
            msg.sender,
            block.chainid,
            messageNonce - 1,
            abi.encode(offerId, token, amount, price, isBuy)
        );

        _payGasAndCallContract(payload);

        emit OfferCreated(offerId, msg.sender, amount, price);
    }

    /**
     * @notice Create a trade from an existing offer
     */
    function createTrade(
        bytes32 offerId,
        uint256 amount
    ) external payable override nonReentrant whenNotPaused {
        require(offerCache[offerId].isActive, "Offer not active");
        require(amount > 0 && amount <= offerCache[offerId].amount, "Invalid amount");
        require(msg.value > 0, "Gas payment required");

        bytes32 tradeId = keccak256(abi.encodePacked(
            offerId,
            msg.sender,
            amount,
            block.timestamp,
            messageNonce++
        ));

        // Cache trade locally
        tradeCache[tradeId] = TradeCache({
            offerId: offerId,
            buyer: offerCache[offerId].isBuy ? offerCache[offerId].creator : msg.sender,
            seller: offerCache[offerId].isBuy ? msg.sender : offerCache[offerId].creator,
            amount: amount,
            status: 0, // Created
            lastUpdate: block.timestamp
        });

        // Prepare message
        bytes memory payload = abi.encode(
            MessageTypes.MessageType.CREATE_TRADE,
            msg.sender,
            block.chainid,
            messageNonce - 1,
            abi.encode(tradeId, offerId, amount)
        );

        _payGasAndCallContract(payload);

        emit TradeInitiated(tradeId, offerId, msg.sender, amount);
    }

    /**
     * @notice Fund escrow for a trade
     */
    function fundEscrow(
        bytes32 tradeId,
        address token,
        uint256 amount
    ) external payable override nonReentrant whenNotPaused {
        require(tradeCache[tradeId].status == 0, "Trade not in correct state");
        require(amount > 0, "Invalid amount");
        require(msg.value > 0, "Gas payment required");

        // Token approval should be done to ITS before calling this
        bytes memory payload = abi.encode(
            MessageTypes.MessageType.FUND_ESCROW,
            msg.sender,
            block.chainid,
            messageNonce++,
            abi.encode(tradeId, token, amount)
        );

        _payGasAndCallContract(payload);

        // Update local cache optimistically
        tradeCache[tradeId].status = 1; // Funded
        tradeCache[tradeId].lastUpdate = block.timestamp;
    }

    /**
     * @notice Complete a trade and release funds
     */
    function completeTrade(bytes32 tradeId) external payable override nonReentrant whenNotPaused {
        require(tradeCache[tradeId].buyer == msg.sender, "Only buyer can complete");
        require(tradeCache[tradeId].status == 1, "Trade not funded");
        require(msg.value > 0, "Gas payment required");

        bytes memory payload = abi.encode(
            MessageTypes.MessageType.RELEASE_FUNDS,
            msg.sender,
            block.chainid,
            messageNonce++,
            abi.encode(tradeId)
        );

        _payGasAndCallContract(payload);

        // Update local cache optimistically
        tradeCache[tradeId].status = 2; // Completed
        tradeCache[tradeId].lastUpdate = block.timestamp;
    }

    /**
     * @notice Dispute a trade
     */
    function disputeTrade(
        bytes32 tradeId,
        string calldata reason
    ) external payable override nonReentrant whenNotPaused {
        require(
            tradeCache[tradeId].buyer == msg.sender || tradeCache[tradeId].seller == msg.sender,
            "Not a party to trade"
        );
        require(tradeCache[tradeId].status == 1, "Trade not funded");
        require(msg.value > 0, "Gas payment required");

        bytes memory payload = abi.encode(
            MessageTypes.MessageType.DISPUTE_TRADE,
            msg.sender,
            block.chainid,
            messageNonce++,
            abi.encode(tradeId, reason)
        );

        _payGasAndCallContract(payload);

        // Update local cache
        tradeCache[tradeId].status = 3; // Disputed
        tradeCache[tradeId].lastUpdate = block.timestamp;
    }

    /**
     * @notice Cancel an offer
     */
    function cancelOffer(bytes32 offerId) external payable override nonReentrant whenNotPaused {
        require(offerCache[offerId].creator == msg.sender, "Not offer creator");
        require(offerCache[offerId].isActive, "Offer not active");
        require(msg.value > 0, "Gas payment required");

        // Create a generic message for offer cancellation
        bytes memory payload = abi.encode(
            MessageTypes.MessageType.BATCH_OPERATION,
            msg.sender,
            block.chainid,
            messageNonce++,
            abi.encode("cancelOffer", offerId)
        );

        _payGasAndCallContract(payload);

        // Update local cache
        offerCache[offerId].isActive = false;
        offerCache[offerId].lastUpdate = block.timestamp;
    }

    // ============ Internal Functions ============

    function _payGasAndCallContract(bytes memory payload) internal {
        bytes32 messageId = keccak256(abi.encodePacked(
            address(this),
            HUB_CHAIN,
            hubAddress,
            payload,
            messageNonce
        ));

        // Track message
        messageSentTime[messageId] = block.timestamp;

        // Pay for gas
        gasService.payNativeGasForContractCall{value: msg.value}(
            address(this),
            HUB_CHAIN,
            hubAddress,
            payload,
            msg.sender
        );

        // Call contract through gateway
        gateway().callContract(HUB_CHAIN, hubAddress, payload);

        emit MessageSent(messageId, uint8(uint256(bytes32(payload) >> 248)), msg.sender);
    }

    // ============ Callback Handling ============

    function _execute(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        require(keccak256(bytes(sourceChain)) == keccak256(bytes(HUB_CHAIN)), "Invalid source chain");
        require(keccak256(bytes(sourceAddress)) == keccak256(bytes(hubAddress)), "Invalid source");

        // Decode callback
        (bool success, bytes32 requestId, bytes memory data) = abi.decode(
            payload,
            (bool, bytes32, bytes)
        );

        // Prevent replay
        require(!processedCallbacks[requestId], "Callback already processed");
        processedCallbacks[requestId] = true;

        if (success) {
            _handleSuccessCallback(requestId, data);
        } else {
            _handleFailureCallback(requestId, data);
        }

        emit CallbackReceived(requestId, success, data);
    }

    function _handleSuccessCallback(bytes32 requestId, bytes memory data) internal {
        // Update local cache based on callback type
        if (data.length == 0) return;

        uint8 callbackType = uint8(data[0]);

        // Skip the first byte and decode the rest
        bytes memory callbackData = new bytes(data.length - 1);
        for (uint i = 1; i < data.length; i++) {
            callbackData[i - 1] = data[i];
        }

        if (callbackType == 0) { // Offer update
            (bytes32 offerId, bool isActive) = abi.decode(callbackData, (bytes32, bool));
            offerCache[offerId].isActive = isActive;
            offerCache[offerId].lastUpdate = block.timestamp;
            emit CacheUpdated(offerId, 0);
        } else if (callbackType == 1) { // Trade update
            (bytes32 tradeId, uint8 newStatus) = abi.decode(callbackData, (bytes32, uint8));
            tradeCache[tradeId].status = newStatus;
            tradeCache[tradeId].lastUpdate = block.timestamp;
            emit CacheUpdated(tradeId, 1);
        }
    }

    function _handleFailureCallback(bytes32 requestId, bytes memory data) internal {
        // Revert optimistic updates if needed
        // For now, just log the failure
    }

    // ============ Admin Functions ============

    function setGasConfig(
        uint256 _baseGasAmount,
        uint256 _gasMultiplier
    ) external override onlyRole(ADMIN_ROLE) {
        require(_baseGasAmount > 0, "Invalid base gas amount");
        require(_gasMultiplier >= 100 && _gasMultiplier <= 200, "Invalid multiplier");

        baseGasAmount = _baseGasAmount;
        gasMultiplier = _gasMultiplier;

        emit GasConfigUpdated(_baseGasAmount, _gasMultiplier);
    }

    function updateHubAddress(string memory _hubAddress) external override onlyRole(ADMIN_ROLE) {
        require(bytes(_hubAddress).length > 0, "Invalid hub address");
        hubAddress = _hubAddress;
        emit HubAddressUpdated(_hubAddress);
    }

    /**
     * @notice Emergency pause
     */
    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause
     */
    function unpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(ADMIN_ROLE)
    {}

    // ============ View Functions ============

    function estimateGasFee() external view override returns (uint256) {
        // Get base fee from gas service if available
        uint256 baseFee = baseGasAmount * tx.gasprice;
        return (baseFee * gasMultiplier) / 100;
    }

    function getOfferDetails(bytes32 offerId) external view override returns (OfferCache memory) {
        return offerCache[offerId];
    }

    function getTradeDetails(bytes32 tradeId) external view override returns (TradeCache memory) {
        return tradeCache[tradeId];
    }

    /**
     * @notice Get message status
     */
    function getMessageStatus(bytes32 messageId) external view returns (uint256 sentTime, bool processed) {
        return (messageSentTime[messageId], processedCallbacks[messageId]);
    }

    /**
     * @notice Check if contract is paused
     */
    function isPaused() external view returns (bool) {
        return paused();
    }
}