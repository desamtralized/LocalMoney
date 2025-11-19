const { ethers, upgrades } = require("hardhat");
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const chainConfig = require("./config/chains.config");

// ANSI color codes for console output
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m"
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

async function deploySatellite(network, isTestnet = false) {
    log(`\n========== Deploying to ${network} ==========`, colors.bright + colors.cyan);

    const configs = isTestnet ? chainConfig.testnets : chainConfig.networks;
    const config = configs[network];

    if (!config) {
        throw new Error(`Unknown network: ${network}`);
    }

    // Get deployer account
    const [deployer] = await ethers.getSigners();
    log(`Deployer: ${deployer.address}`, colors.blue);

    const balance = await deployer.provider.getBalance(deployer.address);
    log(`Balance: ${ethers.formatEther(balance)} ${network.toUpperCase()}`, colors.blue);

    if (balance === 0n) {
        throw new Error(`Insufficient balance on ${network}`);
    }

    // Deploy LocalMoneySatellite
    log("Deploying LocalMoneySatellite...", colors.yellow);

    const LocalMoneySatellite = await ethers.getContractFactory("LocalMoneySatellite");

    // Get BSC hub address
    const hubAddress = isTestnet
        ? process.env.BSC_HUB_ADDRESS_TESTNET || chainConfig.bsc.contracts.hub
        : chainConfig.bsc.contracts.hub;

    try {
        const satellite = await upgrades.deployProxy(
            LocalMoneySatellite,
            [
                config.gasService,
                hubAddress
            ],
            {
                initializer: "initialize",
                kind: "uups",
                constructorArgs: [config.gateway],
                unsafeAllow: ["constructor", "state-variable-immutable"],
                txOverrides: getGasConfig(network)
            }
        );

        await satellite.waitForDeployment();
        const satelliteAddress = await satellite.getAddress();

        log(`✅ LocalMoneySatellite deployed to: ${satelliteAddress}`, colors.green);

        // Wait for confirmations
        if (config.confirmations > 0) {
            log(`Waiting for ${config.confirmations} confirmations...`, colors.yellow);
            const deploymentTx = satellite.deploymentTransaction();
            if (deploymentTx) {
                await deploymentTx.wait(config.confirmations);
            }
        }

        // Save deployment info
        const deploymentInfo = {
            network,
            address: satelliteAddress,
            gateway: config.gateway,
            gasService: config.gasService,
            hubAddress,
            deployedAt: new Date().toISOString(),
            deployer: deployer.address,
            chainId: config.chainId,
            axelarName: config.axelarName
        };

        saveDeploymentInfo(network, deploymentInfo, isTestnet);

        // Verify contract if not local network
        if (network !== "hardhat" && network !== "localhost") {
            await verifyContract(network, satelliteAddress, [config.gateway], isTestnet);
        }

        return deploymentInfo;
    } catch (error) {
        log(`❌ Deployment failed: ${error.message}`, colors.red);
        throw error;
    }
}

function getGasConfig(network) {
    const gasConfig = chainConfig.gasConfig[network.replace("-testnet", "")];
    if (!gasConfig) {
        return {};
    }

    return {
        gasPrice: ethers.parseUnits(gasConfig.gasPrice, "gwei"),
        maxFeePerGas: gasConfig.maxFeePerGas ? ethers.parseUnits(gasConfig.maxFeePerGas, "gwei") : undefined,
        maxPriorityFeePerGas: gasConfig.maxPriorityFeePerGas ? ethers.parseUnits(gasConfig.maxPriorityFeePerGas, "gwei") : undefined
    };
}

function saveDeploymentInfo(network, deploymentInfo, isTestnet = false) {
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    const filename = isTestnet
        ? `${network}-satellite-testnet.json`
        : `${network}-satellite.json`;

    const filepath = path.join(deploymentsDir, filename);

    fs.writeFileSync(
        filepath,
        JSON.stringify(deploymentInfo, null, 2)
    );

    log(`Deployment info saved to: ${filepath}`, colors.blue);
}

async function verifyContract(network, address, constructorArgs, isTestnet = false) {
    log(`\nVerifying contract on ${network}...`, colors.yellow);

    try {
        await hre.run("verify:verify", {
            address: address,
            constructorArguments: constructorArgs,
        });

        log(`✅ Contract verified successfully`, colors.green);
    } catch (error) {
        if (error.message.includes("already verified")) {
            log(`Contract already verified`, colors.yellow);
        } else {
            log(`⚠️ Verification failed: ${error.message}`, colors.yellow);
        }
    }
}

async function registerSatelliteOnHub(satelliteDeployments, isTestnet = false) {
    log("\n========== Registering Satellites on BSC Hub ==========", colors.bright + colors.cyan);

    // Connect to BSC
    const network = isTestnet ? "bsc-testnet" : "bsc";

    const [deployer] = await ethers.getSigners();
    log(`Registering with account: ${deployer.address}`, colors.blue);

    // Get AxelarBridge contract address
    const axelarBridgeAddress = process.env.AXELAR_BRIDGE_ADDRESS;
    if (!axelarBridgeAddress) {
        log("⚠️ AXELAR_BRIDGE_ADDRESS not set in environment", colors.yellow);
        log("Please set the address and run registration separately", colors.yellow);
        return;
    }

    try {
        const axelarBridge = await ethers.getContractAt(
            "AxelarBridge",
            axelarBridgeAddress
        );

        for (const deployment of satelliteDeployments) {
            log(`Registering ${deployment.network} satellite...`, colors.yellow);

            const tx = await axelarBridge.registerChain(
                deployment.axelarName,
                deployment.address,
                getGasConfig("bsc")
            );

            await tx.wait(3);
            log(`✅ Registered ${deployment.network}: ${deployment.address}`, colors.green);
        }
    } catch (error) {
        log(`❌ Registration failed: ${error.message}`, colors.red);
        log("You may need to register satellites manually", colors.yellow);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const isTestnet = args.includes("--testnet");
    const specificNetwork = args.find(arg => !arg.startsWith("--"));
    const shouldRegister = !args.includes("--no-register");

    log(`\n🚀 LocalMoney Satellite Deployment Script`, colors.bright + colors.cyan);
    log(`Mode: ${isTestnet ? "TESTNET" : "MAINNET"}`, colors.yellow);

    const networks = specificNetwork
        ? [specificNetwork]
        : isTestnet
            ? ["polygon-testnet", "avalanche-testnet", "base-testnet"]
            : ["polygon", "avalanche", "base"];

    const deployments = [];

    // Deploy to each network
    for (const network of networks) {
        try {
            log(`\n📡 Deploying to ${network}...`, colors.cyan);
            const deployment = await deploySatellite(network, isTestnet);
            deployments.push(deployment);
            log(`✅ Successfully deployed to ${network}`, colors.green);
        } catch (error) {
            log(`❌ Failed to deploy to ${network}: ${error.message}`, colors.red);

            // Ask if should continue
            if (networks.length > 1) {
                log("Continuing with other deployments...", colors.yellow);
            }
        }
    }

    // Register all satellites on BSC hub
    if (deployments.length > 0 && shouldRegister) {
        await registerSatelliteOnHub(deployments, isTestnet);
    }

    // Print summary
    log("\n========== Deployment Summary ==========", colors.bright + colors.cyan);

    if (deployments.length === 0) {
        log("No successful deployments", colors.red);
    } else {
        for (const deployment of deployments) {
            log(`${deployment.network}: ${deployment.address}`, colors.green);
        }

        // Generate consolidated configuration file
        const configFilename = isTestnet ? "satellite-config-testnet.json" : "satellite-config.json";
        const config = {
            hubAddress: chainConfig.bsc.contracts.hub,
            satellites: deployments.reduce((acc, d) => {
                acc[d.network] = {
                    address: d.address,
                    gateway: d.gateway,
                    gasService: d.gasService,
                    chainId: d.chainId,
                    axelarName: d.axelarName
                };
                return acc;
            }, {}),
            timestamp: new Date().toISOString()
        };

        const configPath = path.join(__dirname, "..", "deployments", configFilename);
        fs.writeFileSync(
            configPath,
            JSON.stringify(config, null, 2)
        );

        log(`\nConfiguration saved to: ${configPath}`, colors.blue);
    }

    log("\n✨ Deployment script completed", colors.bright + colors.green);
}

// Run the deployment
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

module.exports = { deploySatellite, registerSatelliteOnHub };