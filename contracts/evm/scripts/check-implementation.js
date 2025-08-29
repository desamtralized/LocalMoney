const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Checking PriceOracle Implementation ===\n");
    
    const PRICE_ORACLE_ADDRESS = "0xCc0f796822c58eed5F58BDf72DfC8433AdE66345";
    
    // Check if it's a proxy
    const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    
    const implAddress = await ethers.provider.getStorage(PRICE_ORACLE_ADDRESS, IMPLEMENTATION_SLOT);
    console.log("Implementation slot value:", implAddress);
    
    if (implAddress !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        const implementationAddress = "0x" + implAddress.slice(26);
        console.log("Implementation address:", implementationAddress);
        console.log("This is a proxy contract");
    } else {
        console.log("This is NOT a proxy contract");
    }
    
    // Try to get the actual code size
    const code = await ethers.provider.getCode(PRICE_ORACLE_ADDRESS);
    console.log("\nContract code size:", code.length, "bytes");
    
    // Check admin slot
    const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
    const adminAddress = await ethers.provider.getStorage(PRICE_ORACLE_ADDRESS, ADMIN_SLOT);
    if (adminAddress !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        console.log("Admin address:", "0x" + adminAddress.slice(26));
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });