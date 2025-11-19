// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@axelar-network/interchain-token-service/contracts/interfaces/IInterchainTokenService.sol";

/**
 * @title ITSTokenRegistry
 * @notice Manages registration and mapping of tokens for Axelar ITS
 * @dev Stores token information and chain-specific mappings for cross-chain transfers
 */
contract ITSTokenRegistry is 
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable 
{
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant REGISTRY_MANAGER_ROLE = keccak256("REGISTRY_MANAGER_ROLE");
    
    struct TokenInfo {
        bytes32 tokenId;           // ITS token ID
        address localAddress;      // Local token contract
        string symbol;
        uint8 decimals;
        bool isRegistered;
        uint256 minBridgeAmount;
        uint256 maxBridgeAmount;
        bool isPaused;            // Emergency pause per token
    }
    
    IInterchainTokenService public tokenService;
    
    mapping(address => TokenInfo) public tokens;
    mapping(uint256 => mapping(address => address)) public chainTokenMappings;
    mapping(bytes32 => address) public tokenIdToAddress;
    mapping(string => uint256) public chainNameToId;
    mapping(uint256 => string) public chainIdToName;
    
    // Events
    event TokenRegistered(
        address indexed token,
        bytes32 indexed tokenId,
        string symbol,
        uint8 decimals
    );
    
    event TokenLimitsUpdated(
        address indexed token,
        uint256 minAmount,
        uint256 maxAmount
    );
    
    event ChainMappingSet(
        uint256 indexed chainId,
        address indexed localToken,
        address remoteToken
    );
    
    event TokenPaused(address indexed token);
    event TokenUnpaused(address indexed token);
    
    event ChainRegistered(string chainName, uint256 chainId);
    
    // Storage gap for upgrades
    uint256[44] private __gap;
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize the token registry
     * @param _tokenService Address of Axelar ITS contract
     */
    function initialize(address _tokenService) external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        
        require(_tokenService != address(0), "Invalid ITS address");
        tokenService = IInterchainTokenService(_tokenService);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(REGISTRY_MANAGER_ROLE, msg.sender);
        
        // Register default chains
        _registerChain("Polygon", 137);
        _registerChain("Avalanche", 43114);
        _registerChain("base", 8453);
        _registerChain("binance", 56);
        _registerChain("ethereum", 1);
    }
    
    /**
     * @notice Register a chain name to ID mapping
     * @param chainName Axelar chain name
     * @param chainId Numeric chain ID
     */
    function _registerChain(string memory chainName, uint256 chainId) internal {
        chainNameToId[chainName] = chainId;
        chainIdToName[chainId] = chainName;
        emit ChainRegistered(chainName, chainId);
    }
    
    /**
     * @notice Register a new token for cross-chain transfers
     * @param token Local token address
     * @param symbol Token symbol
     * @param decimals Token decimals
     * @param minAmount Minimum bridge amount
     * @param maxAmount Maximum bridge amount
     */
    function registerToken(
        address token,
        string memory symbol,
        uint8 decimals,
        uint256 minAmount,
        uint256 maxAmount
    ) external onlyRole(REGISTRY_MANAGER_ROLE) {
        require(token != address(0), "Invalid token address");
        require(!tokens[token].isRegistered, "Token already registered");
        require(minAmount > 0 && maxAmount > minAmount, "Invalid limits");
        require(bytes(symbol).length > 0, "Invalid symbol");
        
        // Generate ITS token ID
        bytes32 tokenId = keccak256(abi.encodePacked("ITS", token, symbol));
        
        tokens[token] = TokenInfo({
            tokenId: tokenId,
            localAddress: token,
            symbol: symbol,
            decimals: decimals,
            isRegistered: true,
            minBridgeAmount: minAmount,
            maxBridgeAmount: maxAmount,
            isPaused: false
        });
        
        tokenIdToAddress[tokenId] = token;
        
        emit TokenRegistered(token, tokenId, symbol, decimals);
    }
    
    /**
     * @notice Update token bridge limits
     * @param token Token address
     * @param minAmount New minimum amount
     * @param maxAmount New maximum amount
     */
    function updateTokenLimits(
        address token,
        uint256 minAmount,
        uint256 maxAmount
    ) external onlyRole(REGISTRY_MANAGER_ROLE) {
        require(tokens[token].isRegistered, "Token not registered");
        require(minAmount > 0 && maxAmount > minAmount, "Invalid limits");
        
        tokens[token].minBridgeAmount = minAmount;
        tokens[token].maxBridgeAmount = maxAmount;
        
        emit TokenLimitsUpdated(token, minAmount, maxAmount);
    }
    
    /**
     * @notice Set token mapping for a specific chain
     * @param chainId Chain ID
     * @param localToken Local token address
     * @param remoteToken Remote token address on target chain
     */
    function setChainTokenMapping(
        uint256 chainId,
        address localToken,
        address remoteToken
    ) external onlyRole(REGISTRY_MANAGER_ROLE) {
        require(tokens[localToken].isRegistered, "Token not registered");
        require(remoteToken != address(0), "Invalid remote token");
        
        chainTokenMappings[chainId][localToken] = remoteToken;
        
        emit ChainMappingSet(chainId, localToken, remoteToken);
    }
    
    /**
     * @notice Pause a specific token for bridging
     * @param token Token address to pause
     */
    function pauseToken(address token) external onlyRole(ADMIN_ROLE) {
        require(tokens[token].isRegistered, "Token not registered");
        require(!tokens[token].isPaused, "Token already paused");
        
        tokens[token].isPaused = true;
        emit TokenPaused(token);
    }
    
    /**
     * @notice Unpause a specific token for bridging
     * @param token Token address to unpause
     */
    function unpauseToken(address token) external onlyRole(ADMIN_ROLE) {
        require(tokens[token].isRegistered, "Token not registered");
        require(tokens[token].isPaused, "Token not paused");
        
        tokens[token].isPaused = false;
        emit TokenUnpaused(token);
    }
    
    /**
     * @notice Get token information
     * @param token Token address
     * @return TokenInfo struct with token details
     */
    function getTokenInfo(address token) external view returns (TokenInfo memory) {
        require(tokens[token].isRegistered, "Token not registered");
        return tokens[token];
    }
    
    /**
     * @notice Check if token is valid for bridging
     * @param token Token address
     * @param amount Amount to bridge
     * @return bool True if valid
     */
    function isValidBridgeAmount(
        address token,
        uint256 amount
    ) external view returns (bool) {
        TokenInfo memory info = tokens[token];
        return (
            info.isRegistered &&
            !info.isPaused &&
            amount >= info.minBridgeAmount &&
            amount <= info.maxBridgeAmount
        );
    }
    
    /**
     * @notice Get chain name from chain ID
     * @param chainId Numeric chain ID
     * @return Chain name for Axelar
     */
    function getChainName(uint256 chainId) external view returns (string memory) {
        require(bytes(chainIdToName[chainId]).length > 0, "Unknown chain");
        return chainIdToName[chainId];
    }
    
    /**
     * @notice Register additional chain
     * @param chainName Axelar chain name
     * @param chainId Numeric chain ID
     */
    function registerChain(
        string memory chainName,
        uint256 chainId
    ) external onlyRole(ADMIN_ROLE) {
        require(bytes(chainName).length > 0, "Invalid chain name");
        require(chainId > 0, "Invalid chain ID");
        require(chainNameToId[chainName] == 0, "Chain already registered");
        
        _registerChain(chainName, chainId);
    }
    
    /**
     * @notice Authorize upgrade (UUPS pattern)
     * @param newImplementation New implementation address
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(ADMIN_ROLE) {}
}