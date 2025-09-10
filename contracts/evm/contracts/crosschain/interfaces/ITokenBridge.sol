// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ITokenBridge
 * @notice Interface for token bridging operations via Axelar ITS
 */
interface ITokenBridge {
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
    
    function bridgeToken(
        address token,
        uint256 amount,
        string memory destinationChain,
        address destinationAddress
    ) external payable;
    
    function bridgeForEscrow(
        address token,
        uint256 amount,
        string memory destinationChain,
        address destinationAddress,
        bytes32 tradeId
    ) external payable;
    
    function estimateBridgeGas(
        string memory destinationChain,
        bytes memory payload
    ) external view returns (uint256);
    
    function updateBridgeFee(uint256 newFeePercentage) external;
    
    function updateGasBuffer(uint256 newBufferPercentage) external;
    
    function updateFeeRecipient(address newRecipient) external;
    
    function pause() external;
    
    function unpause() external;
    
    function bridgeRequests(bytes32 requestId) external view returns (
        address sender,
        address token,
        uint256 amount,
        string memory destinationChain,
        address destinationAddress,
        uint256 timestamp,
        bool isCompleted,
        bytes32 txHash
    );
    
    function totalBridgedAmount(address token) external view returns (uint256);
    
    function chainBridgedAmount(address token, string memory chain) external view returns (uint256);
}