require("dotenv").config();
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("=".repeat(70));
    console.log("LocalMoney Smart Contracts - BSC Deployment");
    console.log("=".repeat(70));
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId;
    const networkName = chainId === 56n ? "BSC Mainnet" : chainId === 97n ? "BSC Testnet" : `Unknown (${chainId})`;
    
    console.log(`\nNetwork: ${networkName}`);
    console.log(`Chain ID: ${chainId}`);
    
    // Create wallet from private key
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
        console.error("❌ DEPLOYER_PRIVATE_KEY not found in .env file");
        process.exit(1);
    }
    
    const deployer = new ethers.Wallet(privateKey, ethers.provider);
    console.log("\nDeployer Address:", deployer.address);
    
    // Check balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "BNB");
    
    const minRequired = ethers.parseEther("0.02");
    if (balance < minRequired) {
        console.error("\n❌ Insufficient balance for deployment");
        console.error(`   Current: ${ethers.formatEther(balance)} BNB`);
        console.error(`   Required: 0.02 BNB minimum`);
        console.error(`\n   Please send BNB to: ${deployer.address}`);
        process.exit(1);
    }
    
    console.log("\n✅ Sufficient balance for deployment");
    console.log("\n" + "=".repeat(70));
    console.log("Starting Deployment...");
    console.log("=".repeat(70));
    
    const deployedContracts = {};
    
    try {
        // 1. Deploy Hub Contract
        console.log("\n1. Deploying Hub contract...");
        const Hub = await ethers.getContractFactory("Hub", deployer);
        
        const defaultConfig = {
            offerContract: ethers.ZeroAddress,
            tradeContract: ethers.ZeroAddress,
            profileContract: ethers.ZeroAddress,
            priceContract: ethers.ZeroAddress,
            treasury: deployer.address,
            localMarket: deployer.address,
            priceProvider: deployer.address,
            localTokenAddress: ethers.ZeroAddress, // Will deploy LOCAL token later
            chainFeeCollector: deployer.address,
            swapRouter: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap V3 router on BSC
            burnFeePct: 100,  // 1%
            chainFeePct: 200, // 2%
            warchestFeePct: 300, // 3%
            conversionFeePct: 50, // 0.5%
            arbitratorFeePct: 100, // 1%
            minTradeAmount: ethers.parseUnits("10", 6), // $10
            maxTradeAmount: ethers.parseUnits("10000", 6), // $10,000
            maxActiveOffers: 10,
            maxActiveTrades: 5,
            tradeExpirationTimer: 24 * 60 * 60, // 24 hours
            tradeDisputeTimer: 7 * 24 * 60 * 60, // 7 days
            globalPause: false,
            pauseNewTrades: false,
            pauseDeposits: false,
            pauseWithdrawals: false
        };
        
        const minDelay = 2 * 24 * 60 * 60; // 48 hours timelock delay for production
        const hub = await upgrades.deployProxy(Hub, [defaultConfig, minDelay], {
            initializer: "initialize",
            kind: "uups"
        });
        await hub.waitForDeployment();
        const hubAddress = await hub.getAddress();
        deployedContracts.Hub = hubAddress;
        console.log("   ✅ Hub deployed to:", hubAddress);
        
        // 2. Deploy Profile Contract
        console.log("\n2. Deploying Profile contract...");
        const Profile = await ethers.getContractFactory("Profile", deployer);
        const profile = await upgrades.deployProxy(Profile, [hubAddress], {
            initializer: "initialize",
            kind: "uups"
        });
        await profile.waitForDeployment();
        const profileAddress = await profile.getAddress();
        deployedContracts.Profile = profileAddress;
        console.log("   ✅ Profile deployed to:", profileAddress);
        
        // 3. Deploy ArbitratorManager Contract
        console.log("\n3. Deploying ArbitratorManager contract...");
        const ArbitratorManager = await ethers.getContractFactory("ArbitratorManager", deployer);
        const arbitratorManager = await upgrades.deployProxy(ArbitratorManager, [hubAddress], {
            initializer: "initialize",
            kind: "uups"
        });
        await arbitratorManager.waitForDeployment();
        const arbitratorManagerAddress = await arbitratorManager.getAddress();
        deployedContracts.ArbitratorManager = arbitratorManagerAddress;
        console.log("   ✅ ArbitratorManager deployed to:", arbitratorManagerAddress);
        
        // 4. Deploy PriceOracle Contract
        console.log("\n4. Deploying PriceOracle contract...");
        const PriceOracle = await ethers.getContractFactory("PriceOracle", deployer);
        const priceOracle = await upgrades.deployProxy(PriceOracle, [hubAddress], {
            initializer: "initialize",
            kind: "uups"
        });
        await priceOracle.waitForDeployment();
        const priceOracleAddress = await priceOracle.getAddress();
        deployedContracts.PriceOracle = priceOracleAddress;
        console.log("   ✅ PriceOracle deployed to:", priceOracleAddress);
        
        // 5. Deploy Escrow Contract
        console.log("\n5. Deploying Escrow contract...");
        const Escrow = await ethers.getContractFactory("Escrow", deployer);
        const escrow = await upgrades.deployProxy(Escrow, [hubAddress], {
            initializer: "initialize",
            kind: "uups"
        });
        await escrow.waitForDeployment();
        const escrowAddress = await escrow.getAddress();
        deployedContracts.Escrow = escrowAddress;
        console.log("   ✅ Escrow deployed to:", escrowAddress);
        
        // 6. Deploy Offer Contract
        console.log("\n6. Deploying Offer contract...");
        const Offer = await ethers.getContractFactory("Offer", deployer);
        const offer = await upgrades.deployProxy(Offer, [hubAddress], {
            initializer: "initialize",
            kind: "uups"
        });
        await offer.waitForDeployment();
        const offerAddress = await offer.getAddress();
        deployedContracts.Offer = offerAddress;
        console.log("   ✅ Offer deployed to:", offerAddress);
        
        // 7. Deploy Trade Contract
        console.log("\n7. Deploying Trade contract...");
        const Trade = await ethers.getContractFactory("Trade", deployer);
        const trade = await upgrades.deployProxy(Trade, [hubAddress], {
            initializer: "initialize",
            kind: "uups"
        });
        await trade.waitForDeployment();
        const tradeAddress = await trade.getAddress();
        deployedContracts.Trade = tradeAddress;
        console.log("   ✅ Trade deployed to:", tradeAddress);
        
        // 8. Update Hub Configuration
        console.log("\n8. Updating Hub configuration...");
        const updatedConfig = {
            ...defaultConfig,
            offerContract: offerAddress,
            tradeContract: tradeAddress,
            profileContract: profileAddress,
            priceContract: priceOracleAddress
        };
        
        const tx = await hub.updateConfig(updatedConfig);
        await tx.wait();
        console.log("   ✅ Hub configuration updated");
        
        // 9. Verify Configuration
        console.log("\n9. Verifying deployment...");
        const hubConfig = await hub.getConfig();
        console.log("   Hub Configuration:");
        console.log("   - Offer Contract:", hubConfig.offerContract);
        console.log("   - Trade Contract:", hubConfig.tradeContract);
        console.log("   - Profile Contract:", hubConfig.profileContract);
        console.log("   - Price Oracle:", hubConfig.priceContract);
        console.log("   - Arbitrator Manager:", hubConfig.arbitratorManager);
        console.log("   - Escrow Contract:", hubConfig.escrowContract);
        
        // 10. Save Deployment Info
        const deploymentInfo = {
            network: networkName,
            chainId: chainId.toString(),
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            contracts: deployedContracts,
            config: updatedConfig
        };
        
        const filename = `deployment-bsc-${chainId === 56n ? 'mainnet' : 'testnet'}-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
        
        console.log("\n" + "=".repeat(70));
        console.log("DEPLOYMENT SUMMARY");
        console.log("=".repeat(70));
        console.log("\nContracts Deployed:");
        Object.entries(deployedContracts).forEach(([name, address]) => {
            console.log(`   ${name.padEnd(20)} : ${address}`);
        });
        console.log("\n✅ Deployment completed successfully!");
        console.log(`📁 Deployment info saved to: ${filename}`);
        
        // BSCScan links
        const explorerBase = chainId === 56n 
            ? "https://bscscan.com" 
            : "https://testnet.bscscan.com";
        
        console.log("\n📊 View on BSCScan:");
        Object.entries(deployedContracts).forEach(([name, address]) => {
            console.log(`   ${name}: ${explorerBase}/address/${address}`);
        });
        
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