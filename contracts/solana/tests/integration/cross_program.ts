import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Hub } from "../../target/types/hub";
import { Offer } from "../../target/types/offer";
import { Trade } from "../../target/types/trade";
import { Profile } from "../../target/types/profile";
import { Price } from "../../target/types/price";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { getSharedTestState, createTestUser, getUserProfilePDA, SharedTestState } from "./shared_setup";

describe("Cross-Program Integration Tests", () => {
    let sharedState: SharedTestState;
    let user1: Keypair;
    let user2: Keypair;

    // User profile PDAs
    let user1ProfilePDA: PublicKey;
    let user2ProfilePDA: PublicKey;

    // Test data
    let offerId: anchor.BN;
    let offerPDA: PublicKey;

    before(async () => {
        // Get shared test state (initializes Hub and all programs if not already done)
        sharedState = await getSharedTestState();

        // Create test users specific to this test suite
        user1 = await createTestUser(201); // Unique seed for cross_program user1
        user2 = await createTestUser(202); // Unique seed for cross_program user2

        // Derive user profile PDAs
        user1ProfilePDA = getUserProfilePDA(user1.publicKey, sharedState.profileProgram.programId);
        user2ProfilePDA = getUserProfilePDA(user2.publicKey, sharedState.profileProgram.programId);

        // Initialize user profiles
        await sharedState.profileProgram.methods
            .updateContact("user1@example.com", "user1_key")
            .accounts({
                profile: user1ProfilePDA,
                profileAuthority: user1.publicKey,
                payer: user1.publicKey,
                profileGlobalState: sharedState.profileGlobalStatePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([user1])
            .rpc();

        await sharedState.profileProgram.methods
            .updateContact("user2@example.com", "user2_key")
            .accounts({
                profile: user2ProfilePDA,
                profileAuthority: user2.publicKey,
                payer: user2.publicKey,
                profileGlobalState: sharedState.profileGlobalStatePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([user2])
            .rpc();
    });

    describe("Hub ↔ Other Programs Integration", () => {
        it("Verifies all programs are registered with Hub", async () => {
            const hubConfig = await sharedState.hubProgram.account.hubConfig.fetch(sharedState.hubConfigPDA);
            
            expect(hubConfig.offerAddr.equals(sharedState.offerProgram.programId)).to.be.true;
            expect(hubConfig.tradeAddr.equals(sharedState.tradeProgram.programId)).to.be.true;
            expect(hubConfig.profileAddr.equals(sharedState.profileProgram.programId)).to.be.true;
            expect(hubConfig.priceAddr.equals(sharedState.priceProgram.programId)).to.be.true;
        });

        it("Verifies program global states reference correct Hub", async () => {
            const offerGlobalState = await sharedState.offerProgram.account.offerGlobalState.fetch(sharedState.offerGlobalStatePDA);
            const tradeGlobalState = await sharedState.tradeProgram.account.tradeGlobalState.fetch(sharedState.tradeGlobalStatePDA);
            const profileGlobalState = await sharedState.profileProgram.account.profileGlobalState.fetch(sharedState.profileGlobalStatePDA);
            const priceGlobalState = await sharedState.priceProgram.account.priceGlobalState.fetch(sharedState.priceGlobalStatePDA);

            expect(offerGlobalState.hubAddress.equals(sharedState.hubProgram.programId)).to.be.true;
            expect(tradeGlobalState.hubAddress.equals(sharedState.hubProgram.programId)).to.be.true;
            expect(profileGlobalState.hubAddress.equals(sharedState.hubProgram.programId)).to.be.true;
            expect(priceGlobalState.hubAddress.equals(sharedState.hubProgram.programId)).to.be.true;
        });
    });

    describe("Offer ↔ Profile CPI Integration", () => {
        it("Tests Offer creation triggers Profile update via CPI", async () => {
            // Get initial profile state
            let initialActiveOffers = 0;
            try {
                const profileBefore = await sharedState.profileProgram.account.profile.fetch(user1ProfilePDA);
                initialActiveOffers = profileBefore.activeOffersCount;
            } catch (error) {
                // Profile might not exist yet, which means 0 active offers
                initialActiveOffers = 0;
            }

            // Create an offer - this should trigger CPI to Profile program
            offerId = new anchor.BN(1);
            [offerPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("offer"), user1.publicKey.toBuffer(), offerId.toArrayLike(Buffer, "le", 8)],
                sharedState.offerProgram.programId
            );

            await sharedState.offerProgram.methods
                .createOffer(
                    offerId,
                    "SOL",                           // denomSymbol
                    "USD",                           // fiatSymbol
                    new anchor.BN(1 * LAMPORTS_PER_SOL), // cryptoAmount
                    new anchor.BN(50),               // fiatAmount
                    "Buy SOL with USD",              // description
                    { buy: {} },                     // offerType
                    { native: {} }                   // denomType
                )
                .accounts({
                    offer: offerPDA,
                    offerOwner: user1.publicKey,
                    payer: user1.publicKey,
                    offerGlobalState: sharedState.offerGlobalStatePDA,
                    hubConfig: sharedState.hubConfigPDA,
                    hubProgram: sharedState.hubProgram.programId,
                    profile: user1ProfilePDA,
                    profileProgram: sharedState.profileProgram.programId,
                    profileGlobalState: sharedState.profileGlobalStatePDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([user1])
                .rpc();

            // Verify Profile was updated via CPI
            const profileAfter = await sharedState.profileProgram.account.profile.fetch(user1ProfilePDA);
            expect(profileAfter.activeOffersCount).to.equal(initialActiveOffers + 1);

            // Verify offer was created correctly
            const offer = await sharedState.offerProgram.account.offer.fetch(offerPDA);
            expect(offer.owner.equals(user1.publicKey)).to.be.true;
            expect(offer.denomSymbol).to.equal("SOL");
            expect(offer.fiatSymbol).to.equal("USD");
        });

        it("Tests Offer update maintains Profile consistency", async () => {
            // Update the offer
            await sharedState.offerProgram.methods
                .updateOffer(
                    offerId,
                    new anchor.BN(2 * LAMPORTS_PER_SOL), // new cryptoAmount
                    new anchor.BN(100),                  // new fiatAmount
                    "Updated: Buy SOL with USD"          // new description
                )
                .accounts({
                    offer: offerPDA,
                    offerOwner: user1.publicKey,
                    offerGlobalState: sharedState.offerGlobalStatePDA,
                    hubConfig: sharedState.hubConfigPDA,
                    hubProgram: sharedState.hubProgram.programId,
                })
                .signers([user1])
                .rpc();

            // Verify offer was updated
            const offer = await sharedState.offerProgram.account.offer.fetch(offerPDA);
            expect(offer.cryptoAmount.toNumber()).to.equal(2 * LAMPORTS_PER_SOL);
            expect(offer.fiatAmount.toNumber()).to.equal(100);
            expect(offer.description).to.equal("Updated: Buy SOL with USD");

            // Verify Profile active offers count remains the same (no CPI needed for updates)
            const profile = await sharedState.profileProgram.account.profile.fetch(user1ProfilePDA);
            expect(profile.activeOffersCount).to.equal(1);
        });
    });

    describe("Trade ↔ Profile CPI Integration", () => {
        let tradeId: anchor.BN;
        let tradePDA: PublicKey;

        it("Tests Trade creation triggers Profile update via CPI", async () => {
            // Get initial profile states
            const buyerProfileBefore = await sharedState.profileProgram.account.profile.fetch(user2ProfilePDA);
            const sellerProfileBefore = await sharedState.profileProgram.account.profile.fetch(user1ProfilePDA);
            
            const initialBuyerRequested = buyerProfileBefore.requestedTradesCount.toNumber();
            const initialSellerRequested = sellerProfileBefore.requestedTradesCount.toNumber();

            // Create a trade - this should trigger CPI to Profile program
            tradeId = new anchor.BN(1);
            [tradePDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("trade"), user2.publicKey.toBuffer(), tradeId.toArrayLike(Buffer, "le", 8)],
                sharedState.tradeProgram.programId
            );

            await sharedState.tradeProgram.methods
                .createTrade(
                    tradeId,
                    offerPDA,                        // offerAddress
                    new anchor.BN(1 * LAMPORTS_PER_SOL), // cryptoAmount
                    new anchor.BN(50),               // fiatAmount
                    "Payment via bank transfer"      // paymentMethod
                )
                .accounts({
                    trade: tradePDA,
                    buyer: user2.publicKey,
                    payer: user2.publicKey,
                    offer: offerPDA,
                    seller: user1.publicKey,
                    tradeGlobalState: sharedState.tradeGlobalStatePDA,
                    hubConfig: sharedState.hubConfigPDA,
                    hubProgram: sharedState.hubProgram.programId,
                    buyerProfile: user2ProfilePDA,
                    sellerProfile: user1ProfilePDA,
                    profileProgram: sharedState.profileProgram.programId,
                    profileGlobalState: sharedState.profileGlobalStatePDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([user2])
                .rpc();

            // Verify Profile counters were updated via CPI
            const buyerProfileAfter = await sharedState.profileProgram.account.profile.fetch(user2ProfilePDA);
            const sellerProfileAfter = await sharedState.profileProgram.account.profile.fetch(user1ProfilePDA);

            expect(buyerProfileAfter.requestedTradesCount.toNumber()).to.equal(initialBuyerRequested + 1);
            expect(sellerProfileAfter.requestedTradesCount.toNumber()).to.equal(initialSellerRequested + 1);

            // Verify trade was created correctly
            const trade = await sharedState.tradeProgram.account.trade.fetch(tradePDA);
            expect(trade.buyer.equals(user2.publicKey)).to.be.true;
            expect(trade.seller.equals(user1.publicKey)).to.be.true;
            expect(trade.offerAddress.equals(offerPDA)).to.be.true;
        });

        it("Tests Trade acceptance triggers Profile active trades update", async () => {
            // Get initial active trades counts
            const buyerProfileBefore = await sharedState.profileProgram.account.profile.fetch(user2ProfilePDA);
            const sellerProfileBefore = await sharedState.profileProgram.account.profile.fetch(user1ProfilePDA);
            
            const initialBuyerActive = buyerProfileBefore.activeTradesCount;
            const initialSellerActive = sellerProfileBefore.activeTradesCount;

            // Accept the trade
            await sharedState.tradeProgram.methods
                .acceptTrade(tradeId)
                .accounts({
                    trade: tradePDA,
                    seller: user1.publicKey,
                    tradeGlobalState: sharedState.tradeGlobalStatePDA,
                    hubConfig: sharedState.hubConfigPDA,
                    hubProgram: sharedState.hubProgram.programId,
                    buyerProfile: user2ProfilePDA,
                    sellerProfile: user1ProfilePDA,
                    profileProgram: sharedState.profileProgram.programId,
                    profileGlobalState: sharedState.profileGlobalStatePDA,
                })
                .signers([user1])
                .rpc();

            // Verify Profile active trades counters were updated via CPI
            const buyerProfileAfter = await sharedState.profileProgram.account.profile.fetch(user2ProfilePDA);
            const sellerProfileAfter = await sharedState.profileProgram.account.profile.fetch(user1ProfilePDA);

            expect(buyerProfileAfter.activeTradesCount).to.equal(initialBuyerActive + 1);
            expect(sellerProfileAfter.activeTradesCount).to.equal(initialSellerActive + 1);

            // Verify trade state changed
            const trade = await sharedState.tradeProgram.account.trade.fetch(tradePDA);
            expect(trade.state).to.deep.equal({ accepted: {} });
        });
    });

    describe("Price ↔ Hub Integration", () => {
        let fiatPriceUsdPDA: PublicKey;
        let denomPriceRouteSolPDA: PublicKey;
        let calculatedPriceSolUsdPDA: PublicKey;

        before(async () => {
            [fiatPriceUsdPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("fiat_price"), Buffer.from("USD")],
                sharedState.priceProgram.programId
            );

            [denomPriceRouteSolPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("denom_route"), Buffer.from("SOL")],
                sharedState.priceProgram.programId
            );

            [calculatedPriceSolUsdPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("calc_price"), Buffer.from("SOL"), Buffer.from("USD")],
                sharedState.priceProgram.programId
            );
        });

        it("Tests Price updates are authorized through Hub validation", async () => {
            // Update fiat price (should be authorized through Hub)
            await sharedState.priceProgram.methods
                .updateFiatPrice("USD", new anchor.BN(1000000)) // $1.00 in micro-units
                .accounts({
                    fiatPrice: fiatPriceUsdPDA,
                    priceProvider: sharedState.priceProvider.publicKey,
                    priceGlobalState: sharedState.priceGlobalStatePDA,
                    hubConfig: sharedState.hubConfigPDA,
                    hubProgram: sharedState.hubProgram.programId,
                    systemProgram: SystemProgram.programId,
                })
                .signers([sharedState.priceProvider])
                .rpc();

            // Verify price was updated
            const fiatPrice = await sharedState.priceProgram.account.fiatPrice.fetch(fiatPriceUsdPDA);
            expect(fiatPrice.symbol).to.equal("USD");
            expect(fiatPrice.price.toNumber()).to.equal(1000000);
        });

        it("Tests Price route registration and calculation", async () => {
            // Register price route for SOL
            const dummyDexPool = Keypair.generate().publicKey;
            
            await sharedState.priceProgram.methods
                .registerPriceRouteForDenom("SOL", "USDC", dummyDexPool)
                .accounts({
                    denomPriceRoute: denomPriceRouteSolPDA,
                    priceProvider: sharedState.priceProvider.publicKey,
                    priceGlobalState: sharedState.priceGlobalStatePDA,
                    hubConfig: sharedState.hubConfigPDA,
                    hubProgram: sharedState.hubProgram.programId,
                    systemProgram: SystemProgram.programId,
                })
                .signers([sharedState.priceProvider])
                .rpc();

            // Calculate and store price
            await sharedState.priceProgram.methods
                .calculateAndStorePrice("SOL", "USD")
                .accounts({
                    calculatedPrice: calculatedPriceSolUsdPDA,
                    denomPriceRoute: denomPriceRouteSolPDA,
                    fiatPrice: fiatPriceUsdPDA,
                    priceProvider: sharedState.priceProvider.publicKey,
                    priceGlobalState: sharedState.priceGlobalStatePDA,
                    hubConfig: sharedState.hubConfigPDA,
                    hubProgram: sharedState.hubProgram.programId,
                    systemProgram: SystemProgram.programId,
                })
                .signers([sharedState.priceProvider])
                .rpc();

            // Verify calculated price exists
            const calculatedPrice = await sharedState.priceProgram.account.calculatedPrice.fetch(calculatedPriceSolUsdPDA);
            expect(calculatedPrice.denomSymbol).to.equal("SOL");
            expect(calculatedPrice.fiatSymbol).to.equal("USD");
            expect(calculatedPrice.price.toNumber()).to.be.greaterThan(0);
        });
    });

    describe("Error Propagation Testing", () => {
        it("Tests CPI error propagation from Profile to Offer", async () => {
            // Try to create an offer that would exceed the active offers limit
            const hubConfig = await sharedState.hubProgram.account.hubConfig.fetch(sharedState.hubConfigPDA);
            const activeOffersLimit = hubConfig.activeOffersLimit;

            // Create offers up to the limit
            for (let i = 2; i <= activeOffersLimit; i++) {
                const newOfferId = new anchor.BN(i);
                const [newOfferPDA] = PublicKey.findProgramAddressSync(
                    [Buffer.from("offer"), user1.publicKey.toBuffer(), newOfferId.toArrayLike(Buffer, "le", 8)],
                    sharedState.offerProgram.programId
                );

                await sharedState.offerProgram.methods
                    .createOffer(
                        newOfferId,
                        "SOL",
                        "USD",
                        new anchor.BN(1 * LAMPORTS_PER_SOL),
                        new anchor.BN(50),
                        `Offer ${i}`,
                        { buy: {} },
                        { native: {} }
                    )
                    .accounts({
                        offer: newOfferPDA,
                        offerOwner: user1.publicKey,
                        payer: user1.publicKey,
                        offerGlobalState: sharedState.offerGlobalStatePDA,
                        hubConfig: sharedState.hubConfigPDA,
                        hubProgram: sharedState.hubProgram.programId,
                        profile: user1ProfilePDA,
                        profileProgram: sharedState.profileProgram.programId,
                        profileGlobalState: sharedState.profileGlobalStatePDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([user1])
                    .rpc();
            }

            // Now try to create one more offer - should fail due to limit
            const exceedingOfferId = new anchor.BN(activeOffersLimit + 1);
            const [exceedingOfferPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("offer"), user1.publicKey.toBuffer(), exceedingOfferId.toArrayLike(Buffer, "le", 8)],
                sharedState.offerProgram.programId
            );

            try {
                await sharedState.offerProgram.methods
                    .createOffer(
                        exceedingOfferId,
                        "SOL",
                        "USD",
                        new anchor.BN(1 * LAMPORTS_PER_SOL),
                        new anchor.BN(50),
                        "Exceeding offer",
                        { buy: {} },
                        { native: {} }
                    )
                    .accounts({
                        offer: exceedingOfferPDA,
                        offerOwner: user1.publicKey,
                        payer: user1.publicKey,
                        offerGlobalState: sharedState.offerGlobalStatePDA,
                        hubConfig: sharedState.hubConfigPDA,
                        hubProgram: sharedState.hubProgram.programId,
                        profile: user1ProfilePDA,
                        profileProgram: sharedState.profileProgram.programId,
                        profileGlobalState: sharedState.profileGlobalStatePDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([user1])
                    .rpc();

                expect.fail("Should have failed due to active offers limit");
            } catch (error) {
                // Verify the error propagated correctly from Profile program
                expect(error.message).to.include("ActiveOffersLimitReached");
            }
        });

        it("Tests unauthorized CPI calls are rejected", async () => {
            // Try to call Profile update with wrong authority
            const unauthorizedUser = Keypair.generate();
            await sharedState.provider.connection.requestAirdrop(unauthorizedUser.publicKey, LAMPORTS_PER_SOL);
            await new Promise(resolve => setTimeout(resolve, 500));

            try {
                await sharedState.profileProgram.methods
                    .updateActiveOffers({ increment: {} })
                    .accounts({
                        profile: user1ProfilePDA,
                        profileAuthority: unauthorizedUser.publicKey, // Wrong authority
                        hubConfig: sharedState.hubConfigPDA,
                        hubProgramId: sharedState.hubProgram.programId,
                        profileGlobalState: sharedState.profileGlobalStatePDA,
                    })
                    .signers([unauthorizedUser])
                    .rpc();

                expect.fail("Should have failed due to unauthorized access");
            } catch (error) {
                expect(error.message).to.include("Unauthorized");
            }
        });
    });
}); 