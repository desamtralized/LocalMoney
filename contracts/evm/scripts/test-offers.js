const { ethers } = require("hardhat");

async function main() {
  console.log("=== Testing EVM Offer Querying ===\n");

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log("Using signer:", signer.address);

  // Get the deployed contract addresses
  const deploymentInfo = require("../deployment-bsc-mainnet-zerofees-complete-1756410072283.json");
  const offerAddress = deploymentInfo.contracts.Offer;
  const hubAddress = deploymentInfo.contracts.Hub;
  
  console.log("Offer Contract:", offerAddress);
  console.log("Hub Contract:", hubAddress);
  console.log();

  // Get the Offer contract with signer
  const offer = await ethers.getContractAt("Offer", offerAddress, signer);

  try {
    // Test 1: Get all active offer IDs
    console.log("Test 1: Getting all active offer IDs...");
    const activeOfferIds = await offer.getAllActiveOffers();
    console.log("Active Offer IDs:", activeOfferIds.map(id => id.toString()));
    console.log("Total active offers:", activeOfferIds.length);
    console.log();

    // Test 2: Get details for each offer
    if (activeOfferIds.length > 0) {
      console.log("Test 2: Getting details for each offer...");
      
      for (const offerId of activeOfferIds) {
        console.log(`\n--- Offer #${offerId} ---`);
        
        try {
          const offerData = await offer.getOffer(offerId);
          
          // Log the raw data
          console.log("Raw offer data:", offerData);
          
          // Log formatted data
          console.log("Formatted data:");
          console.log("  ID:", offerData.id?.toString());
          console.log("  Owner:", offerData.owner);
          console.log("  Offer Type:", offerData.offerType, "(0=Buy, 1=Sell)");
          console.log("  State:", offerData.state, "(0=Active, 1=Paused, 2=Archived)");
          console.log("  Fiat Currency:", offerData.fiatCurrency);
          console.log("  Token Address:", offerData.tokenAddress);
          console.log("  Min Amount:", ethers.utils.formatEther(offerData.minAmount));
          console.log("  Max Amount:", ethers.utils.formatEther(offerData.maxAmount));
          console.log("  Rate:", offerData.rate?.toString());
          console.log("  Description:", offerData.description);
          console.log("  Created At:", new Date(offerData.createdAt * 1000).toISOString());
          console.log("  Updated At:", new Date(offerData.updatedAt * 1000).toISOString());
        } catch (error) {
          console.error(`Error fetching offer ${offerId}:`, error.message);
        }
      }
    }

    // Test 3: Test getOffersByOwner for the first offer's owner
    if (activeOfferIds.length > 0) {
      console.log("\n\nTest 3: Testing getOffersByOwner...");
      const firstOffer = await offer.getOffer(activeOfferIds[0]);
      const ownerAddress = firstOffer.owner;
      console.log("Testing with owner:", ownerAddress);
      
      const ownerOfferIds = await offer.getOffersByOwner(ownerAddress);
      console.log("Owner's offer IDs:", ownerOfferIds.map(id => id.toString()));
      console.log("Total offers by this owner:", ownerOfferIds.length);
    }

    // Test 4: Check the offer struct layout
    console.log("\n\nTest 4: Checking contract ABI...");
    const abi = offer.interface;
    const getOfferFunction = abi.getFunction("getOffer");
    console.log("getOffer outputs:", JSON.stringify(getOfferFunction.outputs, null, 2));

    // Test 5: Test with raw call to understand the actual return structure
    console.log("\n\nTest 5: Raw contract call test...");
    if (activeOfferIds.length > 0) {
      const [signer] = await ethers.getSigners();
      const provider = signer.provider;
      
      // Encode the function call
      const iface = new ethers.utils.Interface([
        "function getOffer(uint256 _offerId) external view returns (tuple(uint256 id, address owner, uint8 offerType, uint8 state, string fiatCurrency, address tokenAddress, uint256 minAmount, uint256 maxAmount, uint256 rate, string description, uint256 createdAt, uint256 updatedAt))"
      ]);
      
      const data = iface.encodeFunctionData("getOffer", [activeOfferIds[0]]);
      
      // Make the call
      const result = await provider.call({
        to: offerAddress,
        data: data
      });
      
      console.log("Raw call result:", result);
      
      // Decode the result
      const decoded = iface.decodeFunctionResult("getOffer", result);
      console.log("Decoded result:", decoded);
      console.log("Decoded offer object:", decoded[0]);
    }

    // Test 6: Check offer state by querying different states
    console.log("\n\nTest 6: Checking offers by state...");
    const hub = await ethers.getContractAt("Hub", hubAddress, signer);
    
    // Get stats from hub
    const stats = await hub.getProtocolStats();
    console.log("Protocol Stats:");
    console.log("  Total Offers:", stats.totalOffers?.toString());
    console.log("  Active Offers:", stats.activeOffers?.toString());
    console.log("  Total Trades:", stats.totalTrades?.toString());
    console.log("  Successful Trades:", stats.successfulTrades?.toString());

  } catch (error) {
    console.error("Error:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });