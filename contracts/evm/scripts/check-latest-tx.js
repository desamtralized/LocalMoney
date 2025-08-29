const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Checking Latest Aggregator Transaction ===\n");
    
    // Latest transaction hash from aggregator
    const txHash = "0xf01f68f3f341855d8d1f8e6601939f590553f1398d0044bd74d7ef152868c705";
    
    console.log("Fetching transaction:", txHash);
    const tx = await ethers.provider.getTransaction(txHash);
    
    if (tx) {
        console.log("\nTransaction Details:");
        console.log("- From:", tx.from);
        console.log("- To:", tx.to);
        console.log("- Gas Limit:", tx.gasLimit.toString());
        
        // Get receipt
        const receipt = await ethers.provider.getTransactionReceipt(txHash);
        
        if (receipt) {
            console.log("\nTransaction Receipt:");
            console.log("- Status:", receipt.status === 1 ? "✅ Success" : "❌ Failed");
            console.log("- Block:", receipt.blockNumber);
            console.log("- Gas Used:", receipt.gasUsed.toString());
            console.log("- Effective Gas Price:", receipt.effectiveGasPrice?.toString());
            
            const gasUsedPercent = (Number(receipt.gasUsed) / Number(tx.gasLimit) * 100).toFixed(2);
            console.log("- Gas Used %:", gasUsedPercent + "%");
            
            if (receipt.status === 0) {
                console.log("\n❌ TRANSACTION FAILED!");
                
                // Try to simulate to get error
                try {
                    const result = await ethers.provider.call({
                        from: tx.from,
                        to: tx.to,
                        data: tx.data,
                        gasLimit: tx.gasLimit
                    }, receipt.blockNumber);
                } catch (error) {
                    console.log("Error reason:", error.reason || error.message);
                }
            } else {
                console.log("\n✅ Transaction succeeded");
                console.log("Events emitted:", receipt.logs.length);
                
                if (receipt.logs.length > 0) {
                    const PRICE_ORACLE_ADDRESS = "0xCc0f796822c58eed5F58BDf72DfC8433AdE66345";
                    const PriceOracle = await ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS);
                    
                    let priceUpdateCount = 0;
                    for (const log of receipt.logs) {
                        try {
                            const parsed = PriceOracle.interface.parseLog({
                                topics: log.topics,
                                data: log.data
                            });
                            if (parsed.name === "FiatPriceUpdated") {
                                priceUpdateCount++;
                                console.log(`- ${parsed.args[0]}: ${parsed.args[1].toString()}`);
                            }
                        } catch (e) {
                            // Ignore non-PriceOracle events
                        }
                    }
                    console.log(`\nTotal FiatPriceUpdated events: ${priceUpdateCount}`);
                }
            }
        }
    } else {
        console.log("Transaction not found");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });