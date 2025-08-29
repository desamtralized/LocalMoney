require("dotenv").config();
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("=".repeat(70));
    console.log("LocalMoney Smart Contracts - BSC Mainnet Deployment");
    console.log("With Offer Description Update Support - Zero Fees");
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
    
    if (balance < ethers.parseEther("0.02")) {
        console.error("❌ Insufficient balance. Need at least 0.02 BNB");
        process.exit(1);
    }
    
    const deployedContracts = {};
    
    try {
        console.log("\n" + "=".repeat(70));
        console.log("DEPLOYING CONTRACTS WITH OFFER DESCRIPTION UPDATE SUPPORT");
        console.log("=".repeat(70));
        
        // 1. Deploy Hub
        console.log("\n1. Deploying Hub contract...");
        const Hub = await ethers.getContractFactory("Hub", deployer);
        
        // Initial Hub configuration with zero fees
        const initialHubConfig = {
            offerContract: ethers.ZeroAddress,  // Will be set later
            tradeContract: ethers.ZeroAddress,  // Will be set later
            profileContract: ethers.ZeroAddress, // Will be set later
            priceContract: ethers.ZeroAddress,  // Will be set later
            treasury: deployer.address,
            localMarket: deployer.address,
            priceProvider: deployer.address,
            localTokenAddress: ethers.ZeroAddress,
            chainFeeCollector: deployer.address,
            swapRouter: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap V3
            burnFeePct: 0,              // 0% - No fees
            chainFeePct: 0,             // 0% - No fees
            warchestFeePct: 0,          // 0% - No fees
            conversionFeePct: 0,        // 0% - No fees
            arbitratorFeePct: 0,        // 0% - No fees
            minTradeAmount: ethers.parseUnits("1", 6),       // $1 minimum
            maxTradeAmount: ethers.parseUnits("500", 6),     // $500 maximum
            maxActiveOffers: 10,
            maxActiveTrades: 5,
            tradeExpirationTimer: 24 * 60 * 60,
            tradeDisputeTimer: 7 * 24 * 60 * 60,
            globalPause: false,
            pauseNewTrades: false,
            pauseDeposits: false,
            pauseWithdrawals: false
        };
        
        const hub = await upgrades.deployProxy(Hub, [
            initialHubConfig,
            2 * 24 * 60 * 60  // 2 days timelock delay
        ], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await hub.waitForDeployment();
        deployedContracts.Hub = await hub.getAddress();
        console.log("   ✅ Hub deployed to:", deployedContracts.Hub);
        
        // 2. Deploy Profile
        console.log("\n2. Deploying Profile contract...");
        const Profile = await ethers.getContractFactory("Profile", deployer);
        const profile = await upgrades.deployProxy(Profile, [
            deployedContracts.Hub  // Only needs hub address
        ], {
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
            deployer.address,  // admin
            "0x10ED43C718714eb63d5aA57B78B54704E256024E"  // PancakeSwap V3 Router
        ], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await priceOracle.waitForDeployment();
        deployedContracts.PriceOracle = await priceOracle.getAddress();
        console.log("   ✅ PriceOracle deployed to:", deployedContracts.PriceOracle);
        
        // 4. Deploy Offer (with description update support)
        console.log("\n4. Deploying Offer contract (with description update support)...");
        const Offer = await ethers.getContractFactory("Offer", deployer);
        const offer = await upgrades.deployProxy(Offer, [
            deployedContracts.Hub  // Only needs hub address
        ], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await offer.waitForDeployment();
        deployedContracts.Offer = await offer.getAddress();
        console.log("   ✅ Offer deployed to:", deployedContracts.Offer);
        console.log("   📝 Includes updateOfferDescription function");
        
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
        
        // 6. Deploy Escrow with zero trade address
        console.log("\n6. Deploying Escrow contract...");
        const Escrow = await ethers.getContractFactory("Escrow", deployer);
        const escrow = await upgrades.deployProxy(Escrow, [
            deployedContracts.Hub,
            deployedContracts.PriceOracle,
            ethers.ZeroAddress  // Trade - will be set later
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
        
        // Update circular dependencies
        console.log("\n" + "=".repeat(70));
        console.log("UPDATING CIRCULAR DEPENDENCIES");
        console.log("=".repeat(70));
        
        // Update Trade with Escrow and ArbitratorManager addresses
        console.log("\n8. Updating Trade contract dependencies...");
        const tradeContract = await ethers.getContractAt("Trade", deployedContracts.Trade, deployer);
        await tradeContract.updateDependencies(
            deployedContracts.Escrow,
            deployedContracts.ArbitratorManager
        );
        console.log("   ✅ Trade updated with Escrow and ArbitratorManager");
        
        // Update Escrow with Trade address
        console.log("\n9. Updating Escrow contract dependencies...");
        const escrowContract = await ethers.getContractAt("Escrow", deployedContracts.Escrow, deployer);
        await escrowContract.setTradeContract(deployedContracts.Trade);
        console.log("   ✅ Escrow updated with Trade address");
        
        // Update Hub with all contract addresses
        console.log("\n10. Updating Hub configuration...");
        const hubContract = await ethers.getContractAt("Hub", deployedContracts.Hub, deployer);
        
        const updatedConfig = {
            ...initialHubConfig,
            offerContract: deployedContracts.Offer,
            tradeContract: deployedContracts.Trade,
            profileContract: deployedContracts.Profile,
            priceContract: deployedContracts.PriceOracle,
        };
        
        await hubContract.updateConfig(updatedConfig);
        console.log("   ✅ Hub configuration updated with all contract addresses");
        console.log("   ✅ Zero fees configuration applied");
        
        // Save deployment results
        console.log("\n" + "=".repeat(70));
        console.log("DEPLOYMENT SUMMARY");
        console.log("=".repeat(70));
        
        const deploymentInfo = {
            network: "BSC Mainnet",
            chainId: Number(network.chainId),
            deployer: deployer.address,
            timestamp: new Date().toISOString(),
            contracts: {
                Hub: deployedContracts.Hub,
                Profile: deployedContracts.Profile,
                Offer: deployedContracts.Offer,
                Trade: deployedContracts.Trade,
                Escrow: deployedContracts.Escrow,
                PriceOracle: deployedContracts.PriceOracle,
                ArbitratorManager: deployedContracts.ArbitratorManager,
            },
            features: {
                offerDescriptionUpdate: true,
                maxDescriptionLength: 280,
                zeroFees: true,
            }
        };
        
        // Save to file
        const deploymentsDir = path.join(__dirname, '..', 'deployments');
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir);
        }
        
        const filename = `bsc-mainnet-${Date.now()}.json`;
        fs.writeFileSync(
            path.join(deploymentsDir, filename),
            JSON.stringify(deploymentInfo, null, 2)
        );
        
        console.log("\n✅ All contracts deployed successfully!");
        console.log("\n📁 Deployment info saved to:", `deployments/${filename}`);
        
        console.log("\n" + "=".repeat(70));
        console.log("CONTRACT ADDRESSES FOR CONFIGURATION");
        console.log("=".repeat(70));
        
        console.log("\nHub:", deployedContracts.Hub);
        console.log("Profile:", deployedContracts.Profile);
        console.log("Offer:", deployedContracts.Offer);
        console.log("Trade:", deployedContracts.Trade);
        console.log("Escrow:", deployedContracts.Escrow);
        console.log("PriceOracle:", deployedContracts.PriceOracle);
        console.log("ArbitratorManager:", deployedContracts.ArbitratorManager);
        
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
        console.log(`   Gas Used:         ${ethers.formatEther(balance - finalBalance)} BNB`);
        
        console.log("\n✅ Configuration Summary:");
        console.log("   - All fees: 0% (ZERO FEES)");
        console.log("   - Min trade amount: $1");
        console.log("   - Max trade amount: $500");
        console.log("   - Trade expiration: 24 hours");
        console.log("   - Dispute window: 7 days");
        console.log("   - Offer description updates: ENABLED");
        
        console.log("\n📝 Next Steps:");
        console.log("1. Update app/src/network/evm/config/bsc.ts with these addresses");
        console.log("2. Test the deployment on BSC Mainnet");
        console.log("3. Verify contracts on BscScan if needed");
        console.log("4. Register arbitrators as needed");
        
        return deploymentInfo;
        
    } catch (error) {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    }
}

main()
    .then((result) => {
        console.log("\n✨ Deployment script completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });