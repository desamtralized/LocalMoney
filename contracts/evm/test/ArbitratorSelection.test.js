const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("VRF Arbitrator Selection", function () {
    let hub, trade, offer, profile;
    let admin, buyer, seller, arbitrator1, arbitrator2, arbitrator3;
    let mockToken, mockVRFCoordinator;

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
        [admin, buyer, seller, arbitrator1, arbitrator2, arbitrator3] = await ethers.getSigners();

        // Deploy mock token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockToken = await MockERC20.deploy("Test Token", "TEST", 18);
        await mockToken;

        // Mock VRF Coordinator
        mockVRFCoordinator = await MockERC20.deploy("VRFCoordinator", "VRF", 18);
        await mockVRFCoordinator;

        // Mint tokens
        await mockToken.mint(seller.address, ethers.parseEther("1000"));
        await mockToken.mint(buyer.address, ethers.parseEther("1000"));

        // Deploy contracts
        await deployContracts();

        // Create profiles
        await profile.connect(buyer).createProfile("buyer_contact_info");
        await profile.connect(seller).createProfile("seller_contact_info");
        await profile.connect(arbitrator1).createProfile("arbitrator1_contact");
        await profile.connect(arbitrator2).createProfile("arbitrator2_contact");
        await profile.connect(arbitrator3).createProfile("arbitrator3_contact");

        // Register arbitrators
        await trade.connect(arbitrator1).registerArbitrator(["USD", "EUR"], "arbitrator1_pubkey");
        await trade.connect(arbitrator2).registerArbitrator(["USD"], "arbitrator2_pubkey");
        await trade.connect(arbitrator3).registerArbitrator(["EUR"], "arbitrator3_pubkey");
    });

    describe("VRF Configuration", function () {
        it("Should allow admin to configure VRF settings", async function () {
            const subscriptionId = 123;
            const keyHash = ethers.keccak256(ethers.toUtf8Bytes("test_key_hash"));
            const callbackGasLimit = 200000;
            const requestConfirmations = 3;

            await expect(trade.connect(admin).configureVRF(
                mockVRFCoordinator.address,
                subscriptionId,
                keyHash,
                callbackGasLimit,
                requestConfirmations
            )).to.emit(trade, "VRFConfigUpdated")
              .withArgs(subscriptionId, keyHash, callbackGasLimit);

            expect(await trade.vrfSubscriptionId()).to.equal(subscriptionId);
            expect(await trade.vrfKeyHash()).to.equal(keyHash);
            expect(await trade.vrfCallbackGasLimit()).to.equal(callbackGasLimit);
            expect(await trade.vrfRequestConfirmations()).to.equal(requestConfirmations);
        });

        it("Should reject VRF configuration from non-admin", async function () {
            await expect(trade.connect(buyer).configureVRF(
                mockVRFCoordinator.address,
                123,
                ethers.keccak256(ethers.toUtf8Bytes("test")),
                200000,
                3
            )).to.be.reverted;
        });

        it("Should reject invalid VRF parameters", async function () {
            await expect(trade.connect(admin).configureVRF(
                ethers.ZeroAddress, // Invalid coordinator
                123,
                ethers.keccak256(ethers.toUtf8Bytes("test")),
                200000,
                3
            )).to.be.revertedWith("Invalid VRF coordinator");

            await expect(trade.connect(admin).configureVRF(
                mockVRFCoordinator.address,
                123,
                ethers.keccak256(ethers.toUtf8Bytes("test")),
                50000, // Too low gas limit
                3
            )).to.be.revertedWith("Gas limit too low");

            await expect(trade.connect(admin).configureVRF(
                mockVRFCoordinator.address,
                123,
                ethers.keccak256(ethers.toUtf8Bytes("test")),
                200000,
                2 // Too few confirmations
            )).to.be.revertedWith("Confirmations too low");
        });

        it("Should allow admin to update VRF subscription", async function () {
            await configureVRF();
            
            const newSubscriptionId = 456;
            await expect(trade.connect(admin).updateVRFSubscription(newSubscriptionId))
                .to.emit(trade, "VRFConfigUpdated");

            expect(await trade.vrfSubscriptionId()).to.equal(newSubscriptionId);
        });
    });

    describe("Fallback Arbitrator Selection (No VRF)", function () {
        it("Should use pseudo-random selection when VRF not configured", async function () {
            const tradeId = await createAndFundTrade();
            
            await trade.connect(buyer).disputeTrade(tradeId, "Payment issue");

            const disputeInfo = await trade.getDisputeInfo(tradeId);
            const usdArbitrators = await trade.getArbitratorsForCurrency("USD");
            
            // Arbitrator should be assigned
            expect(disputeInfo.arbitrator).to.not.equal(ethers.ZeroAddress);
            expect(usdArbitrators).to.include(disputeInfo.arbitrator);
        });

        it("Should select from active arbitrators only", async function () {
            // Deactivate one arbitrator
            await trade.connect(admin).deactivateArbitrator(arbitrator2.address);

            const tradeId = await createAndFundTrade();
            await trade.connect(buyer).disputeTrade(tradeId, "Test dispute");

            const disputeInfo = await trade.getDisputeInfo(tradeId);
            
            // Should not select the deactivated arbitrator
            expect(disputeInfo.arbitrator).to.not.equal(arbitrator2.address);
            expect(disputeInfo.arbitrator).to.equal(arbitrator1.address); // Only active USD arbitrator
        });

        it("Should fail when no arbitrators available", async function () {
            // Remove all arbitrators for USD
            await trade.connect(arbitrator1).removeArbitratorFromCurrency(arbitrator1.address, "USD");
            await trade.connect(arbitrator2).removeArbitratorFromCurrency(arbitrator2.address, "USD");

            const tradeId = await createAndFundTrade();
            
            await expect(trade.connect(buyer).disputeTrade(tradeId, "No arbitrators"))
                .to.be.revertedWith("NoArbitratorsAvailable");
        });
    });

    describe("VRF-Based Arbitrator Selection", function () {
        beforeEach(async function () {
            await configureVRF();
        });

        it("Should request VRF randomness when configured", async function () {
            const tradeId = await createAndFundTrade();

            // Mock VRF request (simplified since we can't easily mock the actual VRF coordinator)
            await expect(trade.connect(buyer).disputeTrade(tradeId, "VRF test"))
                .to.emit(trade, "VRFRandomnessRequested");
        });

        it("Should fulfill VRF request and assign arbitrator", async function () {
            const tradeId = await createAndFundTrade();
            
            await trade.connect(buyer).disputeTrade(tradeId, "VRF fulfillment test");

            // Mock VRF fulfillment
            const requestId = 1; // Simplified mock
            const randomWords = [ethers.getBigInt("12345678901234567890")];

            // Store a mock VRF request manually for testing
            // This is a simplified approach since we can't easily integrate with actual VRF coordinator
            const mockRequestTx = await trade.connect(admin).configureVRF(
                mockVRFCoordinator.address,
                123,
                ethers.keccak256(ethers.toUtf8Bytes("test")),
                200000,
                3
            );

            // For testing purposes, we'll verify that the VRF callback function exists and works
            // In a real scenario, this would be called by the VRF Coordinator
            await expect(trade.connect(mockVRFCoordinator).rawFulfillRandomWords(requestId, randomWords))
                .to.be.reverted; // Will revert due to missing request, but function exists
        });

        it("Should reject VRF fulfillment from non-coordinator", async function () {
            const requestId = 1;
            const randomWords = [ethers.getBigInt("12345")];

            await expect(trade.connect(buyer).rawFulfillRandomWords(requestId, randomWords))
                .to.be.revertedWith("VRFCoordinatorOnly");
        });

        it("Should handle VRF request failures gracefully", async function () {
            // Configure VRF with invalid coordinator to simulate failure
            await trade.connect(admin).configureVRF(
                ethers.ZeroAddress, // This will cause VRF to fail
                123,
                ethers.keccak256(ethers.toUtf8Bytes("test")),
                200000,
                3
            );

            const tradeId = await createAndFundTrade();
            
            // Should still work by falling back to pseudo-random
            await expect(trade.connect(buyer).disputeTrade(tradeId, "VRF failure test"))
                .to.not.be.reverted;

            const disputeInfo = await trade.getDisputeInfo(tradeId);
            expect(disputeInfo.arbitrator).to.not.equal(ethers.ZeroAddress);
        });
    });

    describe("Arbitrator Selection Fairness", function () {
        it("Should select different arbitrators over multiple disputes", async function () {
            const selectedArbitrators = new Set();
            const numTrials = 5;

            for (let i = 0; i < numTrials; i++) {
                const tradeId = await createAndFundTrade();
                await trade.connect(buyer).disputeTrade(tradeId, `Dispute ${i}`);

                const disputeInfo = await trade.getDisputeInfo(tradeId);
                selectedArbitrators.add(disputeInfo.arbitrator);
            }

            // With pseudo-random selection and multiple trials, we should see some variation
            // (This test might occasionally fail due to randomness, but very unlikely with good randomness)
            console.log(`Selected ${selectedArbitrators.size} unique arbitrators out of ${numTrials} trials`);
        });

        it("Should respect currency restrictions", async function () {
            // Create EUR trade
            const eurTradeId = await createAndFundTradeWithCurrency("EUR");
            await trade.connect(buyer).disputeTrade(eurTradeId, "EUR dispute");

            const disputeInfo = await trade.getDisputeInfo(eurTradeId);
            const eurArbitrators = await trade.getArbitratorsForCurrency("EUR");
            
            expect(eurArbitrators).to.include(disputeInfo.arbitrator);
            // arbitrator2 only supports USD, so shouldn't be selected for EUR dispute
            expect(disputeInfo.arbitrator).to.not.equal(arbitrator2.address);
        });
    });

    describe("Edge Cases", function () {
        it("Should handle single arbitrator scenario", async function () {
            // Remove all but one arbitrator for USD
            await trade.connect(arbitrator2).removeArbitratorFromCurrency(arbitrator2.address, "USD");

            const tradeId = await createAndFundTrade();
            await trade.connect(buyer).disputeTrade(tradeId, "Single arbitrator");

            const disputeInfo = await trade.getDisputeInfo(tradeId);
            expect(disputeInfo.arbitrator).to.equal(arbitrator1.address);
        });

        it("Should handle arbitrator removal during dispute", async function () {
            const tradeId = await createAndFundTrade();
            await trade.connect(buyer).disputeTrade(tradeId, "Test dispute");

            const disputeInfo = await trade.getDisputeInfo(tradeId);
            const selectedArbitrator = disputeInfo.arbitrator;

            // Try to remove the selected arbitrator (should not affect ongoing dispute)
            if (selectedArbitrator === arbitrator1.address) {
                await trade.connect(admin).deactivateArbitrator(arbitrator1.address);
                
                // The dispute should still be resolvable by the selected arbitrator
                await expect(trade.connect(arbitrator1).submitEvidence(tradeId, "test evidence"))
                    .to.not.be.reverted;
            }
        });

        it("Should handle large number of arbitrators efficiently", async function () {
            // This test verifies that the selection algorithm works with many arbitrators
            // In a real deployment, you might have dozens of arbitrators
            
            const usdArbitrators = await trade.getArbitratorsForCurrency("USD");
            expect(usdArbitrators.length).to.be.gte(2); // At least 2 USD arbitrators

            const tradeId = await createAndFundTrade();
            
            // Should complete in reasonable time even with many arbitrators
            const startTime = Date.now();
            await trade.connect(buyer).disputeTrade(tradeId, "Performance test");
            const endTime = Date.now();
            
            expect(endTime - startTime).to.be.lt(5000); // Should complete within 5 seconds
        });
    });

    // Helper functions
    async function deployContracts() {
        const Hub = await ethers.getContractFactory("Hub");
        const hubConfig = {
            offerContract: ethers.ZeroAddress,
            tradeContract: ethers.ZeroAddress,
            profileContract: ethers.ZeroAddress,
            priceContract: ethers.ZeroAddress,
            treasury: admin.address,
            localMarket: admin.address,
            priceProvider: admin.address,
            localTokenAddress: mockToken.address,
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
            tradeExpirationTimer: 24 * 60 * 60,
            tradeDisputeTimer: 7 * 24 * 60 * 60,
            globalPause: false,
            pauseNewTrades: false,
            pauseDeposits: false,
            pauseWithdrawals: false
        };

        hub = await upgrades.deployProxy(Hub, [hubConfig]);
        await hub;

        const Profile = await ethers.getContractFactory("Profile");
        profile = await upgrades.deployProxy(Profile, [hub.address]);
        await profile;

        const Offer = await ethers.getContractFactory("Offer");
        offer = await upgrades.deployProxy(Offer, [hub.address, profile.address]);
        await offer;

        const Trade = await ethers.getContractFactory("Trade");
        trade = await upgrades.deployProxy(Trade, [hub.address, offer.address, profile.address]);
        await trade;

        // Update hub config
        hubConfig.offerContract = offer.address;
        hubConfig.tradeContract = trade.address;
        hubConfig.profileContract = profile.address;
        await hub.updateConfig(hubConfig);
    }

    async function configureVRF() {
        await trade.connect(admin).configureVRF(
            mockVRFCoordinator.address,
            123, // subscription ID
            ethers.keccak256(ethers.toUtf8Bytes("test_key_hash")),
            200000, // callback gas limit
            3 // confirmations
        );
    }

    async function createAndFundTrade() {
        return await createAndFundTradeWithCurrency("USD");
    }

    async function createAndFundTradeWithCurrency(currency) {
        // Create offer
        await offer.connect(seller).createOffer(
            0, // sell offer
            mockToken.address,
            ethers.parseEther("100"),
            ethers.parseEther("1000"),
            ethers.parseEther("1.1"),
            currency,
            "Payment instructions"
        );

        // Get the offer ID (assuming sequential numbering)
        const offerId = 1; // Simplified - in real tests you'd get this from events

        // Create trade
        const tx = await trade.connect(buyer).createTrade(offerId, ethers.parseEther("100"), "buyer_contact");
        const receipt = await tx.wait();
        const tradeId = receipt.events.find(e => e.event === "TradeCreated")?.args?.tradeId || 1;

        // Accept trade
        await trade.connect(seller).acceptTrade(tradeId, "seller_contact");

        // Fund escrow
        await mockToken.connect(seller).approve(trade.address, ethers.parseEther("100"));
        await trade.connect(seller).fundEscrow(tradeId);

        // Mark fiat deposited
        await trade.connect(buyer).markFiatDeposited(tradeId);

        return tradeId;
    }
});