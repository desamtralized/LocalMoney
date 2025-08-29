require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
        console.error("❌ DEPLOYER_PRIVATE_KEY not found in .env file");
        process.exit(1);
    }
    
    console.log("=".repeat(70));
    console.log("Checking BSC Wallet Balances");
    console.log("=".repeat(70));
    
    const wallet = new ethers.Wallet(privateKey);
    console.log("\nWallet Address:", wallet.address);
    
    // Check BSC Mainnet
    try {
        const bscProvider = new ethers.JsonRpcProvider("https://bsc-dataseed1.binance.org/");
        const bscBalance = await bscProvider.getBalance(wallet.address);
        console.log("\n📍 BSC Mainnet:");
        console.log("   Balance:", ethers.formatEther(bscBalance), "BNB");
        console.log("   Sufficient for deployment:", parseFloat(ethers.formatEther(bscBalance)) >= 0.02 ? "✅ Yes" : "❌ No (need 0.02 BNB)");
    } catch (error) {
        console.error("   Error checking BSC Mainnet:", error.message);
    }
    
    // Check BSC Testnet
    try {
        const testnetProvider = new ethers.JsonRpcProvider("https://data-seed-prebsc-1-s1.binance.org:8545/");
        const testnetBalance = await testnetProvider.getBalance(wallet.address);
        console.log("\n📍 BSC Testnet:");
        console.log("   Balance:", ethers.formatEther(testnetBalance), "tBNB");
        console.log("   Sufficient for deployment:", parseFloat(ethers.formatEther(testnetBalance)) >= 0.1 ? "✅ Yes" : "❌ No (need 0.1 tBNB)");
        if (parseFloat(ethers.formatEther(testnetBalance)) < 0.1) {
            console.log("   💡 Get testnet BNB from: https://testnet.binance.org/faucet-smart");
        }
    } catch (error) {
        console.error("   Error checking BSC Testnet:", error.message);
    }
}

main()
    .then(() => {
        console.log("\n✨ Balance check completed!");
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
