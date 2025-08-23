const { run } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("🔍 Starting contract verification...\n");

    // Load deployment file (update this to your deployment file)
    const deploymentFile = process.env.DEPLOYMENT_FILE;
    if (!deploymentFile) {
        console.error("Please set DEPLOYMENT_FILE environment variable");
        console.error("Example: DEPLOYMENT_FILE=deployment-sepolia-1234567890.json npm run verify");
        process.exit(1);
    }

    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    console.log(`Network: ${deployment.network}`);
    console.log(`Chain ID: ${deployment.chainId}`);
    console.log(`Deployment time: ${deployment.timestamp}\n`);

    const contracts = [
        {
            name: "Hub",
            address: deployment.contracts.hub,
            constructorArguments: [] // Proxy, no constructor args
        },
        {
            name: "Profile",
            address: deployment.contracts.profile,
            constructorArguments: []
        },
        {
            name: "Offer",
            address: deployment.contracts.offer,
            constructorArguments: []
        },
        {
            name: "Trade",
            address: deployment.contracts.trade,
            constructorArguments: []
        },
        {
            name: "Escrow",
            address: deployment.contracts.escrow,
            constructorArguments: []
        },
        {
            name: "ArbitratorManager",
            address: deployment.contracts.arbitratorManager,
            constructorArguments: []
        },
        {
            name: "PriceOracle",
            address: deployment.contracts.priceOracle,
            constructorArguments: []
        }
    ];

    for (const contract of contracts) {
        console.log(`\nVerifying ${contract.name} at ${contract.address}...`);
        try {
            await run("verify:verify", {
                address: contract.address,
                constructorArguments: contract.constructorArguments,
                contract: `contracts/${contract.name}.sol:${contract.name}`
            });
            console.log(`✅ ${contract.name} verified successfully`);
        } catch (error) {
            if (error.message.includes("already verified")) {
                console.log(`✅ ${contract.name} is already verified`);
            } else {
                console.error(`❌ Failed to verify ${contract.name}:`, error.message);
            }
        }
    }

    console.log("\n✨ Verification complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });