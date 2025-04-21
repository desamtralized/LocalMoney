import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Trade } from "../target/types/trade";
import { Offer } from "../target/types/offer";
import { Profile } from "../target/types/profile";
import { Price } from "../target/types/price";
import { Hub } from "../target/types/hub";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import {
  getHubConfigPda,
  getHubTreasuryPda,
  getProfilePda,
  getPriceRoutePda,
  getDenomPricePda,
  getOfferPda,
  getTradePda,
  getEscrowPda,
  createTestMint,
  getOrCreateAssociatedTokenAccount,
  mintTokensToATA,
  getTokenBalance,
  getProgramAuthorityPda
} from "./utils";

// Mirror TradeState enum
const TradeState = {
  RequestCreated: { requestCreated: {} },
  RequestAccepted: { requestAccepted: {} },
  EscrowFunded: { escrowFunded: {} },
  FiatDeposited: { fiatDeposited: {} },
  EscrowReleased: { escrowReleased: {} },
  EscrowCancelled: { escrowCancelled: {} }, // If cancellation moves to specific state
  EscrowRefunded: { escrowRefunded: {} },
  EscrowDisputed: { escrowDisputed: {} },
  EscrowSettled: { escrowSettled: {} },
};

describe("trade", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Programs
  const tradeProgram = anchor.workspace.Trade as Program<Trade>;
  const offerProgram = anchor.workspace.Offer as Program<Offer>;
  const profileProgram = anchor.workspace.Profile as Program<Profile>;
  const priceProgram = anchor.workspace.Price as Program<Price>;
  const hubProgram = anchor.workspace.Hub as Program<Hub>;
  const tokenProgram = TOKEN_PROGRAM_ID;
  const associatedTokenProgram = ASSOCIATED_TOKEN_PROGRAM_ID;

  // Keypairs
  const admin = provider.wallet as anchor.Wallet;
  const maker = anchor.web3.Keypair.generate(); // Offer creator / Seller
  const taker = anchor.web3.Keypair.generate(); // Offer taker / Buyer
  const oracle = anchor.web3.Keypair.generate(); // Price oracle
  const arbitrator = anchor.web3.Keypair.generate(); // For disputes (can be admin or separate)

  // Test Constants
  const offerId = "tradeTestOffer001";
  const denom = "USDC";
  const fiatCurrency = "USD";
  const decimals = 6;
  const offerAmount = new anchor.BN(500 * 10 ** decimals); // 500 USDC
  const pricePremiumBps = 25; // 0.25%
  const paymentMethod = "Bank Transfer";
  const paymentDetails = "Bank AC Details";
  const makerContact = "telegram:@tradeMaker";
  const takerContact = "signal:@tradeTaker";
  const takerBio = "First time buyer";

  // PDAs & Accounts
  let hubConfigPda: anchor.web3.PublicKey;
  let priceRoutePda: anchor.web3.PublicKey;
  let denomPricePda: anchor.web3.PublicKey;
  let makerProfilePda: anchor.web3.PublicKey;
  let takerProfilePda: anchor.web3.PublicKey;
  let offerPda: anchor.web3.PublicKey;
  let tradePda: anchor.web3.PublicKey;
  let escrowPda: anchor.web3.PublicKey;
  let mintPubkey: anchor.web3.PublicKey;
  let makerAta: anchor.web3.PublicKey;
  let takerAta: anchor.web3.PublicKey;
  let escrowAta: anchor.web3.PublicKey; // Escrow's token account
  let tradeProgramAuthorityPda: anchor.web3.PublicKey;

  // Bumps
  let tradeBump: number;
  let escrowBump: number;

  // Mint authority (using admin wallet for tests)
  const mintAuthority = admin.payer;

  before(async () => {
    console.log("--- Trade Test Setup Starting ---");
    // Fund accounts
    await provider.connection.requestAirdrop(maker.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(taker.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(oracle.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(arbitrator.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Longer delay for multiple airdrops
    console.log("Accounts funded.");

    // Derive PDAs
    [hubConfigPda] = getHubConfigPda(hubProgram.programId);
    [priceRoutePda] = getPriceRoutePda(denom, fiatCurrency, priceProgram.programId);
    [denomPricePda] = getDenomPricePda(denom, fiatCurrency, priceProgram.programId);
    [makerProfilePda] = getProfilePda(maker.publicKey, profileProgram.programId);
    [takerProfilePda] = getProfilePda(taker.publicKey, profileProgram.programId);
    [offerPda] = getOfferPda(maker.publicKey, offerId, offerProgram.programId);
    [tradePda, tradeBump] = getTradePda(offerPda, taker.publicKey, tradeProgram.programId);
    [escrowPda, escrowBump] = getEscrowPda(tradePda, tradeProgram.programId);
    [tradeProgramAuthorityPda] = getProgramAuthorityPda(tradeProgram.programId);
    console.log("PDAs derived.");

    // --- Prerequisites Setup (Hub, Price, Profiles, Offer) ---
    // This mirrors setup from previous tests, ensuring dependencies exist
    // Initialize Hub
    try { await hubProgram.account.hubConfig.fetch(hubConfigPda); } catch (e) {
        console.log("Initializing Hub...");
        const [hubTreasuryPda] = getHubTreasuryPda(hubProgram.programId);
        await hubProgram.methods.initialize(100, 50).accounts({ hubConfig: hubConfigPda, hubTreasury: hubTreasuryPda, admin: admin.publicKey, systemProgram: anchor.web3.SystemProgram.programId }).rpc();
    }
    // Initialize Price Route & Price
    try { await priceProgram.account.denomPrice.fetch(denomPricePda); } catch (e) {
        console.log("Initializing Price...");
        await priceProgram.methods.registerPriceRoute(denom, fiatCurrency, decimals, oracle.publicKey).accounts({ priceRoute: priceRoutePda, hubConfig: hubConfigPda, admin: admin.publicKey, systemProgram: anchor.web3.SystemProgram.programId }).rpc();
        const priceVal = new anchor.BN(1000000); const expo = -6; const ts = new anchor.BN(Date.now() / 1000);
        await priceProgram.methods.updatePrices(denom, fiatCurrency, priceVal, expo, ts).accounts({ priceRoute: priceRoutePda, denomPrice: denomPricePda, authority: oracle.publicKey, systemProgram: anchor.web3.SystemProgram.programId }).signers([oracle]).rpc();
    }
    // Initialize Maker Profile
    try { await profileProgram.account.profile.fetch(makerProfilePda); } catch(e) {
        console.log("Initializing Maker Profile...");
        await profileProgram.methods.updateProfile(makerContact, "Maker Bio").accounts({ profile: makerProfilePda, owner: maker.publicKey, hubConfig: hubConfigPda, systemProgram: anchor.web3.SystemProgram.programId }).signers([maker]).rpc();
    }
    // Initialize Taker Profile
    try { await profileProgram.account.profile.fetch(takerProfilePda); } catch(e) {
        console.log("Initializing Taker Profile...");
        await profileProgram.methods.updateProfile(takerContact, takerBio).accounts({ profile: takerProfilePda, owner: taker.publicKey, hubConfig: hubConfigPda, systemProgram: anchor.web3.SystemProgram.programId }).signers([taker]).rpc();
    }
     // Create the Offer
    try { await offerProgram.account.offer.fetch(offerPda); } catch(e) {
        console.log("Creating Offer...");
        await offerProgram.methods.createOffer(offerId, denom, fiatCurrency, offerAmount, pricePremiumBps, paymentMethod, paymentDetails).accounts({ offer: offerPda, maker: maker.publicKey, makerProfile: makerProfilePda, denomPrice: denomPricePda, hubConfig: hubConfigPda, systemProgram: anchor.web3.SystemProgram.programId }).signers([maker]).rpc();
    }
    console.log("Dependency Programs Initialized.");

    // --- Token Setup ---
    console.log("Setting up SPL Token Mint and ATAs...");
    mintPubkey = await createTestMint(provider, mintAuthority.publicKey, decimals);
    console.log(`Mint created: ${mintPubkey.toBase58()}`);

    // Get/Create ATAs
    makerAta = getOrCreateAssociatedTokenAccount(mintPubkey, maker.publicKey);
    takerAta = getOrCreateAssociatedTokenAccount(mintPubkey, taker.publicKey);
    escrowAta = getOrCreateAssociatedTokenAccount(mintPubkey, escrowPda, true); // Escrow PDA is owner
    console.log(`Maker ATA: ${makerAta.toBase58()}`);
    console.log(`Taker ATA: ${takerAta.toBase58()}`);
    console.log(`Escrow ATA: ${escrowAta.toBase58()}`);

    // Mint initial tokens to Taker (enough to cover the trade)
    const takerInitialAmount = offerAmount.mul(new anchor.BN(2)); // Mint double the offer amount
    await mintTokensToATA(provider, mintPubkey, takerAta, mintAuthority, BigInt(takerInitialAmount.toString()));
    const takerBalance = await getTokenBalance(provider, takerAta);
    console.log(`Minted ${takerInitialAmount} to Taker. New balance: ${takerBalance}`);
    expect(takerBalance).to.equal(BigInt(takerInitialAmount.toString()));

    console.log("--- Trade Test Setup Complete ---");
  });

  it("Creates a trade request and updates profiles via CPI", async () => {
    const takerAmount = offerAmount; // Taker wants full amount

    // Fetch initial profile states for assertion later
    const initialMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
    const initialTakerProfile = await profileProgram.account.profile.fetch(takerProfilePda);

    await tradeProgram.methods
      .createTrade(takerAmount)
      .accounts({
        trade: tradePda,
        offer: offerPda,
        maker: maker.publicKey, // Offer maker's pubkey
        taker: taker.publicKey, // Trade initiator's pubkey
        makerProfile: makerProfilePda,
        takerProfile: takerProfilePda,
        denomPrice: denomPricePda,
        hubConfig: hubConfigPda,
        systemProgram: anchor.web3.SystemProgram.programId,
        // --- CPI Accounts for Profile ---
        profileProgram: profileProgram.programId,
        // Authority PDA for the Trade program
        profileAuthority: tradeProgramAuthorityPda,
        // Profile owners are implicitly checked via maker/taker fields usually
        // but pass them if Profile program requires them explicitly for PDA checks
        makerOwnerForCpi: maker.publicKey,
        takerOwnerForCpi: taker.publicKey,
      })
      .signers([taker]) // Taker signs to create the trade request
      .rpc();

    // Assert trade account state
    const tradeAccount = await tradeProgram.account.trade.fetch(tradePda);
    expect(tradeAccount.offer.equals(offerPda)).to.be.true;
    expect(tradeAccount.maker.equals(maker.publicKey)).to.be.true;
    expect(tradeAccount.taker.equals(taker.publicKey)).to.be.true;
    expect(tradeAccount.amountRequested.eq(takerAmount)).to.be.true;
    expect(JSON.stringify(tradeAccount.state)).to.equal(JSON.stringify(TradeState.RequestCreated));
    expect(tradeAccount.bump).to.equal(tradeBump);

    // Assert CPI calls to Profile program
    const finalMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
    const finalTakerProfile = await profileProgram.account.profile.fetch(takerProfilePda);

    expect(finalMakerProfile.tradesStarted).to.equal(initialMakerProfile.tradesStarted + 1, "Maker tradesStarted should increment");
    expect(finalTakerProfile.tradesStarted).to.equal(initialTakerProfile.tradesStarted + 1, "Taker tradesStarted should increment");
    // Completed counts should be unchanged
    expect(finalMakerProfile.tradesCompleted).to.equal(initialMakerProfile.tradesCompleted, "Maker tradesCompleted unchanged");
    expect(finalTakerProfile.tradesCompleted).to.equal(initialTakerProfile.tradesCompleted, "Taker tradesCompleted unchanged");
  });

  it("Accepts a trade request (Maker only)", async () => {
    // No profile count updates expected here according to many flows
    // (started count already incremented in create_trade). Re-verify if your program logic differs.
    const initialMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
    const initialTakerProfile = await profileProgram.account.profile.fetch(takerProfilePda);

    await tradeProgram.methods
      .acceptRequest()
      .accounts({
        trade: tradePda,
        offer: offerPda, // Offer is likely needed for validation
        maker: maker.publicKey, // Maker must sign to accept
        taker: taker.publicKey,
        makerProfile: makerProfilePda, // Profiles might be needed for constraints/checks
        takerProfile: takerProfilePda,
        // No CPI accounts needed if accept_request doesn't call Profile
      })
      .signers([maker])
      .rpc();

    const tradeAccount = await tradeProgram.account.trade.fetch(tradePda);
    expect(JSON.stringify(tradeAccount.state)).to.equal(JSON.stringify(TradeState.RequestAccepted));

    // Verify profile counts haven't changed (assuming accept doesn't trigger CPI)
    const finalMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
    const finalTakerProfile = await profileProgram.account.profile.fetch(takerProfilePda);
    expect(finalMakerProfile.tradesStarted).to.equal(initialMakerProfile.tradesStarted, "Maker tradesStarted unchanged on accept");
    expect(finalTakerProfile.tradesStarted).to.equal(initialTakerProfile.tradesStarted, "Taker tradesStarted unchanged on accept");
  });

  it("Fails to accept trade request (Non-Maker)", async () => {
    try {
      await tradeProgram.methods
        .acceptRequest()
        .accounts({
          trade: tradePda,
          offer: offerPda,
          maker: taker.publicKey, // WRONG signer
          taker: taker.publicKey,
          makerProfile: makerProfilePda,
          takerProfile: takerProfilePda,
        })
        .signers([taker]) // Signed by Taker, not Maker
        .rpc();
      expect.fail("Should have failed accept request with non-maker signature");
    } catch (err) {
      expect(err).to.be.instanceOf(anchor.AnchorError);
      const errorCode = (err as anchor.AnchorError).error.errorCode.code;
      // Check for ConstraintSigner, ConstraintHasOne, MakerMismatch or similar
      expect(["ConstraintSigner", "ConstraintHasOne", "MakerMismatch"]).to.include(errorCode);
      console.log(`Caught expected error accepting trade as non-maker: ${errorCode}`);
    }
  });

  it("Funds escrow (Taker only)", async () => {
    const tradeAccountBefore = await tradeProgram.account.trade.fetch(tradePda);
    const amountToFund = tradeAccountBefore.amountRequested; // Taker funds the requested amount

    const takerBalanceBefore = await getTokenBalance(provider, takerAta);
    const escrowBalanceBefore = await getTokenBalance(provider, escrowAta);

    // Fetch initial profile states if fund_escrow triggers CPI
    const initialMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
    const initialTakerProfile = await profileProgram.account.profile.fetch(takerProfilePda);

    await tradeProgram.methods
      .fundEscrow()
      .accounts({
        trade: tradePda,
        escrow: escrowPda, // Escrow state account
        taker: taker.publicKey, // Taker must sign to fund
        maker: maker.publicKey, // Required for account validation/context
        takerAta: takerAta, // Taker's token account (source)
        escrowAta: escrowAta, // Escrow's token account (destination)
        mint: mintPubkey,
        tokenProgram: tokenProgram,
        // CPI Accounts (if fund_escrow updates profile counts)
        profileProgram: profileProgram.programId,
        profileAuthority: tradeProgramAuthorityPda,
        makerProfile: makerProfilePda,
        takerProfile: takerProfilePda,
        hubConfig: hubConfigPda,
        makerOwnerForCpi: maker.publicKey,
        takerOwnerForCpi: taker.publicKey,
      })
      .signers([taker])
      .rpc();

    // Assert token balances
    const takerBalanceAfter = await getTokenBalance(provider, takerAta);
    const escrowBalanceAfter = await getTokenBalance(provider, escrowAta);
    expect(takerBalanceAfter).to.equal(takerBalanceBefore - BigInt(amountToFund.toString()), "Taker balance incorrect");
    expect(escrowBalanceAfter).to.equal(escrowBalanceBefore + BigInt(amountToFund.toString()), "Escrow balance incorrect");

    // Assert trade state
    const tradeAccountAfter = await tradeProgram.account.trade.fetch(tradePda);
    expect(JSON.stringify(tradeAccountAfter.state)).to.equal(JSON.stringify(TradeState.EscrowFunded));

    // Assert profile CPI calls (if any)
    // Example: Assuming fund_escrow doesn't change counts
    const finalMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
    const finalTakerProfile = await profileProgram.account.profile.fetch(takerProfilePda);
    expect(finalMakerProfile.tradesStarted).to.equal(initialMakerProfile.tradesStarted, "Maker tradesStarted unchanged on fund");
    expect(finalTakerProfile.tradesStarted).to.equal(initialTakerProfile.tradesStarted, "Taker tradesStarted unchanged on fund");
    // Add checks for other counts if fund_escrow updates them
  });

   it("Fails to fund escrow (Non-Taker)", async () => {
        const tradeAccountBefore = await tradeProgram.account.trade.fetch(tradePda);
        const amountToFund = tradeAccountBefore.amountRequested;

        try {
            await tradeProgram.methods
            .fundEscrow()
            .accounts({
                trade: tradePda,
                escrow: escrowPda,
                taker: maker.publicKey, // WRONG signer (Maker trying to fund)
                maker: maker.publicKey,
                takerAta: makerAta, // Using Maker's ATA as source (incorrect logic, but tests signer constraint)
                escrowAta: escrowAta,
                mint: mintPubkey,
                tokenProgram: tokenProgram,
                profileProgram: profileProgram.programId,
                profileAuthority: tradeProgramAuthorityPda,
                makerProfile: makerProfilePda,
                takerProfile: takerProfilePda,
                hubConfig: hubConfigPda,
                makerOwnerForCpi: maker.publicKey,
                takerOwnerForCpi: taker.publicKey,
            })
            .signers([maker]) // Signed by Maker
            .rpc();
            expect.fail("Should have failed fund escrow with non-taker signature");
        } catch (err) {
            expect(err).to.be.instanceOf(anchor.AnchorError);
            const errorCode = (err as anchor.AnchorError).error.errorCode.code;
            expect(["ConstraintSigner", "ConstraintHasOne", "TakerMismatch"]).to.include(errorCode);
            console.log(`Caught expected error funding escrow as non-taker: ${errorCode}`);
        }
    });

  it("Confirms fiat deposited (Taker only)", async () => {
    // Fetch profile states only if fiat_deposited triggers CPI
    const initialMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
    const initialTakerProfile = await profileProgram.account.profile.fetch(takerProfilePda);

    await tradeProgram.methods
      .fiatDeposited()
      .accounts({
        trade: tradePda,
        taker: taker.publicKey, // Taker confirms sending fiat
        maker: maker.publicKey, // Required for context/validation
         // CPI Accounts (if fiat_deposited updates profile counts)
        profileProgram: profileProgram.programId,
        profileAuthority: tradeProgramAuthorityPda,
        makerProfile: makerProfilePda,
        takerProfile: takerProfilePda,
        hubConfig: hubConfigPda,
        makerOwnerForCpi: maker.publicKey,
        takerOwnerForCpi: taker.publicKey,
      })
      .signers([taker])
      .rpc();

    // Assert trade state
    const tradeAccount = await tradeProgram.account.trade.fetch(tradePda);
    expect(JSON.stringify(tradeAccount.state)).to.equal(JSON.stringify(TradeState.FiatDeposited));

    // Assert profile CPI calls (if any)
    // Assuming fiat_deposited doesn't change counts
    const finalMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
    const finalTakerProfile = await profileProgram.account.profile.fetch(takerProfilePda);
    expect(finalMakerProfile.tradesStarted).to.equal(initialMakerProfile.tradesStarted, "Maker counts unchanged on fiat");
    expect(finalTakerProfile.tradesStarted).to.equal(initialTakerProfile.tradesStarted, "Taker counts unchanged on fiat");
  });

   it("Fails to confirm fiat deposited (Non-Taker)", async () => {
       try {
            await tradeProgram.methods
            .fiatDeposited()
            .accounts({
                trade: tradePda,
                taker: maker.publicKey, // WRONG signer (Maker confirming)
                maker: maker.publicKey,
                profileProgram: profileProgram.programId,
                profileAuthority: tradeProgramAuthorityPda,
                makerProfile: makerProfilePda,
                takerProfile: takerProfilePda,
                hubConfig: hubConfigPda,
                makerOwnerForCpi: maker.publicKey,
                takerOwnerForCpi: taker.publicKey,
            })
            .signers([maker]) // Signed by Maker
            .rpc();
            expect.fail("Should have failed fiat deposited with non-taker signature");
        } catch (err) {
            expect(err).to.be.instanceOf(anchor.AnchorError);
            const errorCode = (err as anchor.AnchorError).error.errorCode.code;
            expect(["ConstraintSigner", "ConstraintHasOne", "TakerMismatch"]).to.include(errorCode);
            console.log(`Caught expected error confirming fiat as non-taker: ${errorCode}`);
        }
    });

  it("Releases escrow (Maker only) and updates profiles via CPI", async () => {
    const tradeAccountBefore = await tradeProgram.account.trade.fetch(tradePda);
    const amountToRelease = tradeAccountBefore.amountRequested;

    const takerBalanceBefore = await getTokenBalance(provider, takerAta);
    const escrowBalanceBefore = await getTokenBalance(provider, escrowAta);
    expect(escrowBalanceBefore).to.equal(BigInt(amountToRelease.toString()), "Escrow balance should match trade amount before release");

    // Fetch initial profile states for assertion later
    const initialMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
    const initialTakerProfile = await profileProgram.account.profile.fetch(takerProfilePda);

    await tradeProgram.methods
      .releaseEscrow()
      .accounts({
        trade: tradePda,
        escrow: escrowPda,
        maker: maker.publicKey, // Maker must sign to release
        taker: taker.publicKey,
        takerAta: takerAta, // Taker's token account (destination)
        escrowAta: escrowAta, // Escrow's token account (source)
        mint: mintPubkey,
        tokenProgram: tokenProgram,
        // CPI Accounts for Profile update (tradesCompleted)
        profileProgram: profileProgram.programId,
        profileAuthority: tradeProgramAuthorityPda,
        makerProfile: makerProfilePda,
        takerProfile: takerProfilePda,
        hubConfig: hubConfigPda,
        makerOwnerForCpi: maker.publicKey,
        takerOwnerForCpi: taker.publicKey,
      })
      .signers([maker])
      .rpc();

    // Assert token balances
    const takerBalanceAfter = await getTokenBalance(provider, takerAta);
    const escrowBalanceAfter = await getTokenBalance(provider, escrowAta);
    expect(takerBalanceAfter).to.equal(takerBalanceBefore + BigInt(amountToRelease.toString()), "Taker balance incorrect after release");
    expect(escrowBalanceAfter).to.equal(escrowBalanceBefore - BigInt(amountToRelease.toString()), "Escrow balance incorrect after release");
    expect(escrowBalanceAfter).to.equal(BigInt(0), "Escrow balance should be zero after release");

    // Assert trade state
    const tradeAccountAfter = await tradeProgram.account.trade.fetch(tradePda);
    expect(JSON.stringify(tradeAccountAfter.state)).to.equal(JSON.stringify(TradeState.EscrowReleased));

    // Assert profile CPI calls (tradesCompleted incremented)
    const finalMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
    const finalTakerProfile = await profileProgram.account.profile.fetch(takerProfilePda);
    expect(finalMakerProfile.tradesCompleted).to.equal(initialMakerProfile.tradesCompleted + 1, "Maker tradesCompleted should increment");
    expect(finalTakerProfile.tradesCompleted).to.equal(initialTakerProfile.tradesCompleted + 1, "Taker tradesCompleted should increment");
    // tradesStarted should remain unchanged from the create step
    expect(finalMakerProfile.tradesStarted).to.equal(initialMakerProfile.tradesStarted, "Maker tradesStarted unchanged on release");
    expect(finalTakerProfile.tradesStarted).to.equal(initialTakerProfile.tradesStarted, "Taker tradesStarted unchanged on release");
  });

  it("Fails to release escrow (Non-Maker)", async () => {
      const tradeAccountBefore = await tradeProgram.account.trade.fetch(tradePda);
      const amountToRelease = tradeAccountBefore.amountRequested;

        try {
            await tradeProgram.methods
            .releaseEscrow()
            .accounts({
                trade: tradePda,
                escrow: escrowPda,
                maker: taker.publicKey, // WRONG signer (Taker trying to release)
                taker: taker.publicKey,
                takerAta: takerAta,
                escrowAta: escrowAta,
                mint: mintPubkey,
                tokenProgram: tokenProgram,
                 // CPI Accounts
                profileProgram: profileProgram.programId,
                profileAuthority: tradeProgramAuthorityPda,
                makerProfile: makerProfilePda,
                takerProfile: takerProfilePda,
                hubConfig: hubConfigPda,
                makerOwnerForCpi: maker.publicKey,
                takerOwnerForCpi: taker.publicKey,
            })
            .signers([taker]) // Signed by Taker
            .rpc();
            expect.fail("Should have failed release escrow with non-maker signature");
        } catch (err) {
            expect(err).to.be.instanceOf(anchor.AnchorError);
            const errorCode = (err as anchor.AnchorError).error.errorCode.code;
            expect(["ConstraintSigner", "ConstraintHasOne", "MakerMismatch"]).to.include(errorCode);
            console.log(`Caught expected error releasing escrow as non-maker: ${errorCode}`);
        }

        // Verify escrow balance unchanged
        const escrowBalance = await getTokenBalance(provider, escrowAta);
        expect(escrowBalance).to.equal(BigInt(0), "Escrow balance should still be zero after failed release attempt"); // Was already 0 from successful release
    });

  // --- Dispute Path Tests --- //

  describe("Dispute Path", () => {
    const disputeOfferId = "disputeOffer002";
    const disputeTaker = anchor.web3.Keypair.generate(); // New taker for this path
    let disputeOfferPda: anchor.web3.PublicKey;
    let disputeTradePda: anchor.web3.PublicKey;
    let disputeTradeBump: number;
    let disputeEscrowPda: anchor.web3.PublicKey;
    let disputeEscrowBump: number;
    let disputeTakerProfilePda: anchor.web3.PublicKey;
    let disputeTakerAta: anchor.web3.PublicKey;
    let disputeEscrowAta: anchor.web3.PublicKey;
    let offerProgramAuthorityPda: anchor.web3.PublicKey;

    before(async () => {
      console.log("--- Dispute Path Setup Starting ---");
      // Fund new taker
      await provider.connection.requestAirdrop(disputeTaker.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Derive PDAs for dispute path
      [disputeOfferPda] = getOfferPda(maker.publicKey, disputeOfferId, offerProgram.programId);
      [disputeTakerProfilePda] = getProfilePda(disputeTaker.publicKey, profileProgram.programId);
      [disputeTradePda, disputeTradeBump] = getTradePda(disputeOfferPda, disputeTaker.publicKey, tradeProgram.programId);
      [disputeEscrowPda, disputeEscrowBump] = getEscrowPda(disputeTradePda, tradeProgram.programId);
      disputeTakerAta = getOrCreateAssociatedTokenAccount(mintPubkey, disputeTaker.publicKey);
      disputeEscrowAta = getOrCreateAssociatedTokenAccount(mintPubkey, disputeEscrowPda, true);
      [offerProgramAuthorityPda] = getProgramAuthorityPda(offerProgram.programId);

      console.log("Dispute path PDAs derived.");
      // Initialize Taker Profile
      try { await profileProgram.account.profile.fetch(disputeTakerProfilePda); } catch(e) {
        console.log("Initializing Dispute Taker Profile...");
        await profileProgram.methods.updateProfile("dispute@taker", "Dispute path taker").accounts({ profile: disputeTakerProfilePda, owner: disputeTaker.publicKey, hubConfig: hubConfigPda, systemProgram: anchor.web3.SystemProgram.programId }).signers([disputeTaker]).rpc();
      }
      // Create Offer
      try { await offerProgram.account.offer.fetch(disputeOfferPda); } catch(e) {
        console.log("Creating Dispute Offer...");
         await offerProgram.methods.createOffer(disputeOfferId, denom, fiatCurrency, offerAmount, pricePremiumBps, "DisputePay", "DisputeDetails").accounts({ offer: disputeOfferPda, maker: maker.publicKey, makerProfile: makerProfilePda, denomPrice: denomPricePda, hubConfig: hubConfigPda, systemProgram: anchor.web3.SystemProgram.programId, profileProgram: profileProgram.programId, profileAuthority: offerProgramAuthorityPda, profileOwnerForCpi: maker.publicKey }).signers([maker]).rpc(); // Added CPI accounts
      }
       // Mint funds to new taker
       const disputeTakerInitialAmount = offerAmount.mul(new anchor.BN(2));
       await mintTokensToATA(provider, mintPubkey, disputeTakerAta, mintAuthority, BigInt(disputeTakerInitialAmount.toString()));
       console.log("Dispute Taker funded.");

       // Create Trade
      await tradeProgram.methods.createTrade(offerAmount).accounts({ trade: disputeTradePda, offer: disputeOfferPda, maker: maker.publicKey, taker: disputeTaker.publicKey, makerProfile: makerProfilePda, takerProfile: disputeTakerProfilePda, denomPrice: denomPricePda, hubConfig: hubConfigPda, systemProgram: anchor.web3.SystemProgram.programId, profileProgram: profileProgram.programId, profileAuthority: tradeProgramAuthorityPda, makerOwnerForCpi: maker.publicKey, takerOwnerForCpi: disputeTaker.publicKey }).signers([disputeTaker]).rpc();
      // Accept Trade
      await tradeProgram.methods.acceptRequest().accounts({ trade: disputeTradePda, offer: disputeOfferPda, maker: maker.publicKey, taker: disputeTaker.publicKey, makerProfile: makerProfilePda, takerProfile: disputeTakerProfilePda }).signers([maker]).rpc();
      // Fund Escrow
      await tradeProgram.methods.fundEscrow().accounts({ trade: disputeTradePda, escrow: disputeEscrowPda, taker: disputeTaker.publicKey, maker: maker.publicKey, takerAta: disputeTakerAta, escrowAta: disputeEscrowAta, mint: mintPubkey, tokenProgram: tokenProgram, profileProgram: profileProgram.programId, profileAuthority: tradeProgramAuthorityPda, makerProfile: makerProfilePda, takerProfile: disputeTakerProfilePda, hubConfig: hubConfigPda, makerOwnerForCpi: maker.publicKey, takerOwnerForCpi: disputeTaker.publicKey }).signers([disputeTaker]).rpc();

       console.log("--- Dispute Path Setup Complete (Trade Funded) ---");
    });

    it("Disputes escrow (Maker or Taker) and updates profiles via CPI", async () => {
      const initialMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
      const initialTakerProfile = await profileProgram.account.profile.fetch(disputeTakerProfilePda);

      // Taker initiates dispute in this case
      await tradeProgram.methods
        .disputeEscrow()
        .accounts({
          trade: disputeTradePda,
          disputer: disputeTaker.publicKey, // Taker is disputing
          maker: maker.publicKey,
          taker: disputeTaker.publicKey,
          // CPI Accounts
          profileProgram: profileProgram.programId,
          profileAuthority: tradeProgramAuthorityPda,
          makerProfile: makerProfilePda,
          takerProfile: disputeTakerProfilePda,
          hubConfig: hubConfigPda,
          makerOwnerForCpi: maker.publicKey,
          takerOwnerForCpi: disputeTaker.publicKey,
        })
        .signers([disputeTaker]) // Disputer must sign
        .rpc();

      // Assert trade state
      const tradeAccount = await tradeProgram.account.trade.fetch(disputeTradePda);
      expect(JSON.stringify(tradeAccount.state)).to.equal(JSON.stringify(TradeState.EscrowDisputed));

      // Assert profile CPI calls (tradesDisputed incremented)
      const finalMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
      const finalTakerProfile = await profileProgram.account.profile.fetch(disputeTakerProfilePda);

      expect(finalMakerProfile.tradesDisputed).to.equal(initialMakerProfile.tradesDisputed + 1, "Maker tradesDisputed should increment");
      expect(finalTakerProfile.tradesDisputed).to.equal(initialTakerProfile.tradesDisputed + 1, "Taker tradesDisputed should increment");
      // Other counts should be unchanged from the funded state
      expect(finalMakerProfile.tradesStarted).to.equal(initialMakerProfile.tradesStarted, "Maker tradesStarted unchanged on dispute");
      expect(finalTakerProfile.tradesStarted).to.equal(initialTakerProfile.tradesStarted, "Taker tradesStarted unchanged on dispute");
       expect(finalMakerProfile.tradesCompleted).to.equal(initialMakerProfile.tradesCompleted, "Maker tradesCompleted unchanged on dispute");
      expect(finalTakerProfile.tradesCompleted).to.equal(initialTakerProfile.tradesCompleted, "Taker tradesCompleted unchanged on dispute");
    });

     it("Fails to dispute escrow (Non-participant)", async () => {
      const nonParticipant = anchor.web3.Keypair.generate();
      await provider.connection.requestAirdrop(nonParticipant.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
         await tradeProgram.methods
        .disputeEscrow()
        .accounts({
          trade: disputeTradePda,
          disputer: nonParticipant.publicKey, // WRONG signer
          maker: maker.publicKey,
          taker: disputeTaker.publicKey,
          profileProgram: profileProgram.programId,
          profileAuthority: tradeProgramAuthorityPda,
          makerProfile: makerProfilePda,
          takerProfile: disputeTakerProfilePda,
          hubConfig: hubConfigPda,
          makerOwnerForCpi: maker.publicKey,
          takerOwnerForCpi: disputeTaker.publicKey,
        })
        .signers([nonParticipant]) // Signed by non-participant
        .rpc();
        expect.fail("Should have failed dispute escrow with non-participant signature");
      } catch (err) {
        expect(err).to.be.instanceOf(anchor.AnchorError);
        const errorCode = (err as anchor.AnchorError).error.errorCode.code;
        // Expecting ConstraintSigner, ConstraintHasOne or specific DisputerMismatch error
        expect(["ConstraintSigner", "ConstraintHasOne", "DisputerMismatch"]).to.include(errorCode);
        console.log(`Caught expected error disputing escrow as non-participant: ${errorCode}`);
      }
    });

    it("Settles dispute (Arbitrator only - favoring Taker) and updates profiles via CPI", async () => {
        const amountInEscrow = (await tradeProgram.account.trade.fetch(disputeTradePda)).amountRequested;

        const takerBalanceBefore = await getTokenBalance(provider, disputeTakerAta);
        const escrowBalanceBefore = await getTokenBalance(provider, disputeEscrowAta);
        expect(escrowBalanceBefore).to.equal(BigInt(amountInEscrow.toString()), "Escrow should be funded before settlement");

        const initialMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
        const initialTakerProfile = await profileProgram.account.profile.fetch(disputeTakerProfilePda);

        // Arbitrator settles in favor of Taker
        await tradeProgram.methods
            .settleDispute(true) // settle_for_taker = true
            .accounts({
                trade: disputeTradePda,
                escrow: disputeEscrowPda,
                arbitrator: arbitrator.publicKey, // Using the designated arbitrator keypair
                maker: maker.publicKey,
                taker: disputeTaker.publicKey,
                winnerAta: disputeTakerAta, // Taker gets the funds
                escrowAta: disputeEscrowAta,
                mint: mintPubkey,
                tokenProgram: tokenProgram,
                // CPI Accounts
                profileProgram: profileProgram.programId,
                profileAuthority: tradeProgramAuthorityPda,
                makerProfile: makerProfilePda,
                takerProfile: disputeTakerProfilePda,
                hubConfig: hubConfigPda,
                makerOwnerForCpi: maker.publicKey,
                takerOwnerForCpi: disputeTaker.publicKey,
            })
            .signers([arbitrator]) // Arbitrator must sign
            .rpc();

        // Assert token balances
        const takerBalanceAfter = await getTokenBalance(provider, disputeTakerAta);
        const escrowBalanceAfter = await getTokenBalance(provider, disputeEscrowAta);
        expect(takerBalanceAfter).to.equal(takerBalanceBefore + BigInt(amountInEscrow.toString()), "Taker balance incorrect after settlement");
        expect(escrowBalanceAfter).to.equal(BigInt(0), "Escrow balance should be zero after settlement");

        // Assert trade state
        const tradeAccount = await tradeProgram.account.trade.fetch(disputeTradePda);
        expect(JSON.stringify(tradeAccount.state)).to.equal(JSON.stringify(TradeState.EscrowSettled));

        // Assert profile CPI calls (adjust based on exact logic)
        // Assuming settlement = completed for winner, cancelled for loser
        const finalMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
        const finalTakerProfile = await profileProgram.account.profile.fetch(disputeTakerProfilePda);

        expect(finalMakerProfile.tradesCancelled).to.equal(initialMakerProfile.tradesCancelled + 1, "Maker tradesCancelled should increment");
        expect(finalTakerProfile.tradesCompleted).to.equal(initialTakerProfile.tradesCompleted + 1, "Taker tradesCompleted should increment");
        // Other counts potentially unchanged
        expect(finalMakerProfile.tradesDisputed).to.equal(initialMakerProfile.tradesDisputed, "Maker tradesDisputed unchanged post-settle"); // Assuming dispute count isn't decremented
         expect(finalTakerProfile.tradesDisputed).to.equal(initialTakerProfile.tradesDisputed, "Taker tradesDisputed unchanged post-settle");
    });

     it("Fails to settle dispute (Non-Arbitrator)", async () => {
        try {
            await tradeProgram.methods
            .settleDispute(true) // settle_for_taker = true
            .accounts({
                trade: disputeTradePda,
                escrow: disputeEscrowPda,
                arbitrator: maker.publicKey, // WRONG signer (Maker trying to arbitrate)
                maker: maker.publicKey,
                taker: disputeTaker.publicKey,
                winnerAta: disputeTakerAta,
                escrowAta: disputeEscrowAta,
                mint: mintPubkey,
                tokenProgram: tokenProgram,
                profileProgram: profileProgram.programId,
                profileAuthority: tradeProgramAuthorityPda,
                makerProfile: makerProfilePda,
                takerProfile: disputeTakerProfilePda,
                hubConfig: hubConfigPda,
                makerOwnerForCpi: maker.publicKey,
                takerOwnerForCpi: disputeTaker.publicKey,
            })
            .signers([maker]) // Signed by Maker
            .rpc();
            expect.fail("Should have failed settle dispute with non-arbitrator signature");
        } catch (err) {
            expect(err).to.be.instanceOf(anchor.AnchorError);
            const errorCode = (err as anchor.AnchorError).error.errorCode.code;
             // Expecting ConstraintSigner or specific ArbitratorMismatch error
            expect(["ConstraintSigner", "ConstraintHasOne", "ArbitratorMismatch"]).to.include(errorCode);
            console.log(`Caught expected error settling dispute as non-arbitrator: ${errorCode}`);
        }
    });

    // TODO: Add test case for settling in favor of Maker
    // TODO: Add tests for Cancel/Refund path

  }); // End Dispute Path describe block

  // --- Cancel/Refund Path Tests --- //

  describe("Cancel/Refund Path", () => {
    const cancelOfferId = "cancelOffer003";
    const cancelTaker = anchor.web3.Keypair.generate();
    let cancelOfferPda: anchor.web3.PublicKey;
    let cancelTradePda: anchor.web3.PublicKey;
    let cancelTradeBump: number;
    let cancelTakerProfilePda: anchor.web3.PublicKey;
    let cancelOfferProgramAuthorityPda: anchor.web3.PublicKey;

    before(async () => {
      console.log("--- Cancel Path Setup Starting ---");
      // Fund new taker
      await provider.connection.requestAirdrop(cancelTaker.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Derive PDAs
      [cancelOfferPda] = getOfferPda(maker.publicKey, cancelOfferId, offerProgram.programId);
      [cancelTakerProfilePda] = getProfilePda(cancelTaker.publicKey, profileProgram.programId);
      [cancelTradePda, cancelTradeBump] = getTradePda(cancelOfferPda, cancelTaker.publicKey, tradeProgram.programId);
      [cancelOfferProgramAuthorityPda] = getProgramAuthorityPda(offerProgram.programId);

      console.log("Cancel path PDAs derived.");
      // Initialize Taker Profile
      try { await profileProgram.account.profile.fetch(cancelTakerProfilePda); } catch(e) {
         console.log("Initializing Cancel Taker Profile...");
         await profileProgram.methods.updateProfile("cancel@taker", "Cancel path taker").accounts({ profile: cancelTakerProfilePda, owner: cancelTaker.publicKey, hubConfig: hubConfigPda, systemProgram: anchor.web3.SystemProgram.programId }).signers([cancelTaker]).rpc();
      }
       // Create Offer
      try { await offerProgram.account.offer.fetch(cancelOfferPda); } catch(e) {
         console.log("Creating Cancel Offer...");
         await offerProgram.methods.createOffer(cancelOfferId, denom, fiatCurrency, offerAmount, pricePremiumBps, "CancelPay", "CancelDetails").accounts({ offer: cancelOfferPda, maker: maker.publicKey, makerProfile: makerProfilePda, denomPrice: denomPricePda, hubConfig: hubConfigPda, systemProgram: anchor.web3.SystemProgram.programId, profileProgram: profileProgram.programId, profileAuthority: cancelOfferProgramAuthorityPda, profileOwnerForCpi: maker.publicKey }).signers([maker]).rpc();
      }
       // Create Trade
       await tradeProgram.methods.createTrade(offerAmount).accounts({ trade: cancelTradePda, offer: cancelOfferPda, maker: maker.publicKey, taker: cancelTaker.publicKey, makerProfile: makerProfilePda, takerProfile: cancelTakerProfilePda, denomPrice: denomPricePda, hubConfig: hubConfigPda, systemProgram: anchor.web3.SystemProgram.programId, profileProgram: profileProgram.programId, profileAuthority: tradeProgramAuthorityPda, makerOwnerForCpi: maker.publicKey, takerOwnerForCpi: cancelTaker.publicKey }).signers([cancelTaker]).rpc();
       // Accept Trade (State is now RequestAccepted)
       await tradeProgram.methods.acceptRequest().accounts({ trade: cancelTradePda, offer: cancelOfferPda, maker: maker.publicKey, taker: cancelTaker.publicKey, makerProfile: makerProfilePda, takerProfile: cancelTakerProfilePda }).signers([maker]).rpc();

      console.log("--- Cancel Path Setup Complete (Trade Accepted, Not Funded) ---");
    });

    it("Cancels request (before funding) and updates profiles via CPI", async () => {
      const initialMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
      const initialTakerProfile = await profileProgram.account.profile.fetch(cancelTakerProfilePda);

      // Taker cancels in this case
      await tradeProgram.methods
          .cancelRequest()
          .accounts({
              trade: cancelTradePda,
              canceller: cancelTaker.publicKey, // Taker is cancelling
              maker: maker.publicKey,
              taker: cancelTaker.publicKey,
              // CPI Accounts
              profileProgram: profileProgram.programId,
              profileAuthority: tradeProgramAuthorityPda,
              makerProfile: makerProfilePda,
              takerProfile: cancelTakerProfilePda,
              hubConfig: hubConfigPda,
              makerOwnerForCpi: maker.publicKey,
              takerOwnerForCpi: cancelTaker.publicKey,
          })
          .signers([cancelTaker]) // Canceller must sign
          .rpc();

      // Assert trade state
      const tradeAccount = await tradeProgram.account.trade.fetch(cancelTradePda);
      // Assuming cancellation moves state to EscrowCancelled or similar
      expect(JSON.stringify(tradeAccount.state)).to.equal(JSON.stringify(TradeState.EscrowCancelled));

       // Assert profile CPI calls (tradesCancelled incremented)
      const finalMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
      const finalTakerProfile = await profileProgram.account.profile.fetch(cancelTakerProfilePda);

      expect(finalMakerProfile.tradesCancelled).to.equal(initialMakerProfile.tradesCancelled + 1, "Maker tradesCancelled should increment");
      expect(finalTakerProfile.tradesCancelled).to.equal(initialTakerProfile.tradesCancelled + 1, "Taker tradesCancelled should increment");
      // Other counts unchanged
       expect(finalMakerProfile.tradesStarted).to.equal(initialMakerProfile.tradesStarted, "Maker tradesStarted unchanged on cancel");
      expect(finalTakerProfile.tradesStarted).to.equal(initialTakerProfile.tradesStarted, "Taker tradesStarted unchanged on cancel");
    });

    it("Fails to cancel request (Non-participant)", async () => {
      const nonParticipant = anchor.web3.Keypair.generate();
       await provider.connection.requestAirdrop(nonParticipant.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
       await new Promise(resolve => setTimeout(resolve, 500));

       // Fetch state before attempt
       const tradeAccountBefore = await tradeProgram.account.trade.fetch(cancelTradePda);
       expect(JSON.stringify(tradeAccountBefore.state)).to.equal(JSON.stringify(TradeState.EscrowCancelled)); // Should be cancelled from previous test

      try {
           await tradeProgram.methods
          .cancelRequest()
          .accounts({
              trade: cancelTradePda,
              canceller: nonParticipant.publicKey, // WRONG signer
              maker: maker.publicKey,
              taker: cancelTaker.publicKey,
               // CPI Accounts
              profileProgram: profileProgram.programId,
              profileAuthority: tradeProgramAuthorityPda,
              makerProfile: makerProfilePda,
              takerProfile: cancelTakerProfilePda,
              hubConfig: hubConfigPda,
              makerOwnerForCpi: maker.publicKey,
              takerOwnerForCpi: cancelTaker.publicKey,
          })
          .signers([nonParticipant])
          .rpc();
           expect.fail("Should have failed cancel request with non-participant signature");
      } catch (err) {
           expect(err).to.be.instanceOf(anchor.AnchorError);
           const errorCode = (err as anchor.AnchorError).error.errorCode.code;
            // Expecting ConstraintSigner, ConstraintHasOne or specific CancellerMismatch error, or state error
           expect(["ConstraintSigner", "ConstraintHasOne", "CancellerMismatch", "StateCantBeCancelled" ]).to.include(errorCode);
           console.log(`Caught expected error cancelling request as non-participant or in wrong state: ${errorCode}`);
      }
    });

    // TODO: Add tests for refund_escrow (cancellation after funding)
    it.skip("Refunds escrow (after funding) and updates profiles via CPI", async () => {
        // --- ARRANGE --- 
        // Requires setting up a trade, funding it, and then initiating refund
        // Assume refundTradePda, refundEscrowPda, refundEscrowAta, etc. are set up.
        // Assume trade is in EscrowFunded state.
        // const amountInEscrow = ...;
        // const takerBalanceBefore = await getTokenBalance(provider, refundTakerAta);
        // const escrowBalanceBefore = await getTokenBalance(provider, refundEscrowAta);
        // const initialMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
        // const initialTakerProfile = await profileProgram.account.profile.fetch(refundTakerProfilePda);

        // --- ACT --- 
        // Who triggers refund depends on logic (e.g., maker agrees, timeout)
        /*
        await tradeProgram.methods
            .refundEscrow() // Instruction name might vary
            .accounts({ ... })
            .signers([ ... ]) // Signer depends on who is authorized
            .rpc();
        */

        // --- ASSERT ---
        // Assert token balances (Taker balance increases, Escrow is zero)
        // const takerBalanceAfter = await getTokenBalance(provider, refundTakerAta);
        // const escrowBalanceAfter = await getTokenBalance(provider, refundEscrowAta);
        // expect(takerBalanceAfter).to.equal(takerBalanceBefore + BigInt(amountInEscrow.toString()));
        // expect(escrowBalanceAfter).to.equal(BigInt(0));

        // Assert trade state (e.g., EscrowRefunded)
        // const tradeAccount = await tradeProgram.account.trade.fetch(refundTradePda);
        // expect(JSON.stringify(tradeAccount.state)).to.equal(JSON.stringify(TradeState.EscrowRefunded));

        // Assert profile CPI calls (tradesCancelled incremented for both)
        // const finalMakerProfile = await profileProgram.account.profile.fetch(makerProfilePda);
        // const finalTakerProfile = await profileProgram.account.profile.fetch(refundTakerProfilePda);
        // expect(finalMakerProfile.tradesCancelled).to.equal(initialMakerProfile.tradesCancelled + 1);
        // expect(finalTakerProfile.tradesCancelled).to.equal(initialTakerProfile.tradesCancelled + 1);

        console.log("Skipping refund_escrow test due to setup complexity.");
        expect(true).to.be.true; // Placeholder
    });

  }); // End Cancel/Refund Path describe block

}); 