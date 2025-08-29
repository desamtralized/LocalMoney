require("dotenv").config();
const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("=".repeat(70));
    console.log("Upgrading Trade and Offer Contracts on BSC Mainnet");
    console.log("=".repeat(70));
    
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
    
    // Contract addresses from deployment
    const contracts = {
        Trade: "0xe0cdc4bDb60fCeC0ED1FFedcbbFb86839206862f",
        Offer: "0x5B1E3C79A6A84BD436Fe2141A13E1767C178E621"
    };
    
    console.log("\nContracts to upgrade:");
    console.log("   Trade:", contracts.Trade);
    console.log("   Offer:", contracts.Offer);
    
    try {
        // Note: Direct upgrades are restricted due to timelock requirements
        // For now, we'll just display what the new functions provide
        
        console.log("\n⚠️  Note: Direct upgrades require timelock authorization.");
        console.log("   The contracts have been modified to include:");
        
        console.log("\n📚 New Trade Contract Functions:");
        console.log("   - getTradesByUser(address): Returns all trades for a user");
        console.log("   - getActiveTradesByUser(address): Returns active trades for a user");
        console.log("   - getTradeHistory(uint256): Returns state transition history");
        console.log("   - canUserCreateTrade(address): Checks if user can create more trades");
        
        console.log("\n📚 New Offer Contract Functions:");
        console.log("   - getOffersByOwner(address): Returns all offers by owner");
        console.log("   - getActiveOffersByOwner(address): Returns active offers by owner");
        console.log("   - getAllActiveOffers(): Returns all active offer IDs");
        
        // For testing purposes, let's verify the current implementation works
        console.log("\n🔍 Testing current contract functionality...");
        
        const Trade = await ethers.getContractFactory("Trade", deployer);
        const trade = Trade.attach(contracts.Trade);
        
        const Offer = await ethers.getContractFactory("Offer", deployer);
        const offer = Offer.attach(contracts.Offer);
        
        // Test basic view functions that should exist
        console.log("\nTesting Trade contract:");
        const nextTradeId = await trade.nextTradeId();
        console.log("   Next Trade ID:", nextTradeId.toString());
        
        console.log("\nTesting Offer contract:");
        const nextOfferId = await offer.nextOfferId();
        console.log("   Next Offer ID:", nextOfferId.toString());
        
        // Try to call the new functions (will fail if not upgraded)
        console.log("\n📊 Checking if new functions are available:");
        
        try {
            // This will fail since contracts aren't upgraded yet
            const userTrades = await trade.getTradesByUser(deployer.address);
            console.log("   ✅ getTradesByUser is available");
        } catch (e) {
            console.log("   ❌ getTradesByUser not yet available (needs upgrade)");
        }
        
        try {
            const userOffers = await offer.getOffersByOwner(deployer.address);
            console.log("   ✅ getOffersByOwner is available");
        } catch (e) {
            console.log("   ❌ getOffersByOwner not yet available (needs upgrade)");
        }
        
        console.log("\n" + "=".repeat(70));
        console.log("UPGRADE PREPARATION COMPLETE");
        console.log("=".repeat(70));
        
        console.log("\n📝 Next Steps:");
        console.log("1. The contract code has been updated with new view functions");
        console.log("2. These functions will be available after the timelock upgrade process");
        console.log("3. For immediate testing, consider deploying to testnet first");
        
        console.log("\n💡 Alternative Solution:");
        console.log("   Deploy a separate Reader contract that implements these view functions");
        console.log("   by reading from the existing contracts without requiring upgrades.");
        
    } catch (error) {
        console.error("\n❌ Error:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });