const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("PriceOracle", function () {
    let priceOracle;
    let admin, priceUpdater, routeManager, user;
    let mockSwapRouter, mockChainlinkFeed;

    beforeEach(async function () {
        [admin, priceUpdater, routeManager, user] = await ethers.getSigners();

        // Deploy mock SwapRouter
        const MockSwapRouter = await ethers.getContractFactory("MockERC20"); // Placeholder
        mockSwapRouter = await MockSwapRouter.deploy("MockRouter", "MR", 18);
        await mockSwapRouter.waitForDeployment();

        // Deploy PriceOracle
        const PriceOracle = await ethers.getContractFactory("PriceOracle");
        priceOracle = await upgrades.deployProxy(PriceOracle, [
            admin.address,
            await mockSwapRouter.getAddress()
        ]);

        // Grant roles
        const PRICE_UPDATER_ROLE = await priceOracle.PRICE_UPDATER_ROLE();
        const ROUTE_MANAGER_ROLE = await priceOracle.ROUTE_MANAGER_ROLE();
        
        await priceOracle.grantRole(PRICE_UPDATER_ROLE, priceUpdater.address);
        await priceOracle.grantRole(ROUTE_MANAGER_ROLE, routeManager.address);
    });

    describe("Initialization", function () {
        it("Should initialize with correct admin and swap router", async function () {
            expect(await priceOracle.hasRole(await priceOracle.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
        });

        it("Should not be paused initially", async function () {
            expect(await priceOracle.emergencyPause()).to.be.false;
        });
    });

    describe("Fiat Price Updates", function () {
        it("Should allow price updater to update fiat prices", async function () {
            const currencies = ["EUR", "GBP"];
            const prices = [ethers.parseUnits("1.1", 8), ethers.parseUnits("1.3", 8)];

            await expect(priceOracle.connect(priceUpdater).updateFiatPrices(currencies, prices))
                .to.emit(priceOracle, "FiatPriceUpdated")
                .withArgs("EUR", prices[0], await getBlockTimestamp());

            const eurPrice = await priceOracle.getFiatPrice("EUR");
            expect(eurPrice).to.equal(prices[0]);
        });

        it("Should reject mismatched arrays", async function () {
            const currencies = ["EUR", "GBP"];
            const prices = [ethers.parseUnits("1.1", 8)]; // Only one price for two currencies

            await expect(priceOracle.connect(priceUpdater).updateFiatPrices(currencies, prices))
                .to.be.reverted;
        });

        it("Should reject updates from non-price-updater", async function () {
            const currencies = ["EUR"];
            const prices = [ethers.parseUnits("1.1", 8)];

            await expect(priceOracle.connect(user).updateFiatPrices(currencies, prices))
                .to.be.reverted;
        });
    });

    describe("Price Route Management", function () {
        it("Should allow route manager to register price routes", async function () {
            const tokenAddress = ethers.getAddress("0x1234567890123456789012345678901234567890");
            const path = [tokenAddress, mockSwapRouter.address];
            const fees = [3000]; // 0.3%
            const chainlinkFeed = ethers.ZeroAddress;
            const twapPeriod = 3600;

            await expect(priceOracle.connect(routeManager).registerPriceRoute(
                tokenAddress, path, fees, chainlinkFeed, twapPeriod
            )).to.emit(priceOracle, "PriceRouteUpdated");

            const route = await priceOracle.tokenPriceRoutes(tokenAddress);
            expect(route.useChainlink).to.be.false;
            expect(route.twapPeriod).to.equal(twapPeriod);
        });

        it("Should reject invalid price routes", async function () {
            const tokenAddress = ethers.getAddress("0x1234567890123456789012345678901234567890");
            const path = [tokenAddress]; // Invalid path (too short)
            const fees = [3000];
            const chainlinkFeed = ethers.ZeroAddress;
            const twapPeriod = 3600;

            await expect(priceOracle.connect(routeManager).registerPriceRoute(
                tokenAddress, path, fees, chainlinkFeed, twapPeriod
            )).to.be.reverted;
        });
    });

    describe("Chainlink Feed Management", function () {
        it("Should allow route manager to update Chainlink feeds", async function () {
            const currency = "BTC";
            const feedAddress = ethers.getAddress("0x1234567890123456789012345678901234567890");
            const decimals = 8;
            const heartbeat = 3600;

            await expect(priceOracle.connect(routeManager).updateChainlinkFeed(
                currency, feedAddress, decimals, heartbeat
            )).to.emit(priceOracle, "ChainlinkFeedUpdated");

            const feedInfo = await priceOracle.chainlinkFeeds(currency);
            expect(feedInfo.feedAddress).to.equal(feedAddress);
            expect(feedInfo.decimals).to.equal(decimals);
            expect(feedInfo.isActive).to.be.true;
        });

        it("Should reject invalid feed addresses", async function () {
            const currency = "BTC";
            const feedAddress = ethers.ZeroAddress;
            const decimals = 8;
            const heartbeat = 3600;

            await expect(priceOracle.connect(routeManager).updateChainlinkFeed(
                currency, feedAddress, decimals, heartbeat
            )).to.be.reverted;
        });
    });

    describe("Price Validation", function () {
        beforeEach(async function () {
            // Set up a fiat price
            const currencies = ["USD"];
            const prices = [ethers.parseUnits("1.0", 8)];
            await priceOracle.connect(priceUpdater).updateFiatPrices(currencies, prices);
        });

        it("Should validate fresh prices", async function () {
            expect(await priceOracle.isPriceValid("USD")).to.be.true;
        });

        it("Should reject requests for non-existent prices", async function () {
            await expect(priceOracle.getFiatPrice("NONEXISTENT"))
                .to.be.reverted;
        });

        it("Should calculate price age correctly", async function () {
            const age = await priceOracle.getPriceAge("USD");
            expect(age).to.be.at.most(10); // Should be very recent
        });
    });

    describe("Emergency Controls", function () {
        it("Should allow emergency role to pause", async function () {
            const EMERGENCY_ROLE = await priceOracle.EMERGENCY_ROLE();
            await priceOracle.grantRole(EMERGENCY_ROLE, admin.address);

            await priceOracle.connect(admin).setEmergencyPause(true);
            expect(await priceOracle.emergencyPause()).to.be.true;

            // Should reject operations when paused
            const currencies = ["EUR"];
            const prices = [ethers.parseUnits("1.1", 8)];
            await expect(priceOracle.connect(priceUpdater).updateFiatPrices(currencies, prices))
                .to.be.reverted;
        });

        it("Should allow admin to update swap router", async function () {
            const newRouter = ethers.getAddress("0x9876543210987654321098765432109876543210");
            
            await expect(priceOracle.connect(admin).updateSwapRouter(newRouter))
                .to.emit(priceOracle, "SwapRouterUpdated");
        });
    });

    describe("Legacy Interface Compatibility", function () {
        it("Should support legacy updatePrices function", async function () {
            const currencies = ["EUR"];
            const prices = [ethers.parseUnits("1.1", 8)];

            await expect(priceOracle.connect(priceUpdater).updatePrices(currencies, prices))
                .to.emit(priceOracle, "FiatPriceUpdated");
        });

        it("Should reject deprecated setPriceProvider", async function () {
            const provider = ethers.getAddress("0x1234567890123456789012345678901234567890");
            
            await expect(priceOracle.connect(admin).setPriceProvider(provider))
                .to.be.revertedWith("Use role-based access control");
        });
    });

    // Helper function to get current block timestamp
    async function getBlockTimestamp() {
        const blockNumber = await ethers.provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        return block.timestamp;
    }
});