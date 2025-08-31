require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=".repeat(70));
    console.log("Checking PriceOracle on BSC Mainnet");
    console.log("=".repeat(70));
    
    const PRICE_ORACLE_ADDRESS = "0x5C1e0CE9F02434241d8950ea13D96B5Ed6af44E2";
    
    const provider = ethers.provider;
    const network = await provider.getNetwork();
    
    console.log("\nNetwork: BSC Mainnet");
    console.log("Chain ID:", network.chainId);
    console.log("PriceOracle Address:", PRICE_ORACLE_ADDRESS);
    
    try {
        // Get PriceOracle contract
        const priceOracle = await ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS);
        
        // Check some common currency prices
        const currencies = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "COP", "MXN", "BRL", "ARS"];
        
        console.log("\n📊 Current Prices (in cents per USD):");
        console.log("=".repeat(70));
        
        for (const currency of currencies) {
            try {
                const price = await priceOracle.getPrice(currency);
                const formattedPrice = price > 0 ? (Number(price) / 100).toFixed(4) : "NOT SET";
                console.log(`   ${currency.padEnd(5)}: ${formattedPrice}`);
            } catch (error) {
                console.log(`   ${currency.padEnd(5)}: ERROR - ${error.message}`);
            }
        }
        
        // Check if price updater role is set
        console.log("\n🔐 Access Control:");
        console.log("=".repeat(70));
        
        try {
            // Check who has PRICE_UPDATER_ROLE
            const PRICE_UPDATER_ROLE = await priceOracle.PRICE_UPDATER_ROLE();
            console.log("   PRICE_UPDATER_ROLE hash:", PRICE_UPDATER_ROLE);
            
            // Check if deployer has the role
            const deployer = "0x5f6acb320B94b2A954dC0C28e037D5A761C76571";
            const hasRole = await priceOracle.hasRole(PRICE_UPDATER_ROLE, deployer);
            console.log(`   Deployer has PRICE_UPDATER_ROLE: ${hasRole}`);
        } catch (error) {
            console.log("   Could not check roles:", error.message);
        }
        
        // Check last update time
        console.log("\n⏰ Update Information:");
        console.log("=".repeat(70));
        
        try {
            // Try to get last update time for USD
            const lastUpdate = await priceOracle.lastUpdated("USD");
            if (lastUpdate > 0) {
                const date = new Date(Number(lastUpdate) * 1000);
                console.log("   Last USD update:", date.toISOString());
            } else {
                console.log("   No updates recorded yet");
            }
        } catch (error) {
            console.log("   Could not check last update:", error.message);
        }
        
        // Check staleness parameters
        try {
            const staleThreshold = await priceOracle.STALE_PRICE_THRESHOLD();
            console.log("   Stale price threshold:", staleThreshold.toString(), "seconds");
        } catch (error) {
            // Contract might not have this function
        }
        
        console.log("\n" + "=".repeat(70));
        console.log("Summary:");
        console.log("=".repeat(70));
        
        // Count how many prices are set
        let setCount = 0;
        let notSetCount = 0;
        
        for (const currency of currencies) {
            try {
                const price = await priceOracle.getPrice(currency);
                if (price > 0) {
                    setCount++;
                } else {
                    notSetCount++;
                }
            } catch {
                notSetCount++;
            }
        }
        
        console.log(`\n   Prices set: ${setCount}`);
        console.log(`   Prices not set: ${notSetCount}`);
        
        if (notSetCount > 0) {
            console.log("\n⚠️  Prices need to be initialized!");
            console.log("   Run: npx hardhat run scripts/update-prices.js --network bsc");
        } else {
            console.log("\n✅ All prices are set!");
        }
        
    } catch (error) {
        console.error("\n❌ Error checking prices:", error.message);
    }
}

main()
    .then(() => {
        console.log("\n✨ Price check completed!");
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });