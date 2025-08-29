const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Checking Hub Configuration ===\n");
    
    // Get Hub address from environment or use known address
    const HUB_ADDRESS = process.env.HUB_ADDRESS || "0x27c6799e07f12bB90cf037eAbfD8bd0aA8345e01";
    console.log("Hub address:", HUB_ADDRESS);
    
    // Get Hub contract
    const Hub = await ethers.getContractAt("Hub", HUB_ADDRESS);
    
    // Get configuration
    const config = await Hub.getConfig();
    console.log("\nHub Configuration:");
    console.log("- Offer Contract:", config.offerContract);
    console.log("- Trade Contract:", config.tradeContract);
    console.log("- Profile Contract:", config.profileContract);
    console.log("- Price Contract:", config.priceContract);
    console.log("- Treasury:", config.treasury);
    console.log("- Local Market:", config.localMarket);
    console.log("- Price Provider:", config.priceProvider);
    console.log("- Chain Fee Collector:", config.chainFeeCollector);
    console.log("- Swap Router:", config.swapRouter);
    
    console.log("\n🔍 Current Price Oracle in Hub:", config.priceContract);
    console.log("📍 Expected Price Oracle:", "0xCc0f796822c58eed5F58BDf72DfC8433AdE66345");
    
    if (config.priceContract.toLowerCase() === "0xCc0f796822c58eed5F58BDf72DfC8433AdE66345".toLowerCase()) {
        console.log("✅ Price Oracle is correctly configured in Hub");
    } else {
        console.log("❌ Price Oracle needs to be updated in Hub");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });