const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Setting fiat prices with account:", deployer.address);

  // Get the deployed PriceOracle contract address
  // You'll need to replace this with your actual deployed address
  const PRICE_ORACLE_ADDRESS = "0x3f8f71c3A10907A196F427A3C98e01045f6008de";

  const PriceOracle = await hre.ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS);

  // Fiat currency prices in USD with 8 decimals
  // These are approximate exchange rates (1 USD = X units of fiat)
  const fiatPrices = {
    "USD": "100000000",    // 1 USD = 1 USD (1.00000000)
    "EUR": "108000000",    // 1 EUR = 1.08 USD
    "GBP": "127000000",    // 1 GBP = 1.27 USD
    "JPY": "670000",       // 1 JPY = 0.0067 USD
    "COP": "25000",        // 1 COP = 0.00025 USD (1 USD = 4000 COP)
    "BRL": "20000000",     // 1 BRL = 0.20 USD
    "MXN": "5800000",      // 1 MXN = 0.058 USD
    "ARS": "100000",       // 1 ARS = 0.001 USD
    "CAD": "73000000",     // 1 CAD = 0.73 USD
    "AUD": "65000000",     // 1 AUD = 0.65 USD
    "CHF": "110000000",    // 1 CHF = 1.10 USD
    "CNY": "14000000",     // 1 CNY = 0.14 USD
    "INR": "1200000",      // 1 INR = 0.012 USD
    "KRW": "75000",        // 1 KRW = 0.00075 USD
    "SGD": "74000000",     // 1 SGD = 0.74 USD
    "HKD": "12800000",     // 1 HKD = 0.128 USD
    "NZD": "61000000",     // 1 NZD = 0.61 USD
    "SEK": "9500000",      // 1 SEK = 0.095 USD
    "NOK": "9300000",      // 1 NOK = 0.093 USD
    "ZAR": "5300000",      // 1 ZAR = 0.053 USD
    "THB": "2800000",      // 1 THB = 0.028 USD
    "PHP": "1800000",      // 1 PHP = 0.018 USD
    "IDR": "6300",         // 1 IDR = 0.000063 USD
    "MYR": "22000000",     // 1 MYR = 0.22 USD
    "VND": "4100",         // 1 VND = 0.000041 USD
    "EGP": "3200000",      // 1 EGP = 0.032 USD
    "KES": "650000",       // 1 KES = 0.0065 USD
    "NGN": "85000",        // 1 NGN = 0.00085 USD
    "CLP": "106000",       // 1 CLP = 0.00106 USD
    "VES": "2700000",      // 1 VES = 0.027 USD
  };

  const currencies = Object.keys(fiatPrices);
  const prices = Object.values(fiatPrices);

  console.log(`Setting prices for ${currencies.length} currencies...`);

  try {
    // Check if the caller has the PRICE_UPDATER_ROLE
    const PRICE_UPDATER_ROLE = await PriceOracle.PRICE_UPDATER_ROLE();
    const hasRole = await PriceOracle.hasRole(PRICE_UPDATER_ROLE, deployer.address);
    
    if (!hasRole) {
      console.log("Account doesn't have PRICE_UPDATER_ROLE. Attempting to grant role...");
      
      // Try to grant the role (this will only work if deployer is admin)
      const DEFAULT_ADMIN_ROLE = await PriceOracle.DEFAULT_ADMIN_ROLE();
      const isAdmin = await PriceOracle.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
      
      if (isAdmin) {
        const grantTx = await PriceOracle.grantRole(PRICE_UPDATER_ROLE, deployer.address);
        await grantTx.wait();
        console.log("PRICE_UPDATER_ROLE granted successfully");
      } else {
        console.error("Cannot grant PRICE_UPDATER_ROLE - not an admin");
        return;
      }
    }

    // Update fiat prices
    const tx = await PriceOracle.updateFiatPrices(currencies, prices);
    console.log("Transaction sent:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
    
    // Verify some prices were set correctly
    console.log("\nVerifying prices...");
    for (const currency of ["USD", "EUR", "COP", "BRL"]) {
      try {
        const price = await PriceOracle.getFiatPrice(currency);
        console.log(`${currency}: ${price.toString()} (${Number(price) / 100000000} USD)`);
      } catch (error) {
        console.log(`${currency}: Not set or error`);
      }
    }
    
    console.log("\nFiat prices updated successfully!");
    
  } catch (error) {
    console.error("Error setting fiat prices:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });