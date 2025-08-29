require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=".repeat(70));
    console.log("Updating Price Oracle with Fiat Currency Prices");
    console.log("=".repeat(70));
    
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
        console.error("❌ DEPLOYER_PRIVATE_KEY not found in .env file");
        process.exit(1);
    }
    
    const deployer = new ethers.Wallet(privateKey, ethers.provider);
    const network = await ethers.provider.getNetwork();
    
    console.log("\nNetwork: BSC Mainnet");
    console.log("Chain ID:", network.chainId);
    console.log("\nUpdater Address:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "BNB");
    
    // PriceOracle contract address
    const priceOracleAddress = "0x3f8f71c3A10907A196F427A3C98e01045f6008de";
    
    // Exchange rates: how many units of foreign currency per 1 USD
    // Need to convert to 8 decimals format
    const priceData = [
        [1346.904154, "ARS"],
        [5.409615, "BRL"],
        [1.375013, "CAD"],
        [974.346301, "CLP"],
        [4053.381921, "COP"],
        [0.855981, "EUR"],
        [0.740548, "GBP"],
        [16420.780902, "IDR"],
        [18.67147, "MXN"],
        [4.22582, "MYR"],
        [1533.876779, "NGN"],
        [57.095808, "PHP"],
        [1.282718, "SGD"],
        [32.377933, "THB"],
        [215.02, "VES"],
        [26334.006988, "VND"],
        [17.821993, "ZAR"],
        [49.28, "EGP"],
        [128.87, "KES"]
    ];
    
    // Separate arrays for currencies and prices
    const currencies = [];
    const prices = [];
    
    // Convert prices to 8 decimals format
    for (const [price, currency] of priceData) {
        currencies.push(currency);
        // Convert to 8 decimals: multiply by 10^8 and round
        const priceWith8Decimals = Math.round(price * 10**8);
        prices.push(BigInt(priceWith8Decimals));
    }
    
    console.log("\n📊 Price Updates:");
    console.log("Currency | Exchange Rate | Price (8 decimals)");
    console.log("-".repeat(60));
    
    for (let i = 0; i < currencies.length; i++) {
        const originalPrice = priceData[i][0];
        console.log(`${currencies[i].padEnd(8)} | ${originalPrice.toFixed(6).padStart(12)} | ${prices[i].toString()}`);
    }
    
    try {
        // Load PriceOracle contract
        const PriceOracle = await ethers.getContractFactory("PriceOracle", deployer);
        const priceOracle = PriceOracle.attach(priceOracleAddress);
        
        console.log("\n🔐 Checking permissions...");
        
        // Check if deployer has the price updater role
        const PRICE_UPDATER_ROLE = await priceOracle.PRICE_UPDATER_ROLE();
        const hasRole = await priceOracle.hasRole(PRICE_UPDATER_ROLE, deployer.address);
        
        if (!hasRole) {
            console.log("❌ Deployer doesn't have PRICE_UPDATER_ROLE");
            console.log("\n📝 Attempting to grant role...");
            
            // Try to grant the role (requires admin)
            try {
                const DEFAULT_ADMIN_ROLE = await priceOracle.DEFAULT_ADMIN_ROLE();
                const isAdmin = await priceOracle.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
                
                if (isAdmin) {
                    const grantTx = await priceOracle.grantRole(PRICE_UPDATER_ROLE, deployer.address);
                    console.log("   Transaction sent:", grantTx.hash);
                    await grantTx.wait();
                    console.log("   ✅ PRICE_UPDATER_ROLE granted!");
                } else {
                    console.log("   ❌ Deployer is not admin, cannot grant role");
                    console.log("   Please grant PRICE_UPDATER_ROLE to:", deployer.address);
                    process.exit(1);
                }
            } catch (error) {
                console.error("   Failed to grant role:", error.message);
                process.exit(1);
            }
        } else {
            console.log("✅ Deployer has PRICE_UPDATER_ROLE");
        }
        
        console.log("\n💰 Updating prices...");
        
        // Call updateFiatPrices function
        const tx = await priceOracle.updateFiatPrices(currencies, prices);
        
        console.log("   Transaction sent:", tx.hash);
        console.log("   Waiting for confirmation...");
        
        const receipt = await tx.wait();
        console.log("   ✅ Transaction confirmed in block:", receipt.blockNumber);
        console.log("   Gas used:", receipt.gasUsed.toString());
        
        // Verify some prices were updated
        console.log("\n🔍 Verifying updates...");
        const sampleCurrencies = ["USD", "EUR", "GBP", "BRL", "NGN"];
        
        for (const currency of sampleCurrencies) {
            try {
                const price = await priceOracle.getFiatPrice(currency);
                if (price > 0) {
                    const formattedPrice = Number(price) / 10**8;
                    console.log(`   ${currency}: ${formattedPrice.toFixed(6)}`);
                }
            } catch (error) {
                // Currency might not be in our update list
                if (currency === "USD") {
                    console.log(`   ${currency}: 1.000000 (base currency)`);
                }
            }
        }
        
        console.log("\n🎉 Price Oracle updated successfully!");
        console.log("\n📊 Summary:");
        console.log(`   - Updated ${currencies.length} currency prices`);
        console.log(`   - Transaction: https://bscscan.com/tx/${tx.hash}`);
        console.log(`   - Price Oracle: https://bscscan.com/address/${priceOracleAddress}`);
        
    } catch (error) {
        console.error("\n❌ Update failed:", error);
        console.error("\nError details:", error.message);
        
        // Check if it's a specific error
        if (error.message.includes("AccessControl")) {
            console.log("\n💡 Solution: Grant PRICE_UPDATER_ROLE to", deployer.address);
            console.log("   Use the admin account to run:");
            console.log(`   await priceOracle.grantRole(PRICE_UPDATER_ROLE, "${deployer.address}")`);
        }
        
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });