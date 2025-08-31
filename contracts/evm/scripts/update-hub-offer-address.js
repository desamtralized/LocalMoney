require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=".repeat(70));
    console.log("LocalMoney Smart Contracts - Update Hub Offer Address");
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
    const NEW_OFFER_ADDRESS = "0x9EB738820BF2b838187a5Ae5824DC812d0970eE4"; // New Offer contract with description support
    const OLD_OFFER_ADDRESS = "0xe42b406Aca4b66597b215836BdAaDbF02f6d30f0"; // Old Offer contract without description support
    
    console.log("\n📍 Contract Addresses:");
    console.log("   Hub Contract:", HUB_ADDRESS);
    console.log("   Old Offer Contract:", OLD_OFFER_ADDRESS);
    console.log("   New Offer Contract:", NEW_OFFER_ADDRESS, "✨ (with description support)");
    
    try {
        console.log("\n" + "=".repeat(70));
        console.log("UPDATING HUB CONFIGURATION");
        console.log("=".repeat(70));
        
        // Get Hub contract
        const hubContract = await ethers.getContractAt("Hub", HUB_ADDRESS, deployer);
        
        // Get current configuration
        console.log("\n1. Getting current Hub configuration...");
        const currentConfig = await hubContract.getConfig();
        console.log("   Current Offer Contract:", currentConfig.offerContract);
        
        // Prepare updated configuration with new Offer address
        console.log("\n2. Preparing updated configuration...");
        const updatedConfig = {
            offerContract: NEW_OFFER_ADDRESS,  // UPDATE THE OFFER CONTRACT ADDRESS
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
        console.log("\n3. Updating Hub configuration with new Offer contract...");
        const tx = await hubContract.updateConfig(updatedConfig);
        console.log("   Transaction hash:", tx.hash);
        
        console.log("   Waiting for confirmation...");
        const receipt = await tx.wait();
        console.log("   ✅ Configuration updated successfully!");
        console.log("   Block number:", receipt.blockNumber);
        console.log("   Gas used:", receipt.gasUsed.toString());
        
        // Verify the update
        console.log("\n4. Verifying the update...");
        const newConfig = await hubContract.getConfig();
        console.log("   New Offer Contract:", newConfig.offerContract);
        
        if (newConfig.offerContract.toLowerCase() === NEW_OFFER_ADDRESS.toLowerCase()) {
            console.log("   ✅ Offer contract address successfully updated!");
        } else {
            console.log("   ❌ Offer contract address update failed!");
        }
        
        // Final summary
        console.log("\n" + "=".repeat(70));
        console.log("UPDATE COMPLETE");
        console.log("=".repeat(70));
        
        console.log("\n✅ Hub configuration has been updated:");
        console.log("   - Old Offer Contract:", OLD_OFFER_ADDRESS);
        console.log("   - New Offer Contract:", NEW_OFFER_ADDRESS);
        console.log("   - Description updates: ENABLED");
        console.log("   - Max description length: 280 characters");
        
        console.log("\n📊 View on BSCScan:");
        console.log(`   Hub: https://bscscan.com/address/${HUB_ADDRESS}`);
        console.log(`   New Offer: https://bscscan.com/address/${NEW_OFFER_ADDRESS}`);
        console.log(`   Transaction: https://bscscan.com/tx/${tx.hash}`);
        
        // Final balance
        const finalBalance = await ethers.provider.getBalance(deployer.address);
        console.log("\n💰 Gas Usage:");
        console.log(`   Starting Balance: ${ethers.formatEther(balance)} BNB`);
        console.log(`   Final Balance:    ${ethers.formatEther(finalBalance)} BNB`);
        console.log(`   Gas Used:         ${ethers.formatEther(balance - finalBalance)} BNB`);
        
        console.log("\n📝 Next Steps:");
        console.log("1. Frontend configuration has already been updated");
        console.log("2. Test offer creation with description on BSC Mainnet");
        console.log("3. Test offer description updates on BSC Mainnet");
        
    } catch (error) {
        console.error("\n❌ Update failed:", error);
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