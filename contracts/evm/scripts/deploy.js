const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("Starting deployment of LocalMoney EVM contracts...");

    // Get deployer
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

    // Deploy Hub contract
    console.log("\n1. Deploying Hub contract...");
    const Hub = await ethers.getContractFactory("Hub");
    
    // Default configuration for deployment
    const defaultConfig = {
        offerContract: ethers.ZeroAddress, // Will be updated after Offer deployment
        tradeContract: ethers.ZeroAddress, // Will be updated after Trade deployment
        profileContract: ethers.ZeroAddress, // Will be updated after Profile deployment
        priceContract: ethers.ZeroAddress, // Will be updated after Price deployment
        treasury: deployer.address, // Use deployer as treasury for now
        localMarket: deployer.address, // Use deployer as local market for now
        priceProvider: deployer.address, // Use deployer as price provider for now
        burnFeePct: 100,  // 1%
        chainFeePct: 200, // 2%
        warchestFeePct: 300, // 3%
        conversionFeePct: 50, // 0.5%
        minTradeAmount: ethers.parseUnits("10", 6), // $10 in USD cents
        maxTradeAmount: ethers.parseUnits("10000", 6), // $10,000 in USD cents
        maxActiveOffers: 10,
        maxActiveTrades: 5,
        tradeExpirationTimer: 24 * 60 * 60, // 24 hours
        tradeDisputeTimer: 7 * 24 * 60 * 60, // 7 days
        globalPause: false,
        pauseNewTrades: false,
        pauseDeposits: false,
        pauseWithdrawals: false
    };

    const hub = await upgrades.deployProxy(Hub, [defaultConfig], {
        initializer: "initialize",
        kind: "uups"
    });
    await hub.waitForDeployment();
    console.log("Hub deployed to:", hub.target);

    // Deploy Profile contract
    console.log("\n2. Deploying Profile contract...");
    const Profile = await ethers.getContractFactory("Profile");
    const profile = await upgrades.deployProxy(Profile, [hub.target], {
        initializer: "initialize",
        kind: "uups"
    });
    await profile.waitForDeployment();
    console.log("Profile deployed to:", profile.target);

    // Update Hub configuration with Profile contract address
    console.log("\n3. Updating Hub configuration...");
    const updatedConfig = { ...defaultConfig };
    updatedConfig.profileContract = profile.target;
    
    await hub.updateConfig(updatedConfig);
    console.log("Hub configuration updated with Profile contract address");

    // Verify deployment
    console.log("\n4. Verifying deployment...");
    const hubConfig = await hub.getConfig();
    console.log("Hub configuration:");
    console.log("- Profile Contract:", hubConfig.profileContract);
    console.log("- Treasury:", hubConfig.treasury);
    console.log("- Burn Fee:", hubConfig.burnFeePct, "bps");
    console.log("- Chain Fee:", hubConfig.chainFeePct, "bps");
    console.log("- Max Active Offers:", hubConfig.maxActiveOffers.toString());
    console.log("- Max Active Trades:", hubConfig.maxActiveTrades.toString());

    const hubAdmin = await hub.getAdmin();
    console.log("Hub admin:", hubAdmin);

    const profileAdmin = await profile.admin();
    console.log("Profile admin:", profileAdmin);

    console.log("\n5. Deployment Summary:");
    console.log("=".repeat(50));
    console.log("Hub Contract Address:    ", hub.target);
    console.log("Profile Contract Address:", profile.target);
    console.log("Admin Address:           ", deployer.address);
    console.log("=".repeat(50));

    // Save deployment addresses to a file
    const fs = require("fs");
    const deploymentInfo = {
        network: await ethers.provider.getNetwork(),
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            hub: hub.target,
            profile: profile.target
        },
        config: updatedConfig
    };

    fs.writeFileSync(
        "deployment-info.json",
        JSON.stringify(deploymentInfo, null, 2)
    );
    console.log("\nDeployment info saved to deployment-info.json");

    console.log("\nDeployment completed successfully! 🎉");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment failed:", error);
        process.exit(1);
    });