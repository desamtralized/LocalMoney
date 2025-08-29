require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=".repeat(70));
    console.log("Registering Deployer as Arbitrator for All Currencies");
    console.log("=".repeat(70));
    
    // Create wallet from private key
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
        console.error("❌ DEPLOYER_PRIVATE_KEY not found in .env file");
        process.exit(1);
    }
    
    const deployer = new ethers.Wallet(privateKey, ethers.provider);
    console.log("\nDeployer Address:", deployer.address);
    
    // Check balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "BNB");
    
    // ArbitratorManager contract address from deployment
    const arbitratorManagerAddress = "0xA5200aa4a78391b296a8315d6825426fE403BC31";
    
    // Load ArbitratorManager contract
    const ArbitratorManager = await ethers.getContractFactory("ArbitratorManager", deployer);
    const arbitratorManager = ArbitratorManager.attach(arbitratorManagerAddress);
    
    console.log("\nArbitratorManager Contract:", arbitratorManagerAddress);
    
    // All supported fiat currencies from the CosmWasm contracts
    // These are the most common currencies for P2P trading
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
    
    // Create encryption key (this would normally be a proper public key)
    const encryptionKey = ethers.hexlify(ethers.randomBytes(32));
    
    console.log("\n📝 Registration Details:");
    console.log("   Arbitrator:", deployer.address);
    console.log("   Supported Currencies:", supportedCurrencies.length);
    console.log("   Sample Currencies:", supportedCurrencies.slice(0, 10).join(", "), "...");
    
    try {
        // Check if already registered
        const arbitratorInfo = await arbitratorManager.arbitratorInfo(deployer.address);
        if (arbitratorInfo.joinedAt > 0) {
            console.log("\n⚠️  Already registered as arbitrator");
            console.log("   Joined At:", new Date(Number(arbitratorInfo.joinedAt) * 1000).toISOString());
            console.log("   Is Active:", arbitratorInfo.isActive);
            console.log("   Disputes Handled:", arbitratorInfo.disputesHandled.toString());
            console.log("   Reputation Score:", arbitratorInfo.reputationScore.toString());
            return;
        }
        
        // Register as arbitrator
        console.log("\n🚀 Registering as arbitrator...");
        const tx = await arbitratorManager.registerArbitrator(
            supportedCurrencies,
            encryptionKey
        );
        
        console.log("   Transaction Hash:", tx.hash);
        console.log("   Waiting for confirmation...");
        
        const receipt = await tx.wait();
        console.log("   ✅ Transaction confirmed in block:", receipt.blockNumber);
        
        // Verify registration
        console.log("\n🔍 Verifying registration...");
        const info = await arbitratorManager.arbitratorInfo(deployer.address);
        
        console.log("\n✅ Successfully Registered as Arbitrator!");
        console.log("\nArbitrator Info:");
        console.log("   Address:", deployer.address);
        console.log("   Is Active:", info.isActive);
        console.log("   Supported Fiats:", info.supportedFiats.length);
        console.log("   Reputation Score:", info.reputationScore.toString());
        console.log("   Joined At:", new Date(Number(info.joinedAt) * 1000).toISOString());
        
        // Check a few currencies to confirm
        console.log("\n📋 Currency Support Verification:");
        const sampleCurrencies = ["USD", "EUR", "GBP", "BTC", "ETH"];
        for (const currency of sampleCurrencies.slice(0, 3)) {
            const supported = await arbitratorManager.currencySupport(deployer.address, currency);
            console.log(`   ${currency}: ${supported ? "✅ Supported" : "❌ Not Supported"}`);
        }
        
        // Check arbitrators list for USD
        const usdArbitrators = await arbitratorManager.arbitratorsByFiat("USD");
        console.log("\n📊 USD Arbitrators:", usdArbitrators.length);
        console.log("   Deployer included:", usdArbitrators.includes(deployer.address) ? "✅ Yes" : "❌ No");
        
    } catch (error) {
        console.error("\n❌ Registration failed:", error.message);
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