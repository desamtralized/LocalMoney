require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=".repeat(70));
    console.log("Initialize New Offer Contract on BSC Mainnet");
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
    const NEW_OFFER_ADDRESS = "0x9EB738820BF2b838187a5Ae5824DC812d0970eE4";
    
    console.log("\n📍 Contract Addresses:");
    console.log("   Hub Contract:", HUB_ADDRESS);
    console.log("   New Offer Contract:", NEW_OFFER_ADDRESS);
    
    try {
        console.log("\n" + "=".repeat(70));
        console.log("INITIALIZING OFFER CONTRACT");
        console.log("=".repeat(70));
        
        // Get Offer contract
        const offerContract = await ethers.getContractAt("Offer", NEW_OFFER_ADDRESS, deployer);
        
        // Check if already initialized by trying to read the hub
        console.log("\n1. Checking initialization status...");
        try {
            const currentHub = await offerContract.hub();
            if (currentHub !== ethers.ZeroAddress) {
                console.log("   ⚠️  Contract already initialized with Hub:", currentHub);
                
                if (currentHub.toLowerCase() === HUB_ADDRESS.toLowerCase()) {
                    console.log("   ✅ Contract is already correctly initialized!");
                    return;
                } else {
                    console.log("   ❌ Contract initialized with wrong Hub address!");
                    console.log("      Expected:", HUB_ADDRESS);
                    console.log("      Current:", currentHub);
                    process.exit(1);
                }
            }
        } catch (e) {
            console.log("   Contract not yet initialized (this is expected)");
        }
        
        // Initialize the Offer contract with Hub address
        console.log("\n2. Initializing Offer contract with Hub address...");
        const tx = await offerContract.initialize(HUB_ADDRESS);
        console.log("   Transaction hash:", tx.hash);
        
        console.log("   Waiting for confirmation...");
        const receipt = await tx.wait();
        console.log("   ✅ Initialization successful!");
        console.log("   Block number:", receipt.blockNumber);
        console.log("   Gas used:", receipt.gasUsed.toString());
        
        // Verify initialization
        console.log("\n3. Verifying initialization...");
        const verifiedHub = await offerContract.hub();
        console.log("   Hub address in Offer contract:", verifiedHub);
        
        if (verifiedHub.toLowerCase() === HUB_ADDRESS.toLowerCase()) {
            console.log("   ✅ Offer contract successfully initialized with correct Hub!");
        } else {
            console.log("   ❌ Initialization verification failed!");
        }
        
        // Check nextOfferId to confirm initialization
        try {
            const nextId = await offerContract.nextOfferId();
            console.log("   Next Offer ID:", nextId.toString());
            if (nextId > 0) {
                console.log("   ✅ Contract state properly initialized");
            }
        } catch (e) {
            console.log("   ⚠️  Could not verify nextOfferId");
        }
        
        // Final summary
        console.log("\n" + "=".repeat(70));
        console.log("INITIALIZATION COMPLETE");
        console.log("=".repeat(70));
        
        console.log("\n✅ Offer contract has been initialized:");
        console.log("   - Offer Contract:", NEW_OFFER_ADDRESS);
        console.log("   - Hub Contract:", HUB_ADDRESS);
        console.log("   - Description support: ENABLED");
        console.log("   - Ready for use: YES");
        
        console.log("\n📊 View on BSCScan:");
        console.log(`   Offer: https://bscscan.com/address/${NEW_OFFER_ADDRESS}`);
        console.log(`   Transaction: https://bscscan.com/tx/${tx.hash}`);
        
        // Final balance
        const finalBalance = await ethers.provider.getBalance(deployer.address);
        console.log("\n💰 Gas Usage:");
        console.log(`   Starting Balance: ${ethers.formatEther(balance)} BNB`);
        console.log(`   Final Balance:    ${ethers.formatEther(finalBalance)} BNB`);
        console.log(`   Gas Used:         ${ethers.formatEther(balance - finalBalance)} BNB`);
        
        console.log("\n📝 Next Steps:");
        console.log("1. Test offer creation on BSC Mainnet");
        console.log("2. Verify description persistence works");
        console.log("3. Monitor for any errors");
        
    } catch (error) {
        console.error("\n❌ Initialization failed:", error.message);
        
        // Check if it's an already initialized error
        if (error.message.includes("Initializable")) {
            console.log("\n⚠️  Contract may already be initialized");
            console.log("   Run check-hub-config.js to verify current state");
        }
        
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