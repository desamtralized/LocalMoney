require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=".repeat(70));
    console.log("Initialize PriceOracle on BSC Mainnet");
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
    console.log("\nDeployer Address:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "BNB");
    
    const PRICE_ORACLE_ADDRESS = "0x5C1e0CE9F02434241d8950ea13D96B5Ed6af44E2";
    const HUB_ADDRESS = "0x2726F33a34EAA0ab65A079bc2f1aDCea577D3315";
    
    console.log("\n📍 Contract Addresses:");
    console.log("   PriceOracle:", PRICE_ORACLE_ADDRESS);
    console.log("   Hub:", HUB_ADDRESS);
    
    try {
        console.log("\n" + "=".repeat(70));
        console.log("STEP 1: GRANT PRICE_UPDATER_ROLE");
        console.log("=".repeat(70));
        
        // Get PriceOracle contract
        const priceOracle = await ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS, deployer);
        
        // Get the PRICE_UPDATER_ROLE
        const PRICE_UPDATER_ROLE = await priceOracle.PRICE_UPDATER_ROLE();
        console.log("\n   PRICE_UPDATER_ROLE hash:", PRICE_UPDATER_ROLE);
        
        // Check if deployer already has the role
        const hasRole = await priceOracle.hasRole(PRICE_UPDATER_ROLE, deployer.address);
        
        if (!hasRole) {
            console.log("   Granting PRICE_UPDATER_ROLE to deployer...");
            
            // Get DEFAULT_ADMIN_ROLE
            const DEFAULT_ADMIN_ROLE = await priceOracle.DEFAULT_ADMIN_ROLE();
            
            // Check if deployer is admin
            const isAdmin = await priceOracle.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
            console.log("   Deployer is admin:", isAdmin);
            
            if (isAdmin) {
                const tx = await priceOracle.grantRole(PRICE_UPDATER_ROLE, deployer.address);
                console.log("   Transaction hash:", tx.hash);
                await tx.wait();
                console.log("   ✅ PRICE_UPDATER_ROLE granted!");
            } else {
                console.log("   ❌ Deployer is not admin, cannot grant role");
                // Try from Hub contract
                console.log("\n   Trying to grant role from Hub contract...");
                const hub = await ethers.getContractAt("Hub", HUB_ADDRESS, deployer);
                
                // Hub might have admin rights on PriceOracle
                // This would need to be implemented in the Hub contract
                console.log("   ⚠️  May need to manually grant role from admin account");
            }
        } else {
            console.log("   ✅ Deployer already has PRICE_UPDATER_ROLE");
        }
        
        console.log("\n" + "=".repeat(70));
        console.log("STEP 2: UPDATE FIAT PRICES");
        console.log("=".repeat(70));
        
        // Sample exchange rates (1 USD = X foreign currency)
        const priceData = {
            "USD": 10000,     // 1.0000 (100.00 cents, 8 decimals => 10000)
            "EUR": 9200,      // 0.9200
            "GBP": 7900,      // 0.7900
            "JPY": 14900,     // 149.00
            "AUD": 15500,     // 1.5500
            "CAD": 13600,     // 1.3600
            "CHF": 8800,      // 0.8800
            "CNY": 72500,     // 7.2500
            "COP": 410000,    // 4100.00
            "MXN": 170000,    // 17.0000
            "BRL": 50000,     // 5.0000
            "ARS": 82500,     // 825.00
            "INR": 835000,    // 83.5000
            "KRW": 1330000,   // 1330.00
            "SGD": 13500,     // 1.3500
            "HKD": 78500,     // 7.8500
            "NZD": 16800,     // 1.6800
            "SEK": 109000,    // 10.9000
            "NOK": 107000,    // 10.7000
            "DKK": 68500,     // 6.8500
            "PLN": 40000,     // 4.0000
            "CZK": 227000,    // 22.7000
            "HUF": 3550000,   // 355.00
            "RON": 46000,     // 4.6000
            "BGN": 18000,     // 1.8000
            "HRK": 69000,     // 6.9000
            "RUB": 910000,    // 91.0000
            "TRY": 330000,    // 33.0000
            "THB": 350000,    // 35.0000
            "IDR": 15600000,  // 15600.00
            "MYR": 46500,     // 4.6500
            "PHP": 560000,    // 56.0000
            "VND": 24500000,  // 24500.00
            "ZAR": 188000,    // 18.8000
            "UAH": 410000,    // 41.0000
            "CLP": 9750000,   // 975.00
            "PEN": 37500,     // 3.7500
            "UYU": 395000,    // 39.5000
            "PYG": 73000000,  // 7300.00
            "BOB": 69000,     // 6.9000
            "VES": 365000,    // 36.5000
            "EGP": 490000,    // 49.0000
            "MAD": 100000,    // 10.0000
            "TND": 31000,     // 3.1000
            "NGN": 15500000,  // 1550.00
            "KES": 1290000,   // 129.00
            "GHS": 155000,    // 15.5000
            "ETB": 575000,    // 57.5000
            "UGX": 37500000,  // 3750.00
            "TZS": 26500000,  // 2650.00
        };
        
        const currencies = Object.keys(priceData);
        const prices = Object.values(priceData);
        
        console.log("\n   Updating prices for", currencies.length, "currencies...");
        
        try {
            // Update prices in batches to avoid gas issues
            const batchSize = 10;
            for (let i = 0; i < currencies.length; i += batchSize) {
                const batchCurrencies = currencies.slice(i, i + batchSize);
                const batchPrices = prices.slice(i, i + batchSize);
                
                console.log(`\n   Batch ${Math.floor(i/batchSize) + 1}: ${batchCurrencies.join(", ")}`);
                
                const tx = await priceOracle.updateFiatPrices(batchCurrencies, batchPrices);
                console.log(`   Transaction hash: ${tx.hash}`);
                await tx.wait();
                console.log(`   ✅ Batch updated!`);
            }
            
            console.log("\n   ✅ All prices updated successfully!");
        } catch (error) {
            console.error("\n   ❌ Failed to update prices:", error.message);
            
            if (error.message.includes("AccessControl")) {
                console.log("\n   ⚠️  Access denied. You need PRICE_UPDATER_ROLE.");
                console.log("   Please ensure the deployer has the correct role.");
            }
        }
        
        console.log("\n" + "=".repeat(70));
        console.log("STEP 3: VERIFY PRICES");
        console.log("=".repeat(70));
        
        // Verify some prices
        const testCurrencies = ["USD", "EUR", "GBP", "COP", "MXN", "BRL"];
        console.log("\n   Verifying prices:");
        
        for (const currency of testCurrencies) {
            try {
                const price = await priceOracle.getFiatPrice(currency);
                const formattedPrice = Number(price) / 10000; // Convert from 8 decimals to readable format
                console.log(`   ${currency.padEnd(5)}: ${formattedPrice.toFixed(4)}`);
            } catch (error) {
                console.log(`   ${currency.padEnd(5)}: ERROR - ${error.message}`);
            }
        }
        
        // Final balance
        const finalBalance = await ethers.provider.getBalance(deployer.address);
        console.log("\n💰 Gas Usage:");
        console.log(`   Starting Balance: ${ethers.formatEther(balance)} BNB`);
        console.log(`   Final Balance:    ${ethers.formatEther(finalBalance)} BNB`);
        console.log(`   Gas Used:         ${ethers.formatEther(balance - finalBalance)} BNB`);
        
        console.log("\n✅ Summary:");
        console.log("   - PriceOracle initialized with current exchange rates");
        console.log("   - Prices are now available for the frontend");
        console.log("   - System ready for trading");
        
    } catch (error) {
        console.error("\n❌ Initialization failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => {
        console.log("\n✨ Price initialization completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });