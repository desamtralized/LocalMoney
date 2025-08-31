const { ethers } = require("ethers");
require('dotenv').config();

// SECURITY: Never hardcode seed phrases or private keys
// Load seed phrase from environment variable
const SEED_PHRASE = process.env.SEED_PHRASE;

if (!SEED_PHRASE) {
    console.error("ERROR: SEED_PHRASE not found in .env file");
    console.error("\nPlease add your seed phrase to .env file:");
    console.error("SEED_PHRASE=\"your twelve word seed phrase here\"");
    console.error("\nWARNING: Never commit .env files or seed phrases to version control!");
    process.exit(1);
}

console.log("Deriving keys from seed phrase...\n");
console.log("Seed phrase: [HIDDEN FOR SECURITY]");
console.log("\n" + "=".repeat(70));

// Create HD wallet from mnemonic with MetaMask derivation path
const hdNode = ethers.HDNodeWallet.fromPhrase(SEED_PHRASE, undefined, "m/44'/60'/0'/0");

// Get first account (index 0)
const account0 = hdNode.deriveChild(0);

console.log("\nMetaMask Derivation Path: m/44'/60'/0'/0/0");
console.log("Address:", account0.address);
console.log("Private Key: [HIDDEN - check output if needed]");

// Show address only for first few accounts (hide private keys)
console.log("\n" + "=".repeat(70));
console.log("First 5 MetaMask account addresses:");
console.log("=".repeat(70));

for (let i = 0; i < 5; i++) {
    const account = hdNode.deriveChild(i);
    console.log(`\nAccount ${i} (m/44'/60'/0'/0/${i}):`);
    console.log("  Address:", account.address);
    // Private keys are derived but not displayed for security
}

console.log("\n" + "=".repeat(70));
console.log("SECURITY NOTICE:");
console.log("- Private keys have been derived but are hidden in output");
console.log("- To see private keys, modify this script locally");
console.log("- Never share or commit private keys to version control");
console.log("- Store DEPLOYER_PRIVATE_KEY securely in .env file");