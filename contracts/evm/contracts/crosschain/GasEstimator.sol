// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./ITSTokenRegistry.sol";

/**
 * @title GasEstimator
 * @notice Estimates gas costs for cross-chain operations
 * @dev Provides accurate gas estimation for different chains and operations
 */
contract GasEstimator is 
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable 
{
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ESTIMATOR_ROLE = keccak256("ESTIMATOR_ROLE");
    
    IAxelarGasService public gasService;
    ITSTokenRegistry public tokenRegistry;
    
    // Base gas costs per chain (in gas units)
    mapping(uint256 => uint256) public baseGasCosts;
    mapping(uint256 => uint256) public tokenTransferGasCosts;
    mapping(uint256 => uint256) public messageGasCosts;
    
    // Gas price multipliers per chain (in basis points, 10000 = 1x)
    mapping(uint256 => uint256) public gasPriceMultipliers;
    
    // Operation types
    enum OperationType {
        TOKEN_TRANSFER,
        MESSAGE_ONLY,
        TOKEN_WITH_MESSAGE,
        BATCH_TRANSFER
    }
    
    // Events
    event GasCostUpdated(
        uint256 indexed chainId,
        uint256 baseGas,
        uint256 tokenGas,
        uint256 messageGas
    );
    
    event GasMultiplierUpdated(
        uint256 indexed chainId,
        uint256 multiplier
    );
    
    event GasEstimated(
        uint256 indexed sourceChainId,
        uint256 indexed destinationChainId,
        OperationType operationType,
        uint256 estimatedGas,
        uint256 estimatedCost
    );
    
    // Storage gap
    uint256[44] private __gap;
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize the gas estimator
     * @param _gasService Address of Axelar gas service
     * @param _tokenRegistry Address of token registry
     */
    function initialize(
        address _gasService,
        address _tokenRegistry
    ) external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        
        require(_gasService != address(0), "Invalid gas service");
        require(_tokenRegistry != address(0), "Invalid registry");
        
        gasService = IAxelarGasService(_gasService);
        tokenRegistry = ITSTokenRegistry(_tokenRegistry);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(ESTIMATOR_ROLE, msg.sender);
        
        // Initialize default gas costs
        _initializeDefaultGasCosts();
    }
    
    /**
     * @notice Initialize default gas costs for major chains
     */
    function _initializeDefaultGasCosts() internal {
        // Ethereum
        baseGasCosts[1] = 100000;
        tokenTransferGasCosts[1] = 200000;
        messageGasCosts[1] = 50000;
        gasPriceMultipliers[1] = 15000; // 1.5x
        
        // BSC
        baseGasCosts[56] = 80000;
        tokenTransferGasCosts[56] = 150000;
        messageGasCosts[56] = 40000;
        gasPriceMultipliers[56] = 10000; // 1x
        
        // Polygon
        baseGasCosts[137] = 70000;
        tokenTransferGasCosts[137] = 140000;
        messageGasCosts[137] = 35000;
        gasPriceMultipliers[137] = 12000; // 1.2x
        
        // Avalanche
        baseGasCosts[43114] = 90000;
        tokenTransferGasCosts[43114] = 180000;
        messageGasCosts[43114] = 45000;
        gasPriceMultipliers[43114] = 11000; // 1.1x
        
        // Base
        baseGasCosts[8453] = 85000;
        tokenTransferGasCosts[8453] = 170000;
        messageGasCosts[8453] = 42500;
        gasPriceMultipliers[8453] = 10500; // 1.05x
    }
    
    /**
     * @notice Estimate gas for a bridge operation
     * @param destinationChainId Target chain ID
     * @param operationType Type of operation
     * @param payloadSize Size of payload in bytes
     * @return estimatedGas Estimated gas units
     * @return estimatedCost Estimated cost in native token
     */
    function estimateBridgeFee(
        uint256 destinationChainId,
        OperationType operationType,
        uint256 payloadSize
    ) external view returns (uint256 estimatedGas, uint256 estimatedCost) {
        require(baseGasCosts[destinationChainId] > 0, "Unknown chain");
        
        // Calculate base gas
        uint256 baseGas = baseGasCosts[destinationChainId];
        
        // Add operation-specific gas
        if (operationType == OperationType.TOKEN_TRANSFER) {
            baseGas += tokenTransferGasCosts[destinationChainId];
        } else if (operationType == OperationType.MESSAGE_ONLY) {
            baseGas += messageGasCosts[destinationChainId];
        } else if (operationType == OperationType.TOKEN_WITH_MESSAGE) {
            baseGas += tokenTransferGasCosts[destinationChainId] + messageGasCosts[destinationChainId];
        } else if (operationType == OperationType.BATCH_TRANSFER) {
            baseGas += tokenTransferGasCosts[destinationChainId] * 3; // Estimate for batch
        }
        
        // Add dynamic gas for payload
        uint256 dynamicGas = payloadSize * 100; // 100 gas per byte estimate
        
        // Apply multiplier
        estimatedGas = (baseGas + dynamicGas) * gasPriceMultipliers[destinationChainId] / 10000;
        
        // Get chain name for cost estimation
        string memory chainName = tokenRegistry.getChainName(destinationChainId);
        
        // Estimate cost (this would call Axelar's gas service in production)
        // For now, return a simplified estimate
        estimatedCost = estimatedGas * 20 gwei; // Simplified estimate
        
        return (estimatedGas, estimatedCost);
    }
    
    /**
     * @notice Estimate gas for token bridge
     * @param token Token address
     * @param amount Amount to bridge
     * @param destinationChainId Target chain
     * @return estimatedGas Gas estimate
     */
    function estimateTokenBridgeGas(
        address token,
        uint256 amount,
        uint256 destinationChainId
    ) external view returns (uint256 estimatedGas) {
        require(baseGasCosts[destinationChainId] > 0, "Unknown chain");
        
        // Get token info to calculate payload size
        ITSTokenRegistry.TokenInfo memory tokenInfo = tokenRegistry.getTokenInfo(token);
        require(tokenInfo.isRegistered, "Token not registered");
        
        // Base gas for token transfer
        uint256 baseGas = baseGasCosts[destinationChainId] + tokenTransferGasCosts[destinationChainId];
        
        // Add gas for amount size (larger amounts may require more gas)
        uint256 amountGas = 0;
        if (amount > 1000 * 10**tokenInfo.decimals) {
            amountGas = 10000; // Extra gas for large transfers
        }
        
        // Apply multiplier
        estimatedGas = (baseGas + amountGas) * gasPriceMultipliers[destinationChainId] / 10000;
        
        return estimatedGas;
    }
    
    /**
     * @notice Update gas costs for a chain
     * @param chainId Chain ID
     * @param baseGas Base gas cost
     * @param tokenGas Token transfer gas cost
     * @param messageGas Message gas cost
     */
    function updateGasCosts(
        uint256 chainId,
        uint256 baseGas,
        uint256 tokenGas,
        uint256 messageGas
    ) external onlyRole(ADMIN_ROLE) {
        require(chainId > 0, "Invalid chain ID");
        require(baseGas > 0 && tokenGas > 0 && messageGas > 0, "Invalid gas costs");
        
        baseGasCosts[chainId] = baseGas;
        tokenTransferGasCosts[chainId] = tokenGas;
        messageGasCosts[chainId] = messageGas;
        
        emit GasCostUpdated(chainId, baseGas, tokenGas, messageGas);
    }
    
    /**
     * @notice Update gas price multiplier for a chain
     * @param chainId Chain ID
     * @param multiplier Multiplier in basis points
     */
    function updateGasMultiplier(
        uint256 chainId,
        uint256 multiplier
    ) external onlyRole(ADMIN_ROLE) {
        require(chainId > 0, "Invalid chain ID");
        require(multiplier >= 5000 && multiplier <= 30000, "Invalid multiplier"); // 0.5x to 3x
        
        gasPriceMultipliers[chainId] = multiplier;
        
        emit GasMultiplierUpdated(chainId, multiplier);
    }
    
    /**
     * @notice Batch update gas costs
     * @param chainIds Array of chain IDs
     * @param baseGases Array of base gas costs
     * @param tokenGases Array of token gas costs
     * @param messageGases Array of message gas costs
     */
    function batchUpdateGasCosts(
        uint256[] memory chainIds,
        uint256[] memory baseGases,
        uint256[] memory tokenGases,
        uint256[] memory messageGases
    ) external onlyRole(ADMIN_ROLE) {
        require(
            chainIds.length == baseGases.length &&
            baseGases.length == tokenGases.length &&
            tokenGases.length == messageGases.length,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < chainIds.length; i++) {
            baseGasCosts[chainIds[i]] = baseGases[i];
            tokenTransferGasCosts[chainIds[i]] = tokenGases[i];
            messageGasCosts[chainIds[i]] = messageGases[i];
            
            emit GasCostUpdated(chainIds[i], baseGases[i], tokenGases[i], messageGases[i]);
        }
    }
    
    /**
     * @notice Get comprehensive gas estimate
     * @param sourceChainId Source chain
     * @param destinationChainId Destination chain
     * @param operationType Operation type
     * @return gasUnits Estimated gas units
     * @return nativeCost Estimated cost in native token
     * @return confidence Confidence level (0-100)
     */
    function getComprehensiveEstimate(
        uint256 sourceChainId,
        uint256 destinationChainId,
        OperationType operationType
    ) external view returns (
        uint256 gasUnits,
        uint256 nativeCost,
        uint8 confidence
    ) {
        require(baseGasCosts[destinationChainId] > 0, "Unknown destination chain");
        
        // Calculate gas units
        gasUnits = baseGasCosts[destinationChainId];
        
        if (operationType == OperationType.TOKEN_TRANSFER) {
            gasUnits += tokenTransferGasCosts[destinationChainId];
        } else if (operationType == OperationType.MESSAGE_ONLY) {
            gasUnits += messageGasCosts[destinationChainId];
        } else if (operationType == OperationType.TOKEN_WITH_MESSAGE) {
            gasUnits += tokenTransferGasCosts[destinationChainId] + messageGasCosts[destinationChainId];
        }
        
        // Apply multiplier
        gasUnits = gasUnits * gasPriceMultipliers[destinationChainId] / 10000;
        
        // Estimate native cost (simplified)
        nativeCost = gasUnits * 20 gwei;
        
        // Calculate confidence based on data availability
        if (gasPriceMultipliers[destinationChainId] > 0) {
            confidence = 90; // High confidence with custom multiplier
        } else {
            confidence = 70; // Lower confidence with defaults
        }
        
        return (gasUnits, nativeCost, confidence);
    }
    
    /**
     * @notice Check if chain is supported
     * @param chainId Chain ID to check
     * @return supported True if chain is supported
     */
    function isChainSupported(uint256 chainId) external view returns (bool supported) {
        return baseGasCosts[chainId] > 0;
    }
    
    /**
     * @notice Authorize upgrade
     * @param newImplementation New implementation address
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(ADMIN_ROLE) {}
}