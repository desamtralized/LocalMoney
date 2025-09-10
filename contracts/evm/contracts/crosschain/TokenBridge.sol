// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol";
import "@axelar-network/interchain-token-service/contracts/interfaces/IInterchainTokenService.sol";
import "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./ITSTokenRegistry.sol";

/**
 * @title TokenBridge
 * @notice Handles token bridging operations through Axelar ITS
 * @dev Integrates with ITS for cross-chain token transfers
 */
contract TokenBridge is 
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    AxelarExecutable
{
    using SafeERC20 for IERC20;
    using AddressToString for address;
    
    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant BRIDGE_OPERATOR_ROLE = keccak256("BRIDGE_OPERATOR_ROLE");
    bytes32 public constant ESCROW_ROLE = keccak256("ESCROW_ROLE");
    
    // State variables
    IInterchainTokenService public tokenService;
    IAxelarGasService public gasService;
    ITSTokenRegistry public tokenRegistry;
    address public crossChainEscrow;
    
    // Bridge configuration
    uint256 public bridgeFeePercentage; // In basis points (100 = 1%)
    uint256 public gasBufferPercentage; // Extra gas buffer percentage
    address public feeRecipient;
    
    // Tracking
    struct BridgeRequest {
        address sender;
        address token;
        uint256 amount;
        string destinationChain;
        address destinationAddress;
        uint256 timestamp;
        bool isCompleted;
        bytes32 txHash;
    }
    
    mapping(bytes32 => BridgeRequest) public bridgeRequests;
    mapping(address => uint256) public totalBridgedAmount;
    mapping(address => mapping(string => uint256)) public chainBridgedAmount;
    
    // Events
    event TokensBridged(
        bytes32 indexed requestId,
        address indexed sender,
        address indexed token,
        uint256 amount,
        string destinationChain,
        address destinationAddress
    );
    
    event BridgeRequestCompleted(
        bytes32 indexed requestId,
        bytes32 txHash
    );
    
    event BridgeFeeUpdated(uint256 newFeePercentage);
    event GasBufferUpdated(uint256 newBufferPercentage);
    event FeeRecipientUpdated(address newRecipient);
    
    // Storage gap
    uint256[42] private __gap;
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _gateway) AxelarExecutable(_gateway) {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize the token bridge
     * @param _tokenService Address of ITS
     * @param _gasService Address of Axelar gas service
     * @param _tokenRegistry Address of token registry
     * @param _crossChainEscrow Address of cross-chain escrow
     * @param _feeRecipient Address to receive bridge fees
     */
    function initialize(
        address _tokenService,
        address _gasService,
        address _tokenRegistry,
        address _crossChainEscrow,
        address _feeRecipient
    ) external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        
        require(_tokenService != address(0), "Invalid token service");
        require(_gasService != address(0), "Invalid gas service");
        require(_tokenRegistry != address(0), "Invalid registry");
        require(_crossChainEscrow != address(0), "Invalid escrow");
        require(_feeRecipient != address(0), "Invalid fee recipient");
        
        tokenService = IInterchainTokenService(_tokenService);
        gasService = IAxelarGasService(_gasService);
        tokenRegistry = ITSTokenRegistry(_tokenRegistry);
        crossChainEscrow = _crossChainEscrow;
        feeRecipient = _feeRecipient;
        
        bridgeFeePercentage = 30; // 0.3% default fee
        gasBufferPercentage = 120; // 20% gas buffer
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(BRIDGE_OPERATOR_ROLE, msg.sender);
        _grantRole(ESCROW_ROLE, _crossChainEscrow);
    }
    
    /**
     * @notice Bridge tokens to another chain
     * @param token Token to bridge
     * @param amount Amount to bridge
     * @param destinationChain Target chain name
     * @param destinationAddress Recipient address on target chain
     */
    function bridgeToken(
        address token,
        uint256 amount,
        string memory destinationChain,
        address destinationAddress
    ) external payable whenNotPaused nonReentrant {
        require(amount > 0, "Invalid amount");
        require(bytes(destinationChain).length > 0, "Invalid chain");
        require(destinationAddress != address(0), "Invalid destination");
        
        // Validate token
        ITSTokenRegistry.TokenInfo memory tokenInfo = tokenRegistry.getTokenInfo(token);
        require(tokenInfo.isRegistered, "Token not registered");
        require(!tokenInfo.isPaused, "Token paused");
        require(
            tokenRegistry.isValidBridgeAmount(token, amount),
            "Invalid bridge amount"
        );
        
        // Calculate fees
        uint256 bridgeFee = (amount * bridgeFeePercentage) / 10000;
        uint256 netAmount = amount - bridgeFee;
        
        // Transfer tokens from sender
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Send bridge fee to recipient
        if (bridgeFee > 0) {
            IERC20(token).safeTransfer(feeRecipient, bridgeFee);
        }
        
        // Generate request ID
        bytes32 requestId = keccak256(abi.encodePacked(
            msg.sender,
            token,
            amount,
            destinationChain,
            destinationAddress,
            block.timestamp,
            block.number
        ));
        
        // Store bridge request
        bridgeRequests[requestId] = BridgeRequest({
            sender: msg.sender,
            token: token,
            amount: netAmount,
            destinationChain: destinationChain,
            destinationAddress: destinationAddress,
            timestamp: block.timestamp,
            isCompleted: false,
            txHash: bytes32(0)
        });
        
        // Update tracking
        totalBridgedAmount[token] += netAmount;
        chainBridgedAmount[token][destinationChain] += netAmount;
        
        // Prepare metadata
        bytes memory metadata = abi.encode(
            msg.sender,
            requestId,
            block.chainid
        );
        
        // Approve ITS for token transfer
        IERC20(token).safeIncreaseAllowance(address(tokenService), netAmount);
        
        // Calculate gas payment with buffer
        uint256 gasPayment = (msg.value * gasBufferPercentage) / 100;
        
        // Pay for gas
        if (gasPayment > 0) {
            gasService.payNativeGasForContractCall{value: gasPayment}(
                address(this),
                destinationChain,
                destinationAddress.toHexString(),
                abi.encode(token, netAmount, destinationAddress),
                msg.sender
            );
        }
        
        // Execute cross-chain transfer
        tokenService.interchainTransfer{value: msg.value - gasPayment}(
            tokenInfo.tokenId,
            destinationChain,
            abi.encode(destinationAddress),
            netAmount,
            metadata,
            msg.value - gasPayment
        );
        
        emit TokensBridged(
            requestId,
            msg.sender,
            token,
            netAmount,
            destinationChain,
            destinationAddress
        );
    }
    
    /**
     * @notice Bridge tokens on behalf of escrow
     * @param token Token to bridge
     * @param amount Amount to bridge
     * @param destinationChain Target chain
     * @param destinationAddress Recipient address
     * @param tradeId Trade identifier for tracking
     */
    function bridgeForEscrow(
        address token,
        uint256 amount,
        string memory destinationChain,
        address destinationAddress,
        bytes32 tradeId
    ) external payable onlyRole(ESCROW_ROLE) whenNotPaused nonReentrant {
        require(amount > 0, "Invalid amount");
        
        // Validate token
        ITSTokenRegistry.TokenInfo memory tokenInfo = tokenRegistry.getTokenInfo(token);
        require(tokenInfo.isRegistered, "Token not registered");
        require(!tokenInfo.isPaused, "Token paused");
        
        // Transfer tokens from escrow
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Generate request ID
        bytes32 requestId = keccak256(abi.encodePacked(
            msg.sender,
            token,
            amount,
            destinationChain,
            destinationAddress,
            tradeId,
            block.timestamp
        ));
        
        // Store request
        bridgeRequests[requestId] = BridgeRequest({
            sender: msg.sender,
            token: token,
            amount: amount,
            destinationChain: destinationChain,
            destinationAddress: destinationAddress,
            timestamp: block.timestamp,
            isCompleted: false,
            txHash: bytes32(0)
        });
        
        // Prepare metadata with trade ID
        bytes memory metadata = abi.encode(
            msg.sender,
            requestId,
            tradeId,
            block.chainid
        );
        
        // Approve and bridge
        IERC20(token).safeIncreaseAllowance(address(tokenService), amount);
        
        // Pay for gas if provided
        if (msg.value > 0) {
            gasService.payNativeGasForContractCall{value: msg.value}(
                address(this),
                destinationChain,
                destinationAddress.toHexString(),
                abi.encode(token, amount, destinationAddress, tradeId),
                msg.sender
            );
        }
        
        // Execute transfer
        tokenService.interchainTransfer(
            tokenInfo.tokenId,
            destinationChain,
            abi.encode(destinationAddress),
            amount,
            metadata,
            0 // Gas payment already handled
        );
        
        emit TokensBridged(
            requestId,
            msg.sender,
            token,
            amount,
            destinationChain,
            destinationAddress
        );
    }
    
    /**
     * @notice Handle incoming cross-chain message
     * @dev Called by Axelar Gateway
     */
    function _execute(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        // Decode payload
        (
            address token,
            uint256 amount,
            address recipient,
            bytes32 requestId
        ) = abi.decode(payload, (address, uint256, address, bytes32));
        
        // Mark request as completed
        if (bridgeRequests[requestId].timestamp > 0) {
            bridgeRequests[requestId].isCompleted = true;
            bridgeRequests[requestId].txHash = keccak256(abi.encodePacked(
                sourceChain,
                sourceAddress,
                block.timestamp
            ));
            
            emit BridgeRequestCompleted(requestId, bridgeRequests[requestId].txHash);
        }
        
        // Additional processing can be added here
    }
    
    /**
     * @notice Estimate gas for bridging
     * @param destinationChain Target chain
     * @param payload Encoded payload
     */
    function estimateBridgeGas(
        string memory destinationChain,
        bytes memory payload
    ) external view returns (uint256) {
        // Base gas estimation
        uint256 baseGas = 200000; // Base gas for ITS transfer
        uint256 payloadGas = payload.length * 16; // Gas per byte
        
        // Add buffer
        uint256 totalGas = (baseGas + payloadGas) * gasBufferPercentage / 100;
        
        return totalGas;
    }
    
    /**
     * @notice Update bridge fee percentage
     * @param newFeePercentage New fee in basis points
     */
    function updateBridgeFee(
        uint256 newFeePercentage
    ) external onlyRole(ADMIN_ROLE) {
        require(newFeePercentage <= 500, "Fee too high"); // Max 5%
        bridgeFeePercentage = newFeePercentage;
        emit BridgeFeeUpdated(newFeePercentage);
    }
    
    /**
     * @notice Update gas buffer percentage
     * @param newBufferPercentage New buffer percentage
     */
    function updateGasBuffer(
        uint256 newBufferPercentage
    ) external onlyRole(ADMIN_ROLE) {
        require(newBufferPercentage >= 100 && newBufferPercentage <= 200, "Invalid buffer");
        gasBufferPercentage = newBufferPercentage;
        emit GasBufferUpdated(newBufferPercentage);
    }
    
    /**
     * @notice Update fee recipient
     * @param newRecipient New fee recipient address
     */
    function updateFeeRecipient(
        address newRecipient
    ) external onlyRole(ADMIN_ROLE) {
        require(newRecipient != address(0), "Invalid recipient");
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(newRecipient);
    }
    
    /**
     * @notice Pause bridge operations
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @notice Unpause bridge operations
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @notice Authorize upgrade
     * @param newImplementation New implementation address
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(ADMIN_ROLE) {}
}

// Helper library for address to hex string conversion
library AddressToString {
    function toHexString(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(42);
        buffer[0] = '0';
        buffer[1] = 'x';
        for (uint256 i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint160(addr) >> (8 * (19 - i))));
            buffer[2 + i * 2] = toHexChar(uint8(b) >> 4);
            buffer[3 + i * 2] = toHexChar(uint8(b) & 0x0f);
        }
        return string(buffer);
    }
    
    function toHexChar(uint8 value) internal pure returns (bytes1) {
        if (value < 10) {
            return bytes1(uint8(bytes1('0')) + value);
        } else {
            return bytes1(uint8(bytes1('a')) + value - 10);
        }
    }
}