const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ITSTokenRegistry", function () {
    // Fixture for test setup
    async function deployTokenRegistryFixture() {
        const [owner, manager, otherAccount] = await ethers.getSigners();
        
        // Deploy mock ITS
        const MockITS = await ethers.getContractFactory("contracts/evm/contracts/mocks/MockInterchainTokenService.sol:MockInterchainTokenService");
        const mockITS = await MockITS.deploy();
        
        // Deploy ITSTokenRegistry
        const ITSTokenRegistry = await ethers.getContractFactory("ITSTokenRegistry");
        const tokenRegistry = await upgrades.deployProxy(ITSTokenRegistry, [
            await mockITS.getAddress()
        ]);
        await tokenRegistry.waitForDeployment();
        
        // Deploy mock tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdt = await MockERC20.deploy("USDT", "USDT");
        const usdc = await MockERC20.deploy("USDC", "USDC");
        const dai = await MockERC20.deploy("DAI", "DAI");
        
        // Grant manager role
        const REGISTRY_MANAGER_ROLE = await tokenRegistry.REGISTRY_MANAGER_ROLE();
        await tokenRegistry.grantRole(REGISTRY_MANAGER_ROLE, manager.address);
        
        return {
            tokenRegistry,
            mockITS,
            usdt,
            usdc,
            dai,
            owner,
            manager,
            otherAccount
        };
    }
    
    describe("Initialization", function () {
        it("Should initialize with correct ITS address", async function () {
            const { tokenRegistry, mockITS } = await loadFixture(deployTokenRegistryFixture);
            
            expect(await tokenRegistry.tokenService()).to.equal(await mockITS.getAddress());
        });
        
        it("Should set up default chain mappings", async function () {
            const { tokenRegistry } = await loadFixture(deployTokenRegistryFixture);
            
            // Check default chains are registered
            expect(await tokenRegistry.chainNameToId("Polygon")).to.equal(137);
            expect(await tokenRegistry.chainNameToId("Avalanche")).to.equal(43114);
            expect(await tokenRegistry.chainNameToId("base")).to.equal(8453);
            expect(await tokenRegistry.chainNameToId("binance")).to.equal(56);
            expect(await tokenRegistry.chainNameToId("ethereum")).to.equal(1);
            
            // Check reverse mappings
            expect(await tokenRegistry.chainIdToName(137)).to.equal("Polygon");
            expect(await tokenRegistry.chainIdToName(56)).to.equal("binance");
        });
        
        it("Should grant roles correctly", async function () {
            const { tokenRegistry, owner, manager } = await loadFixture(deployTokenRegistryFixture);
            
            const ADMIN_ROLE = await tokenRegistry.ADMIN_ROLE();
            const REGISTRY_MANAGER_ROLE = await tokenRegistry.REGISTRY_MANAGER_ROLE();
            
            expect(await tokenRegistry.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
            expect(await tokenRegistry.hasRole(REGISTRY_MANAGER_ROLE, manager.address)).to.be.true;
        });
    });
    
    describe("Token Registration", function () {
        it("Should register a new token", async function () {
            const { tokenRegistry, usdt, manager } = await loadFixture(deployTokenRegistryFixture);
            
            const tokenAddress = await usdt.getAddress();
            const minAmount = ethers.parseUnits("10", 6);
            const maxAmount = ethers.parseUnits("100000", 6);
            
            await expect(
                tokenRegistry.connect(manager).registerToken(
                    tokenAddress,
                    "USDT",
                    6,
                    minAmount,
                    maxAmount
                )
            ).to.emit(tokenRegistry, "TokenRegistered");
            
            const tokenInfo = await tokenRegistry.getTokenInfo(tokenAddress);
            expect(tokenInfo.isRegistered).to.be.true;
            expect(tokenInfo.symbol).to.equal("USDT");
            expect(tokenInfo.decimals).to.equal(6);
            expect(tokenInfo.minBridgeAmount).to.equal(minAmount);
            expect(tokenInfo.maxBridgeAmount).to.equal(maxAmount);
            expect(tokenInfo.isPaused).to.be.false;
        });
        
        it("Should prevent duplicate registration", async function () {
            const { tokenRegistry, usdt, manager } = await loadFixture(deployTokenRegistryFixture);
            
            const tokenAddress = await usdt.getAddress();
            
            // First registration
            await tokenRegistry.connect(manager).registerToken(
                tokenAddress,
                "USDT",
                6,
                ethers.parseUnits("10", 6),
                ethers.parseUnits("100000", 6)
            );
            
            // Attempt duplicate registration
            await expect(
                tokenRegistry.connect(manager).registerToken(
                    tokenAddress,
                    "USDT",
                    6,
                    ethers.parseUnits("10", 6),
                    ethers.parseUnits("100000", 6)
                )
            ).to.be.revertedWith("Token already registered");
        });
        
        it("Should validate registration parameters", async function () {
            const { tokenRegistry, usdt, manager } = await loadFixture(deployTokenRegistryFixture);
            
            // Invalid token address
            await expect(
                tokenRegistry.connect(manager).registerToken(
                    ethers.ZeroAddress,
                    "USDT",
                    6,
                    ethers.parseUnits("10", 6),
                    ethers.parseUnits("100000", 6)
                )
            ).to.be.revertedWith("Invalid token address");
            
            // Invalid limits (min > max)
            await expect(
                tokenRegistry.connect(manager).registerToken(
                    await usdt.getAddress(),
                    "USDT",
                    6,
                    ethers.parseUnits("100000", 6),
                    ethers.parseUnits("10", 6)
                )
            ).to.be.revertedWith("Invalid limits");
            
            // Zero minimum
            await expect(
                tokenRegistry.connect(manager).registerToken(
                    await usdt.getAddress(),
                    "USDT",
                    6,
                    0,
                    ethers.parseUnits("100000", 6)
                )
            ).to.be.revertedWith("Invalid limits");
        });
        
        it("Should generate correct token ID", async function () {
            const { tokenRegistry, usdt, manager } = await loadFixture(deployTokenRegistryFixture);
            
            const tokenAddress = await usdt.getAddress();
            
            await tokenRegistry.connect(manager).registerToken(
                tokenAddress,
                "USDT",
                6,
                ethers.parseUnits("10", 6),
                ethers.parseUnits("100000", 6)
            );
            
            const tokenInfo = await tokenRegistry.getTokenInfo(tokenAddress);
            const expectedTokenId = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["string", "address", "string"],
                    ["ITS", tokenAddress, "USDT"]
                )
            );
            
            expect(tokenInfo.tokenId).to.equal(expectedTokenId);
            expect(await tokenRegistry.tokenIdToAddress(expectedTokenId)).to.equal(tokenAddress);
        });
    });
    
    describe("Token Limits Management", function () {
        it("Should update token limits", async function () {
            const { tokenRegistry, usdt, manager } = await loadFixture(deployTokenRegistryFixture);
            
            const tokenAddress = await usdt.getAddress();
            
            // Register token first
            await tokenRegistry.connect(manager).registerToken(
                tokenAddress,
                "USDT",
                6,
                ethers.parseUnits("10", 6),
                ethers.parseUnits("100000", 6)
            );
            
            // Update limits
            const newMin = ethers.parseUnits("50", 6);
            const newMax = ethers.parseUnits("500000", 6);
            
            await expect(
                tokenRegistry.connect(manager).updateTokenLimits(
                    tokenAddress,
                    newMin,
                    newMax
                )
            ).to.emit(tokenRegistry, "TokenLimitsUpdated")
            .withArgs(tokenAddress, newMin, newMax);
            
            const tokenInfo = await tokenRegistry.getTokenInfo(tokenAddress);
            expect(tokenInfo.minBridgeAmount).to.equal(newMin);
            expect(tokenInfo.maxBridgeAmount).to.equal(newMax);
        });
        
        it("Should validate bridge amounts", async function () {
            const { tokenRegistry, usdt, manager } = await loadFixture(deployTokenRegistryFixture);
            
            const tokenAddress = await usdt.getAddress();
            const minAmount = ethers.parseUnits("10", 6);
            const maxAmount = ethers.parseUnits("100000", 6);
            
            await tokenRegistry.connect(manager).registerToken(
                tokenAddress,
                "USDT",
                6,
                minAmount,
                maxAmount
            );
            
            // Valid amount
            expect(await tokenRegistry.isValidBridgeAmount(
                tokenAddress,
                ethers.parseUnits("100", 6)
            )).to.be.true;
            
            // Below minimum
            expect(await tokenRegistry.isValidBridgeAmount(
                tokenAddress,
                ethers.parseUnits("5", 6)
            )).to.be.false;
            
            // Above maximum
            expect(await tokenRegistry.isValidBridgeAmount(
                tokenAddress,
                ethers.parseUnits("200000", 6)
            )).to.be.false;
        });
    });
    
    describe("Chain Management", function () {
        it("Should register new chains", async function () {
            const { tokenRegistry, owner } = await loadFixture(deployTokenRegistryFixture);
            
            await expect(
                tokenRegistry.connect(owner).registerChain("Arbitrum", 42161)
            ).to.emit(tokenRegistry, "ChainRegistered")
            .withArgs("Arbitrum", 42161);
            
            expect(await tokenRegistry.chainNameToId("Arbitrum")).to.equal(42161);
            expect(await tokenRegistry.chainIdToName(42161)).to.equal("Arbitrum");
        });
        
        it("Should prevent duplicate chain registration", async function () {
            const { tokenRegistry, owner } = await loadFixture(deployTokenRegistryFixture);
            
            await expect(
                tokenRegistry.connect(owner).registerChain("Polygon", 137)
            ).to.be.revertedWith("Chain already registered");
        });
        
        it("Should get chain name from ID", async function () {
            const { tokenRegistry } = await loadFixture(deployTokenRegistryFixture);
            
            expect(await tokenRegistry.getChainName(137)).to.equal("Polygon");
            expect(await tokenRegistry.getChainName(56)).to.equal("binance");
            
            await expect(
                tokenRegistry.getChainName(999999)
            ).to.be.revertedWith("Unknown chain");
        });
    });
    
    describe("Token Pause Functionality", function () {
        it("Should pause and unpause tokens", async function () {
            const { tokenRegistry, usdt, owner, manager } = await loadFixture(deployTokenRegistryFixture);
            
            const tokenAddress = await usdt.getAddress();
            
            // Register token
            await tokenRegistry.connect(manager).registerToken(
                tokenAddress,
                "USDT",
                6,
                ethers.parseUnits("10", 6),
                ethers.parseUnits("100000", 6)
            );
            
            // Pause token
            await expect(
                tokenRegistry.connect(owner).pauseToken(tokenAddress)
            ).to.emit(tokenRegistry, "TokenPaused")
            .withArgs(tokenAddress);
            
            let tokenInfo = await tokenRegistry.getTokenInfo(tokenAddress);
            expect(tokenInfo.isPaused).to.be.true;
            
            // Check validation fails when paused
            expect(await tokenRegistry.isValidBridgeAmount(
                tokenAddress,
                ethers.parseUnits("100", 6)
            )).to.be.false;
            
            // Unpause token
            await expect(
                tokenRegistry.connect(owner).unpauseToken(tokenAddress)
            ).to.emit(tokenRegistry, "TokenUnpaused")
            .withArgs(tokenAddress);
            
            tokenInfo = await tokenRegistry.getTokenInfo(tokenAddress);
            expect(tokenInfo.isPaused).to.be.false;
        });
        
        it("Should prevent double pause/unpause", async function () {
            const { tokenRegistry, usdt, owner, manager } = await loadFixture(deployTokenRegistryFixture);
            
            const tokenAddress = await usdt.getAddress();
            
            await tokenRegistry.connect(manager).registerToken(
                tokenAddress,
                "USDT",
                6,
                ethers.parseUnits("10", 6),
                ethers.parseUnits("100000", 6)
            );
            
            // Pause once
            await tokenRegistry.connect(owner).pauseToken(tokenAddress);
            
            // Try to pause again
            await expect(
                tokenRegistry.connect(owner).pauseToken(tokenAddress)
            ).to.be.revertedWith("Token already paused");
            
            // Unpause
            await tokenRegistry.connect(owner).unpauseToken(tokenAddress);
            
            // Try to unpause again
            await expect(
                tokenRegistry.connect(owner).unpauseToken(tokenAddress)
            ).to.be.revertedWith("Token not paused");
        });
    });
    
    describe("Chain Token Mappings", function () {
        it("Should set chain token mappings", async function () {
            const { tokenRegistry, usdt, manager } = await loadFixture(deployTokenRegistryFixture);
            
            const localToken = await usdt.getAddress();
            const remoteToken = ethers.Wallet.createRandom().address;
            
            // Register token first
            await tokenRegistry.connect(manager).registerToken(
                localToken,
                "USDT",
                6,
                ethers.parseUnits("10", 6),
                ethers.parseUnits("100000", 6)
            );
            
            // Set chain mapping
            await expect(
                tokenRegistry.connect(manager).setChainTokenMapping(
                    137, // Polygon
                    localToken,
                    remoteToken
                )
            ).to.emit(tokenRegistry, "ChainMappingSet")
            .withArgs(137, localToken, remoteToken);
            
            expect(await tokenRegistry.chainTokenMappings(137, localToken)).to.equal(remoteToken);
        });
        
        it("Should require token to be registered for mapping", async function () {
            const { tokenRegistry, manager } = await loadFixture(deployTokenRegistryFixture);
            
            const unregisteredToken = ethers.Wallet.createRandom().address;
            const remoteToken = ethers.Wallet.createRandom().address;
            
            await expect(
                tokenRegistry.connect(manager).setChainTokenMapping(
                    137,
                    unregisteredToken,
                    remoteToken
                )
            ).to.be.revertedWith("Token not registered");
        });
    });
    
    describe("Access Control", function () {
        it("Should restrict token registration to REGISTRY_MANAGER_ROLE", async function () {
            const { tokenRegistry, usdt, otherAccount } = await loadFixture(deployTokenRegistryFixture);
            
            await expect(
                tokenRegistry.connect(otherAccount).registerToken(
                    await usdt.getAddress(),
                    "USDT",
                    6,
                    ethers.parseUnits("10", 6),
                    ethers.parseUnits("100000", 6)
                )
            ).to.be.reverted;
        });
        
        it("Should restrict chain registration to ADMIN_ROLE", async function () {
            const { tokenRegistry, otherAccount } = await loadFixture(deployTokenRegistryFixture);
            
            await expect(
                tokenRegistry.connect(otherAccount).registerChain("NewChain", 99999)
            ).to.be.reverted;
        });
        
        it("Should restrict pause operations to ADMIN_ROLE", async function () {
            const { tokenRegistry, usdt, manager, otherAccount } = await loadFixture(deployTokenRegistryFixture);
            
            const tokenAddress = await usdt.getAddress();
            
            await tokenRegistry.connect(manager).registerToken(
                tokenAddress,
                "USDT",
                6,
                ethers.parseUnits("10", 6),
                ethers.parseUnits("100000", 6)
            );
            
            await expect(
                tokenRegistry.connect(otherAccount).pauseToken(tokenAddress)
            ).to.be.reverted;
        });
    });
});