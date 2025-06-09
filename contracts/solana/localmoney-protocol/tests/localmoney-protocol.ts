import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";

// Import individual test suites
import "./hub.test";
import "./profile.test";

describe("LocalMoney Protocol - Integration Tests", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  // These are placeholder tests - individual tests are imported above
  it("Should compile and load all programs", async () => {
    const hubProgram = anchor.workspace.Hub;
    const offerProgram = anchor.workspace.Offer;
    const tradeProgram = anchor.workspace.Trade;
    const profileProgram = anchor.workspace.Profile;
    const priceProgram = anchor.workspace.Price;

    // Verify all programs are loaded
    console.log("Hub Program ID:", hubProgram.programId.toString());
    console.log("Offer Program ID:", offerProgram.programId.toString());
    console.log("Trade Program ID:", tradeProgram.programId.toString());
    console.log("Profile Program ID:", profileProgram.programId.toString());
    console.log("Price Program ID:", priceProgram.programId.toString());
  });
});
