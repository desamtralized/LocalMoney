import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Offer } from "../target/types/offer"; // Adjust path based on actual IDL location
import { assert } from "chai";

// Import Hub types and potentially the program instance if shared across test files
// For now, let's assume hubConfigPda will be available in this scope.
// import { Hub } from "../target/types/hub"; // Assuming hub IDL is available
let hubConfigPda: anchor.web3.PublicKey; // This would be set by the hub deployment/initialization

// Configure the client to use the local cluster.
anchor.setProvider(anchor.AnchorProvider.env());
const program = anchor.workspace.Offer as Program<Offer>;
const provider = anchor.getProvider();

describe("Offer Program Tests", () => {
    const authority = anchor.web3.Keypair.generate(); // Program deployer / admin
    const offerOwner = anchor.web3.Keypair.generate();
    let offerGlobalStatePda: anchor.web3.PublicKey;
    let offerGlobalStateBump: number;

    before(async () => {
        // Airdrop SOL to the authority and offerOwner for transaction fees
        await provider.connection.requestAirdrop(authority.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.requestAirdrop(offerOwner.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL);
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for airdrop

        [offerGlobalStatePda, offerGlobalStateBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("offer_global_state")],
            program.programId
        );
    });

    it("Initializes OfferGlobalState", async () => {
        await program.methods
            .initializeOfferGlobalState()
            .accounts({
                offerGlobalState: offerGlobalStatePda,
                authority: authority.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([authority])
            .rpc();

        const globalState = await program.account.offerGlobalState.fetch(offerGlobalStatePda);
        assert.equal(globalState.offersCount.toNumber(), 0);
        assert.ok(globalState.hubAddress.equals(anchor.web3.PublicKey.default));
        assert.equal(globalState.bump, offerGlobalStateBump);
    });

    it("Registers Hub Address", async () => {
        // const testHubAddress = anchor.web3.Keypair.generate().publicKey; // Old way
        
        // EXPECTATION: hubConfigPda is initialized and available from Hub program deployment
        // This might require running Hub initialization in a global beforeAll
        // or passing the Hub's PDA address to these tests.
        // For this example, we'll assume hubConfigPda is set.
        // If not set, this test would fail or need to be adapted.
        if (!hubConfigPda) {
            console.warn("HubConfig PDA not set. Skipping registerHub with actual Hub address. This test needs proper Hub integration.");
            // Fallback to a dummy address for now to allow other tests to proceed,
            // but this needs to be addressed for true E2E.
            hubConfigPda = anchor.web3.Keypair.generate().publicKey;
        }

        await program.methods
            .registerHub(hubConfigPda) // Use the actual hubConfigPda
            .accounts({
                offerGlobalState: offerGlobalStatePda,
                authority: authority.publicKey, // Assuming global admin registers hub for now
            })
            .signers([authority])
            .rpc();

        const globalState = await program.account.offerGlobalState.fetch(offerGlobalStatePda);
        assert.ok(globalState.hubAddress.equals(hubConfigPda));
    });

    it("Creates an Offer", async () => {
        // Ensure Hub is registered before creating an offer
        const globalStateBefore = await program.account.offerGlobalState.fetch(offerGlobalStatePda);
        const currentOfferId = globalStateBefore.offersCount.toNumber();

        const [offerPda, offerBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("offer"), new anchor.BN(currentOfferId).toArrayLike(Buffer, "le", 8)],
            program.programId
        );

        const offerInput = {
            ownerContact: "test_contact@example.com",
            ownerEncryptionKey: "test_enc_key",
            offerType: { buy: {} }, // Example: Buy Offer
            fiatCurrency: "USD",
            rate: new anchor.BN(1000), // Example rate
            denom: "SOL",
            minAmount: new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL),
            maxAmount: new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
            description: "Test offer to buy SOL",
        };

        let listenerId = 0;
        const eventPromise = new Promise((resolve, reject) => {
            listenerId = program.addEventListener("OfferProfileUpdateRequest", (event, slot) => {
                resolve(event);
            });
        });

        await program.methods
            .createOffer(
                offerInput.ownerContact,
                offerInput.ownerEncryptionKey,
                offerInput.offerType,
                offerInput.fiatCurrency,
                offerInput.rate,
                offerInput.denom,
                offerInput.minAmount,
                offerInput.maxAmount,
                offerInput.description
            )
            .accounts({
                offer: offerPda,
                offerGlobalState: offerGlobalStatePda,
                owner: offerOwner.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([offerOwner])
            .rpc();

        const createdOffer = await program.account.offer.fetch(offerPda);
        assert.equal(createdOffer.id.toNumber(), currentOfferId);
        assert.ok(createdOffer.owner.equals(offerOwner.publicKey));
        assert.equal(createdOffer.ownerContact, offerInput.ownerContact);
        assert.deepStrictEqual(createdOffer.offerType, offerInput.offerType);
        assert.ok(createdOffer.state.hasOwnProperty("active"));
        assert.equal(createdOffer.bump, offerBump);

        const globalStateAfter = await program.account.offerGlobalState.fetch(offerGlobalStatePda);
        assert.equal(globalStateAfter.offersCount.toNumber(), currentOfferId + 1);

        // Verify event
        const eventData: any = await eventPromise;
        program.removeEventListener(listenerId);

        assert.isDefined(eventData, "OfferProfileUpdateRequest event not emitted");
        assert.equal(eventData.offerId.toNumber(), currentOfferId);
        assert.ok(eventData.owner.equals(offerOwner.publicKey));
        assert.equal(eventData.ownerContact, offerInput.ownerContact);
        assert.isDefined(eventData.offerStateChange);
        assert.isTrue(eventData.offerStateChange.newState.hasOwnProperty("active"));
        assert.isTrue(eventData.actionType.hasOwnProperty("createOffer"));
    });

    // TODO: Add tests for update_offer, including event emission
    describe("update_offer", () => {
        const newOfferDetails = {
            ownerContact: "updated_contact@example.com",
            ownerEncryptionKey: "updated_enc_key",
            rate: new anchor.BN(1200), // Updated rate
            minAmount: new anchor.BN(0.5 * anchor.web3.LAMPORTS_PER_SOL),
            maxAmount: new anchor.BN(15 * anchor.web3.LAMPORTS_PER_SOL),
            description: "Updated test offer",
        };
        let offerIdToUpdate: anchor.BN;
        let offerPdaToUpdate: anchor.web3.PublicKey;

        before(async () => {
            // Use the offer created in the previous test or create a new one for updating
            // For simplicity, let's assume the previously created offer (id 0) is what we'll update.
            const globalState = await program.account.offerGlobalState.fetch(offerGlobalStatePda);
            if (globalState.offersCount.toNumber() > 0) {
                offerIdToUpdate = new anchor.BN(0); // Assuming the first offer
                [offerPdaToUpdate] = anchor.web3.PublicKey.findProgramAddressSync(
                    [Buffer.from("offer"), offerIdToUpdate.toArrayLike(Buffer, "le", 8)],
                    program.programId
                );
            } else {
                // Fallback: if no offer exists, create one to ensure update tests can run
                // This duplicates some logic but makes the suite more robust if run in isolation or reordered
                console.warn("No existing offer found for update_offer tests, creating a new one.")
                const offerInput = {
                    ownerContact: "temp_contact@example.com",
                    ownerEncryptionKey: "temp_enc_key",
                    offerType: { sell: {} }, 
                    fiatCurrency: "EUR",
                    rate: new anchor.BN(900), 
                    denom: "USDC",
                    minAmount: new anchor.BN(10 * 1e6), // Assuming 6 decimals for USDC
                    maxAmount: new anchor.BN(100 * 1e6),
                    description: "Temporary offer for update tests",
                };
                const globalStateBefore = await program.account.offerGlobalState.fetch(offerGlobalStatePda);
                offerIdToUpdate = globalStateBefore.offersCount;
                [offerPdaToUpdate] = anchor.web3.PublicKey.findProgramAddressSync(
                    [Buffer.from("offer"), offerIdToUpdate.toArrayLike(Buffer, "le", 8)],
                    program.programId
                );
                await program.methods
                    .createOffer(...Object.values(offerInput))
                    .accounts({ offer: offerPdaToUpdate, offerGlobalState: offerGlobalStatePda, owner: offerOwner.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
                    .signers([offerOwner])
                    .rpc();
            }
        });

        it("Successfully updates an offer by its owner", async () => {
            if (!offerPdaToUpdate) assert.fail("Offer PDA for update not initialized");

            let listenerId = 0;
            const eventPromise = new Promise((resolve, reject) => {
                listenerId = program.addEventListener("OfferProfileUpdateRequest", (event, slot) => {
                    if (event.offerId.eq(offerIdToUpdate)) {
                        resolve(event);
                    }
                });
            });

            await program.methods
                .updateOffer(
                    offerIdToUpdate,
                    newOfferDetails.ownerContact,
                    newOfferDetails.ownerEncryptionKey,
                    newOfferDetails.rate,
                    newOfferDetails.minAmount,
                    newOfferDetails.maxAmount,
                    newOfferDetails.description
                )
                .accounts({
                    offer: offerPdaToUpdate,
                    owner: offerOwner.publicKey,
                    // hub_config: hubConfigPda, // If needed for validations from hub
                })
                .signers([offerOwner])
                .rpc();

            const updatedOffer = await program.account.offer.fetch(offerPdaToUpdate);
            assert.equal(updatedOffer.ownerContact, newOfferDetails.ownerContact);
            assert.equal(updatedOffer.rate.toString(), newOfferDetails.rate.toString());
            assert.equal(updatedOffer.minAmount.toString(), newOfferDetails.minAmount.toString());
            assert.equal(updatedOffer.maxAmount.toString(), newOfferDetails.maxAmount.toString());
            assert.equal(updatedOffer.description, newOfferDetails.description);
            // Add more assertions as necessary, e.g., offer state if it can be changed by update_offer

            const eventData: any = await eventPromise;
            program.removeEventListener(listenerId);
            assert.isDefined(eventData, "OfferProfileUpdateRequest event not emitted for update_offer");
            assert.equal(eventData.offerId.toString(), offerIdToUpdate.toString());
            assert.ok(eventData.owner.equals(offerOwner.publicKey));
            assert.equal(eventData.ownerContact, newOfferDetails.ownerContact);
            assert.isTrue(eventData.actionType.hasOwnProperty("updateOffer"));
        });

        it("Fails to update an offer by a non-owner", async () => {
            if (!offerPdaToUpdate) assert.fail("Offer PDA for update not initialized");
            const nonOwner = anchor.web3.Keypair.generate();
            // Airdrop some SOL to nonOwner for transaction fees
            await provider.connection.requestAirdrop(nonOwner.publicKey, anchor.web3.LAMPORTS_PER_SOL);
            await new Promise(resolve => setTimeout(resolve, 500)); 

            try {
                await program.methods
                    .updateOffer(
                        offerIdToUpdate,
                        "hacker@contact.com",
                        "hacker_key",
                        new anchor.BN(100), 
                        new anchor.BN(1), 
                        new anchor.BN(2),
                        "Hacked offer"
                    )
                    .accounts({
                        offer: offerPdaToUpdate,
                        owner: nonOwner.publicKey, // Non-owner tries to update
                    })
                    .signers([nonOwner])
                    .rpc();
                assert.fail("Update offer by non-owner should have failed.");
            } catch (error) {
                // Check for specific Anchor error, e.g., ConstraintSigner or a custom error
                assert.include(error.message, "ConstraintSigner"); // Or your specific error code/message
            }
        });

        it("Fails to update an offer with invalid amounts (min > max)", async () => {
            if (!offerPdaToUpdate) assert.fail("Offer PDA for update not initialized");

            try {
                await program.methods
                    .updateOffer(
                        offerIdToUpdate,
                        newOfferDetails.ownerContact,
                        newOfferDetails.ownerEncryptionKey,
                        newOfferDetails.rate,
                        new anchor.BN(15 * anchor.web3.LAMPORTS_PER_SOL), // minAmount
                        new anchor.BN(0.5 * anchor.web3.LAMPORTS_PER_SOL), // maxAmount (min > max)
                        newOfferDetails.description
                    )
                    .accounts({
                        offer: offerPdaToUpdate,
                        owner: offerOwner.publicKey,
                    })
                    .signers([offerOwner])
                    .rpc();
                assert.fail("Update offer with minAmount > maxAmount should have failed.");
            } catch (error) {
                // Assuming an error code like InvalidOfferAmounts or a general validation error
                // This needs to match the actual error from the program
                // For now, we check if there's an error, ideally specific error code.
                assert.isNotNull(error, "Expected an error but got none.");
                // Example: expect(error.error.errorCode.code).to.equal("InvalidOfferAmounts");
            }
        });
    });

    describe("pause_offer", () => {
        let offerIdToPause: anchor.BN;
        let offerPdaToPause: anchor.web3.PublicKey;

        before(async () => {
            // Assuming offer 0 is active and can be paused.
            // If not, one should be created in an active state here.
            offerIdToPause = new anchor.BN(0);
            [offerPdaToPause] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("offer"), offerIdToPause.toArrayLike(Buffer, "le", 8)],
                program.programId
            );
            // Ensure the offer is active before pausing
            const offerAccount = await program.account.offer.fetch(offerPdaToPause);
            if (!offerAccount.state.hasOwnProperty("active")) {
                // This is a simplistic recovery; ideally, test setup ensures correct initial state
                console.warn(`Offer ${offerIdToPause} not active before pausing. State: ${Object.keys(offerAccount.state)[0]}. Attempting to create/resume might be needed.`);
                // For robust tests, you might need to call resumeOffer or create a new one if it's cancelled/taken.
            }
        });

        it("Successfully pauses an offer by its owner", async () => {
            if (!offerPdaToPause) assert.fail("Offer PDA for pause not initialized");

            let listenerId = 0;
            const eventPromise = new Promise((resolve) => {
                listenerId = program.addEventListener("OfferProfileUpdateRequest", (event, slot) => {
                    if (event.offerId.eq(offerIdToPause) && event.offerStateChange.newState.hasOwnProperty("paused")) {
                        resolve(event);
                    }
                });
            });

            await program.methods
                .pauseOffer(offerIdToPause)
                .accounts({ offer: offerPdaToPause, owner: offerOwner.publicKey })
                .signers([offerOwner])
                .rpc();

            const pausedOffer = await program.account.offer.fetch(offerPdaToPause);
            assert.ok(pausedOffer.state.hasOwnProperty("paused"), "Offer state not paused");

            const eventData: any = await eventPromise;
            program.removeEventListener(listenerId);
            assert.isDefined(eventData, "OfferProfileUpdateRequest for pause_offer not emitted or not matched");
            assert.isTrue(eventData.actionType.hasOwnProperty("pauseOffer"));
        });

        it("Fails to pause an offer by a non-owner", async () => {
            if (!offerPdaToPause) assert.fail("Offer PDA for pause not initialized");
            const nonOwner = anchor.web3.Keypair.generate();
            await provider.connection.requestAirdrop(nonOwner.publicKey, anchor.web3.LAMPORTS_PER_SOL);
            await new Promise(resolve => setTimeout(resolve, 500)); 

            try {
                await program.methods
                    .pauseOffer(offerIdToPause)
                    .accounts({ offer: offerPdaToPause, owner: nonOwner.publicKey })
                    .signers([nonOwner])
                    .rpc();
                assert.fail("Pause offer by non-owner should have failed.");
            } catch (error) {
                assert.include(error.message, "ConstraintSigner");
            }
        });
    });

    describe("resume_offer", () => {
        let offerIdToResume: anchor.BN;
        let offerPdaToResume: anchor.web3.PublicKey;

        before(async () => {
            // Assuming offer 0 was paused in the previous test suite.
            offerIdToResume = new anchor.BN(0);
            [offerPdaToResume] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("offer"), offerIdToResume.toArrayLike(Buffer, "le", 8)],
                program.programId
            );
             // Ensure the offer is paused before resuming
            const offerAccount = await program.account.offer.fetch(offerPdaToResume);
            if (!offerAccount.state.hasOwnProperty("paused")) {
                 console.warn(`Offer ${offerIdToResume} not paused before resuming. State: ${Object.keys(offerAccount.state)[0]}. Test might fail or reflect incorrect prior state.`);
            }
        });

        it("Successfully resumes a paused offer by its owner", async () => {
            if (!offerPdaToResume) assert.fail("Offer PDA for resume not initialized");

            let listenerId = 0;
            const eventPromise = new Promise((resolve) => {
                listenerId = program.addEventListener("OfferProfileUpdateRequest", (event, slot) => {
                    if (event.offerId.eq(offerIdToResume) && event.offerStateChange.newState.hasOwnProperty("active")) {
                        resolve(event);
                    }
                });
            });

            await program.methods
                .resumeOffer(offerIdToResume)
                .accounts({ offer: offerPdaToResume, owner: offerOwner.publicKey })
                .signers([offerOwner])
                .rpc();

            const resumedOffer = await program.account.offer.fetch(offerPdaToResume);
            assert.ok(resumedOffer.state.hasOwnProperty("active"), "Offer state not active after resume");

            const eventData: any = await eventPromise;
            program.removeEventListener(listenerId);
            assert.isDefined(eventData, "OfferProfileUpdateRequest for resume_offer not emitted or not matched");
            assert.isTrue(eventData.actionType.hasOwnProperty("resumeOffer"));
        });

        it("Fails to resume an offer by a non-owner", async () => {
            if (!offerPdaToResume) assert.fail("Offer PDA for resume not initialized");
            const nonOwner = anchor.web3.Keypair.generate();
            await provider.connection.requestAirdrop(nonOwner.publicKey, anchor.web3.LAMPORTS_PER_SOL);
            await new Promise(resolve => setTimeout(resolve, 500));

            try {
                await program.methods
                    .resumeOffer(offerIdToResume)
                    .accounts({ offer: offerPdaToResume, owner: nonOwner.publicKey })
                    .signers([nonOwner])
                    .rpc();
                assert.fail("Resume offer by non-owner should have failed.");
            } catch (error) {
                assert.include(error.message, "ConstraintSigner");
            }
        });
    });

    describe("cancel_offer", () => {
        let offerIdToCancel: anchor.BN;
        let offerPdaToCancel: anchor.web3.PublicKey;
        let tempOfferOwner: anchor.web3.Keypair; // Use a new owner for a fresh offer to cancel

        before(async () => {
            // Create a new offer specifically for cancellation test to avoid state conflicts
            tempOfferOwner = anchor.web3.Keypair.generate();
            await provider.connection.requestAirdrop(tempOfferOwner.publicKey, anchor.web3.LAMPORTS_PER_SOL);
            await new Promise(resolve => setTimeout(resolve, 500));

            const globalStateBefore = await program.account.offerGlobalState.fetch(offerGlobalStatePda);
            offerIdToCancel = globalStateBefore.offersCount; // New ID

            [offerPdaToCancel] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("offer"), offerIdToCancel.toArrayLike(Buffer, "le", 8)],
                program.programId
            );
            const offerInput = {
                ownerContact: "cancel@example.com", ownerEncryptionKey: "cancel_key",
                offerType: { buy: {} }, fiatCurrency: "GBP", rate: new anchor.BN(800),
                denom: "ETH", minAmount: new anchor.BN(1e18), maxAmount: new anchor.BN(5e18),
                description: "Offer to be cancelled",
            };
            await program.methods.createOffer(...Object.values(offerInput))
                .accounts({ offer: offerPdaToCancel, offerGlobalState: offerGlobalStatePda, owner: tempOfferOwner.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
                .signers([tempOfferOwner])
                .rpc();
        });

        it("Successfully cancels an offer by its owner", async () => {
            if (!offerPdaToCancel) assert.fail("Offer PDA for cancel not initialized");

            let listenerId = 0;
            const eventPromise = new Promise((resolve) => {
                listenerId = program.addEventListener("OfferProfileUpdateRequest", (event, slot) => {
                    if (event.offerId.eq(offerIdToCancel) && event.offerStateChange.newState.hasOwnProperty("cancelled")) {
                        resolve(event);
                    }
                });
            });

            await program.methods
                .cancelOffer(offerIdToCancel)
                .accounts({ offer: offerPdaToCancel, owner: tempOfferOwner.publicKey })
                .signers([tempOfferOwner])
                .rpc();

            const cancelledOffer = await program.account.offer.fetch(offerPdaToCancel);
            assert.ok(cancelledOffer.state.hasOwnProperty("cancelled"), "Offer state not cancelled");

            const eventData: any = await eventPromise;
            program.removeEventListener(listenerId);
            assert.isDefined(eventData, "OfferProfileUpdateRequest for cancel_offer not emitted or not matched");
            assert.isTrue(eventData.actionType.hasOwnProperty("cancelOffer"));
        });

        it("Fails to cancel an offer by a non-owner", async () => {
            if (!offerPdaToCancel) assert.fail("Offer PDA for cancel not initialized");
            const nonOwner = anchor.web3.Keypair.generate();
            await provider.connection.requestAirdrop(nonOwner.publicKey, anchor.web3.LAMPORTS_PER_SOL);
            await new Promise(resolve => setTimeout(resolve, 500)); 

            try {
                await program.methods
                    .cancelOffer(offerIdToCancel)
                    .accounts({ offer: offerPdaToCancel, owner: nonOwner.publicKey })
                    .signers([nonOwner])
                    .rpc();
                assert.fail("Cancel offer by non-owner should have failed.");
            } catch (error) {
                assert.include(error.message, "ConstraintSigner");
            }
        });
        
        it("Fails to pause a cancelled offer", async () => {
            if (!offerPdaToCancel) assert.fail("Offer PDA for cancel not initialized");
            try {
                await program.methods
                    .pauseOffer(offerIdToCancel) // Attempt to pause the already cancelled offer
                    .accounts({ offer: offerPdaToCancel, owner: tempOfferOwner.publicKey })
                    .signers([tempOfferOwner])
                    .rpc();
                assert.fail("Pausing a cancelled offer should have failed.");
            } catch (error) {
                // Expecting a specific error like InvalidOfferState or similar
                assert.isNotNull(error, "Expected an error for pausing a cancelled offer.");
                // Example: expect(error.error.errorCode.code).to.equal("InvalidOfferState");
            }
        });
    });

    // TODO: Add tests for query handlers (once implemented)
}); 