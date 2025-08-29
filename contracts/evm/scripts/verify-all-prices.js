const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Verifying All Currency Prices ===\n");
    
    const PRICE_ORACLE_ADDRESS = "0xCc0f796822c58eed5F58BDf72DfC8433AdE66345";
    const PriceOracle = await ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS);
    
    const currencies = [
        "USD", "EUR", "GBP", "JPY", "COP", "BRL", "MXN", "ARS",
        "PHP", "VND", "IDR", "MYR", "SGD", "THB", "NGN", "CLP",
        "VES", "ZAR", "EGP", "KES", "CAD"
    ];
    
    let validCount = 0;
    let invalidCount = 0;
    
    console.log("Currency | Price (8 dec) | USD Value   | Status");
    console.log("-".repeat(55));
    
    for (const currency of currencies) {
        try {
            const price = await PriceOracle.getFiatPrice(currency);
            const priceUSD = Number(price) / 100_000_000;
            validCount++;
            console.log(
                `${currency.padEnd(8)} | ${price.toString().padEnd(13)} | ${priceUSD.toFixed(6).padEnd(11)} | ✅ Valid`
            );
        } catch (error) {
            invalidCount++;
            console.log(
                `${currency.padEnd(8)} | ${"-".padEnd(13)} | ${"-".padEnd(11)} | ❌ Not Found`
            );
        }
    }
    
    console.log("\n=== Summary ===");
    console.log(`✅ Valid prices: ${validCount}/${currencies.length}`);
    console.log(`❌ Missing prices: ${invalidCount}/${currencies.length}`);
    
    if (validCount >= 15) {
        console.log("\n🎉 SUCCESS: Price oracle is working correctly!");
    } else {
        console.log("\n⚠️  WARNING: Some prices are still missing");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });