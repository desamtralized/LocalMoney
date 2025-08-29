const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Granting PRICE_UPDATER_ROLE to Aggregator Wallet ===\n");
    
    // PriceOracle address  
    const PRICE_ORACLE_ADDRESS = "0xCc0f796822c58eed5F58BDf72DfC8433AdE66345";
    
    // Get the aggregator wallet address from private key
    const aggregatorPrivateKey = process.env.EVM_PRIVATE_KEY;
    if (!aggregatorPrivateKey) {
        console.error("❌ EVM_PRIVATE_KEY not found in .env");
        process.exit(1);
    }
    
    const aggregatorWallet = new ethers.Wallet(aggregatorPrivateKey);
    const aggregatorAddress = aggregatorWallet.address;
    console.log("Aggregator wallet address:", aggregatorAddress);
    
    // Get deployer/admin wallet
    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!deployerPrivateKey) {
        console.error("❌ DEPLOYER_PRIVATE_KEY not found in .env");
        process.exit(1);
    }
    const deployer = new ethers.Wallet(deployerPrivateKey, ethers.provider);
    console.log("Admin/Deployer address:", deployer.address);
    
    // Get PriceOracle contract
    const PriceOracle = await ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS);
    
    // Get PRICE_UPDATER_ROLE
    const PRICE_UPDATER_ROLE = await PriceOracle.PRICE_UPDATER_ROLE();
    console.log("\nPRICE_UPDATER_ROLE:", PRICE_UPDATER_ROLE);
    
    // Check if aggregator already has the role
    const hasRole = await PriceOracle.hasRole(PRICE_UPDATER_ROLE, aggregatorAddress);
    console.log(`\nAggregator has PRICE_UPDATER_ROLE: ${hasRole}`);
    
    if (!hasRole) {
        console.log("\n📝 Granting PRICE_UPDATER_ROLE to aggregator...");
        const tx = await PriceOracle.connect(deployer).grantRole(PRICE_UPDATER_ROLE, aggregatorAddress);
        console.log("Transaction hash:", tx.hash);
        await tx.wait();
        console.log("✅ Role granted successfully!");
        
        // Verify the role was granted
        const hasRoleAfter = await PriceOracle.hasRole(PRICE_UPDATER_ROLE, aggregatorAddress);
        console.log(`\nVerification - Aggregator has PRICE_UPDATER_ROLE: ${hasRoleAfter}`);
    } else {
        console.log("✅ Aggregator already has PRICE_UPDATER_ROLE");
    }
    
    // Also check DEFAULT_ADMIN_ROLE for reference
    const DEFAULT_ADMIN_ROLE = await PriceOracle.DEFAULT_ADMIN_ROLE();
    const isAdmin = await PriceOracle.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    console.log(`\nDeployer has DEFAULT_ADMIN_ROLE: ${isAdmin}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });