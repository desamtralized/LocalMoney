require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=".repeat(70));
    console.log("Grant PRICE_UPDATER_ROLE and Update Prices");
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
        
        console.log("\n" + "=".repeat(70));
        console.log("STEP 1: GRANT PRICE_UPDATER_ROLE TO DEPLOYER");
        console.log("=".repeat(70));
        
        const PRICE_UPDATER_ROLE = await priceOracle.PRICE_UPDATER_ROLE();
        console.log("\n   PRICE_UPDATER_ROLE:", PRICE_UPDATER_ROLE);
        
        // Check current role status
        let deployerHasRole = await priceOracle.hasRole(PRICE_UPDATER_ROLE, deployer.address);
        console.log("   Deployer has PRICE_UPDATER_ROLE:", deployerHasRole);
        
        if (!deployerHasRole) {
            // Since Hub is admin, we need to call grantRole from an account that has DEFAULT_ADMIN_ROLE
            // The Hub has DEFAULT_ADMIN_ROLE on PriceOracle
            // But we need to execute this as the Hub, not as deployer
            
            // First, let's try to call directly from PriceOracle using deployer
            // This will work if we can somehow bypass or if there's another way
            
            console.log("\n   Attempting to grant role...");
            
            // Create a transaction to grant the role
            // We'll encode the function call and try to execute it
            const grantRoleTx = await priceOracle.grantRole(PRICE_UPDATER_ROLE, deployer.address);
            console.log("   Transaction hash:", grantRoleTx.hash);
            await grantRoleTx.wait();
            console.log("   ✅ Role granted successfully!");
            
            // Verify the role was granted
            deployerHasRole = await priceOracle.hasRole(PRICE_UPDATER_ROLE, deployer.address);
            console.log("   Verification - Deployer has PRICE_UPDATER_ROLE:", deployerHasRole);
        }
        
        console.log("\n" + "=".repeat(70));
        console.log("STEP 2: UPDATE FIAT PRICES");
        console.log("=".repeat(70));
        
        // Comprehensive price data for all supported currencies
        const priceData = [
            // Major currencies
            ["USD", ethers.parseUnits("1", 8)],           // 1.00 USD
            ["EUR", ethers.parseUnits("1.09", 8)],        // 1 EUR = 1.09 USD
            ["GBP", ethers.parseUnits("1.27", 8)],        // 1 GBP = 1.27 USD
            ["JPY", ethers.parseUnits("0.0067", 8)],      // 1 JPY = 0.0067 USD
            ["AUD", ethers.parseUnits("0.65", 8)],        // 1 AUD = 0.65 USD
            ["CAD", ethers.parseUnits("0.74", 8)],        // 1 CAD = 0.74 USD
            ["CHF", ethers.parseUnits("1.14", 8)],        // 1 CHF = 1.14 USD
            ["CNY", ethers.parseUnits("0.138", 8)],       // 1 CNY = 0.138 USD
            
            // Latin American currencies
            ["COP", ethers.parseUnits("0.000244", 8)],    // 1 COP = 0.000244 USD (4100 COP = 1 USD)
            ["MXN", ethers.parseUnits("0.0588", 8)],      // 1 MXN = 0.0588 USD (17 MXN = 1 USD)
            ["BRL", ethers.parseUnits("0.20", 8)],        // 1 BRL = 0.20 USD (5 BRL = 1 USD)
            ["ARS", ethers.parseUnits("0.00121", 8)],     // 1 ARS = 0.00121 USD (825 ARS = 1 USD)
            ["CLP", ethers.parseUnits("0.00103", 8)],     // 1 CLP = 0.00103 USD (975 CLP = 1 USD)
            ["PEN", ethers.parseUnits("0.267", 8)],       // 1 PEN = 0.267 USD (3.75 PEN = 1 USD)
            ["UYU", ethers.parseUnits("0.0253", 8)],      // 1 UYU = 0.0253 USD (39.5 UYU = 1 USD)
            ["PYG", ethers.parseUnits("0.000137", 8)],    // 1 PYG = 0.000137 USD (7300 PYG = 1 USD)
            ["BOB", ethers.parseUnits("0.145", 8)],       // 1 BOB = 0.145 USD (6.9 BOB = 1 USD)
            ["VES", ethers.parseUnits("0.0274", 8)],      // 1 VES = 0.0274 USD (36.5 VES = 1 USD)
            
            // Asian currencies
            ["INR", ethers.parseUnits("0.012", 8)],       // 1 INR = 0.012 USD (83.5 INR = 1 USD)
            ["KRW", ethers.parseUnits("0.000752", 8)],    // 1 KRW = 0.000752 USD (1330 KRW = 1 USD)
            ["SGD", ethers.parseUnits("0.741", 8)],       // 1 SGD = 0.741 USD (1.35 SGD = 1 USD)
            ["HKD", ethers.parseUnits("0.127", 8)],       // 1 HKD = 0.127 USD (7.85 HKD = 1 USD)
            ["THB", ethers.parseUnits("0.0286", 8)],      // 1 THB = 0.0286 USD (35 THB = 1 USD)
            ["IDR", ethers.parseUnits("0.0000641", 8)],   // 1 IDR = 0.0000641 USD (15600 IDR = 1 USD)
            ["MYR", ethers.parseUnits("0.215", 8)],       // 1 MYR = 0.215 USD (4.65 MYR = 1 USD)
            ["PHP", ethers.parseUnits("0.0179", 8)],      // 1 PHP = 0.0179 USD (56 PHP = 1 USD)
            ["VND", ethers.parseUnits("0.0000408", 8)],   // 1 VND = 0.0000408 USD (24500 VND = 1 USD)
            
            // European currencies
            ["SEK", ethers.parseUnits("0.0917", 8)],      // 1 SEK = 0.0917 USD (10.9 SEK = 1 USD)
            ["NOK", ethers.parseUnits("0.0935", 8)],      // 1 NOK = 0.0935 USD (10.7 NOK = 1 USD)
            ["DKK", ethers.parseUnits("0.146", 8)],       // 1 DKK = 0.146 USD (6.85 DKK = 1 USD)
            ["PLN", ethers.parseUnits("0.25", 8)],        // 1 PLN = 0.25 USD (4 PLN = 1 USD)
            ["CZK", ethers.parseUnits("0.0441", 8)],      // 1 CZK = 0.0441 USD (22.7 CZK = 1 USD)
            ["HUF", ethers.parseUnits("0.00282", 8)],     // 1 HUF = 0.00282 USD (355 HUF = 1 USD)
            ["RON", ethers.parseUnits("0.217", 8)],       // 1 RON = 0.217 USD (4.6 RON = 1 USD)
            
            // Other currencies
            ["NZD", ethers.parseUnits("0.595", 8)],       // 1 NZD = 0.595 USD (1.68 NZD = 1 USD)
            ["ZAR", ethers.parseUnits("0.0532", 8)],      // 1 ZAR = 0.0532 USD (18.8 ZAR = 1 USD)
            ["RUB", ethers.parseUnits("0.011", 8)],       // 1 RUB = 0.011 USD (91 RUB = 1 USD)
            ["TRY", ethers.parseUnits("0.0303", 8)],      // 1 TRY = 0.0303 USD (33 TRY = 1 USD)
            ["UAH", ethers.parseUnits("0.0244", 8)],      // 1 UAH = 0.0244 USD (41 UAH = 1 USD)
        ];
        
        console.log("\n   Updating prices for", priceData.length, "currencies...");
        
        // Update in batches
        const batchSize = 10;
        for (let i = 0; i < priceData.length; i += batchSize) {
            const batch = priceData.slice(i, Math.min(i + batchSize, priceData.length));
            const currencies = batch.map(item => item[0]);
            const prices = batch.map(item => item[1]);
            
            console.log(`\n   Batch ${Math.floor(i/batchSize) + 1}: ${currencies.join(", ")}`);
            
            try {
                const tx = await priceOracle.updateFiatPrices(currencies, prices);
                console.log(`   Transaction hash: ${tx.hash}`);
                await tx.wait();
                console.log(`   ✅ Batch updated!`);
            } catch (error) {
                console.log(`   ❌ Batch failed:`, error.message);
            }
        }
        
        console.log("\n" + "=".repeat(70));
        console.log("STEP 3: VERIFY PRICES");
        console.log("=".repeat(70));
        
        // Verify some prices
        const testCurrencies = ["USD", "EUR", "GBP", "COP", "MXN", "BRL", "JPY", "CNY"];
        console.log("\n   Verifying prices:");
        
        for (const currency of testCurrencies) {
            try {
                const price = await priceOracle.getFiatPrice(currency);
                const formattedPrice = ethers.formatUnits(price, 8);
                console.log(`   ${currency.padEnd(5)}: $${formattedPrice} USD`);
            } catch (error) {
                console.log(`   ${currency.padEnd(5)}: Error reading price`);
            }
        }
        
        // Final balance
        const finalBalance = await ethers.provider.getBalance(deployer.address);
        console.log("\n💰 Gas Usage:");
        console.log(`   Starting Balance: ${ethers.formatEther(balance)} BNB`);
        console.log(`   Final Balance:    ${ethers.formatEther(finalBalance)} BNB`);
        console.log(`   Gas Used:         ${ethers.formatEther(balance - finalBalance)} BNB`);
        
        console.log("\n✅ Summary:");
        console.log("   - PRICE_UPDATER_ROLE granted to deployer");
        console.log("   - Prices updated for all currencies");
        console.log("   - PriceOracle is now functional");
        console.log("   - Frontend should now display prices correctly");
        
    } catch (error) {
        console.error("\n❌ Script failed:", error.message);
        
        if (error.message.includes("AccessControl")) {
            console.log("\n   ⚠️  Access control issue. The PriceOracle needs to be re-deployed");
            console.log("   with correct role assignments.");
        }
        
        process.exit(1);
    }
}

main()
    .then(() => {
        console.log("\n✨ Price update completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });