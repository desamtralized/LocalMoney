// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../interfaces/IEscrow.sol";

/**
 * @title ICrossChainEscrow
 * @notice Interface for cross-chain escrow operations
 */
interface ICrossChainEscrow is IEscrow {
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
    
    function initializeCrossChain(
        address _tokenRegistry,
        address _tokenService
    ) external;
    
    function depositFromChain(
        uint256 sourceChainId,
        address depositor,
        address token,
        uint256 amount,
        bytes32 tradeId
    ) external;
    
    function releaseToChain(
        uint256 destinationChainId,
        address recipient,
        address token,
        uint256 amount,
        bytes32 tradeId
    ) external payable;
    
    function batchReleaseToChains(
        uint256[] memory destinationChainIds,
        address[] memory recipients,
        address[] memory tokens,
        uint256[] memory amounts,
        bytes32[] memory tradeIds
    ) external payable;
    
    function markReleaseCompleted(bytes32 releaseId) external;
    
    function emergencyUnlockDeposit(bytes32 depositId) external;
    
    function getCrossChainDeposit(bytes32 depositId) external view returns (CrossChainDeposit memory);
    
    function getCrossChainRelease(bytes32 releaseId) external view returns (CrossChainRelease memory);
    
    function getChainBalance(bytes32 tradeId, uint256 chainId) external view returns (uint256);
    
    function getTotalCrossChainFees(bytes32 tradeId) external view returns (uint256);
    
    function withdrawCrossChainFees(
        address token,
        uint256 amount,
        address recipient
    ) external;
}