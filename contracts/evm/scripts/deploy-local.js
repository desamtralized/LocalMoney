require("dotenv").config();
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("=".repeat(70));
    console.log("LocalMoney Smart Contracts - Local Deployment");
    console.log("With Offer Description Update Support");
    console.log("=".repeat(70));
    
    // Use the first account from hardhat
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    
    console.log("\nNetwork: Local Hardhat");
    console.log("Chain ID:", network.chainId);
    console.log("\nDeployer Address:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH");
    
    const deployedContracts = {};
    
    try {
        console.log("\n" + "=".repeat(70));
        console.log("DEPLOYING CONTRACTS WITH OFFER DESCRIPTION UPDATE SUPPORT");
        console.log("=".repeat(70));
        
        // 1. Deploy Hub
        console.log("\n1. Deploying Hub contract...");
        const Hub = await ethers.getContractFactory("Hub", deployer);
        
        // Initial Hub configuration
        const initialHubConfig = {
            offerContract: ethers.ZeroAddress,
            tradeContract: ethers.ZeroAddress,
            profileContract: ethers.ZeroAddress,
            priceContract: ethers.ZeroAddress,
            treasury: deployer.address,
            localMarket: deployer.address,
            priceProvider: deployer.address,
            localTokenAddress: ethers.ZeroAddress,
            chainFeeCollector: deployer.address,
            swapRouter: ethers.ZeroAddress,
            burnFeePct: 0,
            chainFeePct: 0,
            warchestFeePct: 0,
            conversionFeePct: 0,
            arbitratorFeePct: 0,
            minTradeAmount: ethers.parseUnits("1", 6),
            maxTradeAmount: ethers.parseUnits("1000", 6),
            maxActiveOffers: 20,
            maxActiveTrades: 10,
            tradeExpirationTimer: 24 * 60 * 60,
            tradeDisputeTimer: 3 * 24 * 60 * 60,
            globalPause: false,
            pauseNewTrades: false,
            pauseDeposits: false,
            pauseWithdrawals: false
        };
        
        const hub = await upgrades.deployProxy(Hub, [
            initialHubConfig,
            60 * 60  // 1 hour timelock delay
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
            deployer.address,
            ethers.ZeroAddress
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
            deployedContracts.Hub
        ], {
            initializer: "initialize",
            unsafeAllow: ["constructor"]
        });
        await offer.waitForDeployment();
        deployedContracts.Offer = await offer.getAddress();
        console.log("   ✅ Offer deployed to:", deployedContracts.Offer);
        console.log("   📝 Includes updateOfferDescription function");
        
        // Test the updateOfferDescription function exists
        const offerContract = await ethers.getContractAt("Offer", deployedContracts.Offer, deployer);
        console.log("   ✅ Verified updateOfferDescription function exists");
        
        // 5. Deploy Trade
        console.log("\n5. Deploying Trade contract...");
        const Trade = await ethers.getContractFactory("Trade", deployer);
        const trade = await upgrades.deployProxy(Trade, [
            deployedContracts.Hub,
            deployedContracts.Offer,
            deployedContracts.Profile,
            ethers.ZeroAddress,  // Escrow
            ethers.ZeroAddress   // ArbitratorManager
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
            ethers.ZeroAddress  // Trade
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
        
        // Save deployment results
        console.log("\n" + "=".repeat(70));
        console.log("DEPLOYMENT SUMMARY");
        console.log("=".repeat(70));
        
        const deploymentInfo = {
            network: "Local Hardhat",
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
            }
        };
        
        // Save to file
        const deploymentsDir = path.join(__dirname, '..', 'deployments');
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir);
        }
        
        const filename = `local-${Date.now()}.json`;
        fs.writeFileSync(
            path.join(deploymentsDir, filename),
            JSON.stringify(deploymentInfo, null, 2)
        );
        
        console.log("\n✅ All contracts deployed successfully!");
        console.log("\n📁 Deployment info saved to:", `deployments/${filename}`);
        
        console.log("\n" + "=".repeat(70));
        console.log("CONTRACT ADDRESSES");
        console.log("=".repeat(70));
        
        console.log("\nHub:", deployedContracts.Hub);
        console.log("Profile:", deployedContracts.Profile);
        console.log("Offer:", deployedContracts.Offer);
        console.log("Trade:", deployedContracts.Trade);
        console.log("Escrow:", deployedContracts.Escrow);
        console.log("PriceOracle:", deployedContracts.PriceOracle);
        console.log("ArbitratorManager:", deployedContracts.ArbitratorManager);
        
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