// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IBridgedToken
 * @notice Interface for bridged tokens on BSC from Kujira
 * @dev Extends ERC20 with bridge-specific minting functionality
 */
interface IBridgedToken is IERC20 {
    /**
     * @notice Mint tokens to recipient after successful bridge from Kujira
     * @param recipient Address to receive the minted tokens
     * @param amount Amount of tokens to mint
     * @param kujiraTxHash Transaction hash from Kujira burn
     * @dev Only callable by accounts with MINTER_ROLE
     */
    function mintBridged(
        address recipient,
        uint256 amount,
        bytes32 kujiraTxHash
    ) external;

    /**
     * @notice Check if a Kujira transaction has been processed
     * @param kujiraTxHash Transaction hash from Kujira
     * @return bool True if already processed
     */
    function processedBurns(bytes32 kujiraTxHash) external view returns (bool);

    /**
     * @notice Pause token transfers
     * @dev Only callable by PAUSER_ROLE
     */
    function pause() external;

    /**
     * @notice Unpause token transfers
     * @dev Only callable by PAUSER_ROLE
     */
    function unpause() external;

    /**
     * @notice Grant role to an account
     * @param role The role to grant
     * @param account The account to grant the role to
     * @dev Only callable by role admin
     */
    function grantRole(bytes32 role, address account) external;

    /**
     * @notice Revoke role from an account
     * @param role The role to revoke
     * @param account The account to revoke the role from
     * @dev Only callable by role admin
     */
    function revokeRole(bytes32 role, address account) external;

    /**
     * @notice Check if account has role
     * @param role The role to check
     * @param account The account to check
     * @return bool True if account has role
     */
    function hasRole(bytes32 role, address account) external view returns (bool);

    /**
     * @notice Get the MINTER_ROLE identifier
     * @return bytes32 The role identifier
     */
    function MINTER_ROLE() external view returns (bytes32);

    /**
     * @notice Get the PAUSER_ROLE identifier
     * @return bytes32 The role identifier
     */
    function PAUSER_ROLE() external view returns (bytes32);

    /**
     * @notice Emitted when tokens are minted through bridge
     * @param recipient Address that received tokens
     * @param amount Amount of tokens minted
     * @param kujiraTxHash Transaction hash from Kujira
     */
    event TokensMinted(
        address indexed recipient,
        uint256 amount,
        bytes32 indexed kujiraTxHash
    );
}