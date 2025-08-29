const hre = require("hardhat");

async function main() {
  console.log("Querying prices from PriceOracle contract...");

  // Get the deployed PriceOracle contract
  const PRICE_ORACLE_ADDRESS = "0xCc0f796822c58eed5F58BDf72DfC8433AdE66345";
  
  const PriceOracle = await hre.ethers.getContractAt("PriceOracle", PRICE_ORACLE_ADDRESS);

  // List of currencies to query
  const currencies = [
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "COP",
    "BRL",
    "MXN",
    "ARS",
    "PHP",
    "VND",
    "IDR",
    "MYR",
    "SGD",
    "THB",
    "NGN",
    "CLP",
    "VES",
    "ZAR",
    "EGP",
    "KES",
    "CAD"
  ];

  console.log("\n=== Fiat Currency Prices (8 decimals) ===");
  console.log("Currency | Price (raw) | Price (USD) | Status");
  console.log("-".repeat(60));

  for (const currency of currencies) {
    try {
      const price = await PriceOracle.getFiatPrice(currency);
      const priceUSD = Number(price) / 100_000_000; // Convert from 8 decimals
      
      // Check if price is valid (not 0)
      const status = price > 0 ? "✅ Valid" : "❌ Not Set";
      
      console.log(
        `${currency.padEnd(8)} | ${price.toString().padEnd(11)} | ${priceUSD.toFixed(8).padEnd(11)} | ${status}`
      );
    } catch (error) {
      // Handle FiatPriceNotFound error
      if (error.message.includes("FiatPriceNotFound") || error.message.includes("0x4a1e0a41")) {
        console.log(
          `${currency.padEnd(8)} | ${"-".padEnd(11)} | ${"-".padEnd(11)} | ❌ Not Found`
        );
      } else {
        console.log(
          `${currency.padEnd(8)} | Error: ${error.message.substring(0, 30)}...`
        );
      }
    }
  }

  // Check price age and validity
  console.log("\n=== Price Validity Check ===");
  
  try {
    // Check a sample currency (USD)
    const isValid = await PriceOracle.isPriceValid("USD");
    const age = await PriceOracle.getPriceAge("USD");
    
    console.log(`USD price valid: ${isValid ? "✅" : "❌"}`);
    console.log(`USD price age: ${age} seconds`);
    
    if (age > 3600) {
      console.log("⚠️  Warning: Price is stale (older than 1 hour)");
    }
  } catch (error) {
    console.log("Could not check price validity:", error.message);
  }

  // Check contract configuration
  console.log("\n=== Oracle Configuration ===");
  
  try {
    const maxPriceAge = await PriceOracle.MAX_PRICE_AGE();
    const priceDecimals = await PriceOracle.PRICE_DECIMALS();
    
    console.log(`Max price age: ${maxPriceAge} seconds (${maxPriceAge / 60} minutes)`);
    console.log(`Price decimals: ${priceDecimals}`);
  } catch (error) {
    console.log("Could not read configuration:", error.message);
  }

  // Summary
  console.log("\n=== Summary ===");
  const validPrices = [];
  const missingPrices = [];
  
  for (const currency of currencies) {
    try {
      const price = await PriceOracle.getFiatPrice(currency);
      if (price > 0) {
        validPrices.push(currency);
      } else {
        missingPrices.push(currency);
      }
    } catch {
      missingPrices.push(currency);
    }
  }
  
  console.log(`✅ Valid prices: ${validPrices.length}/${currencies.length}`);
  if (validPrices.length > 0) {
    console.log(`   Currencies: ${validPrices.join(", ")}`);
  }
  
  if (missingPrices.length > 0) {
    console.log(`❌ Missing prices: ${missingPrices.length}`);
    console.log(`   Currencies: ${missingPrices.join(", ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });