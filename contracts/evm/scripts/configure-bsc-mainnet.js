require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("=".repeat(70));
    console.log("LocalMoney Smart Contracts - BSC Mainnet Configuration");
    console.log("Completing Circular Dependencies Setup");
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
    
    // Deployed contract addresses from the partial deployment
    const deployedContracts = {
        Hub: "0x27c6799e07f12bB90cf037eAbfD8bd0aA8345e01",
        Profile: "0x88dAd4bdf0465456CF916F994c2faD7b41501939",
        PriceOracle: "0xCc0f796822c58eed5F58BDf72DfC8433AdE66345",
        Offer: "0xe42b406Aca4b66597b215836BdAaDbF02f6d30f0",
        Trade: "0x21D26b89d228bAa4597a87cffAbD7554FD8058A9",
        Escrow: "0xCd1BFEb7D0aAdA1e2CBbEEf7D1E3c84a08aFf01F",
        ArbitratorManager: "0x79cAeB526AD74213ed3A923Ddc147720D21b4768"
    };
    
    console.log("\n📍 Deployed Contracts:");
    Object.entries(deployedContracts).forEach(([name, address]) => {
        console.log(`   ${name.padEnd(20)} : ${address}`);
    });
    
    try {
        console.log("\n" + "=".repeat(70));
        console.log("CONFIGURING CIRCULAR DEPENDENCIES");
        console.log("=".repeat(70));
        
        // 1. Update Trade with Escrow and ArbitratorManager addresses
        console.log("\n1. Updating Trade contract dependencies...");
        const tradeContract = await ethers.getContractAt("Trade", deployedContracts.Trade, deployer);
        
        // Set Escrow contract
        console.log("   Setting Escrow contract...");
        await tradeContract.setEscrowContract(deployedContracts.Escrow);
        console.log("   ✅ Escrow contract set");
        
        // Set ArbitratorManager
        console.log("   Setting ArbitratorManager...");
        await tradeContract.setArbitratorManager(deployedContracts.ArbitratorManager);
        console.log("   ✅ ArbitratorManager set");
        
        // 2. Update Escrow with Trade address
        console.log("\n2. Updating Escrow contract dependencies...");
        const escrowContract = await ethers.getContractAt("Escrow", deployedContracts.Escrow, deployer);
        await escrowContract.setTradeContract(deployedContracts.Trade);
        console.log("   ✅ Trade contract set in Escrow");
        
        // 3. Update Hub with all contract addresses
        console.log("\n3. Updating Hub configuration...");
        const hubContract = await ethers.getContractAt("Hub", deployedContracts.Hub, deployer);
        
        const hubConfig = {
            offerContract: deployedContracts.Offer,
            tradeContract: deployedContracts.Trade,
            profileContract: deployedContracts.Profile,
            priceContract: deployedContracts.PriceOracle,
            treasury: deployer.address,
            localMarket: deployer.address,
            priceProvider: deployer.address,
            localTokenAddress: ethers.ZeroAddress,
            chainFeeCollector: deployer.address,
            swapRouter: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap V3
            burnFeePct: 0,              // 0% - No fees
            chainFeePct: 0,             // 0% - No fees
            warchestFeePct: 0,          // 0% - No fees
            conversionFeePct: 0,        // 0% - No fees
            arbitratorFeePct: 0,        // 0% - No fees
            minTradeAmount: ethers.parseUnits("1", 6),       // $1 minimum
            maxTradeAmount: ethers.parseUnits("500", 6),     // $500 maximum
            maxActiveOffers: 10,
            maxActiveTrades: 5,
            tradeExpirationTimer: 24 * 60 * 60,
            tradeDisputeTimer: 7 * 24 * 60 * 60,
            globalPause: false,
            pauseNewTrades: false,
            pauseDeposits: false,
            pauseWithdrawals: false
        };
        
        await hubContract.updateConfig(hubConfig);
        console.log("   ✅ Hub configuration updated with all contract addresses");
        console.log("   ✅ Zero fees configuration applied");
        
        // Save final deployment results
        console.log("\n" + "=".repeat(70));
        console.log("CONFIGURATION COMPLETE");
        console.log("=".repeat(70));
        
        const deploymentInfo = {
            network: "BSC Mainnet",
            chainId: Number(network.chainId),
            deployer: deployer.address,
            timestamp: new Date().toISOString(),
            contracts: deployedContracts,
            features: {
                offerDescriptionUpdate: true,
                maxDescriptionLength: 280,
                zeroFees: true,
            },
            status: "fully configured"
        };
        
        // Save to file
        const deploymentsDir = path.join(__dirname, '..', 'deployments');
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir);
        }
        
        const filename = `bsc-mainnet-complete-${Date.now()}.json`;
        fs.writeFileSync(
            path.join(deploymentsDir, filename),
            JSON.stringify(deploymentInfo, null, 2)
        );
        
        console.log("\n✅ All contracts configured successfully!");
        console.log("\n📁 Deployment info saved to:", `deployments/${filename}`);
        
        console.log("\n" + "=".repeat(70));
        console.log("CONTRACT ADDRESSES FOR CONFIGURATION");
        console.log("=".repeat(70));
        
        console.log("\nHub:", deployedContracts.Hub);
        console.log("Profile:", deployedContracts.Profile);
        console.log("Offer:", deployedContracts.Offer);
        console.log("Trade:", deployedContracts.Trade);
        console.log("Escrow:", deployedContracts.Escrow);
        console.log("PriceOracle:", deployedContracts.PriceOracle);
        console.log("ArbitratorManager:", deployedContracts.ArbitratorManager);
        
        // BSCScan links
        console.log("\n📊 View on BSCScan:");
        Object.entries(deployedContracts).forEach(([name, address]) => {
            console.log(`   ${name}: https://bscscan.com/address/${address}`);
        });
        
        // Final balance
        const finalBalance = await ethers.provider.getBalance(deployer.address);
        console.log("\n💰 Gas Usage:");
        console.log(`   Starting Balance: ${ethers.formatEther(balance)} BNB`);
        console.log(`   Final Balance:    ${ethers.formatEther(finalBalance)} BNB`);
        console.log(`   Gas Used:         ${ethers.formatEther(balance - finalBalance)} BNB`);
        
        console.log("\n✅ Configuration Summary:");
        console.log("   - All fees: 0% (ZERO FEES)");
        console.log("   - Min trade amount: $1");
        console.log("   - Max trade amount: $500");
        console.log("   - Trade expiration: 24 hours");
        console.log("   - Dispute window: 7 days");
        console.log("   - Offer description updates: ENABLED");
        
        console.log("\n📝 Next Steps:");
        console.log("1. Update app/src/network/evm/config/bsc.ts with these addresses");
        console.log("2. Test the deployment on BSC Mainnet");
        console.log("3. Verify contracts on BscScan if needed");
        
        return deploymentInfo;
        
    } catch (error) {
        console.error("\n❌ Configuration failed:", error);
        process.exit(1);
    }
}

main()
    .then((result) => {
        console.log("\n✨ Configuration script completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });