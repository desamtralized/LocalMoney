// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../Escrow.sol";
import "./ITSTokenRegistry.sol";
import "@axelar-network/interchain-token-service/contracts/interfaces/IInterchainTokenService.sol";
import "@axelar-network/interchain-token-service/contracts/interfaces/ITokenManager.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title CrossChainEscrow
 * @notice Extends Escrow with cross-chain token transfer capabilities using Axelar ITS
 * @dev Handles cross-chain deposits and releases for multi-chain trades
 */
contract CrossChainEscrow is Escrow {
    using SafeERC20 for IERC20;
    
    // Cross-chain specific roles
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");
    
    // Cross-chain constants
    uint256 public constant MIN_BRIDGE_AMOUNT = 10 * 1e6; // 10 USDT/USDC (6 decimals)
    uint256 public constant MAX_BRIDGE_AMOUNT = 100000 * 1e6; // 100k USDT/USDC
    uint256 public constant CROSS_CHAIN_FEE_BPS = 30; // 0.3% cross-chain fee
    
    // Cross-chain state
    ITSTokenRegistry public tokenRegistry;
    IInterchainTokenService public tokenService;
    
    struct CrossChainDeposit {
        uint256 sourceChainId;
        address depositor;
        address token;
        uint256 amount;
        bytes32 tradeId;
        uint256 timestamp;
        bool isLocked;
    }
    
    struct CrossChainRelease {
        uint256 destinationChainId;
        address recipient;
        address token;
        uint256 amount;
        bytes32 tradeId;
        uint256 timestamp;
        bool isCompleted;
    }
    
    // Mappings for cross-chain tracking
    mapping(bytes32 => CrossChainDeposit) public crossChainDeposits;
    mapping(bytes32 => CrossChainRelease) public crossChainReleases;
    mapping(bytes32 => mapping(uint256 => uint256)) public chainBalances;
    mapping(bytes32 => uint256) public totalCrossChainFees;
    
    // Events
    event CrossChainDepositReceived(
        bytes32 indexed depositId,
        uint256 indexed sourceChainId,
        address indexed depositor,
        address token,
        uint256 amount,
        bytes32 tradeId
    );
    
    event CrossChainReleaseInitiated(
        bytes32 indexed releaseId,
        uint256 indexed destinationChainId,
        address indexed recipient,
        address token,
        uint256 amount,
        bytes32 tradeId
    );
    
    event CrossChainFeeCollected(
        bytes32 indexed tradeId,
        address token,
        uint256 feeAmount
    );
    
    event CrossChainEscrowInitialized(
        address tokenRegistry,
        address tokenService
    );
    
    // Storage gap adjustment for inheritance
    uint256[40] private __gapCrossChain;
    
    /**
     * @notice Initialize cross-chain components
     * @param _tokenRegistry Address of ITSTokenRegistry
     * @param _tokenService Address of Axelar ITS
     */
    function initializeCrossChain(
        address _tokenRegistry,
        address _tokenService
    ) external onlyRole(ADMIN_ROLE) {
        require(_tokenRegistry != address(0), "Invalid registry");
        require(_tokenService != address(0), "Invalid token service");
        require(address(tokenRegistry) == address(0), "Already initialized");
        
        tokenRegistry = ITSTokenRegistry(_tokenRegistry);
        tokenService = IInterchainTokenService(_tokenService);
        
        emit CrossChainEscrowInitialized(_tokenRegistry, _tokenService);
    }
    
    /**
     * @notice Process deposit from another chain
     * @param sourceChainId Source chain ID
     * @param depositor Original depositor address
     * @param token Token address
     * @param amount Amount deposited
     * @param tradeId Trade identifier
     */
    function depositFromChain(
        uint256 sourceChainId,
        address depositor,
        address token,
        uint256 amount,
        bytes32 tradeId
    ) external onlyRole(BRIDGE_ROLE) nonReentrant {
        require(amount >= MIN_BRIDGE_AMOUNT, "Amount too small");
        require(amount <= MAX_BRIDGE_AMOUNT, "Amount too large");
        require(depositor != address(0), "Invalid depositor");
        require(tradeId != bytes32(0), "Invalid trade ID");
        
        // Verify token is registered and not paused
        ITSTokenRegistry.TokenInfo memory tokenInfo = tokenRegistry.getTokenInfo(token);
        require(tokenInfo.isRegistered, "Token not registered");
        require(!tokenInfo.isPaused, "Token paused");
        
        // Generate unique deposit ID
        bytes32 depositId = keccak256(abi.encodePacked(
            sourceChainId,
            depositor,
            tradeId,
            block.timestamp,
            block.number
        ));
        
        // Ensure deposit doesn't already exist
        require(crossChainDeposits[depositId].timestamp == 0, "Duplicate deposit");
        
        // Calculate cross-chain fee
        uint256 feeAmount = (amount * CROSS_CHAIN_FEE_BPS) / 10000;
        uint256 netAmount = amount - feeAmount;
        
        // Store deposit information
        crossChainDeposits[depositId] = CrossChainDeposit({
            sourceChainId: sourceChainId,
            depositor: depositor,
            token: token,
            amount: netAmount,
            tradeId: tradeId,
            timestamp: block.timestamp,
            isLocked: true
        });
        
        // Update balances
        chainBalances[tradeId][sourceChainId] += netAmount;
        escrowBalances[uint256(tradeId)] += netAmount;
        totalCrossChainFees[tradeId] += feeAmount;
        
        emit CrossChainDepositReceived(
            depositId,
            sourceChainId,
            depositor,
            token,
            netAmount,
            tradeId
        );
        
        emit CrossChainFeeCollected(tradeId, token, feeAmount);
    }
    
    /**
     * @notice Release funds to another chain
     * @param destinationChainId Target chain ID
     * @param recipient Recipient address on target chain
     * @param token Token to transfer
     * @param amount Amount to transfer
     * @param tradeId Trade identifier
     */
    function releaseToChain(
        uint256 destinationChainId,
        address recipient,
        address token,
        uint256 amount,
        bytes32 tradeId
    ) external payable onlyRole(TRADE_CONTRACT_ROLE) nonReentrant {
        require(escrowBalances[uint256(tradeId)] >= amount, "Insufficient balance");
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        
        // Get token info and validate
        ITSTokenRegistry.TokenInfo memory tokenInfo = tokenRegistry.getTokenInfo(token);
        require(tokenInfo.isRegistered, "Token not registered");
        require(!tokenInfo.isPaused, "Token paused");
        require(
            tokenRegistry.isValidBridgeAmount(token, amount),
            "Invalid bridge amount"
        );
        
        // Generate release ID
        bytes32 releaseId = keccak256(abi.encodePacked(
            destinationChainId,
            recipient,
            tradeId,
            block.timestamp,
            block.number
        ));
        
        // Update escrow balance
        escrowBalances[uint256(tradeId)] -= amount;
        
        if (destinationChainId == block.chainid) {
            // Same chain - direct transfer
            IERC20(token).safeTransfer(recipient, amount);
            
            // Record as completed
            crossChainReleases[releaseId] = CrossChainRelease({
                destinationChainId: destinationChainId,
                recipient: recipient,
                token: token,
                amount: amount,
                tradeId: tradeId,
                timestamp: block.timestamp,
                isCompleted: true
            });
        } else {
            // Cross-chain transfer via ITS
            string memory destChain = tokenRegistry.getChainName(destinationChainId);
            
            // Prepare metadata for tracking
            bytes memory metadata = abi.encode(recipient, tradeId, releaseId);
            
            // Approve token service for the transfer
            IERC20(token).safeIncreaseAllowance(address(tokenService), amount);
            
            // Initiate cross-chain transfer
            tokenService.interchainTransfer{value: msg.value}(
                tokenInfo.tokenId,
                destChain,
                abi.encode(recipient),
                amount,
                metadata,
                msg.value // Gas payment
            );
            
            // Record release
            crossChainReleases[releaseId] = CrossChainRelease({
                destinationChainId: destinationChainId,
                recipient: recipient,
                token: token,
                amount: amount,
                tradeId: tradeId,
                timestamp: block.timestamp,
                isCompleted: false
            });
        }
        
        emit CrossChainReleaseInitiated(
            releaseId,
            destinationChainId,
            recipient,
            token,
            amount,
            tradeId
        );
    }
    
    /**
     * @notice Batch release to multiple chains
     * @param destinationChainIds Array of destination chain IDs
     * @param recipients Array of recipient addresses
     * @param tokens Array of token addresses
     * @param amounts Array of amounts to release
     * @param tradeIds Array of trade identifiers
     */
    function batchReleaseToChains(
        uint256[] memory destinationChainIds,
        address[] memory recipients,
        address[] memory tokens,
        uint256[] memory amounts,
        bytes32[] memory tradeIds
    ) external payable onlyRole(TRADE_CONTRACT_ROLE) {
        require(
            destinationChainIds.length == recipients.length &&
            recipients.length == tokens.length &&
            tokens.length == amounts.length &&
            amounts.length == tradeIds.length,
            "Array length mismatch"
        );
        
        uint256 gasPerTransfer = msg.value / destinationChainIds.length;
        
        for (uint256 i = 0; i < destinationChainIds.length; i++) {
            this.releaseToChain{value: gasPerTransfer}(
                destinationChainIds[i],
                recipients[i],
                tokens[i],
                amounts[i],
                tradeIds[i]
            );
        }
    }
    
    /**
     * @notice Mark cross-chain release as completed (called by bridge)
     * @param releaseId Release identifier
     */
    function markReleaseCompleted(
        bytes32 releaseId
    ) external onlyRole(BRIDGE_ROLE) {
        require(crossChainReleases[releaseId].timestamp > 0, "Release not found");
        require(!crossChainReleases[releaseId].isCompleted, "Already completed");
        
        crossChainReleases[releaseId].isCompleted = true;
    }
    
    /**
     * @notice Emergency unlock of cross-chain deposit
     * @param depositId Deposit identifier
     */
    function emergencyUnlockDeposit(
        bytes32 depositId
    ) external onlyRole(EMERGENCY_ROLE) {
        require(crossChainDeposits[depositId].timestamp > 0, "Deposit not found");
        require(crossChainDeposits[depositId].isLocked, "Already unlocked");
        
        // Require timelock period has passed (2 days)
        require(
            block.timestamp >= crossChainDeposits[depositId].timestamp + TIMELOCK_DURATION,
            "Timelock not expired"
        );
        
        crossChainDeposits[depositId].isLocked = false;
        
        // Return funds to depositor
        uint256 amount = crossChainDeposits[depositId].amount;
        address token = crossChainDeposits[depositId].token;
        address depositor = crossChainDeposits[depositId].depositor;
        
        IERC20(token).safeTransfer(depositor, amount);
    }
    
    /**
     * @notice Get cross-chain deposit details
     * @param depositId Deposit identifier
     */
    function getCrossChainDeposit(
        bytes32 depositId
    ) external view returns (CrossChainDeposit memory) {
        return crossChainDeposits[depositId];
    }
    
    /**
     * @notice Get cross-chain release details
     * @param releaseId Release identifier
     */
    function getCrossChainRelease(
        bytes32 releaseId
    ) external view returns (CrossChainRelease memory) {
        return crossChainReleases[releaseId];
    }
    
    /**
     * @notice Check chain balance for a trade
     * @param tradeId Trade identifier
     * @param chainId Chain ID
     */
    function getChainBalance(
        bytes32 tradeId,
        uint256 chainId
    ) external view returns (uint256) {
        return chainBalances[tradeId][chainId];
    }
    
    /**
     * @notice Get total fees collected for a trade
     * @param tradeId Trade identifier
     */
    function getTotalCrossChainFees(
        bytes32 tradeId
    ) external view returns (uint256) {
        return totalCrossChainFees[tradeId];
    }
    
    /**
     * @notice Withdraw accumulated cross-chain fees
     * @param token Token to withdraw
     * @param amount Amount to withdraw
     * @param recipient Fee recipient
     */
    function withdrawCrossChainFees(
        address token,
        uint256 amount,
        address recipient
    ) external onlyRole(ADMIN_ROLE) nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        IERC20(token).safeTransfer(recipient, amount);
    }
}