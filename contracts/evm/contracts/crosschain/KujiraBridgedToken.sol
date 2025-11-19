// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IBridgedToken.sol";

/**
 * @title KujiraBridgedToken
 * @notice ERC-20 token representing bridged KUJI from Kujira to BSC
 * @dev Implements burn-and-mint mechanism with role-based access control
 */
contract KujiraBridgedToken is ERC20, AccessControl, Pausable, IBridgedToken {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    mapping(bytes32 => bool) public processedBurns;

    uint8 private constant DECIMALS = 6; // KUJI uses 6 decimals

    /**
     * @notice Initialize the bridged token
     * @param _name Token name (e.g., "Bridged KUJI")
     * @param _symbol Token symbol (e.g., "bKUJI")
     */
    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

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
    ) external override onlyRole(MINTER_ROLE) whenNotPaused {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        require(kujiraTxHash != bytes32(0), "Invalid tx hash");
        require(!processedBurns[kujiraTxHash], "Already processed");

        processedBurns[kujiraTxHash] = true;
        _mint(recipient, amount);

        emit TokensMinted(recipient, amount, kujiraTxHash);
    }

    /**
     * @notice Returns the number of decimals used by the token
     * @return uint8 Number of decimals (6 for KUJI compatibility)
     */
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice Pause token transfers
     * @dev Only callable by PAUSER_ROLE
     */
    function pause() external override onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause token transfers
     * @dev Only callable by PAUSER_ROLE
     */
    function unpause() external override onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Hook that is called during token transfers
     * @param from Address tokens are transferred from
     * @param to Address tokens are transferred to
     * @param amount Amount of tokens transferred
     */
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._update(from, to, amount);
    }

    /**
     * @dev Override to resolve multiple inheritance
     */
    function grantRole(bytes32 role, address account)
        public
        override(AccessControl, IBridgedToken)
        onlyRole(getRoleAdmin(role))
    {
        super.grantRole(role, account);
    }

    /**
     * @dev Override to resolve multiple inheritance
     */
    function revokeRole(bytes32 role, address account)
        public
        override(AccessControl, IBridgedToken)
        onlyRole(getRoleAdmin(role))
    {
        super.revokeRole(role, account);
    }

    /**
     * @dev Override to resolve multiple inheritance
     */
    function hasRole(bytes32 role, address account)
        public
        view
        override(AccessControl, IBridgedToken)
        returns (bool)
    {
        return super.hasRole(role, account);
    }

    /**
     * @dev Override required by Solidity for multiple inheritance
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}