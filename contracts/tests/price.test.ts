import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Price } from "../target/types/price";
import { Hub } from "../target/types/hub";
import { expect } from "chai";
import {
  getHubConfigPda,
  getHubTreasuryPda,
  getPriceRoutePda,
  getDenomPricePda,
} from "./utils";

describe("price", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const priceProgram = anchor.workspace.Price as Program<Price>;
  const hubProgram = anchor.workspace.Hub as Program<Hub>;

  const admin = provider.wallet as anchor.Wallet;
  const oracle = anchor.web3.Keypair.generate(); // Keypair authorized to update prices
  const nonAdmin = anchor.web3.Keypair.generate();
  const unauthorizedOracle = anchor.web3.Keypair.generate();

  const denom = "USDC";
  const fiatCurrency = "USD";
  const decimals = 6; // Example decimals for USDC/USD price

  let hubConfigPda: anchor.web3.PublicKey;
  let priceRoutePda: anchor.web3.PublicKey;
  let denomPricePda: anchor.web3.PublicKey;
  let priceRouteBump: number;
  let denomPriceBump: number;

  before(async () => {
    // Fund accounts
    await provider.connection.requestAirdrop(oracle.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(nonAdmin.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(unauthorizedOracle.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Derive PDAs
    [hubConfigPda] = getHubConfigPda(hubProgram.programId);
    [priceRoutePda, priceRouteBump] = getPriceRoutePda(denom, fiatCurrency, priceProgram.programId);
    [denomPricePda, denomPriceBump] = getDenomPricePda(denom, fiatCurrency, priceProgram.programId);

    // Ensure Hub is initialized (similar setup as in profile.test.ts)
    try {
        await hubProgram.account.hubConfig.fetch(hubConfigPda);
        console.log("Hub already initialized.");
    } catch (e) {
        console.log("Initializing Hub for Price tests...");
        const [hubTreasuryPda] = getHubTreasuryPda(hubProgram.programId);
        await hubProgram.methods
            .initialize(100, 50)
            .accounts({
                hubConfig: hubConfigPda,
                hubTreasury: hubTreasuryPda,
                admin: admin.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();
        console.log("Hub initialized.");
    }

    // Initialize the Price program itself if needed (e.g., set oracle authority)
    // This depends on your Price program's design. Example:
    /*
    try {
        await priceProgram.account.priceConfig.fetch(somePriceConfigPda);
    } catch (e) {
        await priceProgram.methods.initializePriceProgram(oracle.publicKey)
            .accounts({ ... })
            .rpc();
    }
    */
  });

  it("Registers a price route (Admin only)", async () => {
    await priceProgram.methods
      .registerPriceRoute(denom, fiatCurrency, decimals, oracle.publicKey) // Pass oracle PK
      .accounts({
        priceRoute: priceRoutePda,
        hubConfig: hubConfigPda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const priceRouteAccount = await priceProgram.account.priceRoute.fetch(priceRoutePda);
    expect(priceRouteAccount.denom).to.equal(denom);
    expect(priceRouteAccount.fiatCurrency).to.equal(fiatCurrency);
    expect(priceRouteAccount.decimals).to.equal(decimals);
    expect(priceRouteAccount.authority.equals(oracle.publicKey)).to.be.true; // Check if oracle is set
    expect(priceRouteAccount.bump).to.equal(priceRouteBump);
  });

  it("Fails to register price route (Non-Admin)", async () => {
    const anotherDenom = "SOL";
    const [anotherRoutePda] = getPriceRoutePda(anotherDenom, fiatCurrency, priceProgram.programId);

    try {
      await priceProgram.methods
        .registerPriceRoute(anotherDenom, fiatCurrency, 9, oracle.publicKey)
        .accounts({
          priceRoute: anotherRoutePda,
          hubConfig: hubConfigPda,
          admin: nonAdmin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([nonAdmin])
        .rpc();
      expect.fail("Should have failed to register price route with non-admin");
    } catch (err) {
       expect(err).to.be.instanceOf(anchor.AnchorError);
       // Expecting ConstraintHasOne or similar constraint error on admin check
       expect((err as anchor.AnchorError).error.errorCode.code).to.equal("ConstraintHasOne");
       console.log("Caught expected error: ConstraintHasOne");
    }
  });

  it("Updates prices (Authorized Oracle only)", async () => {
    const price = new anchor.BN(1000000); // e.g., 1 USD = 1.000000 USDC (with 6 decimals)
    const expo = -6; // Standard exponent for price feeds
    const timestamp = new anchor.BN(Date.now() / 1000); // Current timestamp

    // Price update might initialize the DenomPrice account if not already done
    await priceProgram.methods
      .updatePrices(denom, fiatCurrency, price, expo, timestamp)
      .accounts({
        priceRoute: priceRoutePda,      // Route PDA to check authority
        denomPrice: denomPricePda,      // Price data PDA
        authority: oracle.publicKey,    // The authorized oracle from the route
        systemProgram: anchor.web3.SystemProgram.programId, // Needed if initializing DenomPrice
      })
      .signers([oracle]) // Oracle signs
      .rpc();

    const denomPriceAccount = await priceProgram.account.denomPrice.fetch(denomPricePda);
    expect(denomPriceAccount.price.eq(price)).to.be.true;
    expect(denomPriceAccount.expo).to.equal(expo);
    expect(denomPriceAccount.timestamp.gte(timestamp)).to.be.true; // Should be >= timestamp sent
    expect(denomPriceAccount.bump).to.equal(denomPriceBump);
    expect(denomPriceAccount.denom).to.equal(denom);
    expect(denomPriceAccount.fiatCurrency).to.equal(fiatCurrency);

     // Update again with a new price
     const newPrice = new anchor.BN(1050000); // 1.05 USD
     const newTimestamp = new anchor.BN(Date.now() / 1000 + 10);
     await priceProgram.methods
        .updatePrices(denom, fiatCurrency, newPrice, expo, newTimestamp)
        .accounts({ priceRoute: priceRoutePda, denomPrice: denomPricePda, authority: oracle.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
        .signers([oracle])
        .rpc();

     const updatedDenomPriceAccount = await priceProgram.account.denomPrice.fetch(denomPricePda);
     expect(updatedDenomPriceAccount.price.eq(newPrice)).to.be.true;
     expect(updatedDenomPriceAccount.timestamp.gte(newTimestamp)).to.be.true;
  });

  it("Fails to update prices (Unauthorized Oracle)", async () => {
    const price = new anchor.BN(950000); // 0.95 USD
    const expo = -6;
    const timestamp = new anchor.BN(Date.now() / 1000);

    try {
      await priceProgram.methods
        .updatePrices(denom, fiatCurrency, price, expo, timestamp)
        .accounts({
          priceRoute: priceRoutePda,
          denomPrice: denomPricePda,
          authority: unauthorizedOracle.publicKey, // Unauthorized key signing
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([unauthorizedOracle]) // Unauthorized oracle signs
        .rpc();
      expect.fail("Should have failed to update prices with unauthorized oracle");
    } catch (err) {
      expect(err).to.be.instanceOf(anchor.AnchorError);
      // Expecting ConstraintSigner or ConstraintRaw based on how authority is checked
      // against priceRouteAccount.authority
      const errorCode = (err as anchor.AnchorError).error.errorCode.code;
      expect(["ConstraintSigner", "ConstraintRaw", "ConstraintSeeds"]).to.include(errorCode); // Adjust based on error
      console.log(`Caught expected error: ${errorCode}`);
    }

    // Verify price was not updated
    const denomPriceAccount = await priceProgram.account.denomPrice.fetch(denomPricePda);
    const lastGoodPrice = new anchor.BN(1050000); // Price from previous successful update
    expect(denomPriceAccount.price.eq(lastGoodPrice)).to.be.true;
  });

  it("Fetches price via RPC", async () => {
    // This simulates how a client would fetch the latest price
    const denomPriceAccount = await priceProgram.account.denomPrice.fetch(denomPricePda);
    const expectedPrice = new anchor.BN(1050000);
    expect(denomPriceAccount.price.eq(expectedPrice)).to.be.true;
    expect(denomPriceAccount.denom).to.equal(denom);
    expect(denomPriceAccount.fiatCurrency).to.equal(fiatCurrency);
    console.log(
      `Fetched price for ${denom}/${fiatCurrency}: ${denomPriceAccount.price.toString()}e${denomPriceAccount.expo} at ${new Date(denomPriceAccount.timestamp.toNumber() * 1000).toISOString()}`
    );
  });

  // Add tests for multi-hop routes or different oracle setups if applicable

}); 