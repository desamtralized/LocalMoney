import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Offer } from "../target/types/offer"; // Adjust path based on actual IDL location
import { assert } from "chai";

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
        const testHubAddress = anchor.web3.Keypair.generate().publicKey;
        await program.methods
            .registerHub(testHubAddress)
            .accounts({
                offerGlobalState: offerGlobalStatePda,
                authority: authority.publicKey, // Assuming global admin registers hub for now
            })
            .signers([authority])
            .rpc();

        const globalState = await program.account.offerGlobalState.fetch(offerGlobalStatePda);
        assert.ok(globalState.hubAddress.equals(testHubAddress));
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
    // TODO: Add tests for query handlers (once implemented)
    // TODO: Add tests for failure cases (e.g., limits, invalid inputs)
}); 