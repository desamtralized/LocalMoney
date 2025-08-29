require("dotenv").config();
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("=".repeat(70));
    console.log("LocalMoney Smart Contracts - BSC Mainnet Final Deployment");
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
        PriceOracle: "0x09e65e3a9028f7B8d59F85b9A6933C6eF6e092ca",
        Offer: "0x5B1E3C79A6A84BD436Fe2141A13E1767C178E621"
    };
    
    console.log("\n" + "=".repeat(70));
    console.log("Already Deployed Contracts:");
    console.log("=".repeat(70));
    Object.entries(deployedContracts).forEach(([name, address]) => {
        console.log(`   ${name.padEnd(12)}: ${address}`);
    });
    
    console.log("\n" + "=".repeat(70));
    console.log("Deploying Remaining Contracts...");
    console.log("=".repeat(70));
    
    try {
        const hubAddress = deployedContracts.Hub;
        const profileAddress = deployedContracts.Profile;
        const priceOracleAddress = deployedContracts.PriceOracle;
        const offerAddress = deployedContracts.Offer;
        
        // PHASE 1: Deploy all contracts with zero addresses where needed
        
        // 1. Deploy Trade with zero addresses for escrow and arbitrator
        console.log("\n1. Deploying Trade contract (with zero addresses)...");
        const Trade = await ethers.getContractFactory("Trade", deployer);
        const trade = await upgrades.deployProxy(
            Trade, 
            [
                hubAddress,
                offerAddress,
                profileAddress, 
                ethers.ZeroAddress, // escrow will be set later
                ethers.ZeroAddress  // arbitratorManager will be set later
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
        
        // 2. Deploy Escrow with zero address for trade
        console.log("\n2. Deploying Escrow contract (with zero trade address)...");
        const Escrow = await ethers.getContractFactory("Escrow", deployer);
        const escrow = await upgrades.deployProxy(
            Escrow,
            [
                hubAddress, 
                priceOracleAddress, 
                ethers.ZeroAddress  // trade will be set later
            ],
            {
                initializer: "initialize", 
                kind: "uups"
            }
        );
        await escrow.waitForDeployment();
        const escrowAddress = await escrow.getAddress();
        deployedContracts.Escrow = escrowAddress;
        console.log("   ✅ Escrow deployed to:", escrowAddress);
        
        // 3. Deploy ArbitratorManager with zero address for trade
        console.log("\n3. Deploying ArbitratorManager contract (with zero trade address)...");
        const ArbitratorManager = await ethers.getContractFactory("ArbitratorManager", deployer);
        const arbitratorManager = await upgrades.deployProxy(
            ArbitratorManager, 
            [
                hubAddress, 
                ethers.ZeroAddress  // trade will be set later
            ],
            {
                initializer: "initialize",
                kind: "uups"
            }
        );
        await arbitratorManager.waitForDeployment();
        const arbitratorManagerAddress = await arbitratorManager.getAddress();
        deployedContracts.ArbitratorManager = arbitratorManagerAddress;
        console.log("   ✅ ArbitratorManager deployed to:", arbitratorManagerAddress);
        
        console.log("\n" + "=".repeat(70));
        console.log("PHASE 2: Updating Contract Addresses...");
        console.log("=".repeat(70));
        
        // PHASE 2: Update all contract addresses using setter functions
        
        // 4. Update Trade contract with escrow and arbitrator addresses
        console.log("\n4. Updating Trade contract addresses...");
        console.log("   Setting Escrow address...");
        let tx = await trade.setEscrowContract(escrowAddress);
        await tx.wait();
        console.log("   ✅ Escrow address set");
        
        console.log("   Setting ArbitratorManager address...");
        tx = await trade.setArbitratorManager(arbitratorManagerAddress);
        await tx.wait();
        console.log("   ✅ ArbitratorManager address set");
        
        // 5. Update Escrow contract with trade address
        console.log("\n5. Updating Escrow contract...");
        console.log("   Setting Trade contract address...");
        tx = await escrow.setTradeContract(tradeAddress);
        await tx.wait();
        console.log("   ✅ Trade contract address set");
        
        // 6. Update ArbitratorManager with trade address
        console.log("\n6. Updating ArbitratorManager contract...");
        console.log("   Setting Trade contract address...");
        tx = await arbitratorManager.setTradeContract(tradeAddress);
        await tx.wait();
        console.log("   ✅ Trade contract address set");
        
        // 7. Update Hub Configuration
        console.log("\n7. Updating Hub configuration...");
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
        
        tx = await hub.updateConfig(config);
        await tx.wait();
        console.log("   ✅ Hub configuration updated");
        
        // 8. Save Deployment Info
        const deploymentInfo = {
            network: networkName,
            chainId: chainId.toString(),
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            contracts: deployedContracts,
            config: config
        };
        
        const filename = `deployment-bsc-mainnet-final-${Date.now()}.json`;
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