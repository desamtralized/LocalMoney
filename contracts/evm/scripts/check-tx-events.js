const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Checking Transaction Events ===\n");
    
    // Recent transaction hash from aggregator
    const txHash = "0xe04358a7e60acecda1aa6ea90213e7d0f314792c0b25b0bc1ede765e734c5a1f";
    
    console.log("Fetching transaction:", txHash);
    const tx = await ethers.provider.getTransaction(txHash);
    
    if (tx) {
        console.log("\nTransaction Details:");
        console.log("- From:", tx.from);
        console.log("- To:", tx.to);
        console.log("- Value:", tx.value.toString());
        console.log("- Gas Used:", tx.gasLimit.toString());
        console.log("- Data length:", tx.data.length, "bytes");
        
        // Get receipt
        const receipt = await ethers.provider.getTransactionReceipt(txHash);
        
        if (receipt) {
            console.log("\nTransaction Receipt:");
            console.log("- Status:", receipt.status === 1 ? "Success" : "Failed");
            console.log("- Block:", receipt.blockNumber);
            console.log("- Gas Used:", receipt.gasUsed.toString());
            console.log("- Logs count:", receipt.logs.length);
            
            // Parse logs
            if (receipt.logs.length > 0) {
                console.log("\nEvents:");
                
                // Try to decode with PriceOracle interface
                const PRICE_ORACLE_ADDRESS = "0xCc0f796822c58eed5F58BDf72DfC8433AdE66345";
                const PriceOracle = await ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS);
                
                for (const log of receipt.logs) {
                    try {
                        const parsed = PriceOracle.interface.parseLog({
                            topics: log.topics,
                            data: log.data
                        });
                        console.log(`- Event: ${parsed.name}`);
                        console.log(`  Args:`, parsed.args);
                    } catch (e) {
                        console.log(`- Unknown event at ${log.address}`);
                        console.log(`  Topics:`, log.topics);
                    }
                }
            }
        } else {
            console.log("Transaction not yet mined or failed");
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