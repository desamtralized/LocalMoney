// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./MessageTypes.sol";
import "./interfaces/IAxelarBridge.sol";
import "./interfaces/ICrossChainEscrow.sol";
import "./ITSTokenRegistry.sol";
import "../interfaces/IHub.sol";

/**
 * @title AxelarBridge
 * @notice Upgradeable bridge contract for cross-chain messaging via Axelar Network
 * @dev Works with AxelarHandler through composition pattern
 */
contract AxelarBridge is 
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    IAxelarBridge
{
    using MessageTypes for *;
    
    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    bytes32 public constant HANDLER_ROLE = keccak256("HANDLER_ROLE");
    
    // State variables
    IHub public hub;
    address public gasService;
    address public axelarHandler; // The non-upgradeable AxelarHandler contract
    ICrossChainEscrow public crossChainEscrow;
    ITSTokenRegistry public tokenRegistry;
    
    mapping(bytes32 => bool) public processedMessages;
    mapping(string => bool) public registeredChains;
    mapping(string => string) public satelliteAddresses;
    mapping(string => bool) public chainPaused;
    mapping(uint256 => string) public chainIdToName;

    uint256 public messageNonce;
    uint256 public constant MESSAGE_EXPIRY = 1 hours;
    uint256 public messageExpiry;
    
    // Failed message storage for recovery
    mapping(bytes32 => MessageTypes.CrossChainMessage) public failedMessages;
    mapping(bytes32 => string) public failedMessageReasons;

    event ChainIdRegistered(uint256 chainId, string chainName);

    // Storage gap for upgrades (adjust when adding new state variables)
    uint256[40] private __gap;
    
    /**
     * @notice Initialize the bridge contract
     * @param _hub Address of the Hub contract
     * @param _gasService Address of Axelar gas service
     * @param _axelarHandler Address of the AxelarHandler contract
     */
    function initialize(
        address _hub,
        address _gasService,
        address _axelarHandler
    ) external initializer {
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __AccessControl_init();
        __Pausable_init();
        
        require(_hub != address(0), "Invalid hub");
        require(_gasService != address(0), "Invalid gas service");
        require(_axelarHandler != address(0), "Invalid handler");
        
        hub = IHub(_hub);
        gasService = _gasService;
        axelarHandler = _axelarHandler;
        messageExpiry = MESSAGE_EXPIRY;

        _setChainName(1, "Ethereum");
        _setChainName(56, "BSC");
        _setChainName(137, "Polygon");
        _setChainName(43114, "Avalanche");
        _setChainName(8453, "Base");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
        _grantRole(HANDLER_ROLE, _axelarHandler);
    }
    
    /**
     * @notice Handle incoming message from AxelarHandler
     * @dev Called by AxelarHandler when a message is received from Axelar
     * @param commandId The identifier of the command
     * @param sourceChain Name of the source chain
     * @param sourceAddress Address of the source contract
     * @param payload Encoded message data
     */
    function handleAxelarMessage(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) external whenNotPaused nonReentrant onlyRole(HANDLER_ROLE) {
        // Verify source
        require(registeredChains[sourceChain], "Unregistered chain");
        require(!chainPaused[sourceChain], "Chain paused");
        require(
            keccak256(bytes(satelliteAddresses[sourceChain])) == 
            keccak256(bytes(sourceAddress)),
            "Unknown satellite"
        );
        
        // Decode and validate message
        MessageTypes.CrossChainMessage memory message = MessageTypes.decodeMessage(payload);
        require(MessageTypes.validateMessage(message), "Invalid message");
        
        bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
        
        // Prevent replay
        require(!processedMessages[messageId], "Already processed");
        processedMessages[messageId] = true;
        
        // Process based on message type
        try this.routeMessage(message, sourceChain) {
            emit MessageProcessed(messageId, sourceChain, message.sender);
        } catch Error(string memory reason) {
            // Store failed message for recovery
            failedMessages[messageId] = message;
            failedMessageReasons[messageId] = reason;
            emit MessageFailed(messageId, reason);
        } catch {
            // Store failed message for recovery
            failedMessages[messageId] = message;
            failedMessageReasons[messageId] = "Unknown error";
            emit MessageFailed(messageId, "Unknown error");
        }
    }
    
    /**
     * @notice Route message to appropriate handler
     * @param message The cross-chain message to process
     * @param sourceChain Name of the source chain
     */
    function routeMessage(
        MessageTypes.CrossChainMessage memory message,
        string memory sourceChain
    ) external {
        // Only callable internally or by this contract
        require(msg.sender == address(this), "Internal only");
        
        if (message.messageType == MessageTypes.MessageType.CREATE_OFFER) {
            _handleCreateOffer(message, sourceChain);
        } else if (message.messageType == MessageTypes.MessageType.CREATE_TRADE) {
            _handleCreateTrade(message, sourceChain);
        } else if (message.messageType == MessageTypes.MessageType.FUND_ESCROW) {
            _handleFundEscrow(message, sourceChain);
        } else if (message.messageType == MessageTypes.MessageType.RELEASE_FUNDS) {
            _handleReleaseFunds(message, sourceChain);
        } else if (message.messageType == MessageTypes.MessageType.DISPUTE_TRADE) {
            _handleDisputeTrade(message, sourceChain);
        } else if (message.messageType == MessageTypes.MessageType.UPDATE_PROFILE) {
            _handleUpdateProfile(message, sourceChain);
        } else if (message.messageType == MessageTypes.MessageType.QUERY_STATUS) {
            _handleQueryStatus(message, sourceChain);
        } else if (message.messageType == MessageTypes.MessageType.BATCH_OPERATION) {
            _handleBatchOperation(message, sourceChain);
        } else if (message.messageType == MessageTypes.MessageType.TOKEN_DEPOSIT) {
            _handleTokenDeposit(message, sourceChain);
        } else if (message.messageType == MessageTypes.MessageType.TOKEN_RELEASE) {
            _handleTokenRelease(message, sourceChain);
        } else if (message.messageType == MessageTypes.MessageType.TOKEN_BRIDGE) {
            _handleTokenBridge(message, sourceChain);
        } else if (message.messageType == MessageTypes.MessageType.TOKEN_REFUND) {
            _handleTokenRefund(message, sourceChain);
        } else {
            revert("Unknown message type");
        }
    }
    
    /**
     * @notice Send message to satellite chain
     * @param destinationChain Name of the destination chain
     * @param message Message to send
     * @return messageId Unique identifier for the sent message
     */
    function sendMessage(
        string calldata destinationChain,
        MessageTypes.CrossChainMessage calldata message
    ) external payable override whenNotPaused nonReentrant returns (bytes32 messageId) {
        require(registeredChains[destinationChain], "Unregistered chain");
        require(!chainPaused[destinationChain], "Chain paused");
        
        // Generate message ID using the current chain name
        messageId = MessageTypes.getMessageId(message, _currentChainName());
        
        // Encode message
        bytes memory payload = MessageTypes.encodeMessage(message);
        
        // Send via AxelarHandler
        (bool success, ) = axelarHandler.call(
            abi.encodeWithSignature(
                "sendMessage(string,string,bytes)",
                destinationChain,
                satelliteAddresses[destinationChain],
                payload
            )
        );
        require(success, "Failed to send message");
        
        emit MessageSent(messageId, destinationChain, msg.sender);
    }
    
    /**
     * @notice Send message with gas payment
     * @param destinationChain Name of the destination chain
     * @param message Message to send
     * @param gasLimit Gas limit for execution on destination
     * @param refundAddress Address to refund excess gas payment
     * @return messageId Unique identifier for the sent message
     */
    function sendMessageWithGas(
        string calldata destinationChain,
        MessageTypes.CrossChainMessage calldata message,
        uint256 gasLimit,
        address refundAddress
    ) external payable override whenNotPaused nonReentrant returns (bytes32 messageId) {
        require(registeredChains[destinationChain], "Unregistered chain");
        require(!chainPaused[destinationChain], "Chain paused");
        require(msg.value > 0, "Gas payment required");
        
        // Generate message ID using the current chain name
        messageId = MessageTypes.getMessageId(message, _currentChainName());
        
        // Encode message
        bytes memory payload = MessageTypes.encodeMessage(message);
        
        // Pay for gas using low-level call to gas service
        (bool success, ) = gasService.call{value: msg.value}(
            abi.encodeWithSignature(
                "payNativeGasForContractCall(address,string,string,bytes,address)",
                axelarHandler,
                destinationChain,
                satelliteAddresses[destinationChain],
                payload,
                refundAddress
            )
        );
        require(success, "Gas payment failed");
        
        // Send via AxelarHandler
        (success, ) = axelarHandler.call(
            abi.encodeWithSignature(
                "sendMessage(string,string,bytes)",
                destinationChain,
                satelliteAddresses[destinationChain],
                payload
            )
        );
        require(success, "Failed to send message");
        
        emit MessageSent(messageId, destinationChain, msg.sender);
    }
    
    // Message handlers
    /**
     * @notice Handle CREATE_OFFER message from satellite
     * @param message Cross-chain message
     * @param sourceChain Name of source chain
     */
    function _handleCreateOffer(
        MessageTypes.CrossChainMessage memory message,
        string memory sourceChain
    ) internal {
        // 1. Decode payload
        MessageTypes.CreateOfferPayload memory payload = abi.decode(
            message.payload,
            (MessageTypes.CreateOfferPayload)
        );

        // 2. Validate payload
        require(payload.amount > 0, "Invalid amount");
        require(payload.price > 0, "Invalid price");
        require(payload.minAmount <= payload.maxAmount, "Invalid range");
        require(bytes(payload.fiatCurrency).length > 0, "Invalid currency");

        // 3. Generate deterministic offer ID
        bytes32 offerId = keccak256(abi.encodePacked(
            sourceChain,
            message.sender,
            message.nonce,
            payload.token,
            payload.amount,
            block.timestamp
        ));

        // 4. Forward to Hub with error handling
        try hub.handleCrossChainOfferCreation(
            sourceChain,
            message.sender,
            offerId,
            payload.token,
            payload.amount,
            payload.price,
            payload.isBuy,
            payload.fiatCurrency
        ) returns (uint256 localOfferId) {
            // Success - send callback to satellite with offer ID
            bytes memory callbackData = abi.encode(
                offerId,
                localOfferId,
                true,
                "" // No error message
            );

            _sendCallback(
                sourceChain,
                message.nonce,
                true,
                callbackData
            );

            emit MessageProcessed(
                MessageTypes.getMessageId(message, sourceChain),
                sourceChain,
                message.sender
            );

        } catch Error(string memory reason) {
            // Failure - send callback with error reason
            bytes memory callbackData = abi.encode(
                offerId,
                0, // No local ID
                false,
                reason
            );

            _sendCallback(
                sourceChain,
                message.nonce,
                false,
                callbackData
            );

            // Store for retry
            bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
            failedMessages[messageId] = message;
            failedMessageReasons[messageId] = reason;

            emit MessageFailed(messageId, reason);

        } catch (bytes memory lowLevelData) {
            // Unknown error
            bytes memory callbackData = abi.encode(
                offerId,
                0,
                false,
                "Unknown error during offer creation"
            );

            _sendCallback(
                sourceChain,
                message.nonce,
                false,
                callbackData
            );

            bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
            failedMessages[messageId] = message;
            failedMessageReasons[messageId] = "Low-level error";

            emit MessageFailed(messageId, "Low-level error");
        }
    }
    
    /**
     * @notice Handle CREATE_TRADE message from satellite
     */
    function _handleCreateTrade(
        MessageTypes.CrossChainMessage memory message,
        string memory sourceChain
    ) internal {
        MessageTypes.CreateTradePayload memory payload = abi.decode(
            message.payload,
            (MessageTypes.CreateTradePayload)
        );

        require(payload.amount > 0, "Invalid amount");
        require(payload.trader != address(0), "Invalid trader");

        bytes32 tradeId = keccak256(abi.encodePacked(
            sourceChain,
            message.sender,
            message.nonce,
            payload.offerId,
            block.timestamp
        ));

        try hub.handleCrossChainTradeCreation(
            sourceChain,
            payload.trader,
            tradeId,
            uint256(payload.offerId), // Convert bytes32 to uint256 if needed
            payload.amount
        ) returns (uint256 localTradeId) {
            bytes memory callbackData = abi.encode(
                tradeId,
                localTradeId,
                true,
                ""
            );

            _sendCallback(sourceChain, message.nonce, true, callbackData);

            emit MessageProcessed(
                MessageTypes.getMessageId(message, sourceChain),
                sourceChain,
                message.sender
            );

        } catch Error(string memory reason) {
            bytes memory callbackData = abi.encode(tradeId, 0, false, reason);
            _sendCallback(sourceChain, message.nonce, false, callbackData);

            bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
            failedMessages[messageId] = message;
            failedMessageReasons[messageId] = reason;

            emit MessageFailed(messageId, reason);
        }
    }
    
    /**
     * @notice Handle FUND_ESCROW message from satellite
     */
    function _handleFundEscrow(
        MessageTypes.CrossChainMessage memory message,
        string memory sourceChain
    ) internal {
        MessageTypes.FundEscrowPayload memory payload = abi.decode(
            message.payload,
            (MessageTypes.FundEscrowPayload)
        );

        require(payload.amount > 0, "Invalid amount");
        require(payload.token != address(0), "Invalid token");

        try hub.handleCrossChainEscrowFunding(
            sourceChain,
            payload.tradeId,
            payload.amount
        ) returns (bool success) {
            if (success) {
                bytes memory callbackData = abi.encode(
                    payload.tradeId,
                    payload.amount,
                    true,
                    ""
                );
                _sendCallback(sourceChain, message.nonce, true, callbackData);

                emit MessageProcessed(
                    MessageTypes.getMessageId(message, sourceChain),
                    sourceChain,
                    message.sender
                );
            } else {
                revert("Escrow funding failed");
            }
        } catch Error(string memory reason) {
            bytes memory callbackData = abi.encode(
                payload.tradeId,
                0,
                false,
                reason
            );
            _sendCallback(sourceChain, message.nonce, false, callbackData);

            bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
            failedMessages[messageId] = message;
            failedMessageReasons[messageId] = reason;

            emit MessageFailed(messageId, reason);
        }
    }

    /**
     * @notice Handle RELEASE_FUNDS message from satellite
     */
    function _handleReleaseFunds(
        MessageTypes.CrossChainMessage memory message,
        string memory sourceChain
    ) internal {
        MessageTypes.ReleaseFundsPayload memory payload = abi.decode(
            message.payload,
            (MessageTypes.ReleaseFundsPayload)
        );

        require(payload.recipient != address(0), "Invalid recipient");
        require(payload.amount > 0, "Invalid amount");

        try hub.handleCrossChainFundRelease(
            sourceChain,
            payload.tradeId,
            payload.recipient
        ) returns (bool success) {
            if (success) {
                bytes memory callbackData = abi.encode(
                    payload.tradeId,
                    payload.recipient,
                    payload.amount,
                    true,
                    ""
                );
                _sendCallback(sourceChain, message.nonce, true, callbackData);

                emit MessageProcessed(
                    MessageTypes.getMessageId(message, sourceChain),
                    sourceChain,
                    message.sender
                );
            } else {
                revert("Fund release failed");
            }
        } catch Error(string memory reason) {
            bytes memory callbackData = abi.encode(
                payload.tradeId,
                address(0),
                0,
                false,
                reason
            );
            _sendCallback(sourceChain, message.nonce, false, callbackData);

            bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
            failedMessages[messageId] = message;
            failedMessageReasons[messageId] = reason;

            emit MessageFailed(messageId, reason);
        }
    }
    
    /**
     * @notice Handle DISPUTE_TRADE message from satellite
     */
    function _handleDisputeTrade(
        MessageTypes.CrossChainMessage memory message,
        string memory sourceChain
    ) internal {
        // Basic implementation for dispute handling
        // Can be extended based on specific requirements
        emit MessageProcessed(
            MessageTypes.getMessageId(message, sourceChain),
            sourceChain,
            message.sender
        );
    }

    /**
     * @notice Handle UPDATE_PROFILE message from satellite
     */
    function _handleUpdateProfile(
        MessageTypes.CrossChainMessage memory message,
        string memory sourceChain
    ) internal {
        // Basic implementation for profile updates
        // Can be extended based on specific requirements
        emit MessageProcessed(
            MessageTypes.getMessageId(message, sourceChain),
            sourceChain,
            message.sender
        );
    }

    /**
     * @notice Handle QUERY_STATUS message from satellite
     */
    function _handleQueryStatus(
        MessageTypes.CrossChainMessage memory message,
        string memory sourceChain
    ) internal {
        // Send back status information via callback
        bytes memory callbackData = abi.encode(
            message.nonce,
            true,
            "Status: operational"
        );
        _sendCallback(sourceChain, message.nonce, true, callbackData);

        emit MessageProcessed(
            MessageTypes.getMessageId(message, sourceChain),
            sourceChain,
            message.sender
        );
    }

    /**
     * @notice Handle BATCH_OPERATION message from satellite
     */
    function _handleBatchOperation(
        MessageTypes.CrossChainMessage memory message,
        string memory sourceChain
    ) internal {
        // Basic implementation for batch operations
        // Can be extended to process multiple operations
        emit MessageProcessed(
            MessageTypes.getMessageId(message, sourceChain),
            sourceChain,
            message.sender
        );
    }
    
    // Token operation handlers
    function _handleTokenDeposit(
        MessageTypes.CrossChainMessage memory message,
        string memory sourceChain
    ) internal {
        require(address(crossChainEscrow) != address(0), "Escrow not set");
        
        MessageTypes.TokenDepositPayload memory payload = abi.decode(
            message.payload,
            (MessageTypes.TokenDepositPayload)
        );
        
        // Get source chain ID from registry
        uint256 sourceChainId = tokenRegistry.chainNameToId(sourceChain);
        require(sourceChainId > 0, "Unknown source chain");
        
        // Forward to cross-chain escrow
        crossChainEscrow.depositFromChain(
            sourceChainId,
            payload.depositor,
            payload.token,
            payload.amount,
            payload.tradeId
        );
    }
    
    function _handleTokenRelease(
        MessageTypes.CrossChainMessage memory message,
        string memory sourceChain
    ) internal {
        require(address(crossChainEscrow) != address(0), "Escrow not set");
        
        MessageTypes.TokenReleasePayload memory payload = abi.decode(
            message.payload,
            (MessageTypes.TokenReleasePayload)
        );
        
        // Forward to cross-chain escrow for release
        crossChainEscrow.releaseToChain(
            payload.destinationChainId,
            payload.recipient,
            payload.token,
            payload.amount,
            payload.tradeId
        );
    }
    
    function _handleTokenBridge(
        MessageTypes.CrossChainMessage memory message,
        string memory sourceChain
    ) internal {
        MessageTypes.TokenBridgePayload memory payload = abi.decode(
            message.payload,
            (MessageTypes.TokenBridgePayload)
        );
        
        // Process token bridge request
        // This would typically interact with the TokenBridge contract
        // Implementation depends on specific requirements
    }
    
    /**
     * @notice Handle TOKEN_REFUND message from satellite
     */
    function _handleTokenRefund(
        MessageTypes.CrossChainMessage memory message,
        string memory sourceChain
    ) internal {
        require(address(crossChainEscrow) != address(0), "Escrow not set");

        // Basic implementation for token refunds
        // Can be extended with CrossChainEscrow integration

        emit MessageProcessed(
            MessageTypes.getMessageId(message, sourceChain),
            sourceChain,
            message.sender
        );
    }
    
    /**
     * @notice Send callback to satellite chain
     * @param destinationChain Target chain name
     * @param originalNonce Nonce from original message
     * @param success Whether operation succeeded
     * @param data Callback data (result or error)
     */
    function _sendCallback(
        string memory destinationChain,
        uint256 originalNonce,
        bool success,
        bytes memory data
    ) internal {
        require(registeredChains[destinationChain], "Destination not registered");

        // Encode callback message
        MessageTypes.CrossChainMessage memory callback = MessageTypes.CrossChainMessage({
            messageType: MessageTypes.MessageType.QUERY_STATUS, // Reuse for callbacks
            sender: address(this),
            sourceChainId: block.chainid,
            nonce: messageNonce++,
            payload: abi.encode(originalNonce, success, data)
        });

        bytes memory axelarPayload = MessageTypes.encodeMessage(callback);

        // Send via AxelarHandler (no gas payment, hub covers gas)
        (bool callSuccess, ) = axelarHandler.call(
            abi.encodeWithSignature(
                "sendMessage(string,string,bytes)",
                destinationChain,
                satelliteAddresses[destinationChain],
                axelarPayload
            )
        );

        if (!callSuccess) {
            // Store for retry
            bytes32 callbackId = keccak256(abi.encodePacked(
                destinationChain,
                originalNonce,
                block.timestamp
            ));

            // Could store pending callbacks here for retry
            emit CallbackFailed(destinationChain, originalNonce);
        } else {
            emit CallbackSent(destinationChain, originalNonce, success);
        }
    }

    // Add new events
    event CallbackSent(string indexed destinationChain, uint256 indexed originalNonce, bool success);
    event CallbackFailed(string indexed destinationChain, uint256 indexed originalNonce);

    // Configuration functions for token operations
    function setCrossChainEscrow(address _escrow) external onlyRole(ADMIN_ROLE) {
        require(_escrow != address(0), "Invalid escrow");
        crossChainEscrow = ICrossChainEscrow(_escrow);
    }
    
    function setTokenRegistry(address _registry) external onlyRole(ADMIN_ROLE) {
        require(_registry != address(0), "Invalid registry");
        tokenRegistry = ITSTokenRegistry(_registry);
    }

    function registerChainId(uint256 chainId, string calldata chainName) external onlyRole(ADMIN_ROLE) {
        require(chainId != 0, "Invalid chain id");
        require(bytes(chainName).length > 0, "Invalid chain name");

        _setChainName(chainId, chainName);
        emit ChainIdRegistered(chainId, chainName);
    }

    function _setChainName(uint256 chainId, string memory chainName) internal {
        chainIdToName[chainId] = chainName;
    }

    function _currentChainName() internal view returns (string memory) {
        string memory chainName = chainIdToName[block.chainid];
        require(bytes(chainName).length > 0, "Chain name not set");
        return chainName;
    }

    // Chain management functions
    function registerChain(
        string calldata chainName,
        string calldata satelliteAddress
    ) external override onlyRole(ADMIN_ROLE) {
        require(!registeredChains[chainName], "Chain already registered");
        require(bytes(satelliteAddress).length > 0, "Invalid satellite address");
        
        registeredChains[chainName] = true;
        satelliteAddresses[chainName] = satelliteAddress;
        
        emit ChainRegistered(chainName, satelliteAddress);
    }
    
    function updateSatellite(
        string calldata chainName,
        string calldata newSatelliteAddress
    ) external override onlyRole(ADMIN_ROLE) {
        require(registeredChains[chainName], "Chain not registered");
        require(bytes(newSatelliteAddress).length > 0, "Invalid satellite address");
        
        string memory oldAddress = satelliteAddresses[chainName];
        satelliteAddresses[chainName] = newSatelliteAddress;
        
        emit SatelliteUpdated(chainName, oldAddress, newSatelliteAddress);
    }
    
    function unregisterChain(
        string calldata chainName
    ) external override onlyRole(ADMIN_ROLE) {
        require(registeredChains[chainName], "Chain not registered");
        
        delete registeredChains[chainName];
        delete satelliteAddresses[chainName];
        delete chainPaused[chainName];
    }
    
    // Emergency functions
    function pauseChain(string calldata chainName) external override onlyRole(EMERGENCY_ROLE) {
        require(registeredChains[chainName], "Chain not registered");
        chainPaused[chainName] = true;
        emit EmergencyPause(true);
    }
    
    function unpauseChain(string calldata chainName) external override onlyRole(EMERGENCY_ROLE) {
        require(registeredChains[chainName], "Chain not registered");
        chainPaused[chainName] = false;
        emit EmergencyPause(false);
    }
    
    function pauseAll() external override onlyRole(EMERGENCY_ROLE) {
        _pause();
    }
    
    function unpauseAll() external override onlyRole(EMERGENCY_ROLE) {
        _unpause();
    }
    
    // Configuration functions
    function setHub(address newHub) external override onlyRole(ADMIN_ROLE) {
        require(newHub != address(0), "Invalid hub");
        hub = IHub(newHub);
    }
    
    function setGasService(address newGasService) external override onlyRole(ADMIN_ROLE) {
        require(newGasService != address(0), "Invalid gas service");
        gasService = newGasService;
    }
    
    function setMessageExpiry(uint256 newExpiry) external override onlyRole(ADMIN_ROLE) {
        require(newExpiry >= 30 minutes && newExpiry <= 24 hours, "Invalid expiry");
        messageExpiry = newExpiry;
    }
    
    function setAxelarHandler(address newHandler) external onlyRole(ADMIN_ROLE) {
        require(newHandler != address(0), "Invalid handler");
        
        // Revoke role from old handler
        if (axelarHandler != address(0)) {
            _revokeRole(HANDLER_ROLE, axelarHandler);
        }
        
        // Set new handler and grant role
        axelarHandler = newHandler;
        _grantRole(HANDLER_ROLE, newHandler);
    }
    
    // Recovery functions
    function retryFailedMessage(bytes32 messageId, string calldata sourceChain) external onlyRole(ADMIN_ROLE) {
        MessageTypes.CrossChainMessage memory message = failedMessages[messageId];
        require(message.sender != address(0), "Message not found");
        
        // Clear failed status
        delete failedMessages[messageId];
        delete failedMessageReasons[messageId];
        
        // Retry processing
        this.routeMessage(message, sourceChain);
    }
    
    // View functions
    function isChainRegistered(string calldata chainName) external view override returns (bool) {
        return registeredChains[chainName];
    }
    
    function getSatelliteAddress(string calldata chainName) external view override returns (string memory) {
        return satelliteAddresses[chainName];
    }
    
    function isMessageProcessed(bytes32 messageId) external view override returns (bool) {
        return processedMessages[messageId];
    }
    
    function getMessageNonce() external view override returns (uint256) {
        return messageNonce;
    }
    
    function getHub() external view returns (address) {
        return address(hub);
    }
    
    function getAxelarHandler() external view returns (address) {
        return axelarHandler;
    }
    
    function getGasService() external view returns (address) {
        return gasService;
    }
    
    function getMessageExpiry() external view returns (uint256) {
        return messageExpiry;
    }
    
    /**
     * @notice Authorize contract upgrade
     * @param newImplementation Address of new implementation
     */
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyRole(ADMIN_ROLE) 
    {}
}
