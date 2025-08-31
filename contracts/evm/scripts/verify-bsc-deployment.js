require("dotenv").config();
const { ethers } = require("hardhat");
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
    
    console.log(`   Loading addresses from: ${latestFile}`);
    return deploymentInfo.contracts;
}

async function main() {
    console.log("=".repeat(70));
    console.log("BSC MAINNET DEPLOYMENT VERIFICATION");
    console.log("=".repeat(70));
    
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
        console.error("❌ DEPLOYER_PRIVATE_KEY not found in .env file");
        process.exit(1);
    }
    
    const deployer = new ethers.Wallet(privateKey, ethers.provider);
    const network = await ethers.provider.getNetwork();
    
    console.log("\nNetwork: BSC Mainnet");
    console.log("Chain ID:", network.chainId);
    console.log("\nDeployer Address:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "BNB");
    
    // Load deployed contract addresses
    console.log("\n📁 Loading Deployed Contract Addresses...");
    const contracts = loadDeployedAddresses();
    
    console.log("\n📍 Contract Addresses:");
    Object.entries(contracts).forEach(([name, address]) => {
        console.log(`   ${name.padEnd(20)}: ${address}`);
    });
    
    let allChecks = true;
    const results = {
        passed: [],
        failed: [],
        warnings: []
    };
    
    try {
        // ====================================================================
        // CHECK 1: CONTRACT DEPLOYMENT
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("CHECK 1: CONTRACT DEPLOYMENT");
        console.log("=".repeat(70));
        
        for (const [name, address] of Object.entries(contracts)) {
            const code = await ethers.provider.getCode(address);
            if (code !== "0x") {
                console.log(`   ✅ ${name.padEnd(20)}: Contract deployed`);
                results.passed.push(`${name} contract deployed`);
            } else {
                console.log(`   ❌ ${name.padEnd(20)}: No contract code found`);
                results.failed.push(`${name} contract not deployed`);
                allChecks = false;
            }
        }
        
        // ====================================================================
        // CHECK 2: HUB CONFIGURATION
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("CHECK 2: HUB CONFIGURATION");
        console.log("=".repeat(70));
        
        const hub = await ethers.getContractAt("Hub", contracts.Hub, deployer);
        const hubConfig = await hub.getConfig();
        
        // Check contract addresses
        const addressChecks = [
            { name: "Offer", expected: contracts.Offer, actual: hubConfig.offerContract },
            { name: "Trade", expected: contracts.Trade, actual: hubConfig.tradeContract },
            { name: "Profile", expected: contracts.Profile, actual: hubConfig.profileContract },
            { name: "PriceOracle", expected: contracts.PriceOracle, actual: hubConfig.priceContract }
        ];
        
        for (const check of addressChecks) {
            if (check.actual.toLowerCase() === check.expected.toLowerCase()) {
                console.log(`   ✅ ${check.name.padEnd(12)} address: Correctly configured`);
                results.passed.push(`Hub -> ${check.name} configured`);
            } else {
                console.log(`   ❌ ${check.name.padEnd(12)} address: Mismatch`);
                console.log(`      Expected: ${check.expected}`);
                console.log(`      Actual:   ${check.actual}`);
                results.failed.push(`Hub -> ${check.name} misconfigured`);
                allChecks = false;
            }
        }
        
        // Check fees (should all be 0)
        console.log("\n   Fee Configuration (Zero Fees):");
        const fees = [
            { name: "Burn Fee", value: hubConfig.burnFeePct },
            { name: "Chain Fee", value: hubConfig.chainFeePct },
            { name: "Warchest Fee", value: hubConfig.warchestFeePct },
            { name: "Conversion Fee", value: hubConfig.conversionFeePct },
            { name: "Arbitrator Fee", value: hubConfig.arbitratorFeePct }
        ];
        
        for (const fee of fees) {
            if (fee.value.toString() === "0") {
                console.log(`   ✅ ${fee.name.padEnd(15)}: 0% (Zero fee active)`);
                results.passed.push(`${fee.name} = 0%`);
            } else {
                console.log(`   ❌ ${fee.name.padEnd(15)}: ${fee.value}% (Should be 0)`);
                results.failed.push(`${fee.name} not zero`);
                allChecks = false;
            }
        }
        
        // Check limits
        console.log("\n   Trade Limits:");
        const minTrade = ethers.formatUnits(hubConfig.minTradeAmount, 6);
        const maxTrade = ethers.formatUnits(hubConfig.maxTradeAmount, 6);
        console.log(`   Min Trade: $${minTrade}`);
        console.log(`   Max Trade: $${maxTrade}`);
        
        if (minTrade === "10.0") {
            console.log(`   ✅ Min trade amount correct`);
            results.passed.push("Min trade = $10");
        } else {
            console.log(`   ⚠️  Min trade amount: $${minTrade} (expected $10)`);
            results.warnings.push(`Min trade = $${minTrade}`);
        }
        
        if (maxTrade === "10000.0") {
            console.log(`   ✅ Max trade amount correct`);
            results.passed.push("Max trade = $10,000");
        } else {
            console.log(`   ⚠️  Max trade amount: $${maxTrade} (expected $10,000)`);
            results.warnings.push(`Max trade = $${maxTrade}`);
        }
        
        // ====================================================================
        // CHECK 3: PRICE ORACLE
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("CHECK 3: PRICE ORACLE");
        console.log("=".repeat(70));
        
        const priceOracle = await ethers.getContractAt("PriceOracle", contracts.PriceOracle, deployer);
        
        // Check PRICE_UPDATER_ROLE
        const PRICE_UPDATER_ROLE = await priceOracle.PRICE_UPDATER_ROLE();
        const hasRole = await priceOracle.hasRole(PRICE_UPDATER_ROLE, deployer.address);
        
        if (hasRole) {
            console.log(`   ✅ Deployer has PRICE_UPDATER_ROLE`);
            results.passed.push("Price updater role granted");
        } else {
            console.log(`   ❌ Deployer lacks PRICE_UPDATER_ROLE`);
            results.failed.push("Price updater role missing");
            allChecks = false;
        }
        
        // Check some prices
        const testCurrencies = ["USD", "EUR", "GBP", "COP", "MXN"];
        let pricesSet = 0;
        let pricesMissing = 0;
        
        console.log("\n   Checking fiat prices:");
        for (const currency of testCurrencies) {
            try {
                const price = await priceOracle.getFiatPrice(currency);
                if (price > 0) {
                    const formattedPrice = Number(price) / 10000;
                    console.log(`   ✅ ${currency.padEnd(5)}: ${formattedPrice.toFixed(4)}`);
                    pricesSet++;
                } else {
                    console.log(`   ❌ ${currency.padEnd(5)}: Not set (0)`);
                    pricesMissing++;
                }
            } catch (error) {
                console.log(`   ❌ ${currency.padEnd(5)}: Error reading price`);
                pricesMissing++;
            }
        }
        
        if (pricesSet === testCurrencies.length) {
            results.passed.push(`All ${testCurrencies.length} test prices set`);
        } else if (pricesSet > 0) {
            results.warnings.push(`${pricesSet}/${testCurrencies.length} prices set`);
        } else {
            results.failed.push("No prices set");
            allChecks = false;
        }
        
        // ====================================================================
        // CHECK 4: OFFER CONTRACT
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("CHECK 4: OFFER CONTRACT");
        console.log("=".repeat(70));
        
        const offer = await ethers.getContractAt("Offer", contracts.Offer, deployer);
        const offerHub = await offer.hub();
        
        if (offerHub.toLowerCase() === contracts.Hub.toLowerCase()) {
            console.log(`   ✅ Offer -> Hub link correct`);
            results.passed.push("Offer initialized with Hub");
        } else {
            console.log(`   ❌ Offer -> Hub link incorrect`);
            console.log(`      Expected: ${contracts.Hub}`);
            console.log(`      Actual:   ${offerHub}`);
            results.failed.push("Offer Hub link incorrect");
            allChecks = false;
        }
        
        // Check updateOfferDescription function
        try {
            const updateDescFunc = offer.interface.getFunction("updateOfferDescription");
            console.log(`   ✅ updateOfferDescription function exists`);
            results.passed.push("Description update supported");
        } catch (error) {
            console.log(`   ⚠️  updateOfferDescription function not found`);
            results.warnings.push("Description update not available");
        }
        
        // ====================================================================
        // CHECK 5: TRADE CONTRACT DEPENDENCIES
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("CHECK 5: TRADE CONTRACT DEPENDENCIES");
        console.log("=".repeat(70));
        
        const trade = await ethers.getContractAt("Trade", contracts.Trade, deployer);
        const escrowAddr = await trade.escrowContract();
        const arbManagerAddr = await trade.arbitratorManager();
        
        if (escrowAddr.toLowerCase() === contracts.Escrow.toLowerCase()) {
            console.log(`   ✅ Trade -> Escrow link correct`);
            results.passed.push("Trade -> Escrow configured");
        } else {
            console.log(`   ❌ Trade -> Escrow link incorrect`);
            results.failed.push("Trade -> Escrow misconfigured");
            allChecks = false;
        }
        
        if (arbManagerAddr.toLowerCase() === contracts.ArbitratorManager.toLowerCase()) {
            console.log(`   ✅ Trade -> ArbitratorManager link correct`);
            results.passed.push("Trade -> ArbitratorManager configured");
        } else {
            console.log(`   ❌ Trade -> ArbitratorManager link incorrect`);
            results.failed.push("Trade -> ArbitratorManager misconfigured");
            allChecks = false;
        }
        
        // ====================================================================
        // CHECK 6: ARBITRATOR REGISTRATION
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("CHECK 6: ARBITRATOR REGISTRATION");
        console.log("=".repeat(70));
        
        const arbitratorManager = await ethers.getContractAt("ArbitratorManager", contracts.ArbitratorManager, deployer);
        const arbitratorInfo = await arbitratorManager.arbitratorInfo(deployer.address);
        
        if (arbitratorInfo.joinedAt > 0) {
            console.log(`   ✅ Deployer registered as arbitrator`);
            console.log(`      Joined: ${new Date(Number(arbitratorInfo.joinedAt) * 1000).toISOString()}`);
            console.log(`      Active: ${arbitratorInfo.isActive}`);
            console.log(`      Supported Fiats: ${arbitratorInfo.supportedFiats.length}`);
            results.passed.push("Arbitrator registered");
            
            // Check currency support
            const checkCurrencies = ["USD", "EUR", "COP"];
            let supportedCount = 0;
            for (const currency of checkCurrencies) {
                const supported = await arbitratorManager.currencySupport(deployer.address, currency);
                if (supported) supportedCount++;
            }
            
            if (supportedCount === checkCurrencies.length) {
                console.log(`   ✅ All test currencies supported`);
                results.passed.push("Currency support verified");
            } else {
                console.log(`   ⚠️  Only ${supportedCount}/${checkCurrencies.length} test currencies supported`);
                results.warnings.push("Partial currency support");
            }
        } else {
            console.log(`   ⚠️  Deployer not registered as arbitrator`);
            results.warnings.push("Arbitrator not registered");
        }
        
        // ====================================================================
        // CHECK 7: PAUSABLE STATES
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("CHECK 7: PAUSABLE STATES");
        console.log("=".repeat(70));
        
        const pauseStates = [
            { name: "Global Pause", value: hubConfig.globalPause },
            { name: "Pause New Trades", value: hubConfig.pauseNewTrades },
            { name: "Pause Deposits", value: hubConfig.pauseDeposits },
            { name: "Pause Withdrawals", value: hubConfig.pauseWithdrawals }
        ];
        
        for (const state of pauseStates) {
            if (!state.value) {
                console.log(`   ✅ ${state.name.padEnd(20)}: Not paused (Active)`);
                results.passed.push(`${state.name} = Active`);
            } else {
                console.log(`   ⚠️  ${state.name.padEnd(20)}: PAUSED`);
                results.warnings.push(`${state.name} = Paused`);
            }
        }
        
        // ====================================================================
        // FINAL VERIFICATION SUMMARY
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("VERIFICATION SUMMARY");
        console.log("=".repeat(70));
        
        console.log(`\n✅ Passed Checks (${results.passed.length}):`);
        results.passed.forEach(check => console.log(`   • ${check}`));
        
        if (results.warnings.length > 0) {
            console.log(`\n⚠️  Warnings (${results.warnings.length}):`);
            results.warnings.forEach(warning => console.log(`   • ${warning}`));
        }
        
        if (results.failed.length > 0) {
            console.log(`\n❌ Failed Checks (${results.failed.length}):`);
            results.failed.forEach(fail => console.log(`   • ${fail}`));
        }
        
        console.log("\n" + "=".repeat(70));
        if (allChecks && results.failed.length === 0) {
            console.log("🎉 DEPLOYMENT VERIFICATION: PASSED");
            console.log("=".repeat(70));
            console.log("\n✅ All critical checks passed!");
            console.log("   The BSC mainnet deployment is fully operational.");
            
            if (results.warnings.length > 0) {
                console.log("\n⚠️  Note: Some non-critical warnings were found.");
                console.log("   Review them to ensure optimal configuration.");
            }
        } else {
            console.log("❌ DEPLOYMENT VERIFICATION: FAILED");
            console.log("=".repeat(70));
            console.log("\n❌ Critical issues found!");
            console.log("   Please address the failed checks before using the system.");
        }
        
        // Save verification report
        const reportPath = path.join(__dirname, '..', `BSC_VERIFICATION_REPORT_${Date.now()}.json`);
        const report = {
            timestamp: new Date().toISOString(),
            network: "BSC Mainnet",
            chainId: Number(network.chainId),
            deployer: deployer.address,
            contracts,
            verification: {
                overallStatus: allChecks && results.failed.length === 0 ? "PASSED" : "FAILED",
                passed: results.passed,
                warnings: results.warnings,
                failed: results.failed
            }
        };
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📁 Verification report saved to: ${path.basename(reportPath)}`);
        
    } catch (error) {
        console.error("\n❌ Verification failed with error:", error);
        process.exit(1);
    }
}

main()
    .then(() => {
        console.log("\n✨ Verification script completed!");
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });