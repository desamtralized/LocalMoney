const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Dispute Resolution", function () {
    let hub, trade, offer, profile;
    let admin, buyer, seller, arbitrator1, arbitrator2;
    let mockToken;

    const tradeStates = {
        RequestCreated: 0,
        RequestAccepted: 1,
        EscrowFunded: 2,
        FiatDeposited: 3,
        EscrowReleased: 4,
        EscrowCancelled: 5,
        EscrowRefunded: 6,
        EscrowDisputed: 7,
        DisputeResolved: 8
    };

    beforeEach(async function () {
        [admin, buyer, seller, arbitrator1, arbitrator2] = await ethers.getSigners();

        // Deploy mock token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockToken = await MockERC20.deploy("Test Token", "TEST", 18);
        await mockToken.waitForDeployment();

        // Mint tokens to participants
        await mockToken.mint(seller.address, ethers.parseEther("1000"));
        await mockToken.mint(buyer.address, ethers.parseEther("1000"));

        // Deploy Hub
        const Hub = await ethers.getContractFactory("Hub");
        const hubConfig = {
            offerContract: ethers.ZeroAddress,
            tradeContract: ethers.ZeroAddress,
            profileContract: ethers.ZeroAddress,
            priceContract: ethers.ZeroAddress,
            treasury: admin.address,
            localMarket: admin.address,
            priceProvider: admin.address,
            localTokenAddress: await mockToken.getAddress(),
            chainFeeCollector: admin.address,
            swapRouter: ethers.ZeroAddress,
            burnFeePct: 100,   // 1%
            chainFeePct: 100,  // 1%
            warchestFeePct: 100, // 1%
            conversionFeePct: 100, // 1%
            minTradeAmount: ethers.parseEther("10"),
            maxTradeAmount: ethers.parseEther("10000"),
            maxActiveOffers: 10,
            maxActiveTrades: 5,
            tradeExpirationTimer: 24 * 60 * 60, // 24 hours
            tradeDisputeTimer: 7 * 24 * 60 * 60, // 7 days
            globalPause: false,
            pauseNewTrades: false,
            pauseDeposits: false,
            pauseWithdrawals: false
        };

        hub = await upgrades.deployProxy(Hub, [hubConfig]);

        // Deploy Profile
        const Profile = await ethers.getContractFactory("Profile");
        profile = await upgrades.deployProxy(Profile, [await hub.getAddress()]);

        // Deploy Offer
        const Offer = await ethers.getContractFactory("Offer");
        offer = await upgrades.deployProxy(Offer, [await hub.getAddress(), await profile.getAddress()]);

        // Deploy Trade
        const Trade = await ethers.getContractFactory("Trade");
        trade = await upgrades.deployProxy(Trade, [await hub.getAddress(), await offer.getAddress(), await profile.getAddress()]);

        // Update hub config with contract addresses
        hubConfig.offerContract = await offer.getAddress();
        hubConfig.tradeContract = await trade.getAddress();
        hubConfig.profileContract = await profile.getAddress();
        await hub.updateConfig(hubConfig);

        // Create profiles
        await profile.connect(buyer).createProfile("buyer_contact_info");
        await profile.connect(seller).createProfile("seller_contact_info");
        await profile.connect(arbitrator1).createProfile("arbitrator1_contact");
        await profile.connect(arbitrator2).createProfile("arbitrator2_contact");

        // Register arbitrators
        await trade.connect(arbitrator1).registerArbitrator(["USD", "EUR"], "arbitrator1_pubkey");
        await trade.connect(arbitrator2).registerArbitrator(["USD"], "arbitrator2_pubkey");
    });

    describe("Arbitrator Registration", function () {
        it("Should register arbitrators correctly", async function () {
            const arbitratorInfo = await trade.getArbitratorInfo(arbitrator1.address);
            expect(arbitratorInfo.isActive).to.be.true;
            expect(arbitratorInfo.supportedFiats.length).to.equal(2);
            expect(arbitratorInfo.reputationScore).to.equal(5000); // 50% initial score
        });

        it("Should prevent duplicate arbitrator registration", async function () {
            await expect(trade.connect(arbitrator1).registerArbitrator(["GBP"], "new_key"))
                .to.be.revertedWith("ArbitratorAlreadyRegistered");
        });

        it("Should list arbitrators by currency", async function () {
            const usdArbitrators = await trade.getArbitratorsForCurrency("USD");
            expect(usdArbitrators).to.include(arbitrator1.address);
            expect(usdArbitrators).to.include(arbitrator2.address);

            const eurArbitrators = await trade.getArbitratorsForCurrency("EUR");
            expect(eurArbitrators).to.include(arbitrator1.address);
            expect(eurArbitrators).to.not.include(arbitrator2.address);
        });
    });

    describe("Dispute Initiation", function () {
        let tradeId;

        beforeEach(async function () {
            // Create and fund a trade
            tradeId = await createAndFundTrade();
        });

        it("Should allow dispute initiation by trade parties", async function () {
            await expect(trade.connect(buyer).disputeTrade(tradeId, "Seller not responding"))
                .to.emit(trade, "DisputeInitiated")
                .withArgs(tradeId, buyer.address, "Seller not responding", await getBlockTimestamp());

            const tradeData = await trade.getTrade(tradeId);
            expect(tradeData.state).to.equal(tradeStates.EscrowDisputed);

            const disputeInfo = await trade.getDisputeInfo(tradeId);
            expect(disputeInfo.initiator).to.equal(buyer.address);
            expect(disputeInfo.reason).to.equal("Seller not responding");
        });

        it("Should assign an arbitrator automatically", async function () {
            await trade.connect(buyer).disputeTrade(tradeId, "Payment issue");

            const disputeInfo = await trade.getDisputeInfo(tradeId);
            expect(disputeInfo.arbitrator).to.not.equal(ethers.ZeroAddress);

            // Arbitrator should be one of the registered arbitrators for USD
            const usdArbitrators = await trade.getArbitratorsForCurrency("USD");
            expect(usdArbitrators).to.include(disputeInfo.arbitrator);
        });

        it("Should reject dispute from non-trade parties", async function () {
            await expect(trade.connect(arbitrator1).disputeTrade(tradeId, "Unauthorized"))
                .to.be.revertedWith("InvalidDisputer");
        });

        it("Should reject dispute in wrong state", async function () {
            // Try to dispute before fiat is deposited
            const wrongStateTradeId = await createAcceptedTrade();
            
            await expect(trade.connect(buyer).disputeTrade(wrongStateTradeId, "Too early"))
                .to.be.revertedWith("InvalidStateTransition");
        });

        it("Should reject duplicate dispute", async function () {
            await trade.connect(buyer).disputeTrade(tradeId, "First dispute");

            await expect(trade.connect(seller).disputeTrade(tradeId, "Second dispute"))
                .to.be.revertedWith("DisputeAlreadyExists");
        });
    });

    describe("Evidence Submission", function () {
        let tradeId, disputeArbitrator;

        beforeEach(async function () {
            tradeId = await createAndFundTrade();
            await trade.connect(buyer).disputeTrade(tradeId, "Payment issue");
            
            const disputeInfo = await trade.getDisputeInfo(tradeId);
            disputeArbitrator = disputeInfo.arbitrator;
        });

        it("Should allow evidence submission by trade parties", async function () {
            const buyerEvidence = "Here is my payment proof: tx_hash_123";
            
            await expect(trade.connect(buyer).submitEvidence(tradeId, buyerEvidence))
                .to.emit(trade, "EvidenceSubmitted")
                .withArgs(tradeId, buyer.address, buyerEvidence, await getBlockTimestamp());

            const disputeInfo = await trade.getDisputeInfo(tradeId);
            expect(disputeInfo.buyerEvidence).to.equal(buyerEvidence);
        });

        it("Should allow both parties to submit evidence", async function () {
            const buyerEvidence = "Buyer evidence";
            const sellerEvidence = "Seller evidence";

            await trade.connect(buyer).submitEvidence(tradeId, buyerEvidence);
            await trade.connect(seller).submitEvidence(tradeId, sellerEvidence);

            const disputeInfo = await trade.getDisputeInfo(tradeId);
            expect(disputeInfo.buyerEvidence).to.equal(buyerEvidence);
            expect(disputeInfo.sellerEvidence).to.equal(sellerEvidence);
        });

        it("Should reject evidence from non-parties", async function () {
            await expect(trade.connect(arbitrator1).submitEvidence(tradeId, "Unauthorized evidence"))
                .to.be.revertedWith("InvalidDisputer");
        });
    });

    describe("Dispute Resolution", function () {
        let tradeId, disputeArbitrator;

        beforeEach(async function () {
            tradeId = await createAndFundTrade();
            await trade.connect(buyer).disputeTrade(tradeId, "Payment issue");
            
            const disputeInfo = await trade.getDisputeInfo(tradeId);
            disputeArbitrator = disputeInfo.arbitrator;

            // Submit evidence
            await trade.connect(buyer).submitEvidence(tradeId, "Buyer evidence");
            await trade.connect(seller).submitEvidence(tradeId, "Seller evidence");
        });

        it("Should allow arbitrator to resolve dispute", async function () {
            // Arbitrator decides in favor of buyer
            await expect(trade.connect(ethers.provider.getSigner(disputeArbitrator)).resolveDispute(tradeId, buyer.address))
                .to.emit(trade, "DisputeResolvedEvent")
                .withArgs(tradeId, buyer.address, disputeArbitrator, await getBlockTimestamp());

            const tradeData = await trade.getTrade(tradeId);
            expect(tradeData.state).to.equal(tradeStates.DisputeResolved);

            const disputeInfo = await trade.getDisputeInfo(tradeId);
            expect(disputeInfo.winner).to.equal(buyer.address);
            expect(disputeInfo.isResolved).to.be.true;
        });

        it("Should distribute funds correctly after resolution", async function () {
            const initialBuyerBalance = await mockToken.balanceOf(buyer.address);
            const escrowAmount = ethers.parseEther("100");

            // Resolve in favor of buyer
            await trade.connect(ethers.provider.getSigner(disputeArbitrator)).resolveDispute(tradeId, buyer.address);

            const finalBuyerBalance = await mockToken.balanceOf(buyer.address);
            // Buyer should receive the escrowed amount minus fees
            expect(finalBuyerBalance).to.be.gt(initialBuyerBalance);
        });

        it("Should pay arbitrator fee", async function () {
            const initialArbitratorBalance = await mockToken.balanceOf(disputeArbitrator);

            await trade.connect(ethers.provider.getSigner(disputeArbitrator)).resolveDispute(tradeId, buyer.address);

            const finalArbitratorBalance = await mockToken.balanceOf(disputeArbitrator);
            // Arbitrator should receive their fee (0.5% of trade amount)
            expect(finalArbitratorBalance).to.be.gt(initialArbitratorBalance);
        });

        it("Should reject resolution from non-arbitrator", async function () {
            await expect(trade.connect(buyer).resolveDispute(tradeId, buyer.address))
                .to.be.revertedWith("OnlyArbitratorCanResolve");
        });

        it("Should reject invalid winner", async function () {
            const randomAddress = ethers.getAddress("0x1234567890123456789012345678901234567890");
            
            await expect(trade.connect(ethers.provider.getSigner(disputeArbitrator)).resolveDispute(tradeId, randomAddress))
                .to.be.revertedWith("UnauthorizedAccess");
        });

        it("Should update arbitrator reputation after resolution", async function () {
            const initialInfo = await trade.getArbitratorInfo(disputeArbitrator);
            
            await trade.connect(ethers.provider.getSigner(disputeArbitrator)).resolveDispute(tradeId, buyer.address);

            const finalInfo = await trade.getArbitratorInfo(disputeArbitrator);
            expect(finalInfo.disputesHandled).to.equal(initialInfo.disputesHandled.add(1));
            expect(finalInfo.disputesWon).to.equal(initialInfo.disputesWon.add(1));
        });
    });

    describe("Arbitrator Management", function () {
        it("Should allow arbitrator to remove themselves from currency", async function () {
            await expect(trade.connect(arbitrator1).removeArbitratorFromCurrency(arbitrator1.address, "EUR"))
                .to.emit(trade, "ArbitratorRemoved")
                .withArgs(arbitrator1.address, "EUR");

            const eurArbitrators = await trade.getArbitratorsForCurrency("EUR");
            expect(eurArbitrators).to.not.include(arbitrator1.address);
        });

        it("Should allow admin to deactivate arbitrator", async function () {
            await trade.connect(admin).deactivateArbitrator(arbitrator1.address);

            const arbitratorInfo = await trade.getArbitratorInfo(arbitrator1.address);
            expect(arbitratorInfo.isActive).to.be.false;
        });

        it("Should not assign deactivated arbitrators", async function () {
            // Deactivate one arbitrator
            await trade.connect(admin).deactivateArbitrator(arbitrator2.address);

            const tradeId = await createAndFundTrade();
            await trade.connect(buyer).disputeTrade(tradeId, "Test dispute");

            const disputeInfo = await trade.getDisputeInfo(tradeId);
            // Should assign arbitrator1 (the only active one for USD)
            expect(disputeInfo.arbitrator).to.equal(arbitrator1.address);
        });
    });

    // Helper functions
    async function createAndFundTrade() {
        // Create offer
        await offer.connect(seller).createOffer(
            0, // sell offer
            await mockToken.getAddress(),
            ethers.parseEther("100"),
            ethers.parseEther("1000"),
            ethers.parseEther("1.1"), // rate
            "USD",
            "Payment instructions"
        );

        // Create trade
        const tx = await trade.connect(buyer).createTrade(1, ethers.parseEther("100"), "buyer_contact");
        const receipt = await tx.wait();
        const tradeId = receipt.events.find(e => e.event === "TradeCreated").args.tradeId;

        // Accept trade
        await trade.connect(seller).acceptTrade(tradeId, "seller_contact");

        // Fund escrow
        await mockToken.connect(seller).approve(await trade.getAddress(), ethers.parseEther("100"));
        await trade.connect(seller).fundEscrow(tradeId);

        // Mark fiat deposited
        await trade.connect(buyer).markFiatDeposited(tradeId);

        return tradeId;
    }

    async function createAcceptedTrade() {
        await offer.connect(seller).createOffer(
            0, // sell offer
            await mockToken.getAddress(),
            ethers.parseEther("100"),
            ethers.parseEther("1000"),
            ethers.parseEther("1.1"),
            "USD",
            "Payment instructions"
        );

        const tx = await trade.connect(buyer).createTrade(2, ethers.parseEther("100"), "buyer_contact");
        const receipt = await tx.wait();
        const tradeId = receipt.events.find(e => e.event === "TradeCreated").args.tradeId;

        await trade.connect(seller).acceptTrade(tradeId, "seller_contact");

        return tradeId;
    }

    async function getBlockTimestamp() {
        const blockNumber = await ethers.provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        return block.timestamp;
    }
});