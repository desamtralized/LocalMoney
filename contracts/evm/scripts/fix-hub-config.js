const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Fixing Hub configuration with account:", deployer.address);
    
    const hubAddress = "0x45Ea91961F00fD0452273Aa4DB128e07B2FC9E9c";
    const hub = await ethers.getContractAt("Hub", hubAddress, deployer);
    
    console.log("\n📝 Updating Hub configuration...");
    
    const config = {
        treasury: deployer.address,
        localMarket: deployer.address,
        localTokenAddress: ethers.ZeroAddress,
        chainFeeCollector: deployer.address,
        swapRouter: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap V3
        offerContract: "0x8057C2fc06B5C1ceB0A7D723D75d672eE52AB914",
        tradeContract: "0xFEfC8C3A108D44C9cCc2E1559796dfAa408ed361",
        profileContract: "0x4D5Ff987926159C27CF40d2B14580C1A164E81bf",
        priceContract: "0x89876349f314255bD06bC5C354662d0dA6D1E58d",
        priceProvider: deployer.address,
        burnFeePct: 0,
        chainFeePct: 0,
        warchestFeePct: 0,
        conversionFeePct: 0,
        arbitratorFeePct: 0,
        minTradeAmount: ethers.parseUnits("10", 6),
        maxTradeAmount: ethers.parseUnits("10000", 6),
        maxActiveOffers: 100,
        maxActiveTrades: 100,
        tradeExpirationTimer: 24 * 60 * 60,
        tradeDisputeTimer: 7 * 24 * 60 * 60,
        globalPause: false,
        pauseNewTrades: false,
        pauseDeposits: false,
        pauseWithdrawals: false
    };
    
    const tx = await hub.updateConfig(config);
    console.log("   Transaction sent:", tx.hash);
    await tx.wait();
    console.log("   ✅ Hub configuration updated!");
    
    // Verify the update
    console.log("\n📊 Verifying new configuration...");
    const newConfig = await hub.getConfig();
    console.log("   Offer:", newConfig.offerContract);
    console.log("   Trade:", newConfig.tradeContract);
    console.log("   Profile:", newConfig.profileContract);
    console.log("   PriceOracle:", newConfig.priceContract);
    
    if (newConfig.offerContract === "0x8057C2fc06B5C1ceB0A7D723D75d672eE52AB914") {
        console.log("\n✅ Hub configuration successfully fixed!");
    } else {
        console.log("\n❌ Configuration update failed!");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });