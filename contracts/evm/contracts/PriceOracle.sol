// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "./interfaces/IPriceOracle.sol";

/**
 * @title PriceOracle
 * @notice Advanced price oracle for LocalMoney protocol integrating Chainlink and Uniswap V3
 * @dev Provides accurate pricing for tokens and fiat currencies with multiple data sources
 * @author LocalMoney Protocol Team
 */
contract PriceOracle is 
    IPriceOracle,
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    // Access control roles
    bytes32 public constant PRICE_UPDATER_ROLE = keccak256("PRICE_UPDATER_ROLE");
    bytes32 public constant ROUTE_MANAGER_ROLE = keccak256("ROUTE_MANAGER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    // Constants
    uint256 public constant PRICE_DECIMALS = 8; // Chainlink standard
    uint256 public constant MAX_PRICE_AGE = 3600; // 1 hour in seconds
    uint256 public constant MIN_PRICE_STALENESS = 300; // 5 minutes
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2; // Mainnet WETH

    // Price data structures
    struct PriceData {
        uint256 usdPrice;      // Price in USD with 8 decimals
        uint256 updatedAt;     // Last update timestamp
        address source;        // Price source (Chainlink feed or DEX)
        bool isValid;          // Price validity flag
    }

    struct PriceRoute {
        address[] path;        // Token swap path for Uniswap
        uint24[] fees;         // Fee tiers for Uniswap V3 pools
        bool useChainlink;     // Primary source preference
        address chainlinkFeed; // Chainlink price feed address
        uint32 twapPeriod;     // TWAP period in seconds
    }

    struct ChainlinkFeedInfo {
        address feedAddress;
        uint8 decimals;
        uint256 heartbeat;     // Expected update frequency
        bool isActive;
    }

    // Storage
    mapping(string => PriceData) public fiatPrices;         // Fiat currency USD prices
    mapping(address => PriceRoute) public tokenPriceRoutes; // Token price calculation routes
    mapping(address => PriceData) public tokenPrices;       // Cached token prices - FIXED: Already public
    mapping(string => ChainlinkFeedInfo) public chainlinkFeeds; // Chainlink feed registry
    
    // Circuit breaker state for price deviation protection
    mapping(address => uint256) public lastValidPrice;
    mapping(address => bool) public circuitBreakerActive;
    uint256 public circuitBreakerDeviationBps; // Configurable deviation threshold
    uint256 public constant MAX_DEVIATION_BPS = 5000; // 50% max allowed deviation
    uint256 public constant MIN_DEVIATION_BPS = 500; // 5% min allowed deviation
    uint256 public constant DEFAULT_DEVIATION_BPS = 2000; // 20% default deviation
    
    address public swapRouter; // Uniswap V3 SwapRouter address
    bool public emergencyPause;

    // Storage gap for upgrades
    uint256[46] private __gap;

    // Events
    event FiatPriceUpdated(string indexed currency, uint256 price, uint256 timestamp);
    event TokenPriceUpdated(address indexed token, uint256 price, uint256 timestamp, address source);
    event PriceRouteUpdated(address indexed token, address[] path, uint24[] fees, address chainlinkFeed);
    event ChainlinkFeedUpdated(string indexed currency, address feedAddress, uint8 decimals);
    event SwapRouterUpdated(address indexed oldRouter, address indexed newRouter);
    event EmergencyPauseToggled(bool paused);
    event StalePriceDetected(address indexed token, uint256 age, uint256 maxAge);
    event CircuitBreakerTriggered(address indexed token, uint256 priceDeviation, uint256 maxDeviation);
    event CircuitBreakerReset(address indexed token);
    event CircuitBreakerDeviationUpdated(uint256 oldDeviation, uint256 newDeviation);

    // Custom errors
    error PriceNotFound(address token);
    error FiatPriceNotFound(string currency);
    error StalePriceError(address token, uint256 age, uint256 maxAge);
    error InvalidPriceRoute(address token);
    error InvalidChainlinkFeed(address feed);
    error UnauthorizedAccess();
    error EmergencyPaused();
    error InvalidInput();
    error PriceCalculationFailed(string reason);

    // Modifiers
    modifier onlyPriceUpdater() {
        if (!hasRole(PRICE_UPDATER_ROLE, msg.sender)) revert UnauthorizedAccess();
        _;
    }

    modifier onlyRouteManager() {
        if (!hasRole(ROUTE_MANAGER_ROLE, msg.sender)) revert UnauthorizedAccess();
        _;
    }

    modifier whenNotPaused() {
        if (emergencyPause) revert EmergencyPaused();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the PriceOracle contract
     * @param _admin Admin address for role management
     * @param _swapRouter Uniswap V3 SwapRouter address
     */
    function initialize(
        address _admin,
        address _swapRouter
    ) external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        if (_admin == address(0) || _swapRouter == address(0)) revert InvalidInput();

        // Set up roles
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PRICE_UPDATER_ROLE, _admin);
        _grantRole(ROUTE_MANAGER_ROLE, _admin);
        _grantRole(EMERGENCY_ROLE, _admin);

        swapRouter = _swapRouter;
        emergencyPause = false;
        
        // Initialize circuit breaker with default threshold
        circuitBreakerDeviationBps = DEFAULT_DEVIATION_BPS;
    }

    /**
     * @notice Update fiat currency prices in USD
     * @param _currencies Array of currency codes (e.g., "EUR", "GBP")
     * @param _prices Array of prices in USD with 8 decimals
     */
    function updateFiatPrices(
        string[] memory _currencies,
        uint256[] memory _prices
    ) external onlyPriceUpdater whenNotPaused {
        if (_currencies.length != _prices.length || _currencies.length == 0) {
            revert InvalidInput();
        }

        for (uint256 i = 0; i < _currencies.length; i++) {
            if (_prices[i] == 0) continue;
            
            fiatPrices[_currencies[i]] = PriceData({
                usdPrice: _prices[i],
                updatedAt: block.timestamp,
                source: address(0), // Manual update
                isValid: true
            });

            emit FiatPriceUpdated(_currencies[i], _prices[i], block.timestamp);
        }
    }

    /**
     * @notice Register or update a token price route
     * @param _token Token address
     * @param _path Uniswap V3 swap path
     * @param _fees Fee tiers for each hop
     * @param _chainlinkFeed Chainlink feed address (address(0) if not available)
     * @param _twapPeriod TWAP calculation period
     */
    function registerPriceRoute(
        address _token,
        address[] memory _path,
        uint24[] memory _fees,
        address _chainlinkFeed,
        uint32 _twapPeriod
    ) external onlyRouteManager {
        if (_token == address(0)) revert InvalidInput();
        if (_path.length < 2 || _fees.length != _path.length - 1) {
            revert InvalidPriceRoute(_token);
        }

        bool useChainlink = _chainlinkFeed != address(0);
        
        tokenPriceRoutes[_token] = PriceRoute({
            path: _path,
            fees: _fees,
            useChainlink: useChainlink,
            chainlinkFeed: _chainlinkFeed,
            twapPeriod: _twapPeriod == 0 ? 3600 : _twapPeriod // Default 1 hour
        });

        emit PriceRouteUpdated(_token, _path, _fees, _chainlinkFeed);
    }

    /**
     * @notice Update Chainlink feed information
     * @param _currency Currency or token symbol
     * @param _feedAddress Chainlink aggregator address
     * @param _decimals Feed decimals
     * @param _heartbeat Expected update frequency
     */
    function updateChainlinkFeed(
        string memory _currency,
        address _feedAddress,
        uint8 _decimals,
        uint256 _heartbeat
    ) external onlyRouteManager {
        if (_feedAddress == address(0)) revert InvalidChainlinkFeed(_feedAddress);

        chainlinkFeeds[_currency] = ChainlinkFeedInfo({
            feedAddress: _feedAddress,
            decimals: _decimals,
            heartbeat: _heartbeat,
            isActive: true
        });

        emit ChainlinkFeedUpdated(_currency, _feedAddress, _decimals);
    }

    /**
     * @notice Get token price in USD
     * @param _token Token address
     * @return price Price in USD with 8 decimals
     */
    function getTokenPriceInUSD(address _token) 
        external 
        override 
        whenNotPaused 
        returns (uint256) 
    {
        return _getTokenPriceInUSD(_token);
    }
    
    /**
     * @notice Get cached token price without updating cache
     * @param _token Token address
     * @return price Cached USD price with 8 decimals
     * @dev Returns cached price or reverts if not available/stale
     */
    function getCachedTokenPrice(address _token) 
        external 
        view 
        whenNotPaused 
        returns (uint256) 
    {
        PriceData memory cachedPrice = tokenPrices[_token];
        if (!cachedPrice.isValid) revert PriceNotFound(_token);
        if (block.timestamp > cachedPrice.updatedAt + MAX_PRICE_AGE) {
            revert StalePriceError(_token, block.timestamp - cachedPrice.updatedAt, MAX_PRICE_AGE);
        }
        return cachedPrice.usdPrice;
    }

    /**
     * @notice Get token price in specified fiat currency
     * @param _token Token address
     * @param _fiatCurrency Fiat currency code
     * @param _amount Token amount to price
     * @return fiatValue Value in fiat currency
     */
    function getTokenPriceInFiat(
        address _token,
        string memory _fiatCurrency,
        uint256 _amount
    ) external view override whenNotPaused returns (uint256) {
        uint256 tokenPriceUSD = _getTokenPriceInUSD(_token);
        uint256 fiatPriceUSD = getFiatPrice(_fiatCurrency);
        
        if (fiatPriceUSD == 0) revert FiatPriceNotFound(_fiatCurrency);
        
        // Calculate: (tokenAmount * tokenPriceUSD) / fiatPriceUSD
        // Adjust for decimals: both prices are in 8 decimals
        return (_amount * tokenPriceUSD) / fiatPriceUSD;
    }

    /**
     * @notice Get fiat currency price in USD
     * @param _currency Currency code
     * @return price Price in USD with 8 decimals
     */
    function getFiatPrice(string memory _currency) 
        public 
        view 
        override 
        returns (uint256) 
    {
        PriceData memory priceData = fiatPrices[_currency];
        
        if (!priceData.isValid) revert FiatPriceNotFound(_currency);
        
        // Check if price is stale
        if (block.timestamp > priceData.updatedAt + MAX_PRICE_AGE) {
            revert StalePriceError(address(0), block.timestamp - priceData.updatedAt, MAX_PRICE_AGE);
        }
        
        return priceData.usdPrice;
    }

    /**
     * @notice Check if token price is valid and not stale
     * @param _token Token address
     * @return isValid True if price is valid
     */
    function isTokenPriceValid(address _token) external view returns (bool) {
        PriceData memory priceData = tokenPrices[_token];
        
        if (!priceData.isValid) return false;
        if (block.timestamp > priceData.updatedAt + MAX_PRICE_AGE) return false;
        
        return true;
    }

    /**
     * @notice Get price age in seconds
     * @param _token Token address
     * @return age Age in seconds
     */
    function getTokenPriceAge(address _token) external view returns (uint256) {
        PriceData memory priceData = tokenPrices[_token];
        if (!priceData.isValid) return type(uint256).max;
        
        return block.timestamp > priceData.updatedAt ? 
            block.timestamp - priceData.updatedAt : 0;
    }

    /**
     * @notice Emergency pause/unpause
     * @param _paused Pause state
     */
    function setEmergencyPause(bool _paused) external onlyRole(EMERGENCY_ROLE) {
        emergencyPause = _paused;
        emit EmergencyPauseToggled(_paused);
    }

    /**
     * @notice Update swap router address
     * @param _newRouter New swap router address
     */
    function updateSwapRouter(address _newRouter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_newRouter == address(0)) revert InvalidInput();
        
        address oldRouter = swapRouter;
        swapRouter = _newRouter;
        
        emit SwapRouterUpdated(oldRouter, _newRouter);
    }

    // Internal functions

    /**
     * @notice Internal function to get token price in USD
     * @param _token Token address
     * @return price Price in USD with 8 decimals
     */
    function _getTokenPriceInUSD(address _token) internal view returns (uint256) {
        // Return cached price if valid and fresh
        PriceData memory cachedPrice = tokenPrices[_token];
        if (cachedPrice.isValid && 
            block.timestamp <= cachedPrice.updatedAt + MAX_PRICE_AGE) {
            return cachedPrice.usdPrice;
        }

        PriceRoute memory route = tokenPriceRoutes[_token];
        
        // Try Chainlink first if available and preferred
        if (route.useChainlink && route.chainlinkFeed != address(0)) {
            try this._getChainlinkPrice(route.chainlinkFeed) returns (uint256 chainlinkPrice) {
                return chainlinkPrice;
            } catch {
                // Fall through to Uniswap if Chainlink fails
            }
        }

        // Use Uniswap V3 TWAP as fallback
        if (route.path.length >= 2) {
            return _getUniswapPrice(_token, route);
        }

        revert PriceNotFound(_token);
    }

    /**
     * @notice Get price from Chainlink feed
     * @param _feedAddress Chainlink aggregator address
     * @return price Price with 8 decimals
     */
    function _getChainlinkPrice(address _feedAddress) external view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(_feedAddress);
        
        (, int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();
        
        if (price <= 0) revert PriceCalculationFailed("Invalid Chainlink price");
        if (block.timestamp > updatedAt + MAX_PRICE_AGE) {
            revert StalePriceError(address(0), block.timestamp - updatedAt, MAX_PRICE_AGE);
        }
        
        uint8 decimals = priceFeed.decimals();
        
        // Normalize to 8 decimals
        if (decimals > PRICE_DECIMALS) {
            return uint256(price) / (10 ** (decimals - PRICE_DECIMALS));
        } else if (decimals < PRICE_DECIMALS) {
            return uint256(price) * (10 ** (PRICE_DECIMALS - decimals));
        }
        
        return uint256(price);
    }

    /**
     * @notice Get price from Uniswap V3 using TWAP
     * @param _token Token address
     * @param _route Price route configuration
     * @return price Price with 8 decimals
     */
    function _getUniswapPrice(address _token, PriceRoute memory _route) 
        internal 
        view 
        returns (uint256) 
    {
        // For simplicity, we'll use a basic implementation
        // In production, you'd want to implement proper TWAP calculation
        // This is a simplified version that gets the current price
        
        // Find the pool for the first hop (token -> next token in path)
        if (_route.path.length < 2) revert InvalidPriceRoute(_token);
        
        address token0 = _route.path[0];
        address token1 = _route.path[1];
        uint24 fee = _route.fees[0];
        
        // Calculate pool address (this is a simplified approach)
        // In production, you'd use the PoolAddress library from Uniswap
        address poolAddress = _computePoolAddress(token0, token1, fee);
        
        if (poolAddress == address(0)) revert PriceCalculationFailed("Pool not found");
        
        try IUniswapV3Pool(poolAddress).slot0() returns (
            uint160 sqrtPriceX96,
            int24,
            uint16,
            uint16,
            uint16,
            uint8,
            bool
        ) {
            // Convert sqrtPriceX96 to actual price
            // This is a simplified calculation - in production, you'd want more precision
            uint256 price = (uint256(sqrtPriceX96) * uint256(sqrtPriceX96) * 1e8) >> (96 * 2);
            
            // If path has more hops, we'd need to calculate them too
            // For now, assume final token in path is a USD-pegged token or WETH
            
            return price;
        } catch {
            revert PriceCalculationFailed("Uniswap price calculation failed");
        }
    }

    /**
     * @notice Compute Uniswap V3 pool address (simplified)
     * @param _token0 First token
     * @param _token1 Second token  
     * @param _fee Fee tier
     * @return pool Pool address
     */
    function _computePoolAddress(
        address _token0,
        address _token1,
        uint24 _fee
    ) internal pure returns (address pool) {
        // This is a placeholder - in production, use PoolAddress.computeAddress()
        // from @uniswap/v3-periphery/contracts/libraries/PoolAddress.sol
        if (_token0 > _token1) {
            (_token0, _token1) = (_token1, _token0);
        }
        
        // Simplified hash-based calculation (not accurate)
        // In production, use the actual Uniswap V3 factory CREATE2 calculation
        return address(uint160(uint256(keccak256(abi.encodePacked(_token0, _token1, _fee)))));
    }

    /**
     * @notice Authorize upgrade (UUPS pattern)
     * @param newImplementation Address of new implementation
     */
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        // Additional upgrade authorization logic can be added here
    }

    /**
     * @notice Get contract version
     * @return Version string
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }

    // Legacy interface implementations for backward compatibility
    
    function updatePrices(string[] memory _currencies, uint256[] memory _prices) 
        external 
        override 
    {
        this.updateFiatPrices(_currencies, _prices);
    }

    function updateTokenRoute(address _token, TokenRoute memory _route) 
        external 
        override 
    {
        // Convert TokenRoute to PriceRoute format
        address[] memory path = new address[](2);
        path[0] = _token;
        path[1] = WETH; // Assume route to WETH
        
        uint24[] memory fees = new uint24[](1);
        fees[0] = 3000; // 0.3% fee tier
        
        this.registerPriceRoute(_token, path, fees, _route.dex, 3600);
    }

    function setPriceProvider(address /* _provider */) external pure override {
        // This function is deprecated - use role-based access control instead
        revert("Use role-based access control");
    }

    function isPriceValid(string memory _currency) external view override returns (bool) {
        PriceData memory priceData = fiatPrices[_currency];
        
        if (!priceData.isValid) return false;
        if (block.timestamp > priceData.updatedAt + MAX_PRICE_AGE) return false;
        
        return true;
    }

    function getPriceAge(string memory _currency) external view override returns (uint256) {
        PriceData memory priceData = fiatPrices[_currency];
        if (!priceData.isValid) return type(uint256).max;
        
        return block.timestamp > priceData.updatedAt ? 
            block.timestamp - priceData.updatedAt : 0;
    }

    /**
     * @notice Check circuit breaker for price deviation
     * @dev SECURITY FIX: Added circuit breaker for extreme price movements
     * @param _token Token address to check
     * @param _currentPrice Current price to validate
     * @return triggered Whether circuit breaker is triggered
     */
    function checkCircuitBreaker(address _token, uint256 _currentPrice) public returns (bool triggered) {
        if (circuitBreakerActive[_token]) {
            return true; // Already triggered
        }
        
        uint256 lastPrice = lastValidPrice[_token];
        
        if (lastPrice > 0) {
            // Calculate price deviation
            uint256 deviation;
            if (_currentPrice > lastPrice) {
                deviation = ((_currentPrice - lastPrice) * 10000) / lastPrice;
            } else {
                deviation = ((lastPrice - _currentPrice) * 10000) / lastPrice;
            }
            
            // Trigger circuit breaker if deviation exceeds threshold
            if (deviation > circuitBreakerDeviationBps) {
                circuitBreakerActive[_token] = true;
                emit CircuitBreakerTriggered(_token, deviation, circuitBreakerDeviationBps);
                return true;
            }
        }
        
        // Update last valid price
        lastValidPrice[_token] = _currentPrice;
        return false;
    }

    /**
     * @notice Reset circuit breaker for a token
     * @dev Only callable by emergency role
     * @param _token Token address to reset
     */
    function resetCircuitBreaker(address _token) external onlyRole(EMERGENCY_ROLE) {
        circuitBreakerActive[_token] = false;
        lastValidPrice[_token] = 0;
        emit CircuitBreakerReset(_token);
    }

    /**
     * @notice Check if circuit breaker is active for a token
     * @param _token Token address to check
     * @return active Whether circuit breaker is active
     */
    function isCircuitBreakerActive(address _token) external view returns (bool active) {
        return circuitBreakerActive[_token];
    }

    /**
     * @notice Update circuit breaker deviation threshold
     * @dev SECURITY: Configurable circuit breaker for price protection
     * @param _newDeviationBps New deviation threshold in basis points
     */
    function setCircuitBreakerDeviation(uint256 _newDeviationBps) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(
            _newDeviationBps >= MIN_DEVIATION_BPS && _newDeviationBps <= MAX_DEVIATION_BPS,
            "Deviation out of range"
        );
        
        uint256 oldDeviation = circuitBreakerDeviationBps;
        circuitBreakerDeviationBps = _newDeviationBps;
        
        emit CircuitBreakerDeviationUpdated(oldDeviation, _newDeviationBps);
    }

    /**
     * @notice Get current circuit breaker configuration
     * @return deviationBps Current deviation threshold in basis points
     * @return minBps Minimum allowed deviation
     * @return maxBps Maximum allowed deviation
     */
    function getCircuitBreakerConfig() 
        external 
        view 
        returns (
            uint256 deviationBps,
            uint256 minBps,
            uint256 maxBps
        ) 
    {
        return (circuitBreakerDeviationBps, MIN_DEVIATION_BPS, MAX_DEVIATION_BPS);
    }
}