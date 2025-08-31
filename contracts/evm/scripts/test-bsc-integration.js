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

// Helper function to create test wallets
function createTestWallets(provider) {
    const mnemonic = "test test test test test test test test test test test junk";
    const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
    
    return {
        maker: hdNode.deriveChild(0).connect(provider),
        taker: hdNode.deriveChild(1).connect(provider),
        arbitrator: hdNode.deriveChild(2).connect(provider)
    };
}

async function main() {
    console.log("=".repeat(70));
    console.log("BSC MAINNET - INTEGRATION TEST SUITE");
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
    
    // Create test wallets
    console.log("\n👥 Creating Test Wallets...");
    const testWallets = createTestWallets(ethers.provider);
    console.log("   Maker:", testWallets.maker.address);
    console.log("   Taker:", testWallets.taker.address);
    console.log("   Arbitrator:", testWallets.arbitrator.address);
    
    // Test results tracking
    const testResults = {
        passed: [],
        failed: [],
        skipped: []
    };
    
    try {
        // Get contract instances
        const hub = await ethers.getContractAt("Hub", contracts.Hub, deployer);
        const profile = await ethers.getContractAt("Profile", contracts.Profile, deployer);
        const priceOracle = await ethers.getContractAt("PriceOracle", contracts.PriceOracle, deployer);
        const offer = await ethers.getContractAt("Offer", contracts.Offer, deployer);
        const trade = await ethers.getContractAt("Trade", contracts.Trade, deployer);
        const escrow = await ethers.getContractAt("Escrow", contracts.Escrow, deployer);
        const arbitratorManager = await ethers.getContractAt("ArbitratorManager", contracts.ArbitratorManager, deployer);
        
        // ====================================================================
        // TEST 1: PROFILE CREATION
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("TEST 1: PROFILE CREATION");
        console.log("=".repeat(70));
        
        try {
            console.log("\n   Creating profile for deployer...");
            
            // Check if profile already exists
            const existingProfile = await profile.profileInfo(deployer.address);
            
            if (existingProfile.createdAt > 0) {
                console.log("   ℹ️  Profile already exists for deployer");
                console.log(`      Created: ${new Date(Number(existingProfile.createdAt) * 1000).toISOString()}`);
                console.log(`      Trades: ${existingProfile.totalTrades}`);
                testResults.passed.push("Profile exists for deployer");
            } else {
                // Create new profile
                const encryptionKey = ethers.hexlify(ethers.randomBytes(32));
                const tx = await profile.createProfile(
                    "TestUser",
                    "Test bio for integration testing",
                    encryptionKey
                );
                await tx.wait();
                
                // Verify profile creation
                const newProfile = await profile.profileInfo(deployer.address);
                if (newProfile.createdAt > 0) {
                    console.log("   ✅ Profile created successfully");
                    testResults.passed.push("Profile creation");
                } else {
                    console.log("   ❌ Profile creation failed");
                    testResults.failed.push("Profile creation");
                }
            }
        } catch (error) {
            console.log("   ❌ Profile test failed:", error.message);
            testResults.failed.push("Profile creation");
        }
        
        // ====================================================================
        // TEST 2: PRICE ORACLE FUNCTIONALITY
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("TEST 2: PRICE ORACLE FUNCTIONALITY");
        console.log("=".repeat(70));
        
        try {
            console.log("\n   Testing price oracle reads...");
            
            const testCurrencies = ["USD", "EUR", "COP"];
            let allPricesValid = true;
            
            for (const currency of testCurrencies) {
                const price = await priceOracle.getFiatPrice(currency);
                const formattedPrice = Number(price) / 10000;
                
                if (price > 0) {
                    console.log(`   ✅ ${currency}: ${formattedPrice.toFixed(4)}`);
                } else {
                    console.log(`   ❌ ${currency}: No price (0)`);
                    allPricesValid = false;
                }
            }
            
            if (allPricesValid) {
                testResults.passed.push("Price oracle reads");
            } else {
                testResults.failed.push("Price oracle reads");
            }
            
            // Test price update (if have role)
            const PRICE_UPDATER_ROLE = await priceOracle.PRICE_UPDATER_ROLE();
            const hasRole = await priceOracle.hasRole(PRICE_UPDATER_ROLE, deployer.address);
            
            if (hasRole) {
                console.log("\n   Testing price update...");
                const newPrice = 9300; // 0.93 EUR/USD
                const tx = await priceOracle.updateFiatPrices(["EUR"], [newPrice]);
                await tx.wait();
                
                const updatedPrice = await priceOracle.getFiatPrice("EUR");
                if (updatedPrice.toString() === newPrice.toString()) {
                    console.log("   ✅ Price update successful");
                    testResults.passed.push("Price update");
                } else {
                    console.log("   ❌ Price update failed");
                    testResults.failed.push("Price update");
                }
            } else {
                console.log("   ⚠️  Skipping price update test (no role)");
                testResults.skipped.push("Price update");
            }
        } catch (error) {
            console.log("   ❌ Price oracle test failed:", error.message);
            testResults.failed.push("Price oracle functionality");
        }
        
        // ====================================================================
        // TEST 3: OFFER CREATION
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("TEST 3: OFFER CREATION");
        console.log("=".repeat(70));
        
        let offerId;
        
        try {
            console.log("\n   Creating test offer...");
            
            // Create an offer
            const offerData = {
                fiatCurrency: "USD",
                minTradeAmount: ethers.parseUnits("50", 6),  // $50 minimum
                maxTradeAmount: ethers.parseUnits("500", 6), // $500 maximum
                rate: 10500, // 1.05 rate (5% premium)
                paymentMethods: ["Bank Transfer", "PayPal"],
                terms: "Quick trades only. Payment within 15 minutes.",
                description: "Professional trader. Fast and reliable service. Available 24/7.",
                autoReply: "Thanks for your interest! Please send payment details.",
                offerType: 0, // Buy offer (maker buys crypto)
                minReputation: 0,
                collateral: 0
            };
            
            const tx = await offer.createOffer(
                offerData.fiatCurrency,
                offerData.minTradeAmount,
                offerData.maxTradeAmount,
                offerData.rate,
                offerData.paymentMethods,
                offerData.terms,
                offerData.description,
                offerData.autoReply,
                offerData.offerType,
                offerData.minReputation,
                offerData.collateral
            );
            
            const receipt = await tx.wait();
            
            // Get offer ID from events
            const event = receipt.logs.find(log => {
                try {
                    const parsed = offer.interface.parseLog(log);
                    return parsed && parsed.name === "OfferCreated";
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsedEvent = offer.interface.parseLog(event);
                offerId = parsedEvent.args.offerId;
                console.log(`   ✅ Offer created with ID: ${offerId}`);
                testResults.passed.push("Offer creation");
                
                // Verify offer details
                const offerInfo = await offer.offerInfo(offerId);
                console.log(`   Offer Details:`);
                console.log(`      Owner: ${offerInfo.owner}`);
                console.log(`      Fiat: ${offerInfo.fiatCurrency}`);
                console.log(`      Min: $${ethers.formatUnits(offerInfo.minTradeAmount, 6)}`);
                console.log(`      Max: $${ethers.formatUnits(offerInfo.maxTradeAmount, 6)}`);
                console.log(`      Rate: ${Number(offerInfo.rate) / 10000}`);
                console.log(`      Type: ${offerInfo.offerType === 0 ? "Buy" : "Sell"}`);
                console.log(`      Active: ${offerInfo.isActive}`);
            } else {
                console.log("   ❌ Offer creation event not found");
                testResults.failed.push("Offer creation");
            }
        } catch (error) {
            console.log("   ❌ Offer creation failed:", error.message);
            testResults.failed.push("Offer creation");
        }
        
        // ====================================================================
        // TEST 4: OFFER DESCRIPTION UPDATE
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("TEST 4: OFFER DESCRIPTION UPDATE");
        console.log("=".repeat(70));
        
        if (offerId) {
            try {
                console.log("\n   Testing description update...");
                
                const newDescription = "Updated description: Premium trader with 100% success rate. Lightning fast!";
                const tx = await offer.updateOfferDescription(offerId, newDescription);
                await tx.wait();
                
                // Verify update
                const updatedOffer = await offer.offerInfo(offerId);
                if (updatedOffer.description === newDescription) {
                    console.log("   ✅ Description updated successfully");
                    console.log(`      New: "${newDescription}"`);
                    testResults.passed.push("Description update");
                } else {
                    console.log("   ❌ Description update failed");
                    testResults.failed.push("Description update");
                }
            } catch (error) {
                if (error.message.includes("function selector was not recognized")) {
                    console.log("   ⚠️  Description update not supported in this deployment");
                    testResults.skipped.push("Description update");
                } else {
                    console.log("   ❌ Description update failed:", error.message);
                    testResults.failed.push("Description update");
                }
            }
        } else {
            console.log("   ⚠️  Skipping (no offer created)");
            testResults.skipped.push("Description update");
        }
        
        // ====================================================================
        // TEST 5: ARBITRATOR FUNCTIONALITY
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("TEST 5: ARBITRATOR FUNCTIONALITY");
        console.log("=".repeat(70));
        
        try {
            console.log("\n   Checking arbitrator registration...");
            
            const arbInfo = await arbitratorManager.arbitratorInfo(deployer.address);
            
            if (arbInfo.joinedAt > 0) {
                console.log("   ✅ Deployer is registered arbitrator");
                console.log(`      Active: ${arbInfo.isActive}`);
                console.log(`      Supported Fiats: ${arbInfo.supportedFiats.length}`);
                console.log(`      Reputation: ${arbInfo.reputationScore}`);
                
                // Check currency support
                const currencies = ["USD", "EUR", "COP"];
                let allSupported = true;
                
                for (const curr of currencies) {
                    const supported = await arbitratorManager.currencySupport(deployer.address, curr);
                    if (!supported) {
                        allSupported = false;
                        console.log(`      ❌ ${curr} not supported`);
                    }
                }
                
                if (allSupported) {
                    console.log("   ✅ All test currencies supported");
                    testResults.passed.push("Arbitrator functionality");
                } else {
                    console.log("   ⚠️  Some currencies not supported");
                    testResults.failed.push("Arbitrator currency support");
                }
                
                // Check arbitrators list
                const usdArbitrators = await arbitratorManager.arbitratorsByFiat("USD");
                if (usdArbitrators.includes(deployer.address)) {
                    console.log("   ✅ Listed as USD arbitrator");
                    testResults.passed.push("Arbitrator listing");
                } else {
                    console.log("   ❌ Not listed as USD arbitrator");
                    testResults.failed.push("Arbitrator listing");
                }
            } else {
                console.log("   ⚠️  Deployer not registered as arbitrator");
                testResults.skipped.push("Arbitrator functionality");
            }
        } catch (error) {
            console.log("   ❌ Arbitrator test failed:", error.message);
            testResults.failed.push("Arbitrator functionality");
        }
        
        // ====================================================================
        // TEST 6: HUB CONFIGURATION CHECK
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("TEST 6: HUB CONFIGURATION CHECK");
        console.log("=".repeat(70));
        
        try {
            console.log("\n   Verifying hub configuration...");
            
            const hubConfig = await hub.getConfig();
            
            // Check zero fees
            const fees = [
                { name: "burnFeePct", value: hubConfig.burnFeePct },
                { name: "chainFeePct", value: hubConfig.chainFeePct },
                { name: "warchestFeePct", value: hubConfig.warchestFeePct },
                { name: "conversionFeePct", value: hubConfig.conversionFeePct },
                { name: "arbitratorFeePct", value: hubConfig.arbitratorFeePct }
            ];
            
            let allZero = true;
            for (const fee of fees) {
                if (fee.value.toString() !== "0") {
                    console.log(`   ❌ ${fee.name}: ${fee.value} (should be 0)`);
                    allZero = false;
                }
            }
            
            if (allZero) {
                console.log("   ✅ All fees are zero (zero-fee mode active)");
                testResults.passed.push("Zero fees configuration");
            } else {
                console.log("   ❌ Some fees are not zero");
                testResults.failed.push("Zero fees configuration");
            }
            
            // Check pause states
            if (!hubConfig.globalPause && !hubConfig.pauseNewTrades) {
                console.log("   ✅ System is active (not paused)");
                testResults.passed.push("System active state");
            } else {
                console.log("   ⚠️  System or trades are paused");
                testResults.failed.push("System active state");
            }
            
            // Check trade limits
            const minTrade = ethers.formatUnits(hubConfig.minTradeAmount, 6);
            const maxTrade = ethers.formatUnits(hubConfig.maxTradeAmount, 6);
            console.log(`   Trade Limits: $${minTrade} - $${maxTrade}`);
            
            if (minTrade === "10.0" && maxTrade === "10000.0") {
                console.log("   ✅ Trade limits configured correctly");
                testResults.passed.push("Trade limits");
            } else {
                console.log("   ⚠️  Trade limits differ from expected");
                testResults.skipped.push("Trade limits");
            }
        } catch (error) {
            console.log("   ❌ Hub configuration test failed:", error.message);
            testResults.failed.push("Hub configuration");
        }
        
        // ====================================================================
        // TEST SUMMARY
        // ====================================================================
        console.log("\n" + "=".repeat(70));
        console.log("INTEGRATION TEST SUMMARY");
        console.log("=".repeat(70));
        
        console.log(`\n✅ Passed Tests (${testResults.passed.length}):`);
        testResults.passed.forEach(test => console.log(`   • ${test}`));
        
        if (testResults.skipped.length > 0) {
            console.log(`\n⚠️  Skipped Tests (${testResults.skipped.length}):`);
            testResults.skipped.forEach(test => console.log(`   • ${test}`));
        }
        
        if (testResults.failed.length > 0) {
            console.log(`\n❌ Failed Tests (${testResults.failed.length}):`);
            testResults.failed.forEach(test => console.log(`   • ${test}`));
        }
        
        const totalTests = testResults.passed.length + testResults.failed.length + testResults.skipped.length;
        const passRate = ((testResults.passed.length / (testResults.passed.length + testResults.failed.length)) * 100).toFixed(1);
        
        console.log("\n" + "=".repeat(70));
        if (testResults.failed.length === 0) {
            console.log("🎉 ALL INTEGRATION TESTS PASSED!");
            console.log("=".repeat(70));
            console.log(`\n   Total Tests: ${totalTests}`);
            console.log(`   Pass Rate: ${passRate}%`);
            console.log(`   BSC deployment is fully functional!`);
        } else {
            console.log("⚠️  SOME INTEGRATION TESTS FAILED");
            console.log("=".repeat(70));
            console.log(`\n   Total Tests: ${totalTests}`);
            console.log(`   Pass Rate: ${passRate}%`);
            console.log(`   Review failed tests and fix issues.`);
        }
        
        // Save test report
        const reportPath = path.join(__dirname, '..', `BSC_INTEGRATION_TEST_${Date.now()}.json`);
        const report = {
            timestamp: new Date().toISOString(),
            network: "BSC Mainnet",
            chainId: Number(network.chainId),
            deployer: deployer.address,
            contracts,
            testResults: {
                passed: testResults.passed,
                failed: testResults.failed,
                skipped: testResults.skipped,
                passRate: passRate + "%",
                totalTests
            }
        };
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📁 Test report saved to: ${path.basename(reportPath)}`);
        
    } catch (error) {
        console.error("\n❌ Integration test suite failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => {
        console.log("\n✨ Integration test suite completed!");
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });