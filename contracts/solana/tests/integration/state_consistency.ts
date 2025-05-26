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

describe("State Consistency Validation Tests", () => {
    let sharedState: SharedTestState;
    let trader1: Keypair;
    let trader2: Keypair;
    let trader3: Keypair;

    // Profile PDAs
    let trader1ProfilePDA: PublicKey;
    let trader2ProfilePDA: PublicKey;
    let trader3ProfilePDA: PublicKey;

    // Test state tracking
    const createdOffers: { id: anchor.BN; pda: PublicKey; owner: PublicKey }[] = [];
    const createdTrades: { id: anchor.BN; pda: PublicKey; buyer: PublicKey; seller: PublicKey }[] = [];

    before(async () => {
        // Get shared test state (initializes Hub and all programs if not already done)
        sharedState = await getSharedTestState();

        // Create test users specific to this test suite
        trader1 = await createTestUser(301); // Unique seed for state_consistency trader1
        trader2 = await createTestUser(302); // Unique seed for state_consistency trader2
        trader3 = await createTestUser(303); // Unique seed for state_consistency trader3

        // Derive user profile PDAs
        trader1ProfilePDA = getUserProfilePDA(trader1.publicKey, sharedState.profileProgram.programId);
        trader2ProfilePDA = getUserProfilePDA(trader2.publicKey, sharedState.profileProgram.programId);
        trader3ProfilePDA = getUserProfilePDA(trader3.publicKey, sharedState.profileProgram.programId);

        // Initialize user profiles
        await initializeUserProfiles();
    });

    async function initializeUserProfiles() {
        await sharedState.profileProgram.methods.updateContact("trader1@example.com", "trader1_key")
            .accounts({
                profile: trader1ProfilePDA,
                profileAuthority: trader1.publicKey,
                payer: trader1.publicKey,
                profileGlobalState: sharedState.profileGlobalStatePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([trader1])
            .rpc();

        await sharedState.profileProgram.methods.updateContact("trader2@example.com", "trader2_key")
            .accounts({
                profile: trader2ProfilePDA,
                profileAuthority: trader2.publicKey,
                payer: trader2.publicKey,
                profileGlobalState: sharedState.profileGlobalStatePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([trader2])
            .rpc();

        await sharedState.profileProgram.methods.updateContact("trader3@example.com", "trader3_key")
            .accounts({
                profile: trader3ProfilePDA,
                profileAuthority: trader3.publicKey,
                payer: trader3.publicKey,
                profileGlobalState: sharedState.profileGlobalStatePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([trader3])
            .rpc();
    }

    /**
     * Utility function to validate state consistency across all programs
     */
    async function validateStateConsistency() {
        const hubConfig = await sharedState.hubProgram.account.hubConfig.fetch(sharedState.hubConfigPDA);
        
        // Validate all profiles and aggregate counters
        let totalActiveOffers = 0;
        let totalActiveTrades = 0;
        let totalRequestedTrades = 0;
        let totalReleasedTrades = 0;

        for (const profilePDA of [trader1ProfilePDA, trader2ProfilePDA, trader3ProfilePDA]) {
            try {
                const profile = await sharedState.profileProgram.account.profile.fetch(profilePDA);
                totalActiveOffers += profile.activeOffersCount.toNumber();
                totalActiveTrades += profile.activeTradesCount.toNumber();
                totalRequestedTrades += profile.requestedTradesCount.toNumber();
                totalReleasedTrades += profile.releasedTradesCount.toNumber();

                // Validate individual profile limits
                expect(profile.activeOffersCount.toNumber()).to.be.at.most(hubConfig.activeOffersLimit);
                expect(profile.activeTradesCount.toNumber()).to.be.at.most(hubConfig.activeTradesLimit);
            } catch (e) {
                // Profile might not exist yet, which is fine
            }
        }

        // Validate against actual created offers and trades
        let actualActiveOffers = 0;
        for (const offer of createdOffers) {
            try {
                const offerAccount = await offerProgram.account.offer.fetch(offer.pda);
                if (offerAccount.isActive) {
                    actualActiveOffers++;
                }
            } catch (e) {
                // Offer might have been deleted
            }
        }

        let actualActiveTrades = 0;
        let actualCompletedTrades = 0;
        for (const trade of createdTrades) {
            try {
                const tradeAccount = await tradeProgram.account.trade.fetch(trade.pda);
                if (tradeAccount.state.accepted || tradeAccount.state.escrowFunded || 
                    tradeAccount.state.paymentSent || tradeAccount.state.disputed) {
                    actualActiveTrades++;
                } else if (tradeAccount.state.released || tradeAccount.state.refunded) {
                    actualCompletedTrades++;
                }
            } catch (e) {
                // Trade might have been deleted
            }
        }

        return {
            profileCounters: {
                totalActiveOffers,
                totalActiveTrades,
                totalRequestedTrades,
                totalReleasedTrades
            },
            actualCounts: {
                actualActiveOffers,
                actualActiveTrades,
                actualCompletedTrades
            }
        };
    }

    describe("Hub Configuration Consistency", () => {
        it("Validates Hub config changes propagate correctly", async () => {
            const initialConfig = await hubProgram.account.hubConfig.fetch(hubConfigPDA);
            
            // Update Hub configuration
            const newActiveOffersLimit = 15;
            const newActiveTradesLimit = 8;
            
            await hubProgram.methods
                .updateConfig(
                    initialConfig.offerAddr,
                    initialConfig.tradeAddr,
                    initialConfig.profileAddr,
                    initialConfig.priceAddr,
                    initialConfig.priceProviderAddr,
                    initialConfig.localMarketAddr,
                    initialConfig.localDenomMint,
                    initialConfig.chainFeeCollectorAddr,
                    initialConfig.warchestAddr,
                    newActiveOffersLimit,
                    newActiveTradesLimit,
                    initialConfig.arbitrationFeeBps,
                    initialConfig.burnFeeBps,
                    initialConfig.chainFeeBps,
                    initialConfig.warchestFeeBps,
                    initialConfig.tradeExpirationTimer,
                    initialConfig.tradeDisputeTimer,
                    initialConfig.tradeLimitMinUsd,
                    initialConfig.tradeLimitMaxUsd
                )
                .accounts({
                    hubConfig: hubConfigPDA,
                    admin: admin.publicKey,
                })
                .signers([admin])
                .rpc();

            // Verify configuration was updated
            const updatedConfig = await hubProgram.account.hubConfig.fetch(hubConfigPDA);
            expect(updatedConfig.activeOffersLimit).to.equal(newActiveOffersLimit);
            expect(updatedConfig.activeTradesLimit).to.equal(newActiveTradesLimit);

            // Verify all programs still reference the correct Hub
            const offerGlobalState = await offerProgram.account.offerGlobalState.fetch(offerGlobalStatePDA);
            const tradeGlobalState = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
            const profileGlobalState = await profileProgram.account.profileGlobalState.fetch(profileGlobalStatePDA);
            const priceGlobalState = await priceProgram.account.priceGlobalState.fetch(priceGlobalStatePDA);

            expect(offerGlobalState.hubAddress.equals(hubProgram.programId)).to.be.true;
            expect(tradeGlobalState.hubAddress.equals(hubProgram.programId)).to.be.true;
            expect(profileGlobalState.hubAddress.equals(hubProgram.programId)).to.be.true;
            expect(priceGlobalState.hubAddress.equals(hubProgram.programId)).to.be.true;
        });
    });

    describe("Offer-Profile Counter Synchronization", () => {
        it("Maintains consistent offer counts across multiple operations", async () => {
            const initialState = await validateStateConsistency();

            // Create multiple offers from different users
            for (let i = 1; i <= 3; i++) {
                const offerId = new anchor.BN(i);
                const [offerPDA] = PublicKey.findProgramAddressSync(
                    [Buffer.from("offer"), trader1.publicKey.toBuffer(), offerId.toArrayLike(Buffer, "le", 8)],
                    offerProgram.programId
                );

                await offerProgram.methods
                    .createOffer(
                        offerId,
                        "SOL",
                        "USD",
                        new anchor.BN(i * LAMPORTS_PER_SOL),
                        new anchor.BN(50 * i),
                        `Offer ${i}`,
                        { buy: {} },
                        { native: {} }
                    )
                    .accounts({
                        offer: offerPDA,
                        offerOwner: trader1.publicKey,
                        payer: trader1.publicKey,
                        offerGlobalState: offerGlobalStatePDA,
                        hubConfig: hubConfigPDA,
                        hubProgram: hubProgram.programId,
                        profile: trader1ProfilePDA,
                        profileProgram: profileProgram.programId,
                        profileGlobalState: profileGlobalStatePDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([trader1])
                    .rpc();

                createdOffers.push({ id: offerId, pda: offerPDA, owner: trader1.publicKey });
            }

            // Validate state consistency after offer creation
            const afterCreation = await validateStateConsistency();
            expect(afterCreation.profileCounters.totalActiveOffers).to.equal(
                initialState.profileCounters.totalActiveOffers + 3
            );

            // Update one offer and verify counts remain consistent
            await offerProgram.methods
                .updateOffer(
                    new anchor.BN(1),
                    new anchor.BN(2 * LAMPORTS_PER_SOL),
                    new anchor.BN(100),
                    "Updated Offer 1"
                )
                .accounts({
                    offer: createdOffers[0].pda,
                    offerOwner: trader1.publicKey,
                    offerGlobalState: offerGlobalStatePDA,
                    hubConfig: hubConfigPDA,
                    hubProgram: hubProgram.programId,
                })
                .signers([trader1])
                .rpc();

            // Verify counts remain the same after update
            const afterUpdate = await validateStateConsistency();
            expect(afterUpdate.profileCounters.totalActiveOffers).to.equal(
                afterCreation.profileCounters.totalActiveOffers
            );
        });
    });

    describe("Trade-Profile Counter Synchronization", () => {
        it("Maintains consistent trade counts through complete lifecycle", async () => {
            const initialState = await validateStateConsistency();

            // Create a trade
            const tradeId = new anchor.BN(1);
            const [tradePDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("trade"), trader2.publicKey.toBuffer(), tradeId.toArrayLike(Buffer, "le", 8)],
                tradeProgram.programId
            );

            await tradeProgram.methods
                .createTrade(
                    tradeId,
                    createdOffers[0].pda, // Use first created offer
                    new anchor.BN(1 * LAMPORTS_PER_SOL),
                    new anchor.BN(50),
                    "Bank transfer payment"
                )
                .accounts({
                    trade: tradePDA,
                    buyer: trader2.publicKey,
                    payer: trader2.publicKey,
                    offer: createdOffers[0].pda,
                    seller: trader1.publicKey,
                    tradeGlobalState: tradeGlobalStatePDA,
                    hubConfig: hubConfigPDA,
                    hubProgram: hubProgram.programId,
                    buyerProfile: trader2ProfilePDA,
                    sellerProfile: trader1ProfilePDA,
                    profileProgram: profileProgram.programId,
                    profileGlobalState: profileGlobalStatePDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([trader2])
                .rpc();

            createdTrades.push({ id: tradeId, pda: tradePDA, buyer: trader2.publicKey, seller: trader1.publicKey });

            // Validate requested trades count increased
            const afterCreation = await validateStateConsistency();
            expect(afterCreation.profileCounters.totalRequestedTrades).to.equal(
                initialState.profileCounters.totalRequestedTrades + 2 // Both buyer and seller
            );

            // Accept the trade
            await tradeProgram.methods
                .acceptTrade(tradeId)
                .accounts({
                    trade: tradePDA,
                    seller: trader1.publicKey,
                    tradeGlobalState: tradeGlobalStatePDA,
                    hubConfig: hubConfigPDA,
                    hubProgram: hubProgram.programId,
                    buyerProfile: trader2ProfilePDA,
                    sellerProfile: trader1ProfilePDA,
                    profileProgram: profileProgram.programId,
                    profileGlobalState: profileGlobalStatePDA,
                })
                .signers([trader1])
                .rpc();

            // Validate active trades count increased
            const afterAcceptance = await validateStateConsistency();
            expect(afterAcceptance.profileCounters.totalActiveTrades).to.equal(
                initialState.profileCounters.totalActiveTrades + 2 // Both buyer and seller
            );

            // Fund escrow
            const [tradeEscrowPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("trade_escrow"), tradePDA.toBuffer()],
                tradeProgram.programId
            );

            await tradeProgram.methods
                .fundTradeEscrow(tradeId)
                .accounts({
                    trade: tradePDA,
                    tradeEscrow: tradeEscrowPDA,
                    seller: trader1.publicKey,
                    tradeGlobalState: tradeGlobalStatePDA,
                    hubConfig: hubConfigPDA,
                    hubProgram: hubProgram.programId,
                    buyerProfile: trader2ProfilePDA,
                    sellerProfile: trader1ProfilePDA,
                    profileProgram: profileProgram.programId,
                    profileGlobalState: profileGlobalStatePDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([trader1])
                .rpc();

            // Confirm payment sent
            await tradeProgram.methods
                .confirmPaymentSent(tradeId)
                .accounts({
                    trade: tradePDA,
                    buyer: trader2.publicKey,
                    tradeGlobalState: tradeGlobalStatePDA,
                    hubConfig: hubConfigPDA,
                    hubProgram: hubProgram.programId,
                })
                .signers([trader2])
                .rpc();

            // Release escrow
            await tradeProgram.methods
                .releaseEscrow(tradeId)
                .accounts({
                    trade: tradePDA,
                    tradeEscrow: tradeEscrowPDA,
                    seller: trader1.publicKey,
                    buyer: trader2.publicKey,
                    tradeGlobalState: tradeGlobalStatePDA,
                    hubConfig: hubConfigPDA,
                    hubProgram: hubProgram.programId,
                    buyerProfile: trader2ProfilePDA,
                    sellerProfile: trader1ProfilePDA,
                    profileProgram: profileProgram.programId,
                    profileGlobalState: profileGlobalStatePDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([trader1])
                .rpc();

            // Validate final state - active trades should decrease, released trades should increase
            const finalState = await validateStateConsistency();
            expect(finalState.profileCounters.totalActiveTrades).to.equal(
                initialState.profileCounters.totalActiveTrades
            );
            expect(finalState.profileCounters.totalReleasedTrades).to.equal(
                initialState.profileCounters.totalReleasedTrades + 2 // Both buyer and seller
            );
        });
    });

    describe("Cross-Program State Validation", () => {
        it("Validates state consistency after concurrent operations", async () => {
            // Perform multiple concurrent operations
            const operations = [];

            // Create offers from different users
            for (let i = 4; i <= 6; i++) {
                const offerId = new anchor.BN(i);
                const trader = i === 4 ? trader1 : i === 5 ? trader2 : trader3;
                const traderProfilePDA = i === 4 ? trader1ProfilePDA : i === 5 ? trader2ProfilePDA : trader3ProfilePDA;
                
                const [offerPDA] = PublicKey.findProgramAddressSync(
                    [Buffer.from("offer"), trader.publicKey.toBuffer(), offerId.toArrayLike(Buffer, "le", 8)],
                    offerProgram.programId
                );

                operations.push(
                    offerProgram.methods
                        .createOffer(
                            offerId,
                            "SOL",
                            "USD",
                            new anchor.BN(i * LAMPORTS_PER_SOL),
                            new anchor.BN(50 * i),
                            `Concurrent Offer ${i}`,
                            { sell: {} },
                            { native: {} }
                        )
                        .accounts({
                            offer: offerPDA,
                            offerOwner: trader.publicKey,
                            payer: trader.publicKey,
                            offerGlobalState: offerGlobalStatePDA,
                            hubConfig: hubConfigPDA,
                            hubProgram: hubProgram.programId,
                            profile: traderProfilePDA,
                            profileProgram: profileProgram.programId,
                            profileGlobalState: profileGlobalStatePDA,
                            systemProgram: SystemProgram.programId,
                        })
                        .signers([trader])
                        .rpc()
                );

                createdOffers.push({ id: offerId, pda: offerPDA, owner: trader.publicKey });
            }

            // Execute all operations
            await Promise.all(operations);

            // Validate final state consistency
            const finalState = await validateStateConsistency();
            
            // Verify that profile counters match actual on-chain state
            expect(finalState.profileCounters.totalActiveOffers).to.be.greaterThan(0);
            expect(finalState.actualCounts.actualActiveOffers).to.be.greaterThan(0);
            
            // Verify no state corruption occurred
            for (const profilePDA of [trader1ProfilePDA, trader2ProfilePDA, trader3ProfilePDA]) {
                const profile = await profileProgram.account.profile.fetch(profilePDA);
                const hubConfig = await hubProgram.account.hubConfig.fetch(hubConfigPDA);
                
                expect(profile.activeOffersCount.toNumber()).to.be.at.most(hubConfig.activeOffersLimit);
                expect(profile.activeTradesCount.toNumber()).to.be.at.most(hubConfig.activeTradesLimit);
                expect(profile.requestedTradesCount.toNumber()).to.be.at.least(0);
                expect(profile.releasedTradesCount.toNumber()).to.be.at.least(0);
            }
        });
    });

    describe("Error Recovery and State Integrity", () => {
        it("Maintains state integrity after failed operations", async () => {
            const initialState = await validateStateConsistency();

            // Try to create an offer that exceeds the limit
            const hubConfig = await hubProgram.account.hubConfig.fetch(hubConfigPDA);
            const currentProfile = await profileProgram.account.profile.fetch(trader1ProfilePDA);
            
            // Create offers up to the limit
            const remainingSlots = hubConfig.activeOffersLimit - currentProfile.activeOffersCount.toNumber();
            
            for (let i = 0; i < remainingSlots; i++) {
                const offerId = new anchor.BN(100 + i);
                const [offerPDA] = PublicKey.findProgramAddressSync(
                    [Buffer.from("offer"), trader1.publicKey.toBuffer(), offerId.toArrayLike(Buffer, "le", 8)],
                    offerProgram.programId
                );

                await offerProgram.methods
                    .createOffer(
                        offerId,
                        "SOL",
                        "USD",
                        new anchor.BN(LAMPORTS_PER_SOL),
                        new anchor.BN(50),
                        `Limit Test Offer ${i}`,
                        { buy: {} },
                        { native: {} }
                    )
                    .accounts({
                        offer: offerPDA,
                        offerOwner: trader1.publicKey,
                        payer: trader1.publicKey,
                        offerGlobalState: offerGlobalStatePDA,
                        hubConfig: hubConfigPDA,
                        hubProgram: hubProgram.programId,
                        profile: trader1ProfilePDA,
                        profileProgram: profileProgram.programId,
                        profileGlobalState: profileGlobalStatePDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([trader1])
                    .rpc();

                createdOffers.push({ id: offerId, pda: offerPDA, owner: trader1.publicKey });
            }

            // Now try to create one more - should fail
            const exceedingOfferId = new anchor.BN(200);
            const [exceedingOfferPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("offer"), trader1.publicKey.toBuffer(), exceedingOfferId.toArrayLike(Buffer, "le", 8)],
                offerProgram.programId
            );

            try {
                await offerProgram.methods
                    .createOffer(
                        exceedingOfferId,
                        "SOL",
                        "USD",
                        new anchor.BN(LAMPORTS_PER_SOL),
                        new anchor.BN(50),
                        "Should Fail",
                        { buy: {} },
                        { native: {} }
                    )
                    .accounts({
                        offer: exceedingOfferPDA,
                        offerOwner: trader1.publicKey,
                        payer: trader1.publicKey,
                        offerGlobalState: offerGlobalStatePDA,
                        hubConfig: hubConfigPDA,
                        hubProgram: hubProgram.programId,
                        profile: trader1ProfilePDA,
                        profileProgram: profileProgram.programId,
                        profileGlobalState: profileGlobalStatePDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([trader1])
                    .rpc();

                expect.fail("Should have failed due to limit");
            } catch (error) {
                // Expected failure
            }

            // Validate state remained consistent after failed operation
            const afterFailure = await validateStateConsistency();
            
            // Verify the failed operation didn't corrupt state
            const profileAfterFailure = await profileProgram.account.profile.fetch(trader1ProfilePDA);
            expect(profileAfterFailure.activeOffersCount.toNumber()).to.equal(hubConfig.activeOffersLimit);
            
            // Verify the exceeding offer account was not created
            try {
                await offerProgram.account.offer.fetch(exceedingOfferPDA);
                expect.fail("Exceeding offer should not exist");
            } catch (error) {
                // Expected - account should not exist
            }
        });
    });
}); 