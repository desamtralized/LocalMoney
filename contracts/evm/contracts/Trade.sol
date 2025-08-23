// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ITrade.sol";
import "./interfaces/IHub.sol";
import "./interfaces/IOffer.sol";
import "./interfaces/IProfile.sol";
import "./interfaces/IEscrow.sol";
import "./interfaces/IArbitratorManager.sol";

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
    mapping(uint256 => StateTransitionRecord[]) public tradeHistory;
    uint256 public nextTradeId;
    
    IHub public hub;
    IOffer public offerContract;
    IProfile public profileContract;
    IEscrow public escrowContract;
    IArbitratorManager public arbitratorManager;
    
    // Dispute Management Storage
    mapping(uint256 => DisputeInfo) public disputes;
    
    // Storage gap for future upgrades
    uint256[48] private __gap;

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
    
    // Dispute-related errors
    error DisputeNotFound(uint256 tradeId);
    error DisputeAlreadyExists(uint256 tradeId);
    error DisputeAlreadyResolved(uint256 tradeId);
    error InvalidDisputer(address caller);
    error OnlyArbitratorCanResolve(address caller);

    // Events (additional to ITrade interface)
    event StateTransitionEvent(uint256 indexed tradeId, TradeState from, TradeState to, address actor);
    event TradeExpiredByUser(uint256 indexed tradeId, address caller);
    event EscrowRefunded(uint256 indexed tradeId, uint256 amount, address recipient);
    event TradeCancelled(uint256 indexed tradeId, address caller);
    
    // Dispute Events
    event DisputeInitiated(uint256 indexed tradeId, address indexed initiator, string reason, uint256 timestamp);
    event EvidenceSubmitted(uint256 indexed tradeId, address indexed party, string evidence, uint256 timestamp);
    event DisputeResolvedEvent(uint256 indexed tradeId, address indexed winner, address indexed arbitrator, uint256 timestamp);

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
     * @param _escrowContract Address of the Escrow contract
     * @param _arbitratorManager Address of the ArbitratorManager contract
     */
    function initialize(
        address _hub,
        address _offerContract,
        address _profileContract,
        address _escrowContract,
        address _arbitratorManager
    ) external initializer {
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        
        require(_hub != address(0), "Invalid hub address");
        require(_offerContract != address(0), "Invalid offer contract address");
        require(_profileContract != address(0), "Invalid profile contract address");
        require(_escrowContract != address(0), "Invalid escrow contract address");
        require(_arbitratorManager != address(0), "Invalid arbitrator manager address");
        
        hub = IHub(_hub);
        offerContract = IOffer(_offerContract);
        profileContract = IProfile(_profileContract);
        escrowContract = IEscrow(_escrowContract);
        arbitratorManager = IArbitratorManager(_arbitratorManager);
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
        
        // SECURITY FIX EXT-017: Apply Checks-Effects-Interactions pattern
        // EFFECTS: Update state BEFORE external calls
        TradeState previousState = trade.state;
        trade.state = TradeState.EscrowFunded;
        
        // Record state transition BEFORE external calls
        _recordStateTransition(_tradeId, previousState, TradeState.EscrowFunded);
        
        // INTERACTIONS: External calls AFTER state updates
        // Deposit to escrow contract
        if (trade.tokenAddress == address(0)) {
            // ETH payment
            if (msg.value != trade.amount) {
                revert IncorrectPaymentAmount(msg.value, trade.amount);
            }
            // SECURITY FIX AUTH-006: Pass address(this) as depositor since Trade contract is the msg.sender
            escrowContract.deposit{value: msg.value}(_tradeId, address(0), msg.value, address(this));
        } else {
            // ERC20 payment - first transfer to this contract, then to escrow
            if (msg.value != 0) revert IncorrectPaymentAmount(msg.value, 0);
            IERC20(trade.tokenAddress).safeTransferFrom(
                msg.sender,
                address(this),
                trade.amount
            );
            IERC20(trade.tokenAddress).safeIncreaseAllowance(address(escrowContract), trade.amount);
            // SECURITY FIX AUTH-006: Pass address(this) as depositor since Trade contract holds the tokens
            escrowContract.deposit(_tradeId, trade.tokenAddress, trade.amount, address(this));
        }
        
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
        
        // Update state first (CEI pattern)
        trade.state = TradeState.EscrowReleased;
        
        // Release funds from escrow contract
        uint256 netAmount = escrowContract.release(
            _tradeId,
            trade.tokenAddress,
            trade.buyer,
            address(0) // No arbitrator
        );
        
        // Update profiles
        profileContract.updateActiveTrades(trade.buyer, -1);
        profileContract.updateActiveTrades(trade.seller, -1);
        profileContract.updateTradeCount(trade.buyer, true);
        profileContract.updateTradeCount(trade.seller, true);
        
        // Record state transition
        _recordStateTransition(_tradeId, TradeState.FiatDeposited, TradeState.EscrowReleased);
        
        emit EscrowReleased(_tradeId, netAmount);
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
                escrowContract.refund(_tradeId, trade.tokenAddress, trade.seller);
                emit EscrowRefunded(_tradeId, trade.amount, trade.seller);
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
        
        // Update state first (CEI pattern)
        trade.state = TradeState.EscrowRefunded;
        
        // Refund from escrow contract
        escrowContract.refund(_tradeId, trade.tokenAddress, trade.seller);
        
        // Update profiles
        profileContract.updateActiveTrades(trade.buyer, -1);
        profileContract.updateActiveTrades(trade.seller, -1);
        
        // Record state transition
        _recordStateTransition(_tradeId, TradeState.EscrowFunded, TradeState.EscrowRefunded);
        
        emit EscrowRefunded(_tradeId, trade.amount, trade.seller);
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
        
        // Assign arbitrator via ArbitratorManager
        address assignedArbitrator = arbitratorManager.assignArbitrator(_tradeId, trade.fiatCurrency);
        disputes[_tradeId].arbitrator = assignedArbitrator;
        trade.arbitrator = assignedArbitrator;
        
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
        
        // EFFECTS: Update all state before external calls
        dispute.winner = _winner;
        dispute.resolvedAt = block.timestamp;
        dispute.isResolved = true;
        trade.state = TradeState.DisputeResolved;
        
        // Update arbitrator reputation via ArbitratorManager
        arbitratorManager.updateArbitratorReputation(dispute.arbitrator, true);
        
        // Record state transition (state change)
        _recordStateTransition(_tradeId, TradeState.EscrowDisputed, TradeState.DisputeResolved);
        
        // INTERACTIONS: Release funds from escrow with arbitrator fee
        escrowContract.release(
            _tradeId,
            trade.tokenAddress,
            _winner,
            dispute.arbitrator
        );
        
        // Update profiles (external calls)
        profileContract.updateActiveTrades(trade.buyer, -1);
        profileContract.updateActiveTrades(trade.seller, -1);
        profileContract.updateTradeCount(trade.buyer, _winner == trade.buyer);
        profileContract.updateTradeCount(trade.seller, _winner == trade.seller);
        
        emit DisputeResolvedEvent(_tradeId, _winner, dispute.arbitrator, block.timestamp);
        emit DisputeResolved(_tradeId, _winner);
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
    function calculateFees(uint256 _amount) public view returns (IEscrow.FeeDistribution memory) {
        return escrowContract.calculateFees(_amount, false);
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
     * @notice Authorize upgrade (UUPS pattern)
     * @dev SECURITY FIX: Added timelock requirement via Hub
     * @param newImplementation Address of the new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal view override {
        if (msg.sender != hub.getAdmin()) {
            revert UnauthorizedAccess(msg.sender);
        }
        // Timelock is enforced at the Hub level
        require(hub.isUpgradeAuthorized(address(this), newImplementation), "Upgrade not authorized or timelock not met");
    }

    /**
     * @notice Get contract version
     * @return Version string
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}