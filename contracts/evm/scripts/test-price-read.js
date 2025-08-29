const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Testing Price Oracle Direct Read ===\n");
    
    const PRICE_ORACLE_ADDRESS = "0xCc0f796822c58eed5F58BDf72DfC8433AdE66345";
    const PriceOracle = await ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS);
    
    // Try to read the public mapping directly
    console.log("Reading fiatPrices mapping directly...");
    
    try {
        // Test with EUR
        const eurData = await PriceOracle.fiatPrices("EUR");
        console.log("\nEUR Price Data:");
        console.log("- USD Price:", eurData.usdPrice.toString());
        console.log("- Updated At:", eurData.updatedAt.toString());
        console.log("- Source:", eurData.source);
        console.log("- Is Valid:", eurData.isValid);
        
        // Test with USD
        const usdData = await PriceOracle.fiatPrices("USD");
        console.log("\nUSD Price Data:");
        console.log("- USD Price:", usdData.usdPrice.toString());
        console.log("- Updated At:", usdData.updatedAt.toString());
        console.log("- Source:", usdData.source);
        console.log("- Is Valid:", usdData.isValid);
        
    } catch (error) {
        console.error("Error reading mapping:", error.message);
    }
    
    // Try to call getFiatPrice function
    console.log("\n\nTesting getFiatPrice function...");
    
    try {
        const eurPrice = await PriceOracle.getFiatPrice("EUR");
        console.log("EUR price from function:", eurPrice.toString());
    } catch (error) {
        console.error("Error calling getFiatPrice for EUR:", error.message);
    }
    
    // Check the current block timestamp
    const block = await ethers.provider.getBlock('latest');
    console.log("\nCurrent block timestamp:", block.timestamp);
    console.log("Current time:", new Date(block.timestamp * 1000).toISOString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });