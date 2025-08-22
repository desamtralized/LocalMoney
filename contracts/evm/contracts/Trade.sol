// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@chainlink/contracts/src/v0.8/vrf/interfaces/VRFCoordinatorV2Interface.sol";
import "./interfaces/ITrade.sol";
import "./interfaces/IHub.sol";
import "./interfaces/IOffer.sol";
import "./interfaces/IProfile.sol";
import "./interfaces/ILocalToken.sol";

/**
 * @title Trade
 * @notice Core Trade contract for LocalMoney EVM protocol
 * @dev Handles trade lifecycle from creation through escrow funding to completion
 * @author LocalMoney Protocol Team
 */
contract Trade is ITrade, Initializable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    // Storage
    mapping(uint256 => TradeData) public trades;
    mapping(uint256 => uint256) public escrowBalances;
    mapping(uint256 => StateTransitionRecord[]) public tradeHistory;
    uint256 public nextTradeId;
    
    IHub public hub;
    IOffer public offerContract;
    IProfile public profileContract;
    
    // Phase 4: Dispute and Arbitrator Management Storage
    mapping(uint256 => DisputeInfo) public disputes;
    mapping(address => ArbitratorInfo) public arbitratorInfo;
    mapping(string => address[]) public arbitratorsByFiat; // fiatCurrency => arbitrator addresses
    mapping(address => mapping(string => bool)) public arbitratorSupportsCurrency; // arbitrator => currency => supported
    
    // Phase 4: Chainlink VRF Storage
    VRFCoordinatorV2Interface public vrfCoordinator;
    mapping(uint256 => VRFRequest) public vrfRequests; // requestId => VRF request data
    uint64 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;
    uint32 public vrfCallbackGasLimit;
    uint16 public vrfRequestConfirmations;
    uint32 public vrfNumWords;
    
    // Storage gap for future upgrades (further reduced for VRF storage)
    uint256[39] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    struct StateTransitionRecord {
        TradeState fromState;
        TradeState toState;
        uint256 timestamp;
        address actor;
    }

    struct DisputeInfo {
        uint256 tradeId;
        address initiator;
        uint256 initiatedAt;
        address arbitrator;
        string buyerEvidence;
        string sellerEvidence;
        address winner;
        uint256 resolvedAt;
        string reason;
        bool isResolved;
    }

    struct ArbitratorInfo {
        bool isActive;
        string[] supportedFiats;
        string encryptionKey;
        uint256 disputesHandled;
        uint256 disputesWon;
        uint256 reputationScore; // Out of 10000
        uint256 joinedAt;
    }

    struct VRFRequest {
        uint256 tradeId;
        string fiatCurrency;
        uint256 requestedAt;
        bool fulfilled;
    }

    // Custom errors
    error InvalidOffer(uint256 offerId);
    error OfferNotActive(uint256 offerId);
    error AmountOutOfRange(uint256 amount, uint256 min, uint256 max);
    error SelfTradeNotAllowed();
    error MaxActiveTradesReached(uint256 current, uint256 max);
    error TradeNotFound(uint256 tradeId);
    error UnauthorizedAccess(address caller);
    error InvalidStateTransition(TradeState current, TradeState requested);
    error TradeExpired(uint256 expiresAt);
    error IncorrectPaymentAmount(uint256 sent, uint256 required);
    error InsufficientEscrowBalance(uint256 tradeId);
    error SystemPaused();
    error InvalidTimestamp();
    
    // Phase 4: Dispute-related errors
    error DisputeNotFound(uint256 tradeId);
    error DisputeAlreadyExists(uint256 tradeId);
    error DisputeAlreadyResolved(uint256 tradeId);
    error InvalidDisputer(address caller);
    error ArbitratorNotFound(address arbitrator);
    error ArbitratorAlreadyRegistered(address arbitrator);
    error UnsupportedCurrency(address arbitrator, string currency);
    error NoArbitratorsAvailable(string currency);
    error OnlyArbitratorCanResolve(address caller);
    
    // Phase 4: VRF-related errors
    error VRFNotConfigured();
    error VRFRequestNotFound(uint256 requestId);
    error VRFRequestAlreadyFulfilled(uint256 requestId);
    error VRFCoordinatorOnly(address caller);

    // Events (additional to ITrade interface)
    event StateTransitionEvent(uint256 indexed tradeId, TradeState from, TradeState to, address actor);
    event TradeExpiredByUser(uint256 indexed tradeId, address caller);
    event EscrowRefunded(uint256 indexed tradeId, uint256 amount, address recipient);
    event TradeCancelled(uint256 indexed tradeId, address caller);
    
    // Phase 4: Dispute and Arbitrator Events
    event DisputeInitiated(uint256 indexed tradeId, address indexed initiator, string reason, uint256 timestamp);
    event EvidenceSubmitted(uint256 indexed tradeId, address indexed party, string evidence, uint256 timestamp);
    event ArbitratorAssigned(uint256 indexed tradeId, address indexed arbitrator);
    event DisputeResolvedEvent(uint256 indexed tradeId, address indexed winner, address indexed arbitrator, uint256 timestamp);
    event ArbitratorRegistered(address indexed arbitrator, string[] supportedCurrencies);
    event ArbitratorRemoved(address indexed arbitrator, string currency);
    event ArbitratorReputationUpdated(address indexed arbitrator, uint256 newScore);
    event TokensBurned(address indexed fromToken, address indexed localToken, uint256 amountSwapped, uint256 amountBurned);
    event BurnFallbackToTreasury(address indexed token, uint256 amount, string reason);
    
    // Phase 4: VRF Events
    event VRFConfigUpdated(uint64 subscriptionId, bytes32 keyHash, uint32 callbackGasLimit);
    event VRFRandomnessRequested(uint256 indexed requestId, uint256 indexed tradeId, string fiatCurrency);
    event VRFRandomnessFulfilled(uint256 indexed requestId, uint256 indexed tradeId, address selectedArbitrator);

    // Modifiers
    modifier validTransition(uint256 _tradeId, TradeState _expectedState) {
        if (_tradeId == 0 || _tradeId >= nextTradeId) revert TradeNotFound(_tradeId);
        if (trades[_tradeId].state != _expectedState) {
            revert InvalidStateTransition(trades[_tradeId].state, _expectedState);
        }
        _;
    }

    modifier onlyTradeParty(uint256 _tradeId) {
        TradeData memory trade = trades[_tradeId];
        if (msg.sender != trade.buyer && msg.sender != trade.seller) {
            revert UnauthorizedAccess(msg.sender);
        }
        _;
    }

    modifier notExpired(uint256 _tradeId) {
        if (block.timestamp > trades[_tradeId].expiresAt) {
            revert TradeExpired(trades[_tradeId].expiresAt);
        }
        _;
    }

    modifier whenNotPaused() {
        if (hub.isPaused()) revert SystemPaused();
        _;
    }

    /**
     * @notice Initialize the Trade contract
     * @param _hub Address of the Hub contract
     * @param _offerContract Address of the Offer contract
     * @param _profileContract Address of the Profile contract
     */
    function initialize(
        address _hub,
        address _offerContract,
        address _profileContract
    ) external initializer {
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        
        require(_hub != address(0), "Invalid hub address");
        require(_offerContract != address(0), "Invalid offer contract address");
        require(_profileContract != address(0), "Invalid profile contract address");
        
        hub = IHub(_hub);
        offerContract = IOffer(_offerContract);
        profileContract = IProfile(_profileContract);
        nextTradeId = 1; // Start from 1 to avoid confusion with 0
    }

    /**
     * @notice Create a new trade from an offer
     * @param _offerId Offer ID to create trade from
     * @param _amount Crypto amount to trade
     * @param _buyerContact Buyer's encrypted contact information
     * @return tradeId The created trade ID
     */
    function createTrade(
        uint256 _offerId,
        uint256 _amount,
        string memory _buyerContact
    ) external nonReentrant whenNotPaused returns (uint256) {
        // Load and validate offer
        IOffer.OfferData memory offer = offerContract.getOffer(_offerId);
        if (offer.state != IOffer.OfferState.Active) revert OfferNotActive(_offerId);
        if (_amount < offer.minAmount || _amount > offer.maxAmount) {
            revert AmountOutOfRange(_amount, offer.minAmount, offer.maxAmount);
        }
        if (msg.sender == offer.owner) revert SelfTradeNotAllowed();
        
        // Check user limits
        IHub.HubConfig memory config = hub.getConfig();
        if (!profileContract.canCreateTrade(msg.sender)) {
            revert MaxActiveTradesReached(0, config.maxActiveTrades); // Profile will provide exact count
        }
        
        // Determine roles based on offer type
        address buyer;
        address seller;
        string memory buyerContact;
        string memory sellerContact;
        
        if (offer.offerType == IOffer.OfferType.Buy) {
            buyer = offer.owner;    // Maker wants to buy crypto
            seller = msg.sender;    // Taker will sell crypto
            buyerContact = "";      // Will be set when accepted
            sellerContact = _buyerContact; // Taker (seller) provides contact
        } else {
            buyer = msg.sender;     // Taker wants to buy crypto
            seller = offer.owner;   // Maker will sell crypto
            buyerContact = _buyerContact; // Taker (buyer) provides contact
            sellerContact = "";     // Will be set when accepted
        }
        
        // Calculate fiat amount
        uint256 fiatAmount = (_amount * offer.rate) / 1e18;
        
        // Create trade
        uint256 tradeId = nextTradeId++;
        trades[tradeId] = TradeData({
            id: uint128(tradeId),
            offerId: uint128(_offerId),
            buyer: buyer,
            seller: seller,
            tokenAddress: offer.tokenAddress,
            amount: uint96(_amount),
            fiatAmount: uint128(fiatAmount),
            fiatCurrency: offer.fiatCurrency,
            rate: uint128(offer.rate),
            state: TradeState.RequestCreated,
            createdAt: uint32(block.timestamp),
            expiresAt: uint32(block.timestamp + config.tradeExpirationTimer),
            disputeDeadline: 0, // Set later when fiat is deposited
            arbitrator: address(0), // Will be assigned later
            buyerContact: buyerContact,
            sellerContact: sellerContact
        });
        
        // Record state transition
        _recordStateTransition(tradeId, TradeState.RequestCreated, TradeState.RequestCreated);
        
        // Update profiles
        profileContract.updateActiveTrades(buyer, 1);
        profileContract.updateActiveTrades(seller, 1);
        
        emit TradeCreated(tradeId, _offerId, buyer);
        
        return tradeId;
    }

    /**
     * @notice Accept a trade request (for makers)
     * @param _tradeId Trade ID to accept
     * @param _sellerContact Seller's encrypted contact information
     */
    function acceptTrade(
        uint256 _tradeId,
        string memory _sellerContact
    ) external 
        nonReentrant 
        whenNotPaused 
        validTransition(_tradeId, TradeState.RequestCreated)
        notExpired(_tradeId)
    {
        TradeData storage trade = trades[_tradeId];
        
        // Determine who should accept based on offer type
        IOffer.OfferData memory offer = offerContract.getOffer(trade.offerId);
        address expectedAcceptor = offer.owner; // Maker should accept
        
        if (msg.sender != expectedAcceptor) {
            revert UnauthorizedAccess(msg.sender);
        }
        
        // Update trade state and contact
        trade.state = TradeState.RequestAccepted;
        if (offer.offerType == IOffer.OfferType.Buy) {
            trade.buyerContact = _sellerContact; // Maker is buyer
        } else {
            trade.sellerContact = _sellerContact; // Maker is seller
        }
        
        // Record state transition
        _recordStateTransition(_tradeId, TradeState.RequestCreated, TradeState.RequestAccepted);
        
        emit TradeAccepted(_tradeId, trade.seller);
    }

    /**
     * @notice Fund escrow (seller deposits crypto)
     * @param _tradeId Trade ID to fund
     */
    function fundEscrow(uint256 _tradeId) 
        external 
        payable 
        nonReentrant 
        whenNotPaused 
        validTransition(_tradeId, TradeState.RequestAccepted)
        notExpired(_tradeId)
    {
        TradeData storage trade = trades[_tradeId];
        if (msg.sender != trade.seller) revert UnauthorizedAccess(msg.sender);
        
        if (trade.tokenAddress == address(0)) {
            // ETH payment
            if (msg.value != trade.amount) {
                revert IncorrectPaymentAmount(msg.value, trade.amount);
            }
            escrowBalances[_tradeId] = msg.value;
        } else {
            // ERC20 payment
            if (msg.value != 0) revert IncorrectPaymentAmount(msg.value, 0);
            IERC20(trade.tokenAddress).safeTransferFrom(
                msg.sender,
                address(this),
                trade.amount
            );
            escrowBalances[_tradeId] = trade.amount;
        }
        
        // Update state
        trade.state = TradeState.EscrowFunded;
        
        // Record state transition
        _recordStateTransition(_tradeId, TradeState.RequestAccepted, TradeState.EscrowFunded);
        
        emit EscrowFunded(_tradeId, trade.amount);
    }

    /**
     * @notice Mark fiat as deposited (buyer confirms fiat sent)
     * @param _tradeId Trade ID
     */
    function markFiatDeposited(uint256 _tradeId)
        external
        nonReentrant
        whenNotPaused
        validTransition(_tradeId, TradeState.EscrowFunded)
    {
        TradeData storage trade = trades[_tradeId];
        if (msg.sender != trade.buyer) revert UnauthorizedAccess(msg.sender);
        
        // Update state and set dispute deadline
        trade.state = TradeState.FiatDeposited;
        IHub.HubConfig memory config = hub.getConfig();
        trade.disputeDeadline = uint32(block.timestamp + config.tradeDisputeTimer);
        
        // Record state transition
        _recordStateTransition(_tradeId, TradeState.EscrowFunded, TradeState.FiatDeposited);
        
        emit FiatDeposited(_tradeId, trade.buyer);
    }

    /**
     * @notice Release escrow to buyer (seller confirms fiat received)
     * @param _tradeId Trade ID
     */
    function releaseEscrow(uint256 _tradeId)
        external
        nonReentrant
        whenNotPaused
        validTransition(_tradeId, TradeState.FiatDeposited)
    {
        TradeData storage trade = trades[_tradeId];
        if (msg.sender != trade.seller) revert UnauthorizedAccess(msg.sender);
        
        uint256 escrowAmount = escrowBalances[_tradeId];
        if (escrowAmount == 0) revert InsufficientEscrowBalance(_tradeId);
        
        // Calculate fees
        FeeDistribution memory fees = calculateFees(escrowAmount);
        uint256 buyerAmount = escrowAmount - fees.burnAmount - fees.chainAmount - fees.warchestAmount;
        
        // Update state
        trade.state = TradeState.EscrowReleased;
        escrowBalances[_tradeId] = 0;
        
        // Transfer to buyer
        _transfer(trade.tokenAddress, trade.buyer, buyerAmount);
        
        // Distribute fees
        _distributeFees(trade.tokenAddress, fees);
        
        // Update profiles
        profileContract.updateActiveTrades(trade.buyer, -1);
        profileContract.updateActiveTrades(trade.seller, -1);
        profileContract.updateTradeCount(trade.buyer, true);
        profileContract.updateTradeCount(trade.seller, true);
        
        // Record state transition
        _recordStateTransition(_tradeId, TradeState.FiatDeposited, TradeState.EscrowReleased);
        
        emit EscrowReleased(_tradeId, buyerAmount);
    }

    /**
     * @notice Cancel a trade request
     * @param _tradeId Trade ID to cancel
     */
    function cancelTrade(uint256 _tradeId) external nonReentrant onlyTradeParty(_tradeId) {
        TradeData storage trade = trades[_tradeId];
        TradeState currentState = trade.state;
        
        // Allow cancellation in specific states
        if (currentState == TradeState.RequestCreated || 
            currentState == TradeState.RequestAccepted ||
            (currentState == TradeState.EscrowFunded && msg.sender == trade.buyer)) {
            
            TradeState newState = currentState == TradeState.EscrowFunded ? 
                TradeState.EscrowCancelled : 
                TradeState.EscrowCancelled;
            
            trade.state = newState;
            
            // Refund if escrow was funded
            if (currentState == TradeState.EscrowFunded) {
                uint256 escrowAmount = escrowBalances[_tradeId];
                if (escrowAmount > 0) {
                    escrowBalances[_tradeId] = 0;
                    _transfer(trade.tokenAddress, trade.seller, escrowAmount);
                    emit EscrowRefunded(_tradeId, escrowAmount, trade.seller);
                }
            }
            
            // Update profiles
            profileContract.updateActiveTrades(trade.buyer, -1);
            profileContract.updateActiveTrades(trade.seller, -1);
            
            // Record state transition
            _recordStateTransition(_tradeId, currentState, newState);
            
            emit TradeCancelled(_tradeId, msg.sender);
        } else {
            revert InvalidStateTransition(currentState, TradeState.EscrowCancelled);
        }
    }

    /**
     * @notice Refund expired trade
     * @param _tradeId Trade ID to refund
     */
    function refundExpiredTrade(uint256 _tradeId) external nonReentrant {
        TradeData storage trade = trades[_tradeId];
        
        // Only allow refund for funded trades that have expired
        if (trade.state != TradeState.EscrowFunded) {
            revert InvalidStateTransition(trade.state, TradeState.EscrowRefunded);
        }
        if (block.timestamp <= trade.expiresAt) {
            revert InvalidTimestamp();
        }
        
        uint256 escrowAmount = escrowBalances[_tradeId];
        if (escrowAmount == 0) revert InsufficientEscrowBalance(_tradeId);
        
        // Update state
        trade.state = TradeState.EscrowRefunded;
        escrowBalances[_tradeId] = 0;
        
        // Refund to seller
        _transfer(trade.tokenAddress, trade.seller, escrowAmount);
        
        // Update profiles
        profileContract.updateActiveTrades(trade.buyer, -1);
        profileContract.updateActiveTrades(trade.seller, -1);
        
        // Record state transition
        _recordStateTransition(_tradeId, TradeState.EscrowFunded, TradeState.EscrowRefunded);
        
        emit EscrowRefunded(_tradeId, escrowAmount, trade.seller);
        emit TradeExpiredByUser(_tradeId, msg.sender);
    }

    // Phase 4: Dispute Management Functions
    
    /**
     * @notice Initiate a dispute for a trade
     * @param _tradeId Trade ID to dispute
     * @param _reason Reason for the dispute
     */
    function disputeTrade(uint256 _tradeId, string memory _reason) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        TradeData storage trade = trades[_tradeId];
        
        // Validate trade exists and is in correct state
        if (_tradeId == 0 || _tradeId >= nextTradeId) revert TradeNotFound(_tradeId);
        if (trade.state != TradeState.FiatDeposited) {
            revert InvalidStateTransition(trade.state, TradeState.EscrowDisputed);
        }
        
        // Check if caller is authorized (buyer or seller)
        if (msg.sender != trade.buyer && msg.sender != trade.seller) {
            revert InvalidDisputer(msg.sender);
        }
        
        // Check if dispute already exists
        if (disputes[_tradeId].initiatedAt != 0) {
            revert DisputeAlreadyExists(_tradeId);
        }
        
        // Check if dispute deadline has passed
        if (block.timestamp > trade.disputeDeadline) {
            revert TradeExpired(trade.disputeDeadline);
        }
        
        // Create dispute
        disputes[_tradeId] = DisputeInfo({
            tradeId: _tradeId,
            initiator: msg.sender,
            initiatedAt: block.timestamp,
            arbitrator: address(0), // Will be assigned later
            buyerEvidence: "",
            sellerEvidence: "",
            winner: address(0),
            resolvedAt: 0,
            reason: _reason,
            isResolved: false
        });
        
        // Update trade state
        trade.state = TradeState.EscrowDisputed;
        
        // Record state transition
        _recordStateTransition(_tradeId, TradeState.FiatDeposited, TradeState.EscrowDisputed);
        
        // Assign arbitrator (simplified - will be enhanced with VRF in task 6)
        _assignArbitrator(_tradeId, trade.fiatCurrency);
        
        emit DisputeInitiated(_tradeId, msg.sender, _reason, block.timestamp);
        emit TradeDisputed(_tradeId, msg.sender);
    }
    
    /**
     * @notice Submit evidence for a dispute
     * @param _tradeId Trade ID
     * @param _evidence Evidence text (encrypted with arbitrator's key)
     */
    function submitEvidence(uint256 _tradeId, string memory _evidence) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        TradeData memory trade = trades[_tradeId];
        DisputeInfo storage dispute = disputes[_tradeId];
        
        // Validate dispute exists and is not resolved
        if (dispute.initiatedAt == 0) revert DisputeNotFound(_tradeId);
        if (dispute.isResolved) revert DisputeAlreadyResolved(_tradeId);
        
        // Check if caller is authorized
        if (msg.sender != trade.buyer && msg.sender != trade.seller) {
            revert InvalidDisputer(msg.sender);
        }
        
        // Store evidence based on caller
        if (msg.sender == trade.buyer) {
            dispute.buyerEvidence = _evidence;
        } else {
            dispute.sellerEvidence = _evidence;
        }
        
        emit EvidenceSubmitted(_tradeId, msg.sender, _evidence, block.timestamp);
    }
    
    /**
     * @notice Resolve a dispute (only callable by assigned arbitrator)
     * @param _tradeId Trade ID
     * @param _winner Winner of the dispute (buyer or seller)
     */
    function resolveDispute(uint256 _tradeId, address _winner) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        TradeData storage trade = trades[_tradeId];
        DisputeInfo storage dispute = disputes[_tradeId];
        
        // Validate dispute exists and is not resolved
        if (dispute.initiatedAt == 0) revert DisputeNotFound(_tradeId);
        if (dispute.isResolved) revert DisputeAlreadyResolved(_tradeId);
        
        // Check if caller is the assigned arbitrator
        if (msg.sender != dispute.arbitrator) {
            revert OnlyArbitratorCanResolve(msg.sender);
        }
        
        // Validate winner is either buyer or seller
        if (_winner != trade.buyer && _winner != trade.seller) {
            revert UnauthorizedAccess(_winner);
        }
        
        // Calculate fees including arbitrator fee
        uint256 escrowAmount = escrowBalances[_tradeId];
        FeeDistribution memory fees = _calculateFeesWithArbitrator(escrowAmount);
        uint256 remainingAmount = escrowAmount - fees.burnAmount - fees.chainAmount - fees.warchestAmount - fees.arbitratorAmount;
        
        // EFFECTS: Update all state before external calls
        dispute.winner = _winner;
        dispute.resolvedAt = block.timestamp;
        dispute.isResolved = true;
        trade.state = TradeState.DisputeResolved;
        escrowBalances[_tradeId] = 0; // Clear escrow balance first
        
        // Update arbitrator reputation (state change)
        _updateArbitratorReputation(dispute.arbitrator, true);
        
        // Record state transition (state change)
        _recordStateTransition(_tradeId, TradeState.EscrowDisputed, TradeState.DisputeResolved);
        
        // INTERACTIONS: External calls after all state changes
        // Transfer funds to winner
        _transfer(trade.tokenAddress, _winner, remainingAmount);
        
        // Pay arbitrator
        if (fees.arbitratorAmount > 0) {
            _transfer(trade.tokenAddress, dispute.arbitrator, fees.arbitratorAmount);
        }
        
        // Distribute other fees
        _distributeFees(trade.tokenAddress, fees);
        
        // Update profiles (external calls)
        profileContract.updateActiveTrades(trade.buyer, -1);
        profileContract.updateActiveTrades(trade.seller, -1);
        profileContract.updateTradeCount(trade.buyer, _winner == trade.buyer);
        profileContract.updateTradeCount(trade.seller, _winner == trade.seller);
        
        emit DisputeResolvedEvent(_tradeId, _winner, dispute.arbitrator, block.timestamp);
        emit DisputeResolved(_tradeId, _winner);
    }
    
    // Phase 4: VRF Configuration Functions
    
    /**
     * @notice Configure Chainlink VRF settings (admin only)
     * @param _vrfCoordinator VRF Coordinator contract address
     * @param _subscriptionId VRF subscription ID
     * @param _keyHash Key hash for VRF requests
     * @param _callbackGasLimit Gas limit for VRF callback
     * @param _requestConfirmations Number of confirmations for VRF request
     */
    function configureVRF(
        address _vrfCoordinator,
        uint64 _subscriptionId,
        bytes32 _keyHash,
        uint32 _callbackGasLimit,
        uint16 _requestConfirmations
    ) external {
        require(msg.sender == hub.getAdmin(), "Admin only");
        require(_vrfCoordinator != address(0), "Invalid VRF coordinator");
        require(_callbackGasLimit >= 100000, "Gas limit too low");
        require(_requestConfirmations >= 3, "Confirmations too low");
        
        vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinator);
        vrfSubscriptionId = _subscriptionId;
        vrfKeyHash = _keyHash;
        vrfCallbackGasLimit = _callbackGasLimit;
        vrfRequestConfirmations = _requestConfirmations;
        vrfNumWords = 1; // We only need one random number
        
        emit VRFConfigUpdated(_subscriptionId, _keyHash, _callbackGasLimit);
    }
    
    /**
     * @notice Update VRF subscription ID (admin only)
     * @param _subscriptionId New subscription ID
     */
    function updateVRFSubscription(uint64 _subscriptionId) external {
        require(msg.sender == hub.getAdmin(), "Admin only");
        vrfSubscriptionId = _subscriptionId;
        emit VRFConfigUpdated(_subscriptionId, vrfKeyHash, vrfCallbackGasLimit);
    }
    
    /**
     * @notice VRF callback function (only callable by VRF Coordinator)
     * @param _requestId The request ID
     * @param _randomWords Array of random numbers
     */
    function rawFulfillRandomWords(uint256 _requestId, uint256[] memory _randomWords) external {
        if (msg.sender != address(vrfCoordinator)) {
            revert VRFCoordinatorOnly(msg.sender);
        }
        _fulfillRandomWords(_requestId, _randomWords);
    }
    
    // Phase 4: Arbitrator Management Functions
    
    /**
     * @notice Register as an arbitrator for specific fiat currencies
     * @param _supportedCurrencies Array of supported fiat currency codes
     * @param _encryptionKey Public encryption key for secure communication
     */
    function registerArbitrator(
        string[] memory _supportedCurrencies,
        string memory _encryptionKey
    ) external whenNotPaused {
        // Check if already registered
        if (arbitratorInfo[msg.sender].joinedAt != 0) {
            revert ArbitratorAlreadyRegistered(msg.sender);
        }
        
        // Validate input
        require(_supportedCurrencies.length > 0, "Must support at least one currency");
        require(bytes(_encryptionKey).length > 0, "Encryption key required");
        
        // Register arbitrator
        arbitratorInfo[msg.sender] = ArbitratorInfo({
            isActive: true,
            supportedFiats: _supportedCurrencies,
            encryptionKey: _encryptionKey,
            disputesHandled: 0,
            disputesWon: 0,
            reputationScore: 5000, // Start with neutral reputation (50%)
            joinedAt: block.timestamp
        });
        
        // Add to currency mappings
        for (uint256 i = 0; i < _supportedCurrencies.length; i++) {
            string memory currency = _supportedCurrencies[i];
            arbitratorsByFiat[currency].push(msg.sender);
            arbitratorSupportsCurrency[msg.sender][currency] = true;
        }
        
        emit ArbitratorRegistered(msg.sender, _supportedCurrencies);
    }
    
    /**
     * @notice Remove arbitrator from a specific currency
     * @param _arbitrator Arbitrator address
     * @param _currency Currency to remove support for
     */
    function removeArbitratorFromCurrency(
        address _arbitrator,
        string memory _currency
    ) external whenNotPaused {
        // Only the arbitrator themselves or admin can remove
        require(msg.sender == _arbitrator || msg.sender == hub.getAdmin(), "Unauthorized");
        
        // Check if arbitrator exists and supports currency
        if (arbitratorInfo[_arbitrator].joinedAt == 0) {
            revert ArbitratorNotFound(_arbitrator);
        }
        if (!arbitratorSupportsCurrency[_arbitrator][_currency]) {
            revert UnsupportedCurrency(_arbitrator, _currency);
        }
        
        // Remove from currency mapping
        arbitratorSupportsCurrency[_arbitrator][_currency] = false;
        
        // Remove from arbitratorsByFiat array
        address[] storage arbitrators = arbitratorsByFiat[_currency];
        for (uint256 i = 0; i < arbitrators.length; i++) {
            if (arbitrators[i] == _arbitrator) {
                arbitrators[i] = arbitrators[arbitrators.length - 1];
                arbitrators.pop();
                break;
            }
        }
        
        emit ArbitratorRemoved(_arbitrator, _currency);
    }
    
    /**
     * @notice Deactivate an arbitrator (admin only)
     * @param _arbitrator Arbitrator address
     */
    function deactivateArbitrator(address _arbitrator) external {
        require(msg.sender == hub.getAdmin(), "Admin only");
        
        if (arbitratorInfo[_arbitrator].joinedAt == 0) {
            revert ArbitratorNotFound(_arbitrator);
        }
        
        arbitratorInfo[_arbitrator].isActive = false;
    }
    
    /**
     * @notice Get arbitrator information
     * @param _arbitrator Arbitrator address
     * @return ArbitratorInfo struct
     */
    function getArbitratorInfo(address _arbitrator) 
        external 
        view 
        returns (ArbitratorInfo memory) 
    {
        return arbitratorInfo[_arbitrator];
    }
    
    /**
     * @notice Get all arbitrators for a currency
     * @param _currency Currency code
     * @return Array of arbitrator addresses
     */
    function getArbitratorsForCurrency(string memory _currency) 
        external 
        view 
        returns (address[] memory) 
    {
        return arbitratorsByFiat[_currency];
    }
    
    /**
     * @notice Get dispute information
     * @param _tradeId Trade ID
     * @return DisputeInfo struct
     */
    function getDisputeInfo(uint256 _tradeId) 
        external 
        view 
        returns (DisputeInfo memory) 
    {
        return disputes[_tradeId];
    }

    // View functions

    /**
     * @notice Get trade data
     * @param _tradeId Trade ID
     * @return Trade data
     */
    function getTrade(uint256 _tradeId) external view returns (TradeData memory) {
        if (_tradeId == 0 || _tradeId >= nextTradeId) revert TradeNotFound(_tradeId);
        return trades[_tradeId];
    }

    /**
     * @notice Calculate fees for a given amount
     * @param _amount Amount to calculate fees for
     * @return Fee distribution
     */
    function calculateFees(uint256 _amount) public view returns (FeeDistribution memory) {
        IHub.HubConfig memory config = hub.getConfig();
        
        uint256 burnAmount = (_amount * config.burnFeePct) / 10000;
        uint256 chainAmount = (_amount * config.chainFeePct) / 10000;
        uint256 warchestAmount = (_amount * config.warchestFeePct) / 10000;
        
        return FeeDistribution({
            burnAmount: burnAmount,
            chainAmount: chainAmount,
            warchestAmount: warchestAmount,
            arbitratorAmount: 0 // For Phase 4
        });
    }

    // Internal functions

    /**
     * @notice Record state transition
     * @param _tradeId Trade ID
     * @param _from Previous state
     * @param _to New state
     */
    function _recordStateTransition(
        uint256 _tradeId,
        TradeState _from,
        TradeState _to
    ) internal {
        tradeHistory[_tradeId].push(StateTransitionRecord({
            fromState: _from,
            toState: _to,
            timestamp: block.timestamp,
            actor: msg.sender
        }));
        
        emit StateTransitionEvent(_tradeId, _from, _to, msg.sender);
    }

    /**
     * @notice Transfer tokens (ETH or ERC20)
     * @param _tokenAddress Token address (address(0) for ETH)
     * @param _to Recipient address
     * @param _amount Amount to transfer
     */
    function _transfer(address _tokenAddress, address _to, uint256 _amount) internal {
        if (_tokenAddress == address(0)) {
            // ETH transfer
            (bool success, ) = _to.call{value: _amount}("");
            require(success, "ETH transfer failed");
        } else {
            // ERC20 transfer
            IERC20(_tokenAddress).safeTransfer(_to, _amount);
        }
    }

    /**
     * @notice Distribute protocol fees with advanced multi-recipient and burn mechanism
     * @param _tokenAddress Token address
     * @param _fees Fee distribution
     */
    function _distributeFees(address _tokenAddress, FeeDistribution memory _fees) internal {
        IHub.HubConfig memory config = hub.getConfig();
        
        // Chain fee to designated collector
        if (_fees.chainAmount > 0) {
            address chainCollector = config.chainFeeCollector != address(0) 
                ? config.chainFeeCollector 
                : config.treasury;
            _transfer(_tokenAddress, chainCollector, _fees.chainAmount);
        }
        
        // Warchest fee to local market
        if (_fees.warchestAmount > 0) {
            _transfer(_tokenAddress, config.localMarket, _fees.warchestAmount);
        }
        
        // Burn fee - swap to LOCAL and burn
        if (_fees.burnAmount > 0 && config.localTokenAddress != address(0)) {
            _swapAndBurn(_tokenAddress, _fees.burnAmount, config);
        } else if (_fees.burnAmount > 0) {
            // Fallback: send to treasury if LOCAL token not configured
            _transfer(_tokenAddress, config.treasury, _fees.burnAmount);
            emit BurnFallbackToTreasury(_tokenAddress, _fees.burnAmount, "LOCAL token not configured");
        }
    }

    /**
     * @notice Swap tokens to LOCAL and burn them
     * @param _fromToken Token to swap from
     * @param _amount Amount to swap and burn
     * @param _config Hub configuration
     */
    function _swapAndBurn(
        address _fromToken,
        uint256 _amount,
        IHub.HubConfig memory _config
    ) internal {
        if (_fromToken == _config.localTokenAddress) {
            // Already LOCAL token, just burn directly
            ILocalToken(_config.localTokenAddress).burn(_amount);
            emit TokensBurned(_fromToken, _config.localTokenAddress, _amount, _amount);
            return;
        }
        
        if (_config.swapRouter == address(0)) {
            // No swap router configured, send to treasury as fallback
            _transfer(_fromToken, _config.treasury, _amount);
            emit BurnFallbackToTreasury(_fromToken, _amount, "No swap router configured");
            return;
        }
        
        try this._performSwapAndBurn(
            _fromToken, 
            _amount, 
            _config.localTokenAddress, 
            _config.swapRouter
        ) {
            // Swap and burn successful - event emitted in _performSwapAndBurn
        } catch {
            // Swap failed, send to treasury as fallback
            _transfer(_fromToken, _config.treasury, _amount);
            emit BurnFallbackToTreasury(_fromToken, _amount, "Swap failed");
        }
    }

    /**
     * @notice Perform token swap and burn (external for try-catch)
     * @param _fromToken Token to swap from
     * @param _amount Amount to swap
     * @param _localToken LOCAL token address
     * @param _swapRouter Uniswap V3 swap router address
     */
    function _performSwapAndBurn(
        address _fromToken,
        uint256 _amount,
        address _localToken,
        address _swapRouter
    ) external {
        // This function should only be callable by this contract
        require(msg.sender == address(this), "Only self-callable");
        
        ISwapRouter swapRouter = ISwapRouter(_swapRouter);
        
        // Approve router to spend tokens
        IERC20(_fromToken).safeIncreaseAllowance(_swapRouter, _amount);
        
        // Set up swap parameters
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: _fromToken,
                tokenOut: _localToken,
                fee: 3000, // 0.3% fee tier (most common)
                recipient: address(this),
                deadline: block.timestamp + 300, // 5 minute deadline
                amountIn: _amount,
                amountOutMinimum: 0, // Accept any amount (could be improved with slippage protection)
                sqrtPriceLimitX96: 0
            });
        
        // Execute swap
        uint256 amountOut = swapRouter.exactInputSingle(params);
        
        // Burn the received LOCAL tokens
        ILocalToken(_localToken).burn(amountOut);
        
        // Emit burn event
        emit TokensBurned(_fromToken, _localToken, _amount, amountOut);
        
        // Note: No need to reset approval as we used safeIncreaseAllowance
    }
    
    // Phase 4: Internal helper functions for disputes
    
    /**
     * @notice Assign an arbitrator to a dispute using Chainlink VRF
     * @param _tradeId Trade ID
     * @param _fiatCurrency Fiat currency for the trade
     */
    function _assignArbitrator(uint256 _tradeId, string memory _fiatCurrency) internal {
        // Check if VRF is configured
        if (address(vrfCoordinator) == address(0) || vrfSubscriptionId == 0) {
            // Fallback to pseudo-random selection if VRF not configured
            _assignArbitratorFallback(_tradeId, _fiatCurrency);
            return;
        }
        
        // Request randomness from Chainlink VRF
        _requestRandomArbitrator(_tradeId, _fiatCurrency);
    }
    
    /**
     * @notice Fallback arbitrator assignment without VRF
     * @param _tradeId Trade ID
     * @param _fiatCurrency Fiat currency for the trade
     */
    function _assignArbitratorFallback(uint256 _tradeId, string memory _fiatCurrency) internal {
        address[] memory availableArbitrators = arbitratorsByFiat[_fiatCurrency];
        
        // Filter for active arbitrators
        address[] memory activeArbitrators = new address[](availableArbitrators.length);
        uint256 activeCount = 0;
        
        for (uint256 i = 0; i < availableArbitrators.length; i++) {
            if (arbitratorInfo[availableArbitrators[i]].isActive) {
                activeArbitrators[activeCount] = availableArbitrators[i];
                activeCount++;
            }
        }
        
        if (activeCount == 0) {
            revert NoArbitratorsAvailable(_fiatCurrency);
        }
        
        // Secure pseudo-random selection with additional entropy
        // NOTE: For production, this should use Chainlink VRF via _requestRandomArbitrator
        uint256 selectedIndex = uint256(keccak256(abi.encodePacked(
            block.timestamp, 
            block.prevrandao, 
            _tradeId,
            tx.origin,
            gasleft(),
            blockhash(block.number - 1)
        ))) % activeCount;
        
        address selectedArbitrator = activeArbitrators[selectedIndex];
        disputes[_tradeId].arbitrator = selectedArbitrator;
        trades[_tradeId].arbitrator = selectedArbitrator;
        
        emit ArbitratorAssigned(_tradeId, selectedArbitrator);
    }
    
    /**
     * @notice Request random arbitrator selection from Chainlink VRF
     * @param _tradeId Trade ID
     * @param _fiatCurrency Fiat currency for the trade
     */
    function _requestRandomArbitrator(uint256 _tradeId, string memory _fiatCurrency) internal {
        // Ensure we have arbitrators available first
        address[] memory availableArbitrators = arbitratorsByFiat[_fiatCurrency];
        uint256 activeCount = 0;
        
        for (uint256 i = 0; i < availableArbitrators.length; i++) {
            if (arbitratorInfo[availableArbitrators[i]].isActive) {
                activeCount++;
            }
        }
        
        if (activeCount == 0) {
            revert NoArbitratorsAvailable(_fiatCurrency);
        }
        
        // Request randomness from VRF Coordinator
        uint256 requestId = vrfCoordinator.requestRandomWords(
            vrfKeyHash,
            vrfSubscriptionId,
            vrfRequestConfirmations,
            vrfCallbackGasLimit,
            vrfNumWords
        );
        
        // Store VRF request data
        vrfRequests[requestId] = VRFRequest({
            tradeId: _tradeId,
            fiatCurrency: _fiatCurrency,
            requestedAt: block.timestamp,
            fulfilled: false
        });
        
        emit VRFRandomnessRequested(requestId, _tradeId, _fiatCurrency);
    }
    
    /**
     * @notice Fulfill VRF randomness callback
     * @param _requestId VRF request ID
     * @param _randomWords Array of random numbers from VRF
     */
    function _fulfillRandomWords(uint256 _requestId, uint256[] memory _randomWords) internal {
        VRFRequest storage request = vrfRequests[_requestId];
        
        // Validate request exists and is not already fulfilled
        if (request.requestedAt == 0) revert VRFRequestNotFound(_requestId);
        if (request.fulfilled) revert VRFRequestAlreadyFulfilled(_requestId);
        
        // Mark request as fulfilled
        request.fulfilled = true;
        
        // Get available arbitrators for the currency
        address[] memory availableArbitrators = arbitratorsByFiat[request.fiatCurrency];
        
        // Filter for active arbitrators
        address[] memory activeArbitrators = new address[](availableArbitrators.length);
        uint256 activeCount = 0;
        
        for (uint256 i = 0; i < availableArbitrators.length; i++) {
            if (arbitratorInfo[availableArbitrators[i]].isActive) {
                activeArbitrators[activeCount] = availableArbitrators[i];
                activeCount++;
            }
        }
        
        if (activeCount == 0) {
            // This shouldn't happen as we checked before making the VRF request,
            // but handle gracefully by reverting to fallback
            _assignArbitratorFallback(request.tradeId, request.fiatCurrency);
            return;
        }
        
        // Select arbitrator using true randomness
        uint256 selectedIndex = _randomWords[0] % activeCount;
        address selectedArbitrator = activeArbitrators[selectedIndex];
        
        // Assign arbitrator to trade and dispute
        disputes[request.tradeId].arbitrator = selectedArbitrator;
        trades[request.tradeId].arbitrator = selectedArbitrator;
        
        emit ArbitratorAssigned(request.tradeId, selectedArbitrator);
        emit VRFRandomnessFulfilled(_requestId, request.tradeId, selectedArbitrator);
    }
    
    /**
     * @notice Calculate fees including arbitrator fee
     * @param _amount Amount to calculate fees for
     * @return Fee distribution with arbitrator fee
     */
    function _calculateFeesWithArbitrator(uint256 _amount) internal view returns (FeeDistribution memory) {
        IHub.HubConfig memory config = hub.getConfig();
        
        uint256 burnAmount = (_amount * config.burnFeePct) / 10000;
        uint256 chainAmount = (_amount * config.chainFeePct) / 10000;
        uint256 warchestAmount = (_amount * config.warchestFeePct) / 10000;
        
        // Arbitrator gets 0.5% of the trade amount (50 basis points)
        uint256 arbitratorAmount = (_amount * 50) / 10000;
        
        return FeeDistribution({
            burnAmount: burnAmount,
            chainAmount: chainAmount,
            warchestAmount: warchestAmount,
            arbitratorAmount: arbitratorAmount
        });
    }
    
    /**
     * @notice Update arbitrator reputation after dispute resolution
     * @param _arbitrator Arbitrator address
     * @param _won Whether the arbitrator made a decision (always true in current implementation)
     */
    function _updateArbitratorReputation(address _arbitrator, bool _won) internal {
        ArbitratorInfo storage info = arbitratorInfo[_arbitrator];
        
        info.disputesHandled += 1;
        if (_won) {
            info.disputesWon += 1;
        }
        
        // Update reputation score (simple algorithm)
        // In production, this would be more sophisticated
        if (info.disputesHandled > 0) {
            uint256 winRate = (info.disputesWon * 10000) / info.disputesHandled;
            // Cap reputation between 1000 (10%) and 9000 (90%)
            if (winRate < 1000) winRate = 1000;
            if (winRate > 9000) winRate = 9000;
            
            info.reputationScore = winRate;
        }
        
        emit ArbitratorReputationUpdated(_arbitrator, info.reputationScore);
    }

    /**
     * @notice Authorize upgrade (UUPS pattern)
     * @param newImplementation Address of the new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal view override {
        if (msg.sender != hub.getAdmin()) {
            revert UnauthorizedAccess(msg.sender);
        }
    }

    /**
     * @notice Get contract version
     * @return Version string
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}