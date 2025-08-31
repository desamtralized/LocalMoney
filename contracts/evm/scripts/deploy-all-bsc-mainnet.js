require("dotenv").config();
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("=".repeat(70));
    console.log("LocalMoney Smart Contracts - Complete BSC Mainnet Deployment");
    console.log("With Offer Description Update Support");
    console.log("=".repeat(70));
    
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
        console.error("❌ DEPLOYER_PRIVATE_KEY not found in .env file");
        process.exit(1);
    }
    
    const deployer = new ethers.Wallet(privateKey, ethers.provider);
    const network = await ethers.provider.getNetwork();
    
    console.log("\nNetwork: BSC Mainnet");
    console.log("Chain ID:", network.chainId);
    console.log("\nDeployer Address:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "BNB");
    
    if (balance < ethers.parseEther("0.015")) {
        console.error("❌ Insufficient balance. Need at least 0.015 BNB for deployment");
        process.exit(1);
    }
    
    console.log("\n⚠️  Warning: Low balance. Deployment may fail if gas costs exceed available funds.");
    
    const deployedContracts = {};
    
    try {
        console.log("\n" + "=".repeat(70));
        console.log("DEPLOYING CONTRACTS");
        console.log("=".repeat(70));
        
        // 1. Deploy Hub
        console.log("\n1. Deploying Hub contract...");
        const Hub = await ethers.getContractFactory("Hub", deployer);
        
        // Initial hub configuration
        const initialHubConfig = {
            offerContract: ethers.ZeroAddress,  // Will be set later
            tradeContract: ethers.ZeroAddress,  // Will be set later
            profileContract: ethers.ZeroAddress,  // Will be set later
            priceContract: ethers.ZeroAddress,  // Will be set later
            treasury: deployer.address,
            localMarket: deployer.address,
            priceProvider: deployer.address,
            localTokenAddress: ethers.ZeroAddress,
            chainFeeCollector: deployer.address,
            swapRouter: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap V3
            burnFeePct: 0,
            chainFeePct: 0,
            warchestFeePct: 0,
            conversionFeePct: 0,
            arbitratorFeePct: 0,
            minTradeAmount: ethers.parseUnits("10", 6),
            maxTradeAmount: ethers.parseUnits("10000", 6),
            maxActiveOffers: 100,
            maxActiveTrades: 100,
            tradeExpirationTimer: 24 * 60 * 60,
            tradeDisputeTimer: 7 * 24 * 60 * 60,
            globalPause: false,
            pauseNewTrades: false,
            pauseDeposits: false,
            pauseWithdrawals: false
        };
        
        const minDelay = 0; // No timelock delay for immediate updates
        
        const hub = await upgrades.deployProxy(Hub, [initialHubConfig, minDelay], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await hub.waitForDeployment();
        deployedContracts.Hub = await hub.getAddress();
        console.log("   ✅ Hub deployed to:", deployedContracts.Hub);
        
        // 2. Deploy Profile
        console.log("\n2. Deploying Profile contract...");
        const Profile = await ethers.getContractFactory("Profile", deployer);
        const profile = await upgrades.deployProxy(Profile, [deployedContracts.Hub], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await profile.waitForDeployment();
        deployedContracts.Profile = await profile.getAddress();
        console.log("   ✅ Profile deployed to:", deployedContracts.Profile);
        
        // 3. Deploy PriceOracle
        console.log("\n3. Deploying PriceOracle contract...");
        const PriceOracle = await ethers.getContractFactory("PriceOracle", deployer);
        const priceOracle = await upgrades.deployProxy(PriceOracle, [
            deployer.address,  // Admin address
            "0x10ED43C718714eb63d5aA57B78B54704E256024E"  // PancakeSwap V3 router
        ], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await priceOracle.waitForDeployment();
        deployedContracts.PriceOracle = await priceOracle.getAddress();
        console.log("   ✅ PriceOracle deployed to:", deployedContracts.PriceOracle);
        
        // 4. Deploy Offer with description support
        console.log("\n4. Deploying Offer contract (with description update support)...");
        const Offer = await ethers.getContractFactory("Offer", deployer);
        const offer = await upgrades.deployProxy(Offer, [deployedContracts.Hub], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await offer.waitForDeployment();
        deployedContracts.Offer = await offer.getAddress();
        console.log("   ✅ Offer deployed to:", deployedContracts.Offer);
        console.log("   📝 Includes updateOfferDescription function");
        
        // Verify initialization
        const offerHub = await offer.hub();
        console.log("   ✅ Offer initialized with Hub:", offerHub);
        
        // 5. Deploy Trade with zero addresses for circular dependencies
        console.log("\n5. Deploying Trade contract...");
        const Trade = await ethers.getContractFactory("Trade", deployer);
        const trade = await upgrades.deployProxy(Trade, [
            deployedContracts.Hub,
            deployedContracts.Offer,
            deployedContracts.Profile,
            ethers.ZeroAddress,  // Escrow - will be set later
            ethers.ZeroAddress   // ArbitratorManager - will be set later
        ], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await trade.waitForDeployment();
        deployedContracts.Trade = await trade.getAddress();
        console.log("   ✅ Trade deployed to:", deployedContracts.Trade);
        
        // 6. Deploy Escrow
        console.log("\n6. Deploying Escrow contract...");
        const Escrow = await ethers.getContractFactory("Escrow", deployer);
        const escrow = await upgrades.deployProxy(Escrow, [
            deployedContracts.Hub,
            deployedContracts.PriceOracle,
            deployedContracts.Trade
        ], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await escrow.waitForDeployment();
        deployedContracts.Escrow = await escrow.getAddress();
        console.log("   ✅ Escrow deployed to:", deployedContracts.Escrow);
        
        // 7. Deploy ArbitratorManager
        console.log("\n7. Deploying ArbitratorManager contract...");
        const ArbitratorManager = await ethers.getContractFactory("ArbitratorManager", deployer);
        const arbitratorManager = await upgrades.deployProxy(ArbitratorManager, [
            deployedContracts.Hub,
            deployedContracts.Trade
        ], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await arbitratorManager.waitForDeployment();
        deployedContracts.ArbitratorManager = await arbitratorManager.getAddress();
        console.log("   ✅ ArbitratorManager deployed to:", deployedContracts.ArbitratorManager);
        
        console.log("\n" + "=".repeat(70));
        console.log("CONFIGURING CIRCULAR DEPENDENCIES");
        console.log("=".repeat(70));
        
        // 8. Update Trade with Escrow and ArbitratorManager
        console.log("\n8. Updating Trade contract dependencies...");
        const tradeContract = await ethers.getContractAt("Trade", deployedContracts.Trade, deployer);
        
        console.log("   Setting Escrow contract...");
        await tradeContract.setEscrowContract(deployedContracts.Escrow);
        console.log("   ✅ Escrow contract set");
        
        console.log("   Setting ArbitratorManager...");
        await tradeContract.setArbitratorManager(deployedContracts.ArbitratorManager);
        console.log("   ✅ ArbitratorManager set");
        
        // 9. Update Hub configuration with all contract addresses
        console.log("\n9. Configuring Hub with all contract addresses...");
        const hubContract = await ethers.getContractAt("Hub", deployedContracts.Hub, deployer);
        
        const hubConfig = {
            offerContract: deployedContracts.Offer,
            tradeContract: deployedContracts.Trade,
            profileContract: deployedContracts.Profile,
            priceContract: deployedContracts.PriceOracle,
            treasury: deployer.address,
            localMarket: deployer.address,
            priceProvider: deployer.address,
            localTokenAddress: ethers.ZeroAddress,
            chainFeeCollector: deployer.address,
            swapRouter: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap V3
            burnFeePct: 0,              // 0% - Zero fees
            chainFeePct: 0,             // 0% - Zero fees
            warchestFeePct: 0,          // 0% - Zero fees
            conversionFeePct: 0,        // 0% - Zero fees
            arbitratorFeePct: 0,        // 0% - Zero fees
            minTradeAmount: ethers.parseUnits("10", 6),      // $10 minimum
            maxTradeAmount: ethers.parseUnits("10000", 6),   // $10,000 maximum
            maxActiveOffers: 100,
            maxActiveTrades: 100,
            tradeExpirationTimer: 24 * 60 * 60,     // 24 hours
            tradeDisputeTimer: 7 * 24 * 60 * 60,    // 7 days
            globalPause: false,
            pauseNewTrades: false,
            pauseDeposits: false,
            pauseWithdrawals: false
        };
        
        await hubContract.updateConfig(hubConfig);
        console.log("   ✅ Hub configuration updated with all contract addresses");
        console.log("   ✅ Zero fees configuration applied");
        
        // Verify final configuration
        console.log("\n10. Verifying final configuration...");
        const finalConfig = await hubContract.getConfig();
        console.log("   Hub -> Offer:", finalConfig.offerContract);
        console.log("   Hub -> Trade:", finalConfig.tradeContract);
        console.log("   Hub -> Profile:", finalConfig.profileContract);
        console.log("   Hub -> PriceOracle:", finalConfig.priceContract);
        
        // Verify Offer initialization
        const offerContract = await ethers.getContractAt("Offer", deployedContracts.Offer, deployer);
        const verifiedHub = await offerContract.hub();
        console.log("   Offer -> Hub:", verifiedHub);
        
        if (verifiedHub.toLowerCase() === deployedContracts.Hub.toLowerCase()) {
            console.log("   ✅ Offer correctly initialized with Hub!");
        } else {
            console.log("   ❌ Offer initialization verification failed!");
        }
        
        // Save deployment results
        console.log("\n" + "=".repeat(70));
        console.log("DEPLOYMENT COMPLETE");
        console.log("=".repeat(70));
        
        const deploymentInfo = {
            network: "BSC Mainnet",
            chainId: Number(network.chainId),
            deployer: deployer.address,
            timestamp: new Date().toISOString(),
            contracts: deployedContracts,
            configuration: {
                pancakeSwapRouter: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
                fees: {
                    burn: 0,
                    chain: 0,
                    warchest: 0,
                    conversion: 0,
                    arbitrator: 0
                },
                limits: {
                    minTrade: "$10",
                    maxTrade: "$10,000",
                    maxActiveOffers: 100,
                    maxActiveTrades: 100
                },
                timers: {
                    tradeExpiration: "24 hours",
                    disputeWindow: "7 days"
                }
            },
            features: {
                offerDescriptionUpdate: true,
                maxDescriptionLength: 280,
                zeroFees: true
            },
            status: "fully deployed and configured"
        };
        
        // Save to file
        const deploymentsDir = path.join(__dirname, '..', 'deployments');
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir);
        }
        
        const filename = `bsc-mainnet-complete-${Date.now()}.json`;
        fs.writeFileSync(
            path.join(deploymentsDir, filename),
            JSON.stringify(deploymentInfo, null, 2)
        );
        
        console.log("\n✅ All contracts deployed and configured successfully!");
        console.log("\n📁 Deployment info saved to:", `deployments/${filename}`);
        
        console.log("\n" + "=".repeat(70));
        console.log("CONTRACT ADDRESSES");
        console.log("=".repeat(70));
        
        console.log("\nHub:               ", deployedContracts.Hub);
        console.log("Profile:           ", deployedContracts.Profile);
        console.log("PriceOracle:       ", deployedContracts.PriceOracle);
        console.log("Offer:             ", deployedContracts.Offer);
        console.log("Trade:             ", deployedContracts.Trade);
        console.log("Escrow:            ", deployedContracts.Escrow);
        console.log("ArbitratorManager: ", deployedContracts.ArbitratorManager);
        
        // BSCScan links
        console.log("\n📊 View on BSCScan:");
        Object.entries(deployedContracts).forEach(([name, address]) => {
            console.log(`   ${name}: https://bscscan.com/address/${address}`);
        });
        
        // Final balance
        const finalBalance = await ethers.provider.getBalance(deployer.address);
        console.log("\n💰 Gas Usage:");
        console.log(`   Starting Balance: ${ethers.formatEther(balance)} BNB`);
        console.log(`   Final Balance:    ${ethers.formatEther(finalBalance)} BNB`);
        console.log(`   Total Gas Used:   ${ethers.formatEther(balance - finalBalance)} BNB`);
        
        console.log("\n✅ Summary:");
        console.log("   - All contracts deployed successfully");
        console.log("   - Offer description updates: ENABLED");
        console.log("   - Zero fees: ACTIVE");
        console.log("   - System ready for use");
        
        console.log("\n📝 Next Steps:");
        console.log("1. Update app/src/network/evm/config/bsc.ts with new addresses");
        console.log("2. Build and deploy frontend");
        console.log("3. Test offer creation and description updates");
        console.log("4. Verify contracts on BSCScan if needed");
        
        return deploymentInfo;
        
    } catch (error) {
        console.error("\n❌ Deployment failed:", error);
        
        // Save partial deployment if any contracts were deployed
        if (Object.keys(deployedContracts).length > 0) {
            const partialFilename = `bsc-mainnet-partial-${Date.now()}.json`;
            fs.writeFileSync(
                path.join(__dirname, '..', 'deployments', partialFilename),
                JSON.stringify({
                    status: "partial",
                    contracts: deployedContracts,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, null, 2)
            );
            console.log("\n📁 Partial deployment saved to:", `deployments/${partialFilename}`);
        }
        
        process.exit(1);
    }
}

main()
    .then((result) => {
        console.log("\n✨ Deployment script completed successfully!");
        
        // Output for easy copying to frontend config
        console.log("\n" + "=".repeat(70));
        console.log("FRONTEND CONFIGURATION");
        console.log("Copy this to app/src/network/evm/config/bsc.ts:");
        console.log("=".repeat(70));
        
        console.log(`
export const BSC_MAINNET_HUB_INFO: EVMHubInfo = {
  hubAddress: '${result.contracts.Hub}',
  profileAddress: '${result.contracts.Profile}',
  offerAddress: '${result.contracts.Offer}',
  tradeAddress: '${result.contracts.Trade}',
  escrowAddress: '${result.contracts.Escrow}',
  priceOracleAddress: '${result.contracts.PriceOracle}',
  arbitratorManagerAddress: '${result.contracts.ArbitratorManager}',
  hubConfig: {
    profile_addr: '${result.contracts.Profile}',
    offer_addr: '${result.contracts.Offer}',
    trade_addr: '${result.contracts.Trade}',
    escrow_addr: '${result.contracts.Escrow}',
    price_addr: '${result.contracts.PriceOracle}',
    price_oracle_addr: '${result.contracts.PriceOracle}',
    price_provider_addr: '${result.deployer}',
    local_denom: { native: 'USDT' },
    local_market_addr: '${result.deployer}',
    chain_fee_collector_addr: '${result.deployer}',
    warchest_addr: '${result.deployer}',
    arbitration_fee_pct: 0,
    burn_fee_pct: 0,
    chain_fee_pct: 0,
    warchest_fee_pct: 0,
    active_offers_limit: 100,
    active_trades_limit: 100,
    trade_expiration_timer: 86400,
    platform_fee: 0,
    platform_fee_recipient: '${result.deployer}',
  },
}`);
        
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });