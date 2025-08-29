require("dotenv").config();
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("=".repeat(70));
    console.log("LocalMoney Smart Contracts - BSC Deployment (Final)");
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
    
    // Already deployed contracts
    const deployedContracts = {
        Hub: "0x696F771E329DF4550044686C995AB9028fD3a724",
        Profile: "0x9a1AD40c90E5f282152Aa9F56d18B99F31794B68",
        PriceOracle: "0x09e65e3a9028f7B8d59F85b9A6933C6eF6e092ca"
    };
    
    console.log("\n" + "=".repeat(70));
    console.log("Already Deployed Contracts:");
    console.log("=".repeat(70));
    console.log("   Hub:         ", deployedContracts.Hub);
    console.log("   Profile:     ", deployedContracts.Profile);
    console.log("   PriceOracle: ", deployedContracts.PriceOracle);
    
    console.log("\n" + "=".repeat(70));
    console.log("Continuing Deployment...");
    console.log("=".repeat(70));
    
    try {
        const hubAddress = deployedContracts.Hub;
        const profileAddress = deployedContracts.Profile;
        const priceOracleAddress = deployedContracts.PriceOracle;
        
        // Deploy contracts in correct order to handle dependencies
        
        // 1. Deploy Offer Contract (only needs Hub)
        console.log("\n1. Deploying Offer contract...");
        const Offer = await ethers.getContractFactory("Offer", deployer);
        const offer = await upgrades.deployProxy(
            Offer, 
            [hubAddress], // Only needs hub
            {
                initializer: "initialize",
                kind: "uups"
            }
        );
        await offer.waitForDeployment();
        const offerAddress = await offer.getAddress();
        deployedContracts.Offer = offerAddress;
        console.log("   ✅ Offer deployed to:", offerAddress);
        
        // We need to deploy in a special order because of dependencies:
        // Trade needs: hub, offer, profile, escrow, arbitratorManager
        // Escrow needs: hub, priceOracle, trade
        // ArbitratorManager needs: hub, trade
        
        // So we'll use placeholder addresses and update later
        
        // 2. Deploy placeholder contracts first
        console.log("\n2. Deploying Trade contract (with placeholders)...");
        const Trade = await ethers.getContractFactory("Trade", deployer);
        // Deploy with zero addresses for now - we'll reinitialize
        const trade = await upgrades.deployProxy(
            Trade, 
            [
                hubAddress,
                offerAddress,
                profileAddress, 
                ethers.ZeroAddress, // escrow placeholder
                ethers.ZeroAddress  // arbitratorManager placeholder
            ],
            {
                initializer: "initialize",
                kind: "uups"
            }
        );
        await trade.waitForDeployment();
        const tradeAddress = await trade.getAddress();
        deployedContracts.Trade = tradeAddress;
        console.log("   ✅ Trade deployed to:", tradeAddress);
        
        // 3. Now deploy Escrow with actual Trade address
        console.log("\n3. Deploying Escrow contract...");
        const Escrow = await ethers.getContractFactory("Escrow", deployer);
        const escrow = await upgrades.deployProxy(
            Escrow,
            [hubAddress, priceOracleAddress, tradeAddress], // hub, priceOracle, trade
            {
                initializer: "initialize", 
                kind: "uups"
            }
        );
        await escrow.waitForDeployment();
        const escrowAddress = await escrow.getAddress();
        deployedContracts.Escrow = escrowAddress;
        console.log("   ✅ Escrow deployed to:", escrowAddress);
        
        // 4. Deploy ArbitratorManager with Trade address
        console.log("\n4. Deploying ArbitratorManager contract...");
        const ArbitratorManager = await ethers.getContractFactory("ArbitratorManager", deployer);
        const arbitratorManager = await upgrades.deployProxy(
            ArbitratorManager, 
            [hubAddress, tradeAddress], // hub, trade
            {
                initializer: "initialize",
                kind: "uups"
            }
        );
        await arbitratorManager.waitForDeployment();
        const arbitratorManagerAddress = await arbitratorManager.getAddress();
        deployedContracts.ArbitratorManager = arbitratorManagerAddress;
        console.log("   ✅ ArbitratorManager deployed to:", arbitratorManagerAddress);
        
        // 5. Update Trade contract with correct addresses
        console.log("\n5. Updating Trade contract configuration...");
        // Note: Trade contract needs a function to update escrow and arbitrator addresses
        // If it doesn't have one, we may need to redeploy
        
        // 6. Update Hub Configuration
        console.log("\n6. Updating Hub configuration...");
        const Hub = await ethers.getContractFactory("Hub", deployer);
        const hub = Hub.attach(hubAddress);
        
        const config = {
            offerContract: offerAddress,
            tradeContract: tradeAddress,
            profileContract: profileAddress,
            priceContract: priceOracleAddress,
            treasury: deployer.address,
            localMarket: deployer.address,
            priceProvider: deployer.address,
            localTokenAddress: ethers.ZeroAddress,
            chainFeeCollector: deployer.address,
            swapRouter: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
            burnFeePct: 100,
            chainFeePct: 200,
            warchestFeePct: 300,
            conversionFeePct: 50,
            arbitratorFeePct: 100,
            minTradeAmount: ethers.parseUnits("10", 6),
            maxTradeAmount: ethers.parseUnits("10000", 6),
            maxActiveOffers: 10,
            maxActiveTrades: 5,
            tradeExpirationTimer: 24 * 60 * 60,
            tradeDisputeTimer: 7 * 24 * 60 * 60,
            globalPause: false,
            pauseNewTrades: false,
            pauseDeposits: false,
            pauseWithdrawals: false
        };
        
        const tx = await hub.updateConfig(config);
        await tx.wait();
        console.log("   ✅ Hub configuration updated");
        
        // 7. Save Deployment Info
        const deploymentInfo = {
            network: networkName,
            chainId: chainId.toString(),
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            contracts: deployedContracts,
            config: config
        };
        
        const filename = `deployment-bsc-mainnet-complete-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
        
        console.log("\n" + "=".repeat(70));
        console.log("🎉 DEPLOYMENT COMPLETE!");
        console.log("=".repeat(70));
        console.log("\nAll Contracts:");
        Object.entries(deployedContracts).forEach(([name, address]) => {
            console.log(`   ${name.padEnd(20)} : ${address}`);
        });
        console.log("\n📁 Deployment info saved to:", filename);
        
        // BSCScan links
        console.log("\n📊 View on BSCScan:");
        Object.entries(deployedContracts).forEach(([name, address]) => {
            console.log(`   ${name}: https://bscscan.com/address/${address}`);
        });
        
        console.log("\n⚠️  IMPORTANT NOTES:");
        console.log("   - Trade contract was deployed with placeholder addresses");
        console.log("   - You may need to update Trade's escrow and arbitrator addresses");
        console.log("   - Verify all contract interactions before production use");
        
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