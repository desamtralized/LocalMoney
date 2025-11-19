// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockInterchainTokenService
 * @notice Mock implementation of Axelar ITS for testing
 */
contract MockInterchainTokenService {
    mapping(bytes32 => address) public tokenManagers;
    mapping(bytes32 => bool) public transferExecuted;
    
    event InterchainTransfer(
        bytes32 indexed tokenId,
        string destinationChain,
        bytes destinationAddress,
        uint256 amount,
        bytes metadata
    );
    
    function interchainTransfer(
        bytes32 _tokenId,
        string memory destinationChain,
        bytes memory destinationAddress,
        uint256 amount,
        bytes memory metadata,
        uint256 gasValue
    ) external payable {
        transferExecuted[_tokenId] = true;
        
        emit InterchainTransfer(
            _tokenId,
            destinationChain,
            destinationAddress,
            amount,
            metadata
        );
    }
    
    function tokenId(address token, string memory symbol) external pure returns (bytes32) {
        return keccak256(abi.encodePacked("ITS", token, symbol));
    }
    
    function getTokenManager(bytes32 _tokenId) external view returns (address) {
        return tokenManagers[_tokenId];
    }
    
    function setTokenManager(bytes32 _tokenId, address manager) external {
        tokenManagers[_tokenId] = manager;
    }
}