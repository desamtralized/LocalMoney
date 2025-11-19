const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("TokenBridge", function () {
    // Fixture for test setup
    async function deployTokenBridgeFixture() {
        const [owner, user, escrow, feeRecipient] = await ethers.getSigners();
        
        // Deploy mock contracts
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdt = await MockERC20.deploy("USDT", "USDT");
        const usdc = await MockERC20.deploy("USDC", "USDC");
        
        // Deploy mock Axelar contracts
        const MockGateway = await ethers.getContractFactory("MockAxelarGateway");
        const mockGateway = await MockGateway.deploy();
        
        const MockGasService = await ethers.getContractFactory("MockAxelarGasService");
        const mockGasService = await MockGasService.deploy();
        
        // Deploy mock ITS
        const MockITS = await ethers.getContractFactory("contracts/evm/contracts/mocks/MockInterchainTokenService.sol:MockInterchainTokenService");
        const mockITS = await MockITS.deploy();
        
        // Deploy ITSTokenRegistry
        const ITSTokenRegistry = await ethers.getContractFactory("ITSTokenRegistry");
        const tokenRegistry = await upgrades.deployProxy(ITSTokenRegistry, [
            await mockITS.getAddress()
        ]);
        
        // Deploy CrossChainEscrow (mock)
        const CrossChainEscrow = await ethers.getContractFactory("CrossChainEscrow");
        const Hub = await ethers.getContractFactory("Hub");
        const PriceOracle = await ethers.getContractFactory("PriceOracle");
        
        const hub = await upgrades.deployProxy(Hub, [owner.address]);
        const priceOracle = await upgrades.deployProxy(PriceOracle, [
            owner.address, 60, owner.address
        ]);
        
        const crossChainEscrow = await upgrades.deployProxy(CrossChainEscrow, [
            await hub.getAddress(),
            await priceOracle.getAddress(),
            owner.address
        ]);
        
        await crossChainEscrow.initializeCrossChain(
            await tokenRegistry.getAddress(),
            await mockITS.getAddress()
        );
        
        // Deploy TokenBridge
        const TokenBridge = await ethers.getContractFactory("TokenBridge");
        const tokenBridge = await upgrades.deployProxy(TokenBridge, [
            await mockITS.getAddress(),
            await mockGasService.getAddress(),
            await tokenRegistry.getAddress(),
            await crossChainEscrow.getAddress(),
            feeRecipient.address
        ], {
            constructorArgs: [await mockGateway.getAddress()],
            unsafeAllow: ['constructor']
        });
        
        // Register tokens
        const REGISTRY_MANAGER_ROLE = await tokenRegistry.REGISTRY_MANAGER_ROLE();
        await tokenRegistry.grantRole(REGISTRY_MANAGER_ROLE, owner.address);
        
        await tokenRegistry.registerToken(
            await usdt.getAddress(),
            "USDT",
            6,
            ethers.parseUnits("10", 6),
            ethers.parseUnits("100000", 6)
        );
        
        await tokenRegistry.registerToken(
            await usdc.getAddress(),
            "USDC",
            18,
            ethers.parseUnits("10", 18),
            ethers.parseUnits("100000", 18)
        );
        
        // Mint tokens
        await usdt.mint(user.address, ethers.parseUnits("10000", 6));
        await usdc.mint(user.address, ethers.parseUnits("10000", 18));
        
        // Grant escrow role
        const ESCROW_ROLE = await tokenBridge.ESCROW_ROLE();
        await tokenBridge.grantRole(ESCROW_ROLE, escrow.address);
        
        return {
            tokenBridge,
            tokenRegistry,
            crossChainEscrow,
            mockITS,
            mockGasService,
            mockGateway,
            usdt,
            usdc,
            owner,
            user,
            escrow,
            feeRecipient
        };
    }
    
    describe("Initialization", function () {
        it("Should initialize with correct parameters", async function () {
            const { tokenBridge, tokenRegistry, crossChainEscrow, mockITS, mockGasService, feeRecipient } = 
                await loadFixture(deployTokenBridgeFixture);
            
            expect(await tokenBridge.tokenService()).to.equal(await mockITS.getAddress());
            expect(await tokenBridge.gasService()).to.equal(await mockGasService.getAddress());
            expect(await tokenBridge.tokenRegistry()).to.equal(await tokenRegistry.getAddress());
            expect(await tokenBridge.crossChainEscrow()).to.equal(await crossChainEscrow.getAddress());
            expect(await tokenBridge.feeRecipient()).to.equal(feeRecipient.address);
            expect(await tokenBridge.bridgeFeePercentage()).to.equal(30); // 0.3%
            expect(await tokenBridge.gasBufferPercentage()).to.equal(120); // 20% buffer
        });
    });
    
    describe("Token Bridging", function () {
        it("Should bridge tokens to another chain", async function () {
            const { tokenBridge, usdt, user, feeRecipient } = await loadFixture(deployTokenBridgeFixture);
            
            const amount = ethers.parseUnits("100", 6);
            const destinationChain = "Polygon";
            const destinationAddress = ethers.Wallet.createRandom().address;
            
            // Approve token bridge
            await usdt.connect(user).approve(await tokenBridge.getAddress(), amount);
            
            // Bridge tokens
            await expect(
                tokenBridge.connect(user).bridgeToken(
                    await usdt.getAddress(),
                    amount,
                    destinationChain,
                    destinationAddress,
                    { value: ethers.parseEther("0.1") }
                )
            ).to.emit(tokenBridge, "TokensBridged");
            
            // Check fee was collected
            const expectedFee = amount * 30n / 10000n; // 0.3%
            expect(await usdt.balanceOf(feeRecipient.address)).to.equal(expectedFee);
        });
        
        it("Should reject bridging unregistered tokens", async function () {
            const { tokenBridge, user } = await loadFixture(deployTokenBridgeFixture);
            
            const unregisteredToken = ethers.Wallet.createRandom().address;
            
            await expect(
                tokenBridge.connect(user).bridgeToken(
                    unregisteredToken,
                    ethers.parseUnits("100", 6),
                    "Polygon",
                    ethers.Wallet.createRandom().address,
                    { value: ethers.parseEther("0.1") }
                )
            ).to.be.revertedWith("Token not registered");
        });
        
        it("Should reject bridging paused tokens", async function () {
            const { tokenBridge, tokenRegistry, usdt, user, owner } = await loadFixture(deployTokenBridgeFixture);
            
            // Pause token
            await tokenRegistry.connect(owner).pauseToken(await usdt.getAddress());
            
            await usdt.connect(user).approve(await tokenBridge.getAddress(), ethers.parseUnits("100", 6));
            
            await expect(
                tokenBridge.connect(user).bridgeToken(
                    await usdt.getAddress(),
                    ethers.parseUnits("100", 6),
                    "Polygon",
                    ethers.Wallet.createRandom().address,
                    { value: ethers.parseEther("0.1") }
                )
            ).to.be.revertedWith("Token paused");
        });
        
        it("Should enforce minimum and maximum amounts", async function () {
            const { tokenBridge, usdt, user } = await loadFixture(deployTokenBridgeFixture);
            
            const tooSmall = ethers.parseUnits("5", 6); // Below 10 USDT minimum
            const tooLarge = ethers.parseUnits("200000", 6); // Above 100k USDT maximum
            
            await usdt.connect(user).approve(await tokenBridge.getAddress(), tooLarge);
            
            // Test minimum
            await expect(
                tokenBridge.connect(user).bridgeToken(
                    await usdt.getAddress(),
                    tooSmall,
                    "Polygon",
                    ethers.Wallet.createRandom().address,
                    { value: ethers.parseEther("0.1") }
                )
            ).to.be.revertedWith("Invalid bridge amount");
            
            // Mint more tokens for max test
            await usdt.mint(user.address, tooLarge);
            
            // Test maximum
            await expect(
                tokenBridge.connect(user).bridgeToken(
                    await usdt.getAddress(),
                    tooLarge,
                    "Polygon",
                    ethers.Wallet.createRandom().address,
                    { value: ethers.parseEther("0.1") }
                )
            ).to.be.revertedWith("Invalid bridge amount");
        });
    });
    
    describe("Escrow Bridging", function () {
        it("Should allow escrow to bridge tokens", async function () {
            const { tokenBridge, usdt, escrow } = await loadFixture(deployTokenBridgeFixture);
            
            const amount = ethers.parseUnits("100", 6);
            const tradeId = ethers.randomBytes(32);
            
            // Mint tokens to escrow
            await usdt.mint(escrow.address, amount);
            await usdt.connect(escrow).approve(await tokenBridge.getAddress(), amount);
            
            await expect(
                tokenBridge.connect(escrow).bridgeForEscrow(
                    await usdt.getAddress(),
                    amount,
                    "Polygon",
                    ethers.Wallet.createRandom().address,
                    tradeId,
                    { value: ethers.parseEther("0.1") }
                )
            ).to.emit(tokenBridge, "TokensBridged");
        });
        
        it("Should restrict bridgeForEscrow to ESCROW_ROLE", async function () {
            const { tokenBridge, usdt, user } = await loadFixture(deployTokenBridgeFixture);
            
            await expect(
                tokenBridge.connect(user).bridgeForEscrow(
                    await usdt.getAddress(),
                    ethers.parseUnits("100", 6),
                    "Polygon",
                    ethers.Wallet.createRandom().address,
                    ethers.randomBytes(32)
                )
            ).to.be.reverted;
        });
    });
    
    describe("Fee Management", function () {
        it("Should update bridge fee", async function () {
            const { tokenBridge, owner } = await loadFixture(deployTokenBridgeFixture);
            
            const newFee = 50; // 0.5%
            
            await expect(
                tokenBridge.connect(owner).updateBridgeFee(newFee)
            ).to.emit(tokenBridge, "BridgeFeeUpdated")
            .withArgs(newFee);
            
            expect(await tokenBridge.bridgeFeePercentage()).to.equal(newFee);
        });
        
        it("Should enforce maximum fee limit", async function () {
            const { tokenBridge, owner } = await loadFixture(deployTokenBridgeFixture);
            
            await expect(
                tokenBridge.connect(owner).updateBridgeFee(600) // 6%, above 5% max
            ).to.be.revertedWith("Fee too high");
        });
        
        it("Should update fee recipient", async function () {
            const { tokenBridge, owner } = await loadFixture(deployTokenBridgeFixture);
            
            const newRecipient = ethers.Wallet.createRandom().address;
            
            await expect(
                tokenBridge.connect(owner).updateFeeRecipient(newRecipient)
            ).to.emit(tokenBridge, "FeeRecipientUpdated")
            .withArgs(newRecipient);
            
            expect(await tokenBridge.feeRecipient()).to.equal(newRecipient);
        });
    });
    
    describe("Gas Estimation", function () {
        it("Should estimate gas for bridging", async function () {
            const { tokenBridge } = await loadFixture(deployTokenBridgeFixture);
            
            const payload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "address"],
                [ethers.Wallet.createRandom().address, ethers.parseUnits("100", 6), ethers.Wallet.createRandom().address]
            );
            
            const gasEstimate = await tokenBridge.estimateBridgeGas("Polygon", payload);
            
            // Basic checks
            expect(gasEstimate).to.be.gt(0);
            expect(gasEstimate).to.be.lt(ethers.parseUnits("1", 6)); // Less than 1M gas
        });
        
        it("Should update gas buffer", async function () {
            const { tokenBridge, owner } = await loadFixture(deployTokenBridgeFixture);
            
            const newBuffer = 150; // 50% buffer
            
            await expect(
                tokenBridge.connect(owner).updateGasBuffer(newBuffer)
            ).to.emit(tokenBridge, "GasBufferUpdated")
            .withArgs(newBuffer);
            
            expect(await tokenBridge.gasBufferPercentage()).to.equal(newBuffer);
        });
    });
    
    describe("Pause Functionality", function () {
        it("Should pause and unpause bridge", async function () {
            const { tokenBridge, usdt, user, owner } = await loadFixture(deployTokenBridgeFixture);
            
            // Pause
            await tokenBridge.connect(owner).pause();
            
            await usdt.connect(user).approve(await tokenBridge.getAddress(), ethers.parseUnits("100", 6));
            
            // Should fail when paused
            await expect(
                tokenBridge.connect(user).bridgeToken(
                    await usdt.getAddress(),
                    ethers.parseUnits("100", 6),
                    "Polygon",
                    ethers.Wallet.createRandom().address
                )
            ).to.be.revertedWith("Pausable: paused");
            
            // Unpause
            await tokenBridge.connect(owner).unpause();
            
            // Should work after unpause
            await expect(
                tokenBridge.connect(user).bridgeToken(
                    await usdt.getAddress(),
                    ethers.parseUnits("100", 6),
                    "Polygon",
                    ethers.Wallet.createRandom().address,
                    { value: ethers.parseEther("0.1") }
                )
            ).to.emit(tokenBridge, "TokensBridged");
        });
    });
    
    describe("Emergency Recovery", function () {
        it("Should allow emergency token recovery", async function () {
            const { tokenBridge, usdt, owner } = await loadFixture(deployTokenBridgeFixture);
            
            // Send tokens to bridge contract
            const amount = ethers.parseUnits("100", 6);
            await usdt.mint(await tokenBridge.getAddress(), amount);
            
            const balanceBefore = await usdt.balanceOf(owner.address);
            
            await tokenBridge.connect(owner).emergencyTokenRecovery(
                await usdt.getAddress(),
                amount
            );
            
            const balanceAfter = await usdt.balanceOf(owner.address);
            expect(balanceAfter - balanceBefore).to.equal(amount);
        });
        
        it("Should restrict emergency recovery to ADMIN_ROLE", async function () {
            const { tokenBridge, usdt, user } = await loadFixture(deployTokenBridgeFixture);
            
            await expect(
                tokenBridge.connect(user).emergencyTokenRecovery(
                    await usdt.getAddress(),
                    ethers.parseUnits("100", 6)
                )
            ).to.be.reverted;
        });
    });
});