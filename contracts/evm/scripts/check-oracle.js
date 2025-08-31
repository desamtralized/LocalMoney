const hre = require("hardhat");

async function main() {
  const PRICE_ORACLE_ADDRESS = "0x5C1e0CE9F02434241d8950ea13D96B5Ed6af44E2";
  
  const PriceOracle = await hre.ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS);
  
  console.log("Oracle Address:", PRICE_ORACLE_ADDRESS);
  
  try {
    // Try to get the PRICE_UPDATER_ROLE
    const PRICE_UPDATER_ROLE = await PriceOracle.PRICE_UPDATER_ROLE();
    console.log("PRICE_UPDATER_ROLE:", PRICE_UPDATER_ROLE);
    
    // Check if the contract is paused
    const isPaused = await PriceOracle.paused();
    console.log("Contract paused:", isPaused);
    
    // Get MAX_PRICE_AGE
    const maxAge = await PriceOracle.MAX_PRICE_AGE();
    console.log("MAX_PRICE_AGE:", maxAge.toString(), "seconds");
    
  } catch (error) {
    console.error("Error checking oracle:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
