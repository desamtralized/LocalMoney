/**
 * Simple Wallet Integration Test
 *
 * A simplified test to verify basic wallet functionality works correctly
 */
console.log('🧪 Starting Simple Wallet Integration Test...\n');
async function runSimpleTest() {
    try {
        // Import the SDK components we need  
        const { Keypair } = await Promise.resolve().then(() => require('@solana/web3.js'));
        const { LocalMoneySDK, WalletType, WalletUtils, createLocalMoneyWallet } = await Promise.resolve().then(() => require('../dist/index.js'));
        let testsPassed = 0;
        let totalTests = 0;
        // Test 1: SDK import and basic functionality
        console.log('Test 1: SDK Import and Basic Functionality');
        totalTests++;
        if (LocalMoneySDK && WalletType && WalletUtils) {
            console.log('✅ All components imported successfully');
            testsPassed++;
        }
        else {
            console.log('❌ Import failed');
        }
        // Test 2: Wallet creation
        console.log('\nTest 2: Basic Wallet Creation');
        totalTests++;
        try {
            const { Connection } = await Promise.resolve().then(() => require('@solana/web3.js'));
            const connection = new Connection('http://localhost:8899');
            const wallet = createLocalMoneyWallet(connection);
            if (wallet) {
                console.log('✅ Wallet created successfully');
                testsPassed++;
            }
            else {
                console.log('❌ Wallet creation failed');
            }
        }
        catch (error) {
            console.log('❌ Wallet creation error:', error.message);
        }
        // Test 3: Available wallets detection
        console.log('\nTest 3: Available Wallets Detection');
        totalTests++;
        try {
            const availableWallets = LocalMoneySDK.getAvailableWallets();
            if (Array.isArray(availableWallets) && availableWallets.length > 0) {
                console.log('✅ Available wallets detected:', availableWallets.length);
                testsPassed++;
                availableWallets.forEach(wallet => {
                    console.log(`  - ${wallet.name} (${wallet.type}): ${wallet.installed ? 'Installed' : 'Not installed'}`);
                });
            }
            else {
                console.log('❌ No wallets detected or invalid response');
            }
        }
        catch (error) {
            console.log('❌ Wallet detection error:', error.message);
        }
        // Test 4: Utility functions
        console.log('\nTest 4: Wallet Utilities');
        totalTests++;
        try {
            const keypair = Keypair.generate();
            const formatted = WalletUtils.formatAddress(keypair.publicKey, 4);
            const isValid = WalletUtils.isValidAddress(keypair.publicKey.toString());
            if (formatted.includes('...') && isValid) {
                console.log('✅ Wallet utilities work correctly');
                console.log(`  - Formatted address: ${formatted}`);
                testsPassed++;
            }
            else {
                console.log('❌ Wallet utilities failed');
            }
        }
        catch (error) {
            console.log('❌ Wallet utilities error:', error.message);
        }
        // Test 5: Basic SDK creation (enhanced SDK test disabled for now)
        console.log('\nTest 5: Basic SDK Creation');
        totalTests++;
        try {
            const { Connection } = await Promise.resolve().then(() => require('@solana/web3.js'));
            const connection = new Connection('http://localhost:8899');
            const keypair = Keypair.generate();
            const sdk = LocalMoneySDK.createWithKeypair(connection, keypair, {
                hub: new (await Promise.resolve().then(() => require('@solana/web3.js'))).PublicKey('J5FDxQmMpiF4vqKBSWQS3JRGLyE8djRgoHF8QQJJKWM1'),
                profile: new (await Promise.resolve().then(() => require('@solana/web3.js'))).PublicKey('6HJHAiMENmYh4wW99YtHVY6tGDTzdrNeMtwSpDiyGu1k'),
                price: new (await Promise.resolve().then(() => require('@solana/web3.js'))).PublicKey('7nkFUfmqKMKrQfm83HxreJHXyJdTK5feYqDEJtNihaw1'),
                offer: new (await Promise.resolve().then(() => require('@solana/web3.js'))).PublicKey('DGjiY2hKsDpffEgBckNfrAkDt6B5jSxwsHshyQ1cRiP9'),
                trade: new (await Promise.resolve().then(() => require('@solana/web3.js'))).PublicKey('AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM'),
                arbitration: new (await Promise.resolve().then(() => require('@solana/web3.js'))).PublicKey('3XkiY4D1FBnpKHpuT2pi3AhnZ2WcXXGSsR4vSYJ87RbR'),
            });
            if (sdk) {
                console.log('✅ Basic SDK created successfully');
                testsPassed++;
            }
            else {
                console.log('❌ Basic SDK creation failed');
            }
        }
        catch (error) {
            console.log('❌ Basic SDK creation error:', error.message);
        }
        // Summary
        console.log('\n📊 Test Summary');
        console.log('================');
        console.log(`Passed: ${testsPassed}/${totalTests}`);
        console.log(`Success Rate: ${(testsPassed / totalTests * 100).toFixed(1)}%`);
        if (testsPassed === totalTests) {
            console.log('🎉 All tests passed! Wallet integration is working correctly.');
            return true;
        }
        else {
            console.log('⚠️ Some tests failed. Review the output above.');
            return false;
        }
    }
    catch (error) {
        console.error('❌ Test suite failed with error:', error.message);
        return false;
    }
}
// Run the test
runSimpleTest()
    .then((success) => {
    if (success) {
        console.log('\n✅ Simple wallet integration test completed successfully!');
        process.exit(0);
    }
    else {
        console.log('\n❌ Simple wallet integration test failed.');
        process.exit(1);
    }
})
    .catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});
