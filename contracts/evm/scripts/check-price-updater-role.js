const hre = require("hardhat");
const ethers = hre.ethers;

async function main() {
  console.log("Checking PRICE_UPDATER_ROLE on PriceOracle contract...\n");

  // Get the deployed PriceOracle contract
  const PRICE_ORACLE_ADDRESS = "0x3f8f71c3A10907A196F427A3C98e01045f6008de";
  
  const PriceOracle = await hre.ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS);

  // Get the PRICE_UPDATER_ROLE hash
  const PRICE_UPDATER_ROLE = await PriceOracle.PRICE_UPDATER_ROLE();
  console.log("PRICE_UPDATER_ROLE hash:", PRICE_UPDATER_ROLE);

  // Check some common addresses - you'll need to replace with your actual address
  const addressesToCheck = [
    // Add your aggregator's address here
    // This should be the address derived from EVM_PRIVATE_KEY in .env
  ];

  // Get the signer's address from the private key
  const [signer] = await hre.ethers.getSigners();
  console.log("\nChecking signer address:", signer.address);
  
  const hasRole = await PriceOracle.hasRole(PRICE_UPDATER_ROLE, signer.address);
  console.log(`Signer has PRICE_UPDATER_ROLE: ${hasRole ? "✅ YES" : "❌ NO"}`);

  // Check DEFAULT_ADMIN_ROLE to see who can grant roles
  const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const adminCount = await PriceOracle.getRoleMemberCount(DEFAULT_ADMIN_ROLE);
  
  console.log(`\nNumber of admins: ${adminCount}`);
  
  for (let i = 0; i < adminCount; i++) {
    const admin = await PriceOracle.getRoleMember(DEFAULT_ADMIN_ROLE, i);
    console.log(`Admin ${i + 1}: ${admin}`);
  }

  // Check how many addresses have PRICE_UPDATER_ROLE
  const updaterCount = await PriceOracle.getRoleMemberCount(PRICE_UPDATER_ROLE);
  console.log(`\nNumber of price updaters: ${updaterCount}`);
  
  for (let i = 0; i < updaterCount; i++) {
    const updater = await PriceOracle.getRoleMember(PRICE_UPDATER_ROLE, i);
    console.log(`Price Updater ${i + 1}: ${updater}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });