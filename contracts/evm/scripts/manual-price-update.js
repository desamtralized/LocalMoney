const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Manual Price Update Test ===\n");
    
    const PRICE_ORACLE_ADDRESS = "0xCc0f796822c58eed5F58BDf72DfC8433AdE66345";
    
    // Get deployer wallet (has PRICE_UPDATER_ROLE)
    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const deployer = new ethers.Wallet(deployerPrivateKey, ethers.provider);
    console.log("Deployer address:", deployer.address);
    
    const PriceOracle = await ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS, deployer);
    
    // Test currencies and prices (8 decimals)
    const currencies = ["EUR", "GBP", "USD"];
    const prices = [
        85600000,  // EUR: 0.856 USD (8 decimals)
        74200000,  // GBP: 0.742 USD (8 decimals)
        100000000  // USD: 1.00 USD (8 decimals)
    ];
    
    console.log("\nUpdating prices:");
    currencies.forEach((currency, i) => {
        console.log(`- ${currency}: ${prices[i]} (${prices[i] / 100000000} USD)`);
    });
    
    try {
        console.log("\nSending transaction...");
        const tx = await PriceOracle.updateFiatPrices(currencies, prices);
        console.log("Transaction hash:", tx.hash);
        
        const receipt = await tx.wait();
        console.log("Transaction confirmed in block:", receipt.blockNumber);
        console.log("Gas used:", receipt.gasUsed.toString());
        
        // Read back the prices
        console.log("\n=== Verifying Prices ===");
        for (const currency of currencies) {
            const priceData = await PriceOracle.fiatPrices(currency);
            console.log(`\n${currency}:`);
            console.log("- USD Price:", priceData.usdPrice.toString());
            console.log("- Is Valid:", priceData.isValid);
            
            try {
                const price = await PriceOracle.getFiatPrice(currency);
                console.log("- getFiatPrice result:", price.toString());
            } catch (error) {
                console.log("- getFiatPrice error:", error.message.substring(0, 50));
            }
        }
        
    } catch (error) {
        console.error("\nError updating prices:", error.message);
        if (error.data) {
            console.error("Error data:", error.data);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });