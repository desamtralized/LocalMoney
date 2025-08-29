require("dotenv").config();
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("=".repeat(70));
    console.log("LocalMoney Smart Contracts - BSC Deployment (Continuing)");
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
        Profile: "0x9a1AD40c90E5f282152Aa9F56d18B99F31794B68"
    };
    
    console.log("\n" + "=".repeat(70));
    console.log("Already Deployed Contracts:");
    console.log("=".repeat(70));
    console.log("   Hub:     ", deployedContracts.Hub);
    console.log("   Profile: ", deployedContracts.Profile);
    
    console.log("\n" + "=".repeat(70));
    console.log("Continuing Deployment...");
    console.log("=".repeat(70));
    
    try {
        const hubAddress = deployedContracts.Hub;
        
        // 3. Deploy PriceOracle Contract
        console.log("\n3. Deploying PriceOracle contract...");
        const PriceOracle = await ethers.getContractFactory("PriceOracle", deployer);
        const swapRouter = "0x10ED43C718714eb63d5aA57B78B54704E256024E"; // PancakeSwap V3 router
        const priceOracle = await upgrades.deployProxy(
            PriceOracle, 
            [deployer.address, swapRouter], // admin and swapRouter
            {
                initializer: "initialize",
                kind: "uups"
            }
        );
        await priceOracle.waitForDeployment();
        const priceOracleAddress = await priceOracle.getAddress();
        deployedContracts.PriceOracle = priceOracleAddress;
        console.log("   ✅ PriceOracle deployed to:", priceOracleAddress);
        
        // 4. Deploy Escrow Contract
        console.log("\n4. Deploying Escrow contract...");
        const Escrow = await ethers.getContractFactory("Escrow", deployer);
        const escrow = await upgrades.deployProxy(Escrow, [hubAddress], {
            initializer: "initialize",
            kind: "uups"
        });
        await escrow.waitForDeployment();
        const escrowAddress = await escrow.getAddress();
        deployedContracts.Escrow = escrowAddress;
        console.log("   ✅ Escrow deployed to:", escrowAddress);
        
        // 5. Deploy Offer Contract
        console.log("\n5. Deploying Offer contract...");
        const Offer = await ethers.getContractFactory("Offer", deployer);
        const offer = await upgrades.deployProxy(Offer, [hubAddress], {
            initializer: "initialize",
            kind: "uups"
        });
        await offer.waitForDeployment();
        const offerAddress = await offer.getAddress();
        deployedContracts.Offer = offerAddress;
        console.log("   ✅ Offer deployed to:", offerAddress);
        
        // 6. Deploy Trade Contract
        console.log("\n6. Deploying Trade contract...");
        const Trade = await ethers.getContractFactory("Trade", deployer);
        const trade = await upgrades.deployProxy(Trade, [hubAddress], {
            initializer: "initialize",
            kind: "uups"
        });
        await trade.waitForDeployment();
        const tradeAddress = await trade.getAddress();
        deployedContracts.Trade = tradeAddress;
        console.log("   ✅ Trade deployed to:", tradeAddress);
        
        // 7. Deploy ArbitratorManager with Trade address
        console.log("\n7. Deploying ArbitratorManager contract...");
        const ArbitratorManager = await ethers.getContractFactory("ArbitratorManager", deployer);
        const arbitratorManager = await upgrades.deployProxy(
            ArbitratorManager, 
            [hubAddress, tradeAddress],
            {
                initializer: "initialize",
                kind: "uups"
            }
        );
        await arbitratorManager.waitForDeployment();
        const arbitratorManagerAddress = await arbitratorManager.getAddress();
        deployedContracts.ArbitratorManager = arbitratorManagerAddress;
        console.log("   ✅ ArbitratorManager deployed to:", arbitratorManagerAddress);
        
        // 8. Update Hub Configuration
        console.log("\n8. Updating Hub configuration...");
        const Hub = await ethers.getContractFactory("Hub", deployer);
        const hub = Hub.attach(hubAddress);
        
        const defaultConfig = {
            offerContract: offerAddress,
            tradeContract: tradeAddress,
            profileContract: deployedContracts.Profile,
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
        
        const tx = await hub.updateConfig(defaultConfig);
        await tx.wait();
        console.log("   ✅ Hub configuration updated");
        
        // 9. Save Deployment Info
        const deploymentInfo = {
            network: networkName,
            chainId: chainId.toString(),
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            contracts: deployedContracts,
            config: defaultConfig
        };
        
        const filename = `deployment-bsc-mainnet-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
        
        console.log("\n" + "=".repeat(70));
        console.log("DEPLOYMENT SUMMARY");
        console.log("=".repeat(70));
        console.log("\nAll Contracts Deployed:");
        Object.entries(deployedContracts).forEach(([name, address]) => {
            console.log(`   ${name.padEnd(20)} : ${address}`);
        });
        console.log("\n✅ Deployment completed successfully!");
        console.log(`📁 Deployment info saved to: ${filename}`);
        
        // BSCScan links
        console.log("\n📊 View on BSCScan:");
        Object.entries(deployedContracts).forEach(([name, address]) => {
            console.log(`   ${name}: https://bscscan.com/address/${address}`);
        });
        
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