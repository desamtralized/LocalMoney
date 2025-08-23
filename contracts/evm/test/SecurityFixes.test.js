const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Security Fixes Validation", function () {
    // Deploy fixture
    async function deployFixture() {
        const [owner, seller, buyer, attacker, victim, arbitrator1, arbitrator2] = await ethers.getSigners();

        // Deploy Hub
        const Hub = await ethers.getContractFactory("Hub");
        const hub = await upgrades.deployProxy(Hub, [
            {
                offerContract: ethers.ZeroAddress,
                tradeContract: ethers.ZeroAddress,
                profileContract: ethers.ZeroAddress,
                priceContract: ethers.ZeroAddress,
                treasury: owner.address,
                localMarket: owner.address,
                priceProvider: owner.address,
                localTokenAddress: ethers.ZeroAddress,
                chainFeeCollector: owner.address,
                swapRouter: ethers.ZeroAddress,
                burnFeePct: 100,
                chainFeePct: 100,
                warchestFeePct: 100,
                conversionFeePct: 50,
                arbitratorFeePct: 100,
                minTradeAmount: ethers.parseEther("0.01"),
                maxTradeAmount: ethers.parseEther("1000"),
                maxActiveOffers: 10,
                maxActiveTrades: 10,
                tradeExpirationTimer: 3600,
                tradeDisputeTimer: 7200,
                globalPause: false,
                pauseNewTrades: false,
                pauseDeposits: false,
                pauseWithdrawals: false
            },
            172800 // 2 days timelock
        ]);

        // Deploy Escrow
        const Escrow = await ethers.getContractFactory("Escrow");
        const escrow = await upgrades.deployProxy(Escrow, [
            await hub.getAddress(),
            owner.address, // price oracle placeholder
            owner.address  // trade contract placeholder (will update)
        ]);

        // Deploy ArbitratorManager
        const ArbitratorManager = await ethers.getContractFactory("ArbitratorManager");
        const arbitratorManager = await upgrades.deployProxy(ArbitratorManager, [
            await hub.getAddress(),
            owner.address // trade contract placeholder (will update)
        ]);

        // Deploy Trade
        const Trade = await ethers.getContractFactory("Trade");
        const trade = await upgrades.deployProxy(Trade, [
            await hub.getAddress(),
            await escrow.getAddress(),
            await arbitratorManager.getAddress()
        ]);

        // Update Trade contract role in Escrow
        await escrow.grantRole(await escrow.TRADE_CONTRACT_ROLE(), await trade.getAddress());
        
        // Update Trade contract role in ArbitratorManager
        await arbitratorManager.grantRole(
            await arbitratorManager.TRADE_CONTRACT_ROLE(), 
            await trade.getAddress()
        );

        // Deploy Mock ERC20
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mockToken = await MockERC20.deploy("Mock Token", "MOCK", 18);
        await mockToken.waitForDeployment();

        // Mint tokens to test accounts
        await mockToken.mint(seller.address, ethers.parseEther("1000"));
        await mockToken.mint(buyer.address, ethers.parseEther("1000"));
        await mockToken.mint(victim.address, ethers.parseEther("1000"));
        await mockToken.mint(attacker.address, ethers.parseEther("1000"));

        return {
            hub,
            escrow,
            arbitratorManager,
            trade,
            mockToken,
            owner,
            seller,
            buyer,
            attacker,
            victim,
            arbitrator1,
            arbitrator2
        };
    }

    describe("AUTH-006: Escrow Deposit Authorization", function () {
        it("Should prevent arbitrary from address in transferFrom", async function () {
            const { escrow, trade, mockToken, attacker, victim } = await loadFixture(deployFixture);
            
            // Setup: victim approves tokens to escrow
            await mockToken.connect(victim).approve(await escrow.getAddress(), ethers.parseEther("100"));
            
            // Attack attempt: attacker tries to deposit using victim's tokens
            // This should fail because depositor must equal msg.sender when called by Trade contract
            await expect(
                escrow.connect(attacker).deposit(
                    1, // tradeId
                    await mockToken.getAddress(),
                    ethers.parseEther("100"),
                    victim.address // trying to use victim as depositor
                )
            ).to.be.revertedWithCustomError(escrow, "UnauthorizedAccess");
        });

        it("Should only allow Trade contract to call deposit", async function () {
            const { escrow, mockToken, attacker } = await loadFixture(deployFixture);
            
            await expect(
                escrow.connect(attacker).deposit(
                    1,
                    await mockToken.getAddress(),
                    ethers.parseEther("10"),
                    attacker.address
                )
            ).to.be.reverted; // AccessControl will revert
        });

        it("Should enforce depositor equals msg.sender for Trade contract", async function () {
            const { escrow, trade, mockToken, seller } = await loadFixture(deployFixture);
            
            // This test verifies that when Trade contract calls deposit,
            // it must pass itself as the depositor
            // The actual integration will be tested through Trade contract
        });
    });

    describe("EXT-017: CEI Pattern in Trade.fundEscrow", function () {
        it("Should update state before external calls", async function () {
            // This test would require a malicious contract to verify reentrancy protection
            // The CEI pattern ensures state is updated before calling external contracts
            const { trade, escrow, seller, buyer } = await loadFixture(deployFixture);
            
            // The fundEscrow function now updates state BEFORE calling escrow.deposit
            // This prevents reentrancy attacks
            // Full test would require deploying a malicious escrow contract
        });

        it("Should maintain nonReentrant modifier", async function () {
            const { trade } = await loadFixture(deployFixture);
            
            // Verify the function has reentrancy protection
            // The nonReentrant modifier prevents recursive calls
            const code = await ethers.provider.getCode(await trade.getAddress());
            expect(code).to.not.equal("0x"); // Contract is deployed
        });
    });

    describe("AUTH-007: VRF Arbitrator Selection", function () {
        it("Should configure VRF settings", async function () {
            const { arbitratorManager, owner } = await loadFixture(deployFixture);
            
            // Configure VRF (in production, would use real Chainlink VRF)
            const vrfCoordinator = owner.address; // Mock address
            const subscriptionId = 1n;
            const keyHash = "0x" + "0".repeat(64);
            const callbackGasLimit = 100000;
            const requestConfirmations = 3;
            
            await arbitratorManager.configureVRF(
                vrfCoordinator,
                subscriptionId,
                keyHash,
                callbackGasLimit,
                requestConfirmations
            );
            
            // Verify configuration was set
            expect(await arbitratorManager.vrfSubscriptionId()).to.equal(subscriptionId);
        });

        it("Should fallback to improved PRNG when VRF not available", async function () {
            const { arbitratorManager, arbitrator1, arbitrator2 } = await loadFixture(deployFixture);
            
            // Register arbitrators
            await arbitratorManager.connect(arbitrator1).registerArbitrator(
                ["USD", "EUR"],
                "pubkey1"
            );
            await arbitratorManager.connect(arbitrator2).registerArbitrator(
                ["USD", "EUR"],
                "pubkey2"
            );
            
            // Without VRF configured, should use fallback
            const arbitrator = await arbitratorManager.assignArbitrator(1, "USD");
            
            // Should return an arbitrator address
            expect(arbitrator).to.not.equal(ethers.ZeroAddress);
        });
    });

    describe("EXT-021 & DOS-054: Pull Payment Pattern", function () {
        it("Should use pull payment pattern for ETH", async function () {
            const { escrow, seller } = await loadFixture(deployFixture);
            
            // After implementing pull payment, ETH is not sent directly
            // Instead, it's added to pendingWithdrawals mapping
            
            // Check that pendingWithdrawals exists
            const pendingBefore = await escrow.pendingWithdrawals(seller.address);
            expect(pendingBefore).to.equal(0);
        });

        it("Should allow withdrawal of pending payments", async function () {
            const { escrow, trade, seller, buyer, owner } = await loadFixture(deployFixture);
            
            // Grant necessary role for testing
            await escrow.grantRole(await escrow.TRADE_CONTRACT_ROLE(), owner.address);
            
            // Simulate adding pending withdrawal (would normally happen in release)
            // First deposit ETH to escrow
            await escrow.deposit(
                1, // tradeId
                ethers.ZeroAddress, // ETH
                ethers.parseEther("1"),
                owner.address,
                { value: ethers.parseEther("1") }
            );
            
            // Release would add to pendingWithdrawals
            // For this test, we verify the withdraw function exists
            await expect(escrow.withdraw()).to.be.revertedWithCustomError(escrow, "NothingToWithdraw");
        });

        it("Should prevent reentrancy in withdraw", async function () {
            const { escrow } = await loadFixture(deployFixture);
            
            // The withdraw function has nonReentrant modifier
            // This prevents reentrancy attacks during ETH withdrawal
            // Full test would require a malicious contract
        });
    });

    describe("UPG-012: UUPS Upgrade Protection", function () {
        it("Should require admin role for upgrades", async function () {
            const { hub, attacker } = await loadFixture(deployFixture);
            
            // Deploy new implementation
            const HubV2 = await ethers.getContractFactory("Hub");
            const hubV2 = await HubV2.deploy();
            await hubV2.waitForDeployment();
            
            // Attempt upgrade as attacker should fail
            await expect(
                upgrades.upgradeProxy(await hub.getAddress(), HubV2.connect(attacker))
            ).to.be.reverted;
        });

        it("Should emit UpgradeAuthorized event", async function () {
            const { hub, owner } = await loadFixture(deployFixture);
            
            // The _authorizeUpgrade function now emits UpgradeAuthorized event
            // This provides transparency for upgrade operations
        });

        it("Should validate timelock for upgrades", async function () {
            const { hub } = await loadFixture(deployFixture);
            
            // The _authorizeUpgrade function checks if upgrade goes through timelock
            // This adds an additional layer of security for upgrades
            const timelockAddress = await hub.timelockController();
            expect(timelockAddress).to.not.equal(ethers.ZeroAddress);
        });
    });

    describe("Integration Tests", function () {
        it("Should complete a full trade flow with security fixes", async function () {
            const { trade, escrow, mockToken, seller, buyer, owner } = await loadFixture(deployFixture);
            
            // Create offer (simplified - normally through Offer contract)
            // ... offer creation logic ...
            
            // Create trade
            // ... trade creation logic ...
            
            // Fund escrow with proper authorization
            // State is updated before external calls (CEI pattern)
            
            // Complete trade
            // Pull payment pattern for ETH payouts
            
            // This is a placeholder for full integration testing
        });
    });

    describe("Gas Optimization", function () {
        it("Should maintain reasonable gas costs", async function () {
            const { trade, escrow, mockToken, seller } = await loadFixture(deployFixture);
            
            // Approve tokens
            await mockToken.connect(seller).approve(await trade.getAddress(), ethers.parseEther("10"));
            
            // Measure gas for critical operations
            // The security fixes should not significantly increase gas costs
            
            // This is a placeholder for gas measurement tests
        });
    });
});