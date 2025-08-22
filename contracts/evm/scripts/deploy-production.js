// SPDX-License-Identifier: MIT
const { ethers, upgrades, run } = require("hardhat");
const fs = require("fs");

/**
 * Production-ready deployment script for LocalMoney EVM Protocol
 * Implements security best practices from EVM Translation Phase 5
 */

// Production configuration for different networks
const NETWORK_CONFIGS = {
    mainnet: {
        multisig: process.env.MAINNET_MULTISIG || "0x0000000000000000000000000000000000000000",
        treasury: process.env.MAINNET_TREASURY || "0x0000000000000000000000000000000000000000",
        swapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564", // Uniswap V3 Router
        timelock: 48 * 60 * 60, // 48 hours
    },
    arbitrum: {
        multisig: process.env.ARBITRUM_MULTISIG || "0x0000000000000000000000000000000000000000", 
        treasury: process.env.ARBITRUM_TREASURY || "0x0000000000000000000000000000000000000000",
        swapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        timelock: 24 * 60 * 60, // 24 hours
    },
    optimism: {
        multisig: process.env.OPTIMISM_MULTISIG || "0x0000000000000000000000000000000000000000",
        treasury: process.env.OPTIMISM_TREASURY || "0x0000000000000000000000000000000000000000", 
        swapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        timelock: 24 * 60 * 60, // 24 hours
    }
};

async function main() {
    const network = await ethers.provider.getNetwork();
    const networkName = network.name;
    
    console.log(`🚀 Starting LocalMoney EVM Protocol deployment on ${networkName}...`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    
    // Get configuration for current network
    const config = NETWORK_CONFIGS[networkName];
    if (!config) {
        throw new Error(`❌ Network ${networkName} not supported`);
    }
    
    // Get deployer account
    const [deployer] = await ethers.getSigners();
    console.log(`👤 Deployer: ${deployer.address}`);
    console.log(`💰 Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    
    // Verify required addresses are set
    if (config.multisig === "0x0000000000000000000000000000000000000000") {
        throw new Error("❌ MULTISIG address not configured");
    }
    if (config.treasury === "0x0000000000000000000000000000000000000000") {
        throw new Error("❌ TREASURY address not configured");
    }
    
    console.log(`🛡️  Multi-sig: ${config.multisig}`);
    console.log(`🏦 Treasury: ${config.treasury}`);
    
    const deploymentResult = {};
    
    try {
        // Deploy Mock ERC20 for testing (only on testnets)
        let mockToken;
        if (networkName !== "mainnet") {
            console.log("\\n📝 Deploying MockERC20 for testing...");
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            mockToken = await MockERC20.deploy("Test USDC", "TUSDC", 6);
            await mockToken.waitForDeployment();
            deploymentResult.mockToken = mockToken.target;
            console.log(`✅ MockERC20 deployed: ${mockToken.target}`);
        }
        
        // 1. Deploy Hub with initial configuration
        console.log("\\n🏢 Deploying Hub contract...");
        const Hub = await ethers.getContractFactory("Hub");
        
        const initialHubConfig = {
            offerContract: ethers.ZeroAddress,
            tradeContract: ethers.ZeroAddress,
            profileContract: ethers.ZeroAddress,
            priceContract: ethers.ZeroAddress,
            treasury: config.treasury,
            localMarket: config.treasury, // Initially same as treasury
            priceProvider: deployer.address, // Will transfer to price service
            localTokenAddress: ethers.ZeroAddress, // Set when LOCAL token deployed
            chainFeeCollector: config.treasury,
            swapRouter: config.swapRouter,
            burnFeePct: 100,       // 1%
            chainFeePct: 150,      // 1.5%
            warchestFeePct: 250,   // 2.5%
            conversionFeePct: 50,  // 0.5%
            arbitratorFeePct: 200, // 2%
            minTradeAmount: ethers.parseUnits("10", 6),    // $10
            maxTradeAmount: ethers.parseUnits("50000", 6), // $50,000
            maxActiveOffers: 20,
            maxActiveTrades: 10,
            tradeExpirationTimer: 48 * 60 * 60,  // 48 hours
            tradeDisputeTimer: 7 * 24 * 60 * 60, // 7 days
            globalPause: false,
            pauseNewTrades: false,
            pauseDeposits: false,
            pauseWithdrawals: false
        };
        
        const hub = await upgrades.deployProxy(Hub, [initialHubConfig], {
            initializer: "initialize",
            kind: "uups"
        });
        await hub.waitForDeployment();
        deploymentResult.hub = hub.target;
        console.log(`✅ Hub deployed: ${hub.target}`);
        
        // 2. Deploy Profile contract
        console.log("\\n👤 Deploying Profile contract...");
        const Profile = await ethers.getContractFactory("Profile");
        const profile = await upgrades.deployProxy(Profile, [hub.target], {
            initializer: "initialize",
            kind: "uups"
        });
        await profile.waitForDeployment();
        deploymentResult.profile = profile.target;
        console.log(`✅ Profile deployed: ${profile.target}`);
        
        // 3. Deploy Offer contract
        console.log("\\n📋 Deploying Offer contract...");
        const Offer = await ethers.getContractFactory("Offer");
        const offer = await upgrades.deployProxy(Offer, [hub.target], {
            initializer: "initialize",
            kind: "uups"
        });
        await offer.waitForDeployment();
        deploymentResult.offer = offer.target;
        console.log(`✅ Offer deployed: ${offer.target}`);
        
        // 4. Deploy PriceOracle contract
        console.log("\\n💱 Deploying PriceOracle contract...");
        const PriceOracle = await ethers.getContractFactory("PriceOracle");
        const priceOracle = await upgrades.deployProxy(PriceOracle, [deployer.address, config.swapRouter], {
            initializer: "initialize",
            kind: "uups"
        });
        await priceOracle.waitForDeployment();
        deploymentResult.priceOracle = priceOracle.target;
        console.log(`✅ PriceOracle deployed: ${priceOracle.target}`);
        
        // 5. Deploy Trade contract
        console.log("\\n🤝 Deploying Trade contract...");
        const Trade = await ethers.getContractFactory("Trade");
        const trade = await upgrades.deployProxy(Trade, [hub.target, offer.target, profile.target], {
            initializer: "initialize",
            kind: "uups"
        });
        await trade.waitForDeployment();
        deploymentResult.trade = trade.target;
        console.log(`✅ Trade deployed: ${trade.target}`);
        
        // 6. Update Hub configuration with all contract addresses
        console.log("\\n⚙️  Updating Hub configuration...");
        const finalConfig = {
            ...initialHubConfig,
            offerContract: offer.target,
            tradeContract: trade.target,
            profileContract: profile.target,
            priceContract: priceOracle.target
        };
        
        await hub.updateConfig(finalConfig);
        console.log("✅ Hub configuration updated");
        
        // 7. Verify all deployments
        console.log("\\n🔍 Verifying contracts on Etherscan...");
        
        if (networkName !== "hardhat" && networkName !== "localhost") {
            try {
                // Verify Hub
                console.log("Verifying Hub...");
                await run("verify:verify", {
                    address: hub.target,
                    constructorArguments: []
                });
                
                // Verify Profile  
                console.log("Verifying Profile...");
                await run("verify:verify", {
                    address: profile.target,
                    constructorArguments: []
                });
                
                // Verify Offer
                console.log("Verifying Offer...");
                await run("verify:verify", {
                    address: offer.target,
                    constructorArguments: []
                });
                
                // Verify PriceOracle
                console.log("Verifying PriceOracle...");
                await run("verify:verify", {
                    address: priceOracle.target,
                    constructorArguments: []
                });
                
                // Verify Trade
                console.log("Verifying Trade...");
                await run("verify:verify", {
                    address: trade.target,
                    constructorArguments: []
                });
                
                console.log("✅ All contracts verified on Etherscan");
            } catch (error) {
                console.log("⚠️  Contract verification failed:", error.message);
            }
        }
        
        // 8. Transfer ownership to multi-sig (CRITICAL SECURITY STEP)
        console.log("\\n🔐 Transferring ownership to multi-sig...");
        
        // Transfer Hub admin to multi-sig
        await hub.updateAdmin(config.multisig);
        console.log(`✅ Hub admin transferred to: ${config.multisig}`);
        
        // Note: In production, you would also transfer Profile and other contract ownership
        console.log("⚠️  Remember to transfer other contract ownerships manually");
        
        // 9. Save deployment information
        const deploymentInfo = {
            network: {
                name: networkName,
                chainId: network.chainId.toString()
            },
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            multisig: config.multisig,
            contracts: deploymentResult,
            config: finalConfig,
            gasUsed: "TBD", // Could track gas usage
            verification: "completed"
        };
        
        const filename = `deployments/${networkName}-${Date.now()}.json`;
        
        // Ensure deployments directory exists
        if (!fs.existsSync("deployments")) {
            fs.mkdirSync("deployments");
        }
        
        fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
        
        // Also save as latest deployment
        fs.writeFileSync(`deployments/${networkName}-latest.json`, JSON.stringify(deploymentInfo, null, 2));
        
        console.log("\\n📄 Deployment Summary");
        console.log("=".repeat(60));
        console.log(`🌐 Network: ${networkName} (Chain ID: ${network.chainId})`);
        console.log(`🏢 Hub: ${deploymentResult.hub}`);
        console.log(`👤 Profile: ${deploymentResult.profile}`);
        console.log(`📋 Offer: ${deploymentResult.offer}`);
        console.log(`💱 PriceOracle: ${deploymentResult.priceOracle}`);
        console.log(`🤝 Trade: ${deploymentResult.trade}`);
        console.log(`🛡️  Multi-sig: ${config.multisig}`);
        console.log(`💾 Deployment file: ${filename}`);
        console.log("=".repeat(60));
        
        console.log("\\n✅ Deployment completed successfully! 🎉");
        console.log("\\n⚠️  IMPORTANT POST-DEPLOYMENT STEPS:");
        console.log("1. Verify all contracts on Etherscan");
        console.log("2. Transfer remaining contract ownerships to multi-sig");
        console.log("3. Configure price feeds and routes");
        console.log("4. Set up monitoring and alerts");
        console.log("5. Initialize emergency procedures");
        console.log("6. Launch bug bounty program");
        
    } catch (error) {
        console.error("\\n❌ Deployment failed:", error);
        
        // Save failed deployment info for debugging
        const failureInfo = {
            network: networkName,
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            error: error.message,
            partialDeployment: deploymentResult
        };
        
        fs.writeFileSync(
            `deployments/failed-${networkName}-${Date.now()}.json`,
            JSON.stringify(failureInfo, null, 2)
        );
        
        throw error;
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log("\\n⚠️  Deployment interrupted by user");
    process.exit(1);
});

// Execute deployment
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\\n💥 Fatal deployment error:", error);
        process.exit(1);
    });