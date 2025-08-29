require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    // Create wallet from private key
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
        console.error("DEPLOYER_PRIVATE_KEY not found in .env file");
        process.exit(1);
    }
    
    const provider = ethers.provider;
    const wallet = new ethers.Wallet(privateKey, provider);
    const address = wallet.address;
    
    console.log("Deployer Address:", address);
    console.log("=" .repeat(60));
    
    // Check current network
    const network = await ethers.provider.getNetwork();
    console.log("Network:", network.name || `ChainId ${network.chainId}`);
    
    // Get balance
    const balance = await ethers.provider.getBalance(address);
    console.log("Balance:", ethers.formatEther(balance), "BNB");
    
    // Check if we have enough for deployment (rough estimate)
    const minRequired = ethers.parseEther("0.1"); // 0.1 BNB should be enough for deployment
    if (balance >= minRequired) {
        console.log("✅ Sufficient balance for deployment");
    } else {
        console.log("⚠️  Low balance - you may need to add more BNB for deployment");
        console.log("   Recommended minimum: 0.1 BNB");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });