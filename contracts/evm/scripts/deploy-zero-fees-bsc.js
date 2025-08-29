require("dotenv").config();
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("=".repeat(70));
    console.log("LocalMoney Smart Contracts - BSC Mainnet Deployment (Zero Fees)");
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
        console.log("DEPLOYING NEW CONTRACTS WITH ZERO FEES");
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
            deployedContracts.Hub
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
            deployedContracts.Hub
        ], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await priceOracle.waitForDeployment();
        deployedContracts.PriceOracle = await priceOracle.getAddress();
        console.log("   ✅ PriceOracle deployed to:", deployedContracts.PriceOracle);
        
        // 4. Deploy Offer
        console.log("\n4. Deploying Offer contract...");
        const Offer = await ethers.getContractFactory("Offer", deployer);
        const offer = await upgrades.deployProxy(Offer, [
            deployedContracts.Hub
        ], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await offer.waitForDeployment();
        deployedContracts.Offer = await offer.getAddress();
        console.log("   ✅ Offer deployed to:", deployedContracts.Offer);
        
        // 5. Deploy Trade with zero addresses
        console.log("\n5. Deploying Trade contract (with zero addresses)...");
        const Trade = await ethers.getContractFactory("Trade", deployer);
        const trade = await upgrades.deployProxy(Trade, [
            deployedContracts.Hub,
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
        console.log("\n6. Deploying Escrow contract (with zero trade address)...");
        const Escrow = await ethers.getContractFactory("Escrow", deployer);
        const escrow = await upgrades.deployProxy(Escrow, [
            deployedContracts.Hub,
            ethers.ZeroAddress  // Trade - will be set later
        ], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await escrow.waitForDeployment();
        deployedContracts.Escrow = await escrow.getAddress();
        console.log("   ✅ Escrow deployed to:", deployedContracts.Escrow);
        
        // 7. Deploy ArbitratorManager with zero trade address
        console.log("\n7. Deploying ArbitratorManager contract (with zero trade address)...");
        const ArbitratorManager = await ethers.getContractFactory("ArbitratorManager", deployer);
        const arbitratorManager = await upgrades.deployProxy(ArbitratorManager, [
            deployedContracts.Hub,
            ethers.ZeroAddress  // Trade - will be set later
        ], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await arbitratorManager.waitForDeployment();
        deployedContracts.ArbitratorManager = await arbitratorManager.getAddress();
        console.log("   ✅ ArbitratorManager deployed to:", deployedContracts.ArbitratorManager);
        
        console.log("\n" + "=".repeat(70));
        console.log("PHASE 2: Updating Contract Addresses...");
        console.log("=".repeat(70));
        
        // 8. Update Trade contract addresses
        console.log("\n8. Updating Trade contract addresses...");
        console.log("   Setting Escrow address...");
        await trade.setEscrowContract(deployedContracts.Escrow);
        console.log("   ✅ Escrow address set");
        
        console.log("   Setting ArbitratorManager address...");
        await trade.setArbitratorManagerContract(deployedContracts.ArbitratorManager);
        console.log("   ✅ ArbitratorManager address set");
        
        // 9. Update Escrow contract
        console.log("\n9. Updating Escrow contract...");
        console.log("   Setting Trade contract address...");
        await escrow.setTradeContract(deployedContracts.Trade);
        console.log("   ✅ Trade contract address set");
        
        // 10. Update ArbitratorManager contract
        console.log("\n10. Updating ArbitratorManager contract...");
        console.log("   Setting Trade contract address...");
        await arbitratorManager.setTradeContract(deployedContracts.Trade);
        console.log("   ✅ Trade contract address set");
        
        // 11. Update Hub configuration with ZERO FEES
        console.log("\n11. Updating Hub configuration (ZERO FEES)...");
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
        
        await hub.updateConfig(hubConfig);
        console.log("   ✅ Hub configuration updated with ZERO FEES");
        console.log("      - All fees: 0%");
        console.log("      - Min trade: $1");
        console.log("      - Max trade: $500");
        
        // Save deployment info
        const deploymentInfo = {
            network: "BSC Mainnet",
            chainId: network.chainId.toString(),
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            contracts: deployedContracts,
            config: {
                ...hubConfig,
                burnFeePct: 0,
                chainFeePct: 0,
                warchestFeePct: 0,
                conversionFeePct: 0,
                arbitratorFeePct: 0,
                minTradeAmount: "1000000",     // $1 in USDC decimals
                maxTradeAmount: "500000000",   // $500 in USDC decimals
                maxActiveOffers: hubConfig.maxActiveOffers,
                maxActiveTrades: hubConfig.maxActiveTrades,
                tradeExpirationTimer: hubConfig.tradeExpirationTimer,
                tradeDisputeTimer: hubConfig.tradeDisputeTimer,
                globalPause: hubConfig.globalPause,
                pauseNewTrades: hubConfig.pauseNewTrades,
                pauseDeposits: hubConfig.pauseDeposits,
                pauseWithdrawals: hubConfig.pauseWithdrawals
            }
        };
        
        const timestamp = Date.now();
        const filename = `deployment-bsc-mainnet-zerofees-${timestamp}.json`;
        fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
        
        console.log("\n" + "=".repeat(70));
        console.log("🎉 DEPLOYMENT COMPLETE!");
        console.log("=".repeat(70));
        console.log("\nAll Deployed Contracts:");
        Object.entries(deployedContracts).forEach(([name, address]) => {
            console.log(`   ${name.padEnd(20)} : ${address}`);
        });
        console.log("\n📁 Deployment info saved to:", filename);
        
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
        
    } catch (error) {
        console.error("\n❌ Deployment failed:", error);
        console.error("\nError details:", error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });