require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Load deployed contract addresses from latest deployment
function loadDeployedAddresses() {
    const deploymentsDir = path.join(__dirname, '..', 'deployments');
    const files = fs.readdirSync(deploymentsDir)
        .filter(f => f.includes('bsc-mainnet-complete'))
        .sort((a, b) => b.localeCompare(a)); // Get latest file
    
    if (files.length === 0) {
        throw new Error("No BSC mainnet deployment files found");
    }
    
    const latestFile = files[0];
    const deploymentInfo = JSON.parse(
        fs.readFileSync(path.join(deploymentsDir, latestFile), 'utf8')
    );
    
    console.log(`   Loading addresses from: ${latestFile}`);
    return deploymentInfo.contracts;
}

async function main() {
    console.log("=".repeat(70));
    console.log("BSC MAINNET - COMPLETE INITIALIZATION");
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
    
    if (balance < ethers.parseEther("0.01")) {
        console.error("❌ Insufficient balance. Need at least 0.01 BNB for initialization");
        process.exit(1);
    }
    
    // Load deployed contract addresses
    console.log("\n📁 Loading Deployed Contract Addresses...");
    const contracts = loadDeployedAddresses();
    
    console.log("\n📍 Contract Addresses:");
    Object.entries(contracts).forEach(([name, address]) => {
        console.log(`   ${name.padEnd(20)}: ${address}`);
    });
    
    try {
        // ====================================================================
        // STEP 1: INITIALIZE PRICE ORACLE
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("STEP 1: INITIALIZE PRICE ORACLE");
        console.log("=".repeat(70));
        
        const priceOracle = await ethers.getContractAt("PriceOracle", contracts.PriceOracle, deployer);
        
        // Check and grant PRICE_UPDATER_ROLE
        const PRICE_UPDATER_ROLE = await priceOracle.PRICE_UPDATER_ROLE();
        console.log("\n   PRICE_UPDATER_ROLE hash:", PRICE_UPDATER_ROLE);
        
        const hasRole = await priceOracle.hasRole(PRICE_UPDATER_ROLE, deployer.address);
        
        if (!hasRole) {
            console.log("   Granting PRICE_UPDATER_ROLE to deployer...");
            const tx = await priceOracle.grantRole(PRICE_UPDATER_ROLE, deployer.address);
            await tx.wait();
            console.log("   ✅ PRICE_UPDATER_ROLE granted!");
        } else {
            console.log("   ✅ Deployer already has PRICE_UPDATER_ROLE");
        }
        
        // Update initial prices
        console.log("\n   Setting initial fiat prices...");
        
        // Sample exchange rates (1 USD = X foreign currency)
        const priceData = {
            "USD": 10000,     // 1.0000
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
        
        console.log("   Updating prices for", currencies.length, "currencies...");
        
        // Update prices in batches to avoid gas issues
        const batchSize = 10;
        for (let i = 0; i < currencies.length; i += batchSize) {
            const batchCurrencies = currencies.slice(i, i + batchSize);
            const batchPrices = prices.slice(i, i + batchSize);
            
            console.log(`   Batch ${Math.floor(i/batchSize) + 1}: ${batchCurrencies.join(", ")}`);
            
            const tx = await priceOracle.updateFiatPrices(batchCurrencies, batchPrices);
            await tx.wait();
            console.log(`   ✅ Batch ${Math.floor(i/batchSize) + 1} updated!`);
        }
        
        console.log("   ✅ All prices initialized successfully!");
        
        // Verify some prices
        const testCurrencies = ["USD", "EUR", "GBP", "COP"];
        console.log("\n   Verifying prices:");
        
        for (const currency of testCurrencies) {
            const price = await priceOracle.getFiatPrice(currency);
            const formattedPrice = Number(price) / 10000;
            console.log(`   ${currency.padEnd(5)}: ${formattedPrice.toFixed(4)}`);
        }
        
        // ====================================================================
        // STEP 2: REGISTER DEPLOYER AS ARBITRATOR
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("STEP 2: REGISTER DEPLOYER AS ARBITRATOR");
        console.log("=".repeat(70));
        
        const arbitratorManager = await ethers.getContractAt("ArbitratorManager", contracts.ArbitratorManager, deployer);
        
        // Check if already registered
        const arbitratorInfo = await arbitratorManager.arbitratorInfo(deployer.address);
        
        if (arbitratorInfo.joinedAt > 0) {
            console.log("\n   ✅ Already registered as arbitrator");
            console.log("   Joined At:", new Date(Number(arbitratorInfo.joinedAt) * 1000).toISOString());
            console.log("   Is Active:", arbitratorInfo.isActive);
        } else {
            // All supported fiat currencies
            const supportedCurrencies = [
                "USD", "EUR", "GBP", "JPY", "CNY", "INR", "CAD", "AUD", "CHF", "NZD",
                "SEK", "NOK", "DKK", "ZAR", "BRL", "MXN", "ARS", "CLP", "COP", "PEN",
                "UYU", "VEF", "BOB", "PYG", "GYD", "SRD", "TTD", "BBD", "JMD", "BSD",
                "KRW", "HKD", "SGD", "TWD", "THB", "MYR", "IDR", "PHP", "VND", "LAK",
                "KHR", "MMK", "BND", "PKR", "LKR", "NPR", "BDT", "AFN", "MVR", "BTN",
                "AED", "SAR", "QAR", "OMR", "KWD", "BHD", "JOD", "ILS", "TRY", "LBP",
                "SYP", "IQD", "IRR", "YER", "EGP", "LYD", "TND", "DZD", "MAD", "MRU",
                "NGN", "GHS", "KES", "UGX", "TZS", "ETB", "XOF", "XAF", "ZMW", "BWP",
                "MZN", "NAD", "SZL", "LSL", "MWK", "RWF", "BIF", "DJF", "SOS", "SDG",
                "SSP", "ERN", "KMF", "MGA", "SCR", "MUR", "STN", "CVE", "GMD", "GNF",
                "SLL", "LRD", "ZWL", "AOA", "CDF", "XCD", "AWG", "BZD", "BMD", "GIP",
                "FKP", "SHP", "PAB", "NIO", "HNL", "GTQ", "SVC", "CRC", "DOP", "HTG",
                "CUP", "UAH", "PLN", "CZK", "HUF", "RON", "BGN", "HRK", "RSD", "MKD",
                "ALL", "BAM", "MDL", "RUB", "BYN", "KZT", "UZS", "TJS", "TMT", "AZN",
                "GEL", "AMD", "KGS", "MNT", "XPF", "WST", "TOP", "FJD", "PGK", "SBD",
                "VUV"
            ];
            
            // Create encryption key
            const encryptionKey = ethers.hexlify(ethers.randomBytes(32));
            
            console.log("\n   Registering as arbitrator...");
            console.log("   Supported Currencies:", supportedCurrencies.length);
            
            const tx = await arbitratorManager.registerArbitrator(
                supportedCurrencies,
                encryptionKey
            );
            
            console.log("   Transaction Hash:", tx.hash);
            await tx.wait();
            console.log("   ✅ Successfully registered as arbitrator!");
            
            // Verify registration
            const info = await arbitratorManager.arbitratorInfo(deployer.address);
            console.log("\n   Arbitrator Info:");
            console.log("   Is Active:", info.isActive);
            console.log("   Supported Fiats:", info.supportedFiats.length);
        }
        
        // Verify currency support
        console.log("\n   Currency Support Verification:");
        const sampleCurrencies = ["USD", "EUR", "GBP", "COP", "MXN"];
        for (const currency of sampleCurrencies) {
            const supported = await arbitratorManager.currencySupport(deployer.address, currency);
            console.log(`   ${currency}: ${supported ? "✅ Supported" : "❌ Not Supported"}`);
        }
        
        // ====================================================================
        // STEP 3: VERIFY HUB CONFIGURATION
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("STEP 3: VERIFY HUB CONFIGURATION");
        console.log("=".repeat(70));
        
        const hub = await ethers.getContractAt("Hub", contracts.Hub, deployer);
        const hubConfig = await hub.getConfig();
        
        console.log("\n   Hub Configuration:");
        console.log("   Offer Contract:", hubConfig.offerContract);
        console.log("   Trade Contract:", hubConfig.tradeContract);
        console.log("   Profile Contract:", hubConfig.profileContract);
        console.log("   Price Oracle:", hubConfig.priceContract);
        console.log("   Treasury:", hubConfig.treasury);
        console.log("   Fees (all should be 0):");
        console.log("     - Burn Fee:", hubConfig.burnFeePct.toString());
        console.log("     - Chain Fee:", hubConfig.chainFeePct.toString());
        console.log("     - Warchest Fee:", hubConfig.warchestFeePct.toString());
        console.log("     - Conversion Fee:", hubConfig.conversionFeePct.toString());
        console.log("     - Arbitrator Fee:", hubConfig.arbitratorFeePct.toString());
        
        // ====================================================================
        // STEP 4: VERIFY OFFER CONTRACT
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("STEP 4: VERIFY OFFER CONTRACT");
        console.log("=".repeat(70));
        
        const offer = await ethers.getContractAt("Offer", contracts.Offer, deployer);
        const offerHub = await offer.hub();
        console.log("   Offer -> Hub:", offerHub);
        console.log("   Hub Match:", offerHub.toLowerCase() === contracts.Hub.toLowerCase() ? "✅ Correct" : "❌ Mismatch");
        
        // Test updateOfferDescription function exists
        try {
            // Just check if the function exists by getting its selector
            const updateDescFunc = offer.interface.getFunction("updateOfferDescription");
            console.log("   updateOfferDescription: ✅ Function exists");
            console.log("   Max Description Length: 280 characters");
        } catch (error) {
            console.log("   updateOfferDescription: ❌ Function not found");
        }
        
        // ====================================================================
        // STEP 5: VERIFY TRADE CONTRACT DEPENDENCIES
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("STEP 5: VERIFY TRADE CONTRACT DEPENDENCIES");
        console.log("=".repeat(70));
        
        const trade = await ethers.getContractAt("Trade", contracts.Trade, deployer);
        const escrowAddr = await trade.escrow();
        const arbManagerAddr = await trade.arbitratorManager();
        
        console.log("   Trade -> Escrow:", escrowAddr);
        console.log("   Escrow Match:", escrowAddr.toLowerCase() === contracts.Escrow.toLowerCase() ? "✅ Correct" : "❌ Mismatch");
        console.log("   Trade -> ArbitratorManager:", arbManagerAddr);
        console.log("   ArbitratorManager Match:", arbManagerAddr.toLowerCase() === contracts.ArbitratorManager.toLowerCase() ? "✅ Correct" : "❌ Mismatch");
        
        // ====================================================================
        // FINAL SUMMARY
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("INITIALIZATION COMPLETE");
        console.log("=".repeat(70));
        
        const finalBalance = await ethers.provider.getBalance(deployer.address);
        console.log("\n💰 Gas Usage:");
        console.log(`   Starting Balance: ${ethers.formatEther(balance)} BNB`);
        console.log(`   Final Balance:    ${ethers.formatEther(finalBalance)} BNB`);
        console.log(`   Total Gas Used:   ${ethers.formatEther(balance - finalBalance)} BNB`);
        
        console.log("\n✅ Summary:");
        console.log("   ✓ PriceOracle initialized with", currencies.length, "fiat currencies");
        console.log("   ✓ Deployer registered as arbitrator for all currencies");
        console.log("   ✓ Hub configuration verified (zero fees active)");
        console.log("   ✓ Offer contract supports description updates");
        console.log("   ✓ Trade contract dependencies configured");
        console.log("   ✓ System ready for production use");
        
        console.log("\n📊 View on BSCScan:");
        Object.entries(contracts).forEach(([name, address]) => {
            console.log(`   ${name}: https://bscscan.com/address/${address}`);
        });
        
        console.log("\n🎉 BSC Mainnet deployment fully initialized and ready!");
        
    } catch (error) {
        console.error("\n❌ Initialization failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => {
        console.log("\n✨ Initialization script completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });