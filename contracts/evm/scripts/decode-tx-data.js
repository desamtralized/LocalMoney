const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Decoding Transaction Data ===\n");
    
    // Get the transaction
    const txHash = "0xe04358a7e60acecda1aa6ea90213e7d0f314792c0b25b0bc1ede765e734c5a1f";
    const tx = await ethers.provider.getTransaction(txHash);
    
    if (!tx) {
        console.log("Transaction not found");
        return;
    }
    
    // Get PriceOracle interface
    const PRICE_ORACLE_ADDRESS = "0xCc0f796822c58eed5F58BDf72DfC8433AdE66345";
    const PriceOracle = await ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS);
    
    try {
        // Decode the function call
        const decoded = PriceOracle.interface.parseTransaction({ data: tx.data });
        
        console.log("Function called:", decoded.name);
        console.log("Function signature:", decoded.signature);
        console.log("\nArguments:");
        
        if (decoded.name === "updateFiatPrices") {
            const currencies = decoded.args[0];
            const prices = decoded.args[1];
            
            console.log(`\nCurrencies (${currencies.length}):`);
            currencies.forEach((currency, i) => {
                console.log(`  ${i}: "${currency}"`);
            });
            
            console.log(`\nPrices (${prices.length}):`);
            prices.forEach((price, i) => {
                const priceNum = price.toString();
                const priceUSD = Number(priceNum) / 100000000;
                console.log(`  ${i}: ${priceNum} (${priceUSD.toFixed(8)} USD)`);
            });
            
            // Check if arrays match
            if (currencies.length !== prices.length) {
                console.log("\n⚠️ WARNING: Currency and price array lengths don't match!");
            }
        } else {
            console.log("Raw args:", decoded.args);
        }
        
    } catch (error) {
        console.error("Failed to decode transaction data:", error.message);
        
        // Try to extract the method ID
        const methodId = tx.data.slice(0, 10);
        console.log("\nMethod ID:", methodId);
        
        // Show expected method ID for updateFiatPrices
        const expectedSig = PriceOracle.interface.getFunction("updateFiatPrices").selector;
        console.log("Expected updateFiatPrices selector:", expectedSig);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });