const fs = require("fs");
const path = require("path");

// Load deployed contract addresses from latest deployment
function loadDeployedAddresses() {
    const deploymentsDir = path.join(__dirname, '..', 'deployments');
    const files = fs.readdirSync(deploymentsDir)
        .filter(f => f.includes('bsc-mainnet-complete'))
        .sort((a, b) => b.localeCompare(a)); // Get latest file
    
    if (files.length === 0) {
        throw new Error("No BSC mainnet deployment files found");
    }
    
    const latestFile = files[0];
    const deploymentInfo = JSON.parse(
        fs.readFileSync(path.join(deploymentsDir, latestFile), 'utf8')
    );
    
    console.log(`Loading addresses from: ${latestFile}`);
    return {
        contracts: deploymentInfo.contracts,
        deployer: deploymentInfo.deployer,
        timestamp: deploymentInfo.timestamp
    };
}

// Update or add a key-value pair in an .env file
function updateEnvFile(filePath, updates) {
    if (!fs.existsSync(filePath)) {
        console.log(`   ⚠️  File does not exist: ${filePath}`);
        console.log(`   Creating new .env file...`);
        const content = Object.entries(updates)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n') + '\n';
        fs.writeFileSync(filePath, content);
        console.log(`   ✅ Created with ${Object.keys(updates).length} variables`);
        return;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    Object.entries(updates).forEach(([key, value]) => {
        const regex = new RegExp(`^${key}=.*$`, 'gm');
        const newLine = `${key}=${value}`;
        
        if (regex.test(content)) {
            // Update existing key
            const oldValue = content.match(regex)[0].split('=')[1];
            if (oldValue !== value) {
                content = content.replace(regex, newLine);
                console.log(`   Updated ${key}: ${oldValue} → ${value}`);
                modified = true;
            } else {
                console.log(`   Skipped ${key}: already set to ${value}`);
            }
        } else {
            // Add new key
            content += `${newLine}\n`;
            console.log(`   Added ${key}=${value}`);
            modified = true;
        }
    });
    
    if (modified) {
        fs.writeFileSync(filePath, content);
        console.log(`   ✅ File updated successfully`);
    } else {
        console.log(`   ℹ️  No changes needed`);
    }
}

function main() {
    console.log("=".repeat(70));
    console.log("UPDATE ENVIRONMENT VARIABLES");
    console.log("=".repeat(70));
    
    try {
        // Load deployed addresses
        console.log("\n📁 Loading Deployed Contract Addresses...");
        const deployment = loadDeployedAddresses();
        const { contracts, deployer, timestamp } = deployment;
        
        console.log("\n📍 Deployment Info:");
        console.log(`   Timestamp: ${timestamp}`);
        console.log(`   Deployer: ${deployer}`);
        console.log("\n📍 Contract Addresses:");
        Object.entries(contracts).forEach(([name, address]) => {
            console.log(`   ${name.padEnd(20)}: ${address}`);
        });
        
        // ====================================================================
        // UPDATE contracts/evm/.env
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("1. Updating contracts/evm/.env");
        console.log("=".repeat(70));
        
        const contractsEnvPath = path.join(__dirname, '..', '.env');
        const contractsEnvUpdates = {
            BSC_HUB_ADDRESS: contracts.Hub,
            BSC_PROFILE_ADDRESS: contracts.Profile,
            BSC_OFFER_ADDRESS: contracts.Offer,
            BSC_TRADE_ADDRESS: contracts.Trade,
            BSC_ESCROW_ADDRESS: contracts.Escrow,
            BSC_PRICE_ORACLE_ADDRESS: contracts.PriceOracle,
            BSC_ARBITRATOR_MANAGER_ADDRESS: contracts.ArbitratorManager,
        };
        
        updateEnvFile(contractsEnvPath, contractsEnvUpdates);
        
        // ====================================================================
        // UPDATE app/.env (if it needs BSC addresses)
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("2. Updating app/.env");
        console.log("=".repeat(70));
        
        const appEnvPath = path.join(__dirname, '..', '..', '..', 'app', '.env');
        const appEnvUpdates = {
            VITE_BSC_HUB_ADDRESS: contracts.Hub,
            VITE_BSC_PROFILE_ADDRESS: contracts.Profile,
            VITE_BSC_PRICE_ORACLE_ADDRESS: contracts.PriceOracle,
            VITE_BSC_OFFER_ADDRESS: contracts.Offer,
            VITE_BSC_TRADE_ADDRESS: contracts.Trade,
            VITE_BSC_ESCROW_ADDRESS: contracts.Escrow,
            VITE_BSC_ARBITRATOR_MANAGER_ADDRESS: contracts.ArbitratorManager,
        };
        
        updateEnvFile(appEnvPath, appEnvUpdates);
        
        // ====================================================================
        // UPDATE fiat-prices-aggregator/.env
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("3. Updating fiat-prices-aggregator/.env");
        console.log("=".repeat(70));
        
        const aggregatorEnvPath = '/Users/samb/workspace/desamtralized/fiat-prices-aggregator/.env';
        const aggregatorEnvUpdates = {
            BSC_PRICE_ORACLE_ADDRESS: contracts.PriceOracle,
            BSC_HUB_ADDRESS: contracts.Hub,
            BSC_RPC_URL: 'https://bsc-dataseed.binance.org/',
            // Note: Private keys should be manually set if different
        };
        
        updateEnvFile(aggregatorEnvPath, aggregatorEnvUpdates);
        
        // ====================================================================
        // CREATE DEPLOYMENT SUMMARY
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("4. Creating Deployment Summary");
        console.log("=".repeat(70));
        
        const summaryPath = path.join(__dirname, '..', 'BSC_DEPLOYMENT_SUMMARY.md');
        const summaryContent = `# BSC Mainnet Deployment Summary

## Deployment Date
${timestamp}

## Deployer Address
${deployer}

## Deployed Contract Addresses

| Contract | Address | BSCScan |
|----------|---------|---------|
| Hub | ${contracts.Hub} | [View](https://bscscan.com/address/${contracts.Hub}) |
| Profile | ${contracts.Profile} | [View](https://bscscan.com/address/${contracts.Profile}) |
| PriceOracle | ${contracts.PriceOracle} | [View](https://bscscan.com/address/${contracts.PriceOracle}) |
| Offer | ${contracts.Offer} | [View](https://bscscan.com/address/${contracts.Offer}) |
| Trade | ${contracts.Trade} | [View](https://bscscan.com/address/${contracts.Trade}) |
| Escrow | ${contracts.Escrow} | [View](https://bscscan.com/address/${contracts.Escrow}) |
| ArbitratorManager | ${contracts.ArbitratorManager} | [View](https://bscscan.com/address/${contracts.ArbitratorManager}) |

## Configuration

### Fees (Zero Fee Configuration)
- Burn Fee: 0%
- Chain Fee: 0%
- Warchest Fee: 0%
- Conversion Fee: 0%
- Arbitrator Fee: 0%

### Limits
- Min Trade Amount: $10
- Max Trade Amount: $10,000
- Max Active Offers: 100
- Max Active Trades: 100

### Timers
- Trade Expiration: 24 hours
- Dispute Window: 7 days

### Features
- ✅ Offer Description Updates (max 280 characters)
- ✅ Zero Fees Active
- ✅ PancakeSwap V3 Integration

## Environment Variables Updated

### contracts/evm/.env
\`\`\`
BSC_HUB_ADDRESS=${contracts.Hub}
BSC_PROFILE_ADDRESS=${contracts.Profile}
BSC_OFFER_ADDRESS=${contracts.Offer}
BSC_TRADE_ADDRESS=${contracts.Trade}
BSC_ESCROW_ADDRESS=${contracts.Escrow}
BSC_PRICE_ORACLE_ADDRESS=${contracts.PriceOracle}
BSC_ARBITRATOR_MANAGER_ADDRESS=${contracts.ArbitratorManager}
\`\`\`

### app/.env
\`\`\`
VITE_BSC_HUB_ADDRESS=${contracts.Hub}
VITE_BSC_PROFILE_ADDRESS=${contracts.Profile}
VITE_BSC_PRICE_ORACLE_ADDRESS=${contracts.PriceOracle}
VITE_BSC_OFFER_ADDRESS=${contracts.Offer}
VITE_BSC_TRADE_ADDRESS=${contracts.Trade}
VITE_BSC_ESCROW_ADDRESS=${contracts.Escrow}
VITE_BSC_ARBITRATOR_MANAGER_ADDRESS=${contracts.ArbitratorManager}
\`\`\`

### fiat-prices-aggregator/.env
\`\`\`
BSC_PRICE_ORACLE_ADDRESS=${contracts.PriceOracle}
BSC_HUB_ADDRESS=${contracts.Hub}
\`\`\`

## Next Steps

1. Run initialization script: \`npm run initialize:bsc\`
2. Verify contracts on BSCScan (optional)
3. Test offer creation and trading
4. Monitor price oracle updates
`;
        
        fs.writeFileSync(summaryPath, summaryContent);
        console.log(`   ✅ Deployment summary saved to: BSC_DEPLOYMENT_SUMMARY.md`);
        
        // ====================================================================
        // FINAL SUMMARY
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("UPDATE COMPLETE");
        console.log("=".repeat(70));
        
        console.log("\n✅ Summary:");
        console.log("   ✓ contracts/evm/.env updated");
        console.log("   ✓ app/.env updated");
        console.log("   ✓ fiat-prices-aggregator/.env updated");
        console.log("   ✓ Deployment summary created");
        
        console.log("\n📝 Next Steps:");
        console.log("   1. Review the updated .env files");
        console.log("   2. Run the initialization script: npx hardhat run scripts/initialize-bsc-mainnet.js --network bsc");
        console.log("   3. Verify deployment: npx hardhat run scripts/verify-bsc-deployment.js --network bsc");
        console.log("   4. Run integration tests: npx hardhat run scripts/test-bsc-integration.js --network bsc");
        
    } catch (error) {
        console.error("\n❌ Update failed:", error.message);
        process.exit(1);
    }
}

main();