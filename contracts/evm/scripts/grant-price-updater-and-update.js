require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=".repeat(70));
    console.log("Grant Price Updater Role and Update Prices");
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
        // Get contracts
        const priceOracle = await ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS, deployer);
        const hub = await ethers.getContractAt("Hub", HUB_ADDRESS, deployer);
        
        console.log("\n" + "=".repeat(70));
        console.log("CHECKING ADMIN ROLES");
        console.log("=".repeat(70));
        
        // Check who is admin of PriceOracle
        const DEFAULT_ADMIN_ROLE = await priceOracle.DEFAULT_ADMIN_ROLE();
        const PRICE_UPDATER_ROLE = await priceOracle.PRICE_UPDATER_ROLE();
        
        console.log("\n   DEFAULT_ADMIN_ROLE:", DEFAULT_ADMIN_ROLE);
        console.log("   PRICE_UPDATER_ROLE:", PRICE_UPDATER_ROLE);
        
        // Check if Hub is admin
        const hubIsAdmin = await priceOracle.hasRole(DEFAULT_ADMIN_ROLE, HUB_ADDRESS);
        console.log("\n   Hub is admin of PriceOracle:", hubIsAdmin);
        
        // Check if deployer is admin of Hub
        const deployerIsHubAdmin = await hub.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
        console.log("   Deployer is admin of Hub:", deployerIsHubAdmin);
        
        // Check current roles
        const deployerHasPriceRole = await priceOracle.hasRole(PRICE_UPDATER_ROLE, deployer.address);
        const hubHasPriceRole = await priceOracle.hasRole(PRICE_UPDATER_ROLE, HUB_ADDRESS);
        
        console.log("\n   Current PRICE_UPDATER_ROLE holders:");
        console.log("   - Deployer:", deployerHasPriceRole);
        console.log("   - Hub:", hubHasPriceRole);
        
        // Since Hub is admin of PriceOracle and has PRICE_UPDATER_ROLE,
        // we need to directly grant the role to deployer
        
        if (!deployerHasPriceRole) {
            console.log("\n" + "=".repeat(70));
            console.log("GRANTING PRICE_UPDATER_ROLE TO DEPLOYER");
            console.log("=".repeat(70));
            
            // We can't grant directly, but Hub has the role, so let's update prices directly
            // The Hub has PRICE_UPDATER_ROLE, so it can update prices
            console.log("\n   ⚠️  Cannot grant role directly. Hub has admin control.");
            console.log("   Will attempt to update prices anyway...");
        }
        
        console.log("\n" + "=".repeat(70));
        console.log("UPDATING PRICES");
        console.log("=".repeat(70));
        
        // Sample exchange rates (with proper decimals for the contract)
        const priceData = {
            "USD": ethers.parseUnits("1", 8),      // 1.00 USD = 1.00 USD
            "EUR": ethers.parseUnits("0.92", 8),   // 1 EUR = 1.09 USD (inverted)
            "GBP": ethers.parseUnits("0.79", 8),   // 1 GBP = 1.27 USD (inverted)
            "JPY": ethers.parseUnits("149", 8),    // 1 USD = 149 JPY
            "AUD": ethers.parseUnits("1.55", 8),   // 1 USD = 1.55 AUD
            "CAD": ethers.parseUnits("1.36", 8),   // 1 USD = 1.36 CAD
            "CHF": ethers.parseUnits("0.88", 8),   // 1 CHF = 1.14 USD (inverted)
            "CNY": ethers.parseUnits("7.25", 8),   // 1 USD = 7.25 CNY
            "COP": ethers.parseUnits("4100", 8),   // 1 USD = 4100 COP
            "MXN": ethers.parseUnits("17", 8),     // 1 USD = 17 MXN
            "BRL": ethers.parseUnits("5", 8),      // 1 USD = 5 BRL
            "ARS": ethers.parseUnits("825", 8),    // 1 USD = 825 ARS
        };
        
        const currencies = Object.keys(priceData);
        const prices = Object.values(priceData);
        
        console.log("\n   Attempting to update", currencies.length, "currencies...");
        
        try {
            // Try updating with PriceOracle directly (in case deployer has permission somehow)
            const tx = await priceOracle.updateFiatPrices(currencies, prices);
            console.log("   Transaction hash:", tx.hash);
            await tx.wait();
            console.log("   ✅ Prices updated successfully!");
        } catch (error) {
            console.log("   ❌ Direct update failed:", error.message);
            
            // If that fails, we need a different approach
            // The PriceOracle might need to be re-initialized or have roles granted differently
            console.log("\n   ⚠️  Price update failed. The PriceOracle needs proper role configuration.");
            console.log("   Options:");
            console.log("   1. Re-deploy PriceOracle with correct initialization");
            console.log("   2. Use a multisig or admin account to grant roles");
            console.log("   3. Update Hub contract to manage PriceOracle roles");
        }
        
        console.log("\n" + "=".repeat(70));
        console.log("VERIFYING PRICES");
        console.log("=".repeat(70));
        
        // Try to read prices
        const testCurrencies = ["USD", "EUR", "GBP", "COP"];
        console.log("\n   Checking prices:");
        
        for (const currency of testCurrencies) {
            try {
                const price = await priceOracle.getFiatPrice(currency);
                const formattedPrice = ethers.formatUnits(price, 8);
                console.log(`   ${currency.padEnd(5)}: ${formattedPrice}`);
            } catch (error) {
                console.log(`   ${currency.padEnd(5)}: Not set or error`);
            }
        }
        
        // Final balance
        const finalBalance = await ethers.provider.getBalance(deployer.address);
        console.log("\n💰 Gas Usage:");
        console.log(`   Starting Balance: ${ethers.formatEther(balance)} BNB`);
        console.log(`   Final Balance:    ${ethers.formatEther(finalBalance)} BNB`);
        console.log(`   Gas Used:         ${ethers.formatEther(balance - finalBalance)} BNB`);
        
    } catch (error) {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => {
        console.log("\n✨ Script completed!");
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });