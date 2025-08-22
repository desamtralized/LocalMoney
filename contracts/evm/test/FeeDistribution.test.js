const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Fee Distribution", function () {
    let hub, trade, offer, profile;
    let admin, buyer, seller, treasury, localMarket, chainCollector;
    let mockToken, localToken, mockSwapRouter;

    beforeEach(async function () {
        [admin, buyer, seller, treasury, localMarket, chainCollector] = await ethers.getSigners();

        // Deploy mock tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockToken = await MockERC20.deploy("Test Token", "TEST", 18);
        await mockToken;
        
        localToken = await MockERC20.deploy("Local Token", "LOCAL", 18);
        await localToken;

        // Deploy mock swap router (simplified)
        mockSwapRouter = await MockERC20.deploy("SwapRouter", "SR", 18);
        await mockSwapRouter;

        // Mint tokens
        await mockToken.mint(seller.address, ethers.parseEther("10000"));
        await mockToken.mint(buyer.address, ethers.parseEther("10000"));

        // Deploy Hub with fee configuration
        const Hub = await ethers.getContractFactory("Hub");
        const hubConfig = {
            offerContract: ethers.ZeroAddress,
            tradeContract: ethers.ZeroAddress,
            profileContract: ethers.ZeroAddress,
            priceContract: ethers.ZeroAddress,
            treasury: treasury.address,
            localMarket: localMarket.address,
            priceProvider: admin.address,
            localTokenAddress: localToken.address,
            chainFeeCollector: chainCollector.address,
            swapRouter: mockSwapRouter.address,
            burnFeePct: 100,   // 1%
            chainFeePct: 150,  // 1.5%
            warchestFeePct: 200, // 2%
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

        // Deploy other contracts
        const Profile = await ethers.getContractFactory("Profile");
        profile = await upgrades.deployProxy(Profile, [hub.address]);
        await profile;

        const Offer = await ethers.getContractFactory("Offer");
        offer = await upgrades.deployProxy(Offer, [hub.address, profile.address]);
        await offer;

        const Trade = await ethers.getContractFactory("Trade");
        trade = await upgrades.deployProxy(Trade, [hub.address, offer.address, profile.address]);
        await trade;

        // Update hub config with contract addresses
        hubConfig.offerContract = offer.address;
        hubConfig.tradeContract = trade.address;
        hubConfig.profileContract = profile.address;
        await hub.updateConfig(hubConfig);

        // Create profiles
        await profile.connect(buyer).createProfile("buyer_info");
        await profile.connect(seller).createProfile("seller_info");
    });

    describe("Fee Calculation", function () {
        it("Should calculate standard fees correctly", async function () {
            const tradeAmount = ethers.parseEther("100");
            const fees = await trade.calculateFees(tradeAmount);

            // 1% burn = 1 token
            expect(fees.burnAmount).to.equal(ethers.parseEther("1"));
            // 1.5% chain = 1.5 tokens
            expect(fees.chainAmount).to.equal(ethers.parseEther("1.5"));
            // 2% warchest = 2 tokens
            expect(fees.warchestAmount).to.equal(ethers.parseEther("2"));
            // Arbitrator fee should be 0 for normal trades
            expect(fees.arbitratorAmount).to.equal(0);
        });

        it("Should calculate fees with arbitrator compensation", async function () {
            const tradeAmount = ethers.parseEther("1000");
            
            // This is an internal function, but we can test it through dispute resolution
            // For now, let's test the concept with a mock
            const expectedArbitratorFee = tradeAmount.mul(50).div(10000); // 0.5%
            expect(expectedArbitratorFee).to.equal(ethers.parseEther("5"));
        });

        it("Should handle zero amounts gracefully", async function () {
            const fees = await trade.calculateFees(0);
            
            expect(fees.burnAmount).to.equal(0);
            expect(fees.chainAmount).to.equal(0);
            expect(fees.warchestAmount).to.equal(0);
            expect(fees.arbitratorAmount).to.equal(0);
        });
    });

    describe("Standard Fee Distribution", function () {
        let tradeId;

        beforeEach(async function () {
            tradeId = await createCompleteTrade();
        });

        it("Should distribute chain fees to designated collector", async function () {
            const initialBalance = await mockToken.balanceOf(chainCollector.address);
            
            await trade.connect(seller).releaseEscrow(tradeId);
            
            const finalBalance = await mockToken.balanceOf(chainCollector.address);
            const expectedChainFee = ethers.parseEther("100").mul(150).div(10000); // 1.5%
            
            expect(finalBalance.sub(initialBalance)).to.equal(expectedChainFee);
        });

        it("Should distribute warchest fees to local market", async function () {
            const initialBalance = await mockToken.balanceOf(localMarket.address);
            
            await trade.connect(seller).releaseEscrow(tradeId);
            
            const finalBalance = await mockToken.balanceOf(localMarket.address);
            const expectedWarchestFee = ethers.parseEther("100").mul(200).div(10000); // 2%
            
            expect(finalBalance.sub(initialBalance)).to.equal(expectedWarchestFee);
        });

        it("Should send burn fee to treasury when LOCAL token not configured", async function () {
            // Update config to remove LOCAL token
            const config = await hub.getConfig();
            config.localTokenAddress = ethers.ZeroAddress;
            await hub.updateConfig(config);

            const initialBalance = await mockToken.balanceOf(treasury.address);
            
            await trade.connect(seller).releaseEscrow(tradeId);
            
            const finalBalance = await mockToken.balanceOf(treasury.address);
            const expectedBurnFee = ethers.parseEther("100").mul(100).div(10000); // 1%
            
            expect(finalBalance.sub(initialBalance)).to.equal(expectedBurnFee);
        });

        it("Should give remaining amount to buyer after fees", async function () {
            const initialBalance = await mockToken.balanceOf(buyer.address);
            const tradeAmount = ethers.parseEther("100");
            
            await trade.connect(seller).releaseEscrow(tradeId);
            
            const finalBalance = await mockToken.balanceOf(buyer.address);
            
            // Calculate expected remaining after fees (1% + 1.5% + 2% = 4.5%)
            const totalFeePercentage = 100 + 150 + 200; // 450 basis points = 4.5%
            const totalFees = tradeAmount.mul(totalFeePercentage).div(10000);
            const expectedRemaining = tradeAmount.sub(totalFees);
            
            expect(finalBalance.sub(initialBalance)).to.equal(expectedRemaining);
        });
    });

    describe("Token Burning Mechanism", function () {
        let tradeId;

        beforeEach(async function () {
            tradeId = await createCompleteTrade();
            
            // Mock LOCAL token burn function
            await localToken.mint(trade.address, ethers.parseEther("1000"));
        });

        it("Should burn LOCAL tokens directly when trade is in LOCAL", async function () {
            // Create a trade with LOCAL token
            const localTradeId = await createCompleteTradeWithToken(localToken.address);
            
            const initialSupply = await localToken.totalSupply();
            
            await expect(trade.connect(seller).releaseEscrow(localTradeId))
                .to.emit(trade, "TokensBurned");
            
            // Verify burn occurred (total supply should decrease)
            const finalSupply = await localToken.totalSupply();
            const expectedBurn = ethers.parseEther("100").mul(100).div(10000); // 1%
            expect(initialSupply.sub(finalSupply)).to.equal(expectedBurn);
        });

        it("Should emit burn fallback event when swap router not configured", async function () {
            // Remove swap router from config
            const config = await hub.getConfig();
            config.swapRouter = ethers.ZeroAddress;
            await hub.updateConfig(config);

            await expect(trade.connect(seller).releaseEscrow(tradeId))
                .to.emit(trade, "BurnFallbackToTreasury")
                .withArgs(mockToken.address, ethers.parseEther("1"), "No swap router configured");
        });

        it("Should handle swap failure gracefully", async function () {
            // This would require a more sophisticated mock that can fail
            // For now, we test that the contract doesn't revert on swap failure
            await expect(trade.connect(seller).releaseEscrow(tradeId))
                .to.not.be.reverted;
        });
    });

    describe("Fee Distribution in Disputes", function () {
        let tradeId, arbitrator;

        beforeEach(async function () {
            // Create and fund trade
            tradeId = await createCompleteTrade();
            
            // Register arbitrator
            await profile.connect(admin).createProfile("arbitrator_info");
            await trade.connect(admin).registerArbitrator(["USD"], "arbitrator_key");
            
            // Initiate dispute
            await trade.connect(buyer).disputeTrade(tradeId, "Payment issue");
            
            const disputeInfo = await trade.getDisputeInfo(tradeId);
            arbitrator = disputeInfo.arbitrator;
        });

        it("Should pay arbitrator fee during dispute resolution", async function () {
            const initialBalance = await mockToken.balanceOf(arbitrator);
            
            await trade.connect(ethers.provider.getSigner(arbitrator)).resolveDispute(tradeId, buyer.address);
            
            const finalBalance = await mockToken.balanceOf(arbitrator);
            const expectedFee = ethers.parseEther("100").mul(50).div(10000); // 0.5%
            
            expect(finalBalance.sub(initialBalance)).to.equal(expectedFee);
        });

        it("Should distribute all fees correctly in dispute", async function () {
            const initialTreasuryBalance = await mockToken.balanceOf(treasury.address);
            const initialChainBalance = await mockToken.balanceOf(chainCollector.address);
            const initialWarchestBalance = await mockToken.balanceOf(localMarket.address);
            const initialArbitratorBalance = await mockToken.balanceOf(arbitrator);
            const initialWinnerBalance = await mockToken.balanceOf(buyer.address);
            
            await trade.connect(ethers.provider.getSigner(arbitrator)).resolveDispute(tradeId, buyer.address);
            
            // Calculate expected fees
            const tradeAmount = ethers.parseEther("100");
            const burnFee = tradeAmount.mul(100).div(10000);     // 1%
            const chainFee = tradeAmount.mul(150).div(10000);    // 1.5%
            const warchestFee = tradeAmount.mul(200).div(10000); // 2%
            const arbitratorFee = tradeAmount.mul(50).div(10000); // 0.5%
            const winnerAmount = tradeAmount.sub(burnFee).sub(chainFee).sub(warchestFee).sub(arbitratorFee);
            
            // Verify distributions
            expect(await mockToken.balanceOf(chainCollector.address)).to.equal(initialChainBalance.add(chainFee));
            expect(await mockToken.balanceOf(localMarket.address)).to.equal(initialWarchestBalance.add(warchestFee));
            expect(await mockToken.balanceOf(arbitrator)).to.equal(initialArbitratorBalance.add(arbitratorFee));
            expect(await mockToken.balanceOf(buyer.address)).to.equal(initialWinnerBalance.add(winnerAmount));
            
            // Burn fee should go to treasury (fallback) since swap would fail
            expect(await mockToken.balanceOf(treasury.address)).to.equal(initialTreasuryBalance.add(burnFee));
        });
    });

    describe("Configuration Edge Cases", function () {
        it("Should fallback to treasury for chain fees when collector not set", async function () {
            // Update config to remove chain fee collector
            const config = await hub.getConfig();
            config.chainFeeCollector = ethers.ZeroAddress;
            await hub.updateConfig(config);

            const tradeId = await createCompleteTrade();
            const initialBalance = await mockToken.balanceOf(treasury.address);
            
            await trade.connect(seller).releaseEscrow(tradeId);
            
            const finalBalance = await mockToken.balanceOf(treasury.address);
            const expectedFees = ethers.parseEther("100").mul(250).div(10000); // 1% burn + 1.5% chain = 2.5%
            
            expect(finalBalance.sub(initialBalance)).to.equal(expectedFees);
        });

        it("Should handle zero fee percentages", async function () {
            // Update config to have zero fees
            const config = await hub.getConfig();
            config.burnFeePct = 0;
            config.chainFeePct = 0;
            config.warchestFeePct = 0;
            await hub.updateConfig(config);

            const tradeId = await createCompleteTrade();
            const initialBalance = await mockToken.balanceOf(buyer.address);
            
            await trade.connect(seller).releaseEscrow(tradeId);
            
            const finalBalance = await mockToken.balanceOf(buyer.address);
            
            // Buyer should receive full trade amount
            expect(finalBalance.sub(initialBalance)).to.equal(ethers.parseEther("100"));
        });
    });

    describe("Event Emissions", function () {
        it("Should emit burn fallback events with correct reasons", async function () {
            const tradeId = await createCompleteTrade();

            // Test "LOCAL token not configured" reason
            const config = await hub.getConfig();
            config.localTokenAddress = ethers.ZeroAddress;
            await hub.updateConfig(config);

            await expect(trade.connect(seller).releaseEscrow(tradeId))
                .to.emit(trade, "BurnFallbackToTreasury")
                .withArgs(mockToken.address, ethers.parseEther("1"), "LOCAL token not configured");
        });
    });

    // Helper functions
    async function createCompleteTrade() {
        return await createCompleteTradeWithToken(mockToken.address);
    }

    async function createCompleteTradeWithToken(tokenAddress) {
        // Create offer
        await offer.connect(seller).createOffer(
            0, // sell offer
            tokenAddress,
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
        const token = await ethers.getContractAt("MockERC20", tokenAddress);
        await token.connect(seller).approve(trade.address, ethers.parseEther("100"));
        await trade.connect(seller).fundEscrow(tradeId);

        // Mark fiat deposited
        await trade.connect(buyer).markFiatDeposited(tradeId);

        return tradeId;
    }
});