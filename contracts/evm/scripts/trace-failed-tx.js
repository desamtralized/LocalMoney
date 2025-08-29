const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Tracing Failed Transaction ===\n");
    
    const txHash = "0xe04358a7e60acecda1aa6ea90213e7d0f314792c0b25b0bc1ede765e734c5a1f";
    
    try {
        // Try to get more details using eth_call to simulate the transaction
        const tx = await ethers.provider.getTransaction(txHash);
        
        console.log("Simulating transaction...");
        
        // Create a call transaction object
        const callTx = {
            from: tx.from,
            to: tx.to,
            data: tx.data,
            value: tx.value,
            gasLimit: tx.gasLimit
        };
        
        // Get the block number where it failed
        const receipt = await ethers.provider.getTransactionReceipt(txHash);
        const blockNumber = receipt.blockNumber;
        
        try {
            // Try to call the transaction at that block
            const result = await ethers.provider.call(callTx, blockNumber);
            console.log("Call succeeded (unexpected):", result);
        } catch (error) {
            console.log("Call failed with error:");
            console.log("Error message:", error.message);
            
            if (error.data) {
                console.log("\nError data:", error.data);
                
                // Try to decode the error
                const PRICE_ORACLE_ADDRESS = "0xCc0f796822c58eed5F58BDf72DfC8433AdE66345";
                const PriceOracle = await ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS);
                
                try {
                    const decodedError = PriceOracle.interface.parseError(error.data);
                    console.log("\nDecoded error:", decodedError);
                } catch (e) {
                    console.log("Could not decode error");
                }
            }
            
            // Extract revert reason if available
            if (error.reason) {
                console.log("\nRevert reason:", error.reason);
            }
        }
        
        // Check gas usage vs limit
        console.log("\n=== Gas Analysis ===");
        console.log("Gas limit:", tx.gasLimit.toString());
        console.log("Gas used:", receipt.gasUsed.toString());
        console.log("Gas exhausted:", receipt.gasUsed.toString() === tx.gasLimit.toString());
        
    } catch (error) {
        console.error("Error tracing transaction:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });