const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ITS addresses from Axelar documentation
const ITS_ADDRESSES = {
    "bsc": "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C",
    "bsc-testnet": "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C",
    "polygon": "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C",
    "avalanche": "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C",
    "base": "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C",
    "ethereum": "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C"
};

// Gas service addresses from Axelar documentation
const GAS_SERVICE_ADDRESSES = {
    "bsc": "0x2d5d7d31F671F86C782533cc367F14109a082712",
    "bsc-testnet": "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
    "polygon": "0x2d5d7d31F671F86C782533cc367F14109a082712",
    "avalanche": "0x2d5d7d31F671F86C782533cc367F14109a082712",
    "base": "0x2d5d7d31F671F86C782533cc367F14109a082712",
    "ethereum": "0x2d5d7d31F671F86C782533cc367F14109a082712"
};

// Gateway addresses from Axelar documentation
const GATEWAY_ADDRESSES = {
    "bsc": "0x304acf330bbE08d1e512eefaa92F6a57871fD895",
    "bsc-testnet": "0x4D147dCb984e6affEEC47e44293DA442580A3Ec0",
    "polygon": "0x6f015F16De9fC8791b234eF68D486d2bF203FBA8",
    "avalanche": "0x5029C0EFf6C34351a0CEc334542cDb22c7928f78",
    "base": "0xe432150cce91c13a887f7D836923d5597adD8E31",
    "ethereum": "0x4F4495243837681061C4743b74B3eEdf548D56A5"
};

// Token addresses for different networks
const TOKEN_ADDRESSES = {
    "bsc": {
        "USDT": "0x55d398326f99059fF775485246999027B3197955",
        "USDC": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
    },
    "bsc-testnet": {
        "USDT": "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
        "USDC": "0x64544969ed7EBf5f083679233325356EbE738930"
    },
    "polygon": {
        "USDT": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        "USDC": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
    },
    "avalanche": {
        "USDT": "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
        "USDC": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
    }
};

async function main() {
    console.log("========================================");
    console.log("Token Bridge Deployment Script");
    console.log("Network:", network.name);
    console.log("========================================\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH\n");
    
    // Get network-specific addresses
    const itsAddress = ITS_ADDRESSES[network.name];
    const gasServiceAddress = GAS_SERVICE_ADDRESSES[network.name];
    const gatewayAddress = GATEWAY_ADDRESSES[network.name];
    
    if (!itsAddress || !gasServiceAddress || !gatewayAddress) {
        throw new Error(`Missing addresses for network: ${network.name}`);
    }
    
    console.log("Using Axelar addresses:");
    console.log("- ITS:", itsAddress);
    console.log("- Gas Service:", gasServiceAddress);
    console.log("- Gateway:", gatewayAddress);
    console.log("");
    
    // Load existing deployment addresses
    const deploymentFile = path.join(__dirname, `../deployments/${network.name}-deployment.json`);
    let deployment = {};
    
    if (fs.existsSync(deploymentFile)) {
        deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
        console.log("Loaded existing deployment data\n");
    }
    
    // Step 1: Deploy ITSTokenRegistry
    console.log("Step 1: Deploying ITSTokenRegistry...");
    const ITSTokenRegistry = await ethers.getContractFactory("ITSTokenRegistry");
    const tokenRegistry = await upgrades.deployProxy(ITSTokenRegistry, [itsAddress], {
        initializer: "initialize",
        kind: "uups"
    });
    await tokenRegistry.waitForDeployment();
    const tokenRegistryAddress = await tokenRegistry.getAddress();
    console.log("ITSTokenRegistry deployed to:", tokenRegistryAddress);
    
    // Step 2: Deploy CrossChainEscrow (if not already deployed)
    let crossChainEscrowAddress;
    
    if (deployment.CrossChainEscrow) {
        console.log("\nStep 2: Using existing CrossChainEscrow:", deployment.CrossChainEscrow);
        crossChainEscrowAddress = deployment.CrossChainEscrow;
    } else if (deployment.Escrow) {
        // Upgrade existing Escrow to CrossChainEscrow
        console.log("\nStep 2: Upgrading Escrow to CrossChainEscrow...");
        const CrossChainEscrow = await ethers.getContractFactory("CrossChainEscrow");
        const upgraded = await upgrades.upgradeProxy(deployment.Escrow, CrossChainEscrow);
        await upgraded.waitForDeployment();
        crossChainEscrowAddress = await upgraded.getAddress();
        console.log("Escrow upgraded to CrossChainEscrow");
        
        // Initialize cross-chain components
        const escrow = await ethers.getContractAt("CrossChainEscrow", crossChainEscrowAddress);
        await escrow.initializeCrossChain(tokenRegistryAddress, itsAddress);
        console.log("Cross-chain components initialized");
    } else {
        // Deploy new CrossChainEscrow
        console.log("\nStep 2: Deploying CrossChainEscrow...");
        const CrossChainEscrow = await ethers.getContractFactory("CrossChainEscrow");
        
        // Need Hub and PriceOracle addresses
        if (!deployment.Hub || !deployment.PriceOracle) {
            throw new Error("Hub and PriceOracle must be deployed first");
        }
        
        const escrow = await upgrades.deployProxy(CrossChainEscrow, [
            deployment.Hub,
            deployment.PriceOracle,
            deployment.Trade || ethers.ZeroAddress
        ], {
            initializer: "initialize",
            kind: "uups"
        });
        await escrow.waitForDeployment();
        crossChainEscrowAddress = await escrow.getAddress();
        console.log("CrossChainEscrow deployed to:", crossChainEscrowAddress);
        
        // Initialize cross-chain components
        await escrow.initializeCrossChain(tokenRegistryAddress, itsAddress);
        console.log("Cross-chain components initialized");
    }
    
    // Step 3: Deploy TokenBridge
    console.log("\nStep 3: Deploying TokenBridge...");
    const TokenBridge = await ethers.getContractFactory("TokenBridge");
    const tokenBridge = await upgrades.deployProxy(TokenBridge, [
        itsAddress,
        gasServiceAddress,
        tokenRegistryAddress,
        crossChainEscrowAddress,
        deployer.address // Fee recipient (can be changed later)
    ], {
        constructorArgs: [gatewayAddress],
        initializer: "initialize",
        kind: "uups",
        unsafeAllow: ['constructor']
    });
    await tokenBridge.waitForDeployment();
    const tokenBridgeAddress = await tokenBridge.getAddress();
    console.log("TokenBridge deployed to:", tokenBridgeAddress);
    
    // Step 4: Deploy GasEstimator
    console.log("\nStep 4: Deploying GasEstimator...");
    const GasEstimator = await ethers.getContractFactory("GasEstimator");
    const gasEstimator = await upgrades.deployProxy(GasEstimator, [
        gasServiceAddress,
        tokenRegistryAddress
    ], {
        initializer: "initialize",
        kind: "uups"
    });
    await gasEstimator.waitForDeployment();
    const gasEstimatorAddress = await gasEstimator.getAddress();
    console.log("GasEstimator deployed to:", gasEstimatorAddress);
    
    // Step 5: Register tokens
    console.log("\nStep 5: Registering tokens...");
    const tokens = TOKEN_ADDRESSES[network.name] || TOKEN_ADDRESSES["bsc"];
    
    for (const [symbol, address] of Object.entries(tokens)) {
        try {
            const decimals = symbol === "USDT" ? 18 : 18; // Most are 18 decimals on BSC
            const minAmount = ethers.parseUnits("10", decimals);
            const maxAmount = ethers.parseUnits("100000", decimals);
            
            await tokenRegistry.registerToken(
                address,
                symbol,
                decimals,
                minAmount,
                maxAmount
            );
            console.log(`- Registered ${symbol} at ${address}`);
        } catch (error) {
            console.log(`- Failed to register ${symbol}: ${error.message}`);
        }
    }
    
    // Step 6: Set up roles and permissions
    console.log("\nStep 6: Setting up roles and permissions...");
    
    // Grant BRIDGE_ROLE to AxelarBridge (if deployed)
    if (deployment.AxelarBridge) {
        const escrow = await ethers.getContractAt("CrossChainEscrow", crossChainEscrowAddress);
        const BRIDGE_ROLE = await escrow.BRIDGE_ROLE();
        await escrow.grantRole(BRIDGE_ROLE, deployment.AxelarBridge);
        console.log("- Granted BRIDGE_ROLE to AxelarBridge");
        
        // Update AxelarBridge with new contracts
        const axelarBridge = await ethers.getContractAt("AxelarBridge", deployment.AxelarBridge);
        await axelarBridge.setCrossChainEscrow(crossChainEscrowAddress);
        await axelarBridge.setTokenRegistry(tokenRegistryAddress);
        console.log("- Updated AxelarBridge with new contracts");
    }
    
    // Grant ESCROW_ROLE to CrossChainEscrow in TokenBridge
    const ESCROW_ROLE = await tokenBridge.ESCROW_ROLE();
    await tokenBridge.grantRole(ESCROW_ROLE, crossChainEscrowAddress);
    console.log("- Granted ESCROW_ROLE to CrossChainEscrow");
    
    // Step 7: Save deployment addresses
    console.log("\nStep 7: Saving deployment addresses...");
    
    deployment.ITSTokenRegistry = tokenRegistryAddress;
    deployment.CrossChainEscrow = crossChainEscrowAddress;
    deployment.TokenBridge = tokenBridgeAddress;
    deployment.GasEstimator = gasEstimatorAddress;
    deployment.deploymentTimestamp = new Date().toISOString();
    deployment.deployer = deployer.address;
    deployment.network = network.name;
    
    // Ensure deployments directory exists
    const deploymentsDir = path.join(__dirname, '../deployments');
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
    console.log("Deployment data saved to:", deploymentFile);
    
    // Print summary
    console.log("\n========================================");
    console.log("Deployment Summary");
    console.log("========================================");
    console.log("ITSTokenRegistry:", tokenRegistryAddress);
    console.log("CrossChainEscrow:", crossChainEscrowAddress);
    console.log("TokenBridge:", tokenBridgeAddress);
    console.log("GasEstimator:", gasEstimatorAddress);
    console.log("========================================");
    
    // Verification instructions
    console.log("\nTo verify contracts on BSCScan:");
    console.log(`npx hardhat verify --network ${network.name} ${tokenRegistryAddress}`);
    console.log(`npx hardhat verify --network ${network.name} ${crossChainEscrowAddress}`);
    console.log(`npx hardhat verify --network ${network.name} ${tokenBridgeAddress}`);
    console.log(`npx hardhat verify --network ${network.name} ${gasEstimatorAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });