const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("🚀 Starting testnet deployment with security fixes...\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

    // Configuration for testnet
    const TIMELOCK_DELAY = 172800; // 2 days in seconds
    const hubConfig = {
        offerContract: ethers.ZeroAddress,
        tradeContract: ethers.ZeroAddress,
        profileContract: ethers.ZeroAddress,
        priceContract: ethers.ZeroAddress,
        treasury: deployer.address,
        localMarket: deployer.address,
        priceProvider: deployer.address,
        localTokenAddress: ethers.ZeroAddress, // Will be set later if deploying LOCAL token
        chainFeeCollector: deployer.address,
        swapRouter: ethers.ZeroAddress, // Set to Uniswap V3 router on testnet
        burnFeePct: 100,    // 1%
        chainFeePct: 100,   // 1%
        warchestFeePct: 100, // 1%
        conversionFeePct: 50, // 0.5%
        arbitratorFeePct: 100, // 1%
        minTradeAmount: ethers.parseEther("0.01"),
        maxTradeAmount: ethers.parseEther("1000"),
        maxActiveOffers: 10,
        maxActiveTrades: 10,
        tradeExpirationTimer: 3600,  // 1 hour
        tradeDisputeTimer: 7200,     // 2 hours
        globalPause: false,
        pauseNewTrades: false,
        pauseDeposits: false,
        pauseWithdrawals: false
    };

    try {
        // 1. Deploy Hub with timelock
        console.log("1. Deploying Hub contract with timelock...");
        const Hub = await ethers.getContractFactory("Hub");
        const hub = await upgrades.deployProxy(Hub, [hubConfig, TIMELOCK_DELAY], {
            initializer: "initialize",
            kind: "uups"
        });
        await hub.waitForDeployment();
        const hubAddress = await hub.getAddress();
        console.log("✅ Hub deployed to:", hubAddress);
        console.log("   Timelock Controller:", await hub.timelockController());

        // 2. Deploy Profile
        console.log("\n2. Deploying Profile contract...");
        const Profile = await ethers.getContractFactory("Profile");
        const profile = await upgrades.deployProxy(Profile, [hubAddress], {
            initializer: "initialize",
            kind: "uups"
        });
        await profile.waitForDeployment();
        const profileAddress = await profile.getAddress();
        console.log("✅ Profile deployed to:", profileAddress);

        // 3. Deploy PriceOracle
        console.log("\n3. Deploying PriceOracle contract...");
        const PriceOracle = await ethers.getContractFactory("PriceOracle");
        const priceOracle = await upgrades.deployProxy(
            PriceOracle, 
            [deployer.address, ethers.ZeroAddress], // Admin and swap router
            {
                initializer: "initialize",
                kind: "uups"
            }
        );
        await priceOracle.waitForDeployment();
        const priceOracleAddress = await priceOracle.getAddress();
        console.log("✅ PriceOracle deployed to:", priceOracleAddress);

        // 4. Deploy Offer
        console.log("\n4. Deploying Offer contract...");
        const Offer = await ethers.getContractFactory("Offer");
        const offer = await upgrades.deployProxy(Offer, [hubAddress], {
            initializer: "initialize",
            kind: "uups"
        });
        await offer.waitForDeployment();
        const offerAddress = await offer.getAddress();
        console.log("✅ Offer deployed to:", offerAddress);

        // 5. Deploy ArbitratorManager with VRF support
        console.log("\n5. Deploying ArbitratorManager contract...");
        const ArbitratorManager = await ethers.getContractFactory("ArbitratorManager");
        const arbitratorManager = await upgrades.deployProxy(
            ArbitratorManager,
            [hubAddress, deployer.address], // Hub and temporary trade contract
            {
                initializer: "initialize",
                kind: "uups"
            }
        );
        await arbitratorManager.waitForDeployment();
        const arbitratorManagerAddress = await arbitratorManager.getAddress();
        console.log("✅ ArbitratorManager deployed to:", arbitratorManagerAddress);

        // 6. Deploy Escrow with pull payment pattern
        console.log("\n6. Deploying Escrow contract with pull payment pattern...");
        const Escrow = await ethers.getContractFactory("Escrow");
        const escrow = await upgrades.deployProxy(
            Escrow,
            [
                hubAddress,
                priceOracleAddress,
                deployer.address // Temporary trade contract
            ],
            {
                initializer: "initialize",
                kind: "uups"
            }
        );
        await escrow.waitForDeployment();
        const escrowAddress = await escrow.getAddress();
        console.log("✅ Escrow deployed to:", escrowAddress);

        // 7. Deploy Trade with CEI pattern
        console.log("\n7. Deploying Trade contract with CEI pattern...");
        const Trade = await ethers.getContractFactory("Trade");
        const trade = await upgrades.deployProxy(
            Trade,
            [
                hubAddress,
                escrowAddress,
                arbitratorManagerAddress
            ],
            {
                initializer: "initialize",
                kind: "uups"
            }
        );
        await trade.waitForDeployment();
        const tradeAddress = await trade.getAddress();
        console.log("✅ Trade deployed to:", tradeAddress);

        // 8. Update Hub configuration with deployed contracts
        console.log("\n8. Updating Hub configuration...");
        const updatedConfig = {
            ...hubConfig,
            offerContract: offerAddress,
            tradeContract: tradeAddress,
            profileContract: profileAddress,
            priceContract: priceOracleAddress
        };
        await hub.updateConfig(updatedConfig);
        console.log("✅ Hub configuration updated");

        // 9. Grant necessary roles
        console.log("\n9. Setting up access control roles...");
        
        // Grant Trade contract role in Escrow
        const TRADE_CONTRACT_ROLE = await escrow.TRADE_CONTRACT_ROLE();
        await escrow.grantRole(TRADE_CONTRACT_ROLE, tradeAddress);
        console.log("✅ Trade contract role granted in Escrow");

        // Grant Trade contract role in ArbitratorManager
        const TRADE_ROLE_ARB = await arbitratorManager.TRADE_CONTRACT_ROLE();
        await arbitratorManager.grantRole(TRADE_ROLE_ARB, tradeAddress);
        console.log("✅ Trade contract role granted in ArbitratorManager");

        // 10. Configure VRF for ArbitratorManager (if on supported network)
        console.log("\n10. VRF Configuration...");
        const network = await ethers.provider.getNetwork();
        const chainId = network.chainId;
        
        // VRF configuration for different testnets
        const vrfConfig = {
            // Sepolia
            11155111: {
                coordinator: "0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625",
                keyHash: "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c",
                subscriptionId: 0 // Need to create subscription
            },
            // Mumbai
            80001: {
                coordinator: "0x7a1BaC17Ccc5b313516C5E16fb24f7659aA5ebed",
                keyHash: "0x4b09e658ed251bcafeebbc69400383d49f344ace09b9576fe248bb02c003fe9f",
                subscriptionId: 0 // Need to create subscription
            }
        };

        if (vrfConfig[chainId]) {
            console.log(`Configuring VRF for network ${chainId}...`);
            console.log("⚠️  Note: You need to create a VRF subscription and add this contract as a consumer");
            console.log(`   VRF Coordinator: ${vrfConfig[chainId].coordinator}`);
            console.log(`   Key Hash: ${vrfConfig[chainId].keyHash}`);
        } else {
            console.log("⚠️  VRF not configured for this network. Arbitrator selection will use fallback method.");
        }

        // 11. Summary
        console.log("\n" + "=".repeat(60));
        console.log("🎉 DEPLOYMENT COMPLETE WITH SECURITY FIXES!");
        console.log("=".repeat(60));
        console.log("\nDeployed Contracts:");
        console.log("-------------------");
        console.log(`Hub:                ${hubAddress}`);
        console.log(`Profile:            ${profileAddress}`);
        console.log(`Offer:              ${offerAddress}`);
        console.log(`Trade:              ${tradeAddress}`);
        console.log(`Escrow:             ${escrowAddress}`);
        console.log(`ArbitratorManager:  ${arbitratorManagerAddress}`);
        console.log(`PriceOracle:        ${priceOracleAddress}`);
        
        console.log("\n📋 Security Features Implemented:");
        console.log("----------------------------------");
        console.log("✅ AUTH-006: Escrow deposit authorization fixed");
        console.log("✅ AUTH-007: VRF-ready arbitrator selection");
        console.log("✅ EXT-017: CEI pattern in Trade.fundEscrow");
        console.log("✅ EXT-021/DOS-054: Pull payment pattern for ETH");
        console.log("✅ UPG-012: UUPS upgrade with timelock protection");
        console.log("✅ Comprehensive reentrancy protection");
        
        console.log("\n⚡ Next Steps:");
        console.log("--------------");
        console.log("1. Verify contracts on block explorer");
        console.log("2. Set up VRF subscription (if applicable)");
        console.log("3. Configure price feeds");
        console.log("4. Register test arbitrators");
        console.log("5. Run integration tests");

        // Save deployment addresses
        const deployment = {
            network: network.name,
            chainId: chainId.toString(),
            deployer: deployer.address,
            timestamp: new Date().toISOString(),
            contracts: {
                hub: hubAddress,
                profile: profileAddress,
                offer: offerAddress,
                trade: tradeAddress,
                escrow: escrowAddress,
                arbitratorManager: arbitratorManagerAddress,
                priceOracle: priceOracleAddress
            },
            timelockDelay: TIMELOCK_DELAY,
            securityFixes: [
                "AUTH-006", "AUTH-007", "EXT-017", "EXT-021", 
                "DOS-054", "UPG-012", "EXT-018", "MATH-026"
            ]
        };

        const fs = require("fs");
        const deploymentFile = `deployment-${network.name}-${Date.now()}.json`;
        fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
        console.log(`\n💾 Deployment info saved to: ${deploymentFile}`);

    } catch (error) {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });