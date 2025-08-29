require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("=".repeat(70));
    console.log("Saving BSC Mainnet Deployment Information");
    console.log("=".repeat(70));
    
    // All deployed contract addresses
    const deployedContracts = {
        Hub: "0x696F771E329DF4550044686C995AB9028fD3a724",
        Profile: "0x9a1AD40c90E5f282152Aa9F56d18B99F31794B68",
        PriceOracle: "0x09e65e3a9028f7B8d59F85b9A6933C6eF6e092ca",
        Offer: "0x5B1E3C79A6A84BD436Fe2141A13E1767C178E621",
        Trade: "0xe0cdc4bDb60fCeC0ED1FFedcbbFb86839206862f",
        Escrow: "0xA07BfE2A3eE903Dde4e62ADc76cC32b57B0e0Cd2",
        ArbitratorManager: "0xA5200aa4a78391b296a8315d6825426fE403BC31"
    };
    
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const deployer = new ethers.Wallet(privateKey, ethers.provider);
    
    // Configuration (with BigInts converted to strings)
    const config = {
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
        burnFeePct: 100,
        chainFeePct: 200,
        warchestFeePct: 300,
        conversionFeePct: 50,
        arbitratorFeePct: 100,
        minTradeAmount: "10000000", // $10 in cents
        maxTradeAmount: "10000000000", // $10,000 in cents
        maxActiveOffers: 10,
        maxActiveTrades: 5,
        tradeExpirationTimer: 24 * 60 * 60,
        tradeDisputeTimer: 7 * 24 * 60 * 60,
        globalPause: false,
        pauseNewTrades: false,
        pauseDeposits: false,
        pauseWithdrawals: false
    };
    
    const deploymentInfo = {
        network: "BSC Mainnet",
        chainId: "56",
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: deployedContracts,
        config: config
    };
    
    const filename = `deployment-bsc-mainnet-complete.json`;
    fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    
    console.log("\n✅ Deployment Info Saved!");
    console.log("\nAll Deployed Contracts:");
    Object.entries(deployedContracts).forEach(([name, address]) => {
        console.log(`   ${name.padEnd(20)} : ${address}`);
    });
    console.log("\n📁 Deployment info saved to:", filename);
    
    // BSCScan links
    console.log("\n📊 View on BSCScan:");
    Object.entries(deployedContracts).forEach(([name, address]) => {
        console.log(`   ${name}: https://bscscan.com/address/${address}`);
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });