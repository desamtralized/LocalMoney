require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=".repeat(70));
    console.log("Revert Hub to Original Offer Contract on BSC Mainnet");
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
    
    // Contract addresses
    const HUB_ADDRESS = "0x27c6799e07f12bB90cf037eAbfD8bd0aA8345e01";
    const ORIGINAL_OFFER_ADDRESS = "0xe42b406Aca4b66597b215836BdAaDbF02f6d30f0"; // Original working Offer contract
    const BROKEN_OFFER_ADDRESS = "0x9EB738820BF2b838187a5Ae5824DC812d0970eE4"; // New Offer with wrong Hub
    
    console.log("\n📍 Contract Addresses:");
    console.log("   Hub Contract:", HUB_ADDRESS);
    console.log("   Original Offer (working):", ORIGINAL_OFFER_ADDRESS);
    console.log("   Broken Offer (wrong Hub):", BROKEN_OFFER_ADDRESS);
    
    try {
        console.log("\n" + "=".repeat(70));
        console.log("REVERTING HUB CONFIGURATION");
        console.log("=".repeat(70));
        
        // Get Hub contract
        const hubContract = await ethers.getContractAt("Hub", HUB_ADDRESS, deployer);
        
        // Get current configuration
        console.log("\n1. Getting current Hub configuration...");
        const currentConfig = await hubContract.getConfig();
        console.log("   Current Offer Contract:", currentConfig.offerContract);
        
        // Check if already using original
        if (currentConfig.offerContract.toLowerCase() === ORIGINAL_OFFER_ADDRESS.toLowerCase()) {
            console.log("   ✅ Hub is already using the original Offer contract!");
            return;
        }
        
        // Prepare updated configuration with original Offer address
        console.log("\n2. Preparing configuration with original Offer contract...");
        const updatedConfig = {
            offerContract: ORIGINAL_OFFER_ADDRESS,  // REVERT TO ORIGINAL
            tradeContract: currentConfig.tradeContract,
            profileContract: currentConfig.profileContract,
            priceContract: currentConfig.priceContract,
            treasury: currentConfig.treasury,
            localMarket: currentConfig.localMarket,
            priceProvider: currentConfig.priceProvider,
            localTokenAddress: currentConfig.localTokenAddress,
            chainFeeCollector: currentConfig.chainFeeCollector,
            swapRouter: currentConfig.swapRouter,
            burnFeePct: currentConfig.burnFeePct,
            chainFeePct: currentConfig.chainFeePct,
            warchestFeePct: currentConfig.warchestFeePct,
            conversionFeePct: currentConfig.conversionFeePct,
            arbitratorFeePct: currentConfig.arbitratorFeePct,
            minTradeAmount: currentConfig.minTradeAmount,
            maxTradeAmount: currentConfig.maxTradeAmount,
            maxActiveOffers: currentConfig.maxActiveOffers,
            maxActiveTrades: currentConfig.maxActiveTrades,
            tradeExpirationTimer: currentConfig.tradeExpirationTimer,
            tradeDisputeTimer: currentConfig.tradeDisputeTimer,
            globalPause: currentConfig.globalPause,
            pauseNewTrades: currentConfig.pauseNewTrades,
            pauseDeposits: currentConfig.pauseDeposits,
            pauseWithdrawals: currentConfig.pauseWithdrawals
        };
        
        // Update Hub configuration
        console.log("\n3. Reverting Hub to original Offer contract...");
        const tx = await hubContract.updateConfig(updatedConfig);
        console.log("   Transaction hash:", tx.hash);
        
        console.log("   Waiting for confirmation...");
        const receipt = await tx.wait();
        console.log("   ✅ Configuration reverted successfully!");
        console.log("   Block number:", receipt.blockNumber);
        console.log("   Gas used:", receipt.gasUsed.toString());
        
        // Verify the update
        console.log("\n4. Verifying the revert...");
        const newConfig = await hubContract.getConfig();
        console.log("   New Offer Contract:", newConfig.offerContract);
        
        if (newConfig.offerContract.toLowerCase() === ORIGINAL_OFFER_ADDRESS.toLowerCase()) {
            console.log("   ✅ Hub successfully reverted to original Offer contract!");
        } else {
            console.log("   ❌ Revert failed!");
        }
        
        // Final summary
        console.log("\n" + "=".repeat(70));
        console.log("REVERT COMPLETE");
        console.log("=".repeat(70));
        
        console.log("\n✅ Hub has been reverted to original configuration:");
        console.log("   - Now using: Original Offer Contract");
        console.log("   - Address:", ORIGINAL_OFFER_ADDRESS);
        console.log("   - Status: Offer creation should work again");
        console.log("   - Note: Description updates not supported (yet)");
        
        console.log("\n📊 View on BSCScan:");
        console.log(`   Hub: https://bscscan.com/address/${HUB_ADDRESS}`);
        console.log(`   Original Offer: https://bscscan.com/address/${ORIGINAL_OFFER_ADDRESS}`);
        console.log(`   Transaction: https://bscscan.com/tx/${tx.hash}`);
        
        // Final balance
        const finalBalance = await ethers.provider.getBalance(deployer.address);
        console.log("\n💰 Gas Usage:");
        console.log(`   Starting Balance: ${ethers.formatEther(balance)} BNB`);
        console.log(`   Final Balance:    ${ethers.formatEther(finalBalance)} BNB`);
        console.log(`   Gas Used:         ${ethers.formatEther(balance - finalBalance)} BNB`);
        
        console.log("\n📝 Next Steps:");
        console.log("1. Offer creation should work again");
        console.log("2. Deploy a new Offer contract properly for description support");
        console.log("3. Ensure new contract is initialized with correct Hub address");
        
    } catch (error) {
        console.error("\n❌ Revert failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => {
        console.log("\n✨ Script completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });