const { deploySatellite } = require("../deploy-all-satellites");

async function main() {
    const isTestnet = process.argv.includes("--testnet");
    const network = isTestnet ? "base-testnet" : "base";

    console.log(`\n🚀 Deploying LocalMoneySatellite to ${network}`);

    try {
        const deployment = await deploySatellite(network, isTestnet);
        console.log(`\n✅ Deployment successful!`);
        console.log(`Address: ${deployment.address}`);
        console.log(`Gateway: ${deployment.gateway}`);
        console.log(`Gas Service: ${deployment.gasService}`);
    } catch (error) {
        console.error(`\n❌ Deployment failed:`, error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });