import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Hub } from "../../target/types/hub";
import { Offer } from "../../target/types/offer";
import { Trade } from "../../target/types/trade";
import { Profile } from "../../target/types/profile";
import { Price } from "../../target/types/price";
import { 
    Keypair, 
    LAMPORTS_PER_SOL, 
    PublicKey, 
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction
} from "@solana/web3.js";
import { 
    createMint, 
    createAccount, 
    mintTo, 
    getAccount,
    TOKEN_PROGRAM_ID,
    MINT_SIZE,
    createInitializeMintInstruction,
    getMinimumBalanceForRentExemptMint
} from "@solana/spl-token";
import { expect } from "chai";
import { getSharedTestState, createTestUser, getUserProfilePDA, SharedTestState } from "./shared_setup";

describe("SPL Token Integration Tests", () => {
    let sharedState: SharedTestState;
    let testMint: PublicKey;
    let user1: Keypair;
    let user2: Keypair;
    let user1TokenAccount: PublicKey;
    let user2TokenAccount: PublicKey;
    let user1ProfilePDA: PublicKey;
    let user2ProfilePDA: PublicKey;

    before(async () => {
        // Get shared test state (initializes Hub and all programs if not already done)
        sharedState = await getSharedTestState();

        // Create test users specific to SPL token tests
        user1 = await createTestUser(301); // Unique seed for SPL token user1
        user2 = await createTestUser(302); // Unique seed for SPL token user2

        // Derive user profile PDAs
        user1ProfilePDA = getUserProfilePDA(user1.publicKey, sharedState.profileProgram.programId);
        user2ProfilePDA = getUserProfilePDA(user2.publicKey, sharedState.profileProgram.programId);

        // Create a test SPL token mint
        testMint = await createMint(
            sharedState.provider.connection,
            sharedState.admin,
            sharedState.admin.publicKey, // mint authority
            null, // freeze authority
            6 // decimals
        );

        console.log(`Created test mint: ${testMint.toString()}`);

        // Create token accounts for test users
        user1TokenAccount = await createAccount(
            sharedState.provider.connection,
            user1,
            testMint,
            user1.publicKey
        );

        user2TokenAccount = await createAccount(
            sharedState.provider.connection,
            user2,
            testMint,
            user2.publicKey
        );

        // Mint some tokens to user1 (seller)
        await mintTo(
            sharedState.provider.connection,
            sharedState.admin,
            testMint,
            user1TokenAccount,
            sharedState.admin,
            1000 * 10**6 // 1000 tokens with 6 decimals
        );

        console.log(`Minted 1000 tokens to user1: ${user1TokenAccount.toString()}`);

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

        console.log("User profiles initialized");
    });

    describe("SPL Token Offer Creation", () => {
        let offerId: number;
        let offerPDA: PublicKey;

        it("Creates an SPL token sell offer", async () => {
            // Get current offer count to determine next offer ID
            const offerGlobalState = await sharedState.offerProgram.account.offerGlobalState.fetch(
                sharedState.offerGlobalStatePDA
            );
            offerId = offerGlobalState.offersCount.toNumber() + 1;

            // Derive offer PDA
            [offerPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("offer"), Buffer.from(offerId.toString().padStart(8, '0'), 'utf8')],
                sharedState.offerProgram.programId
            );

            console.log(`Creating offer ${offerId} at PDA: ${offerPDA.toString()}`);

            // Create SPL token sell offer
            await sharedState.offerProgram.methods
                .createOffer(
                    "user1@example.com",           // ownerContact
                    "user1_encryption_key",       // ownerEncryptionKey
                    { sell: {} },                  // offerType - selling tokens for fiat
                    "USD",                         // fiatCurrency
                    new anchor.BN(2000000),        // rate (2.00 USD per token, 6 decimals)
                    "USDC",                        // denom (representing our test token)
                    testMint,                      // tokenMint
                    new anchor.BN(10 * 10**6),     // minAmount (10 tokens)
                    new anchor.BN(100 * 10**6),    // maxAmount (100 tokens)
                    "Selling USDC for USD via bank transfer" // description
                )
                .accounts({
                    offer: offerPDA,
                    offerGlobalState: sharedState.offerGlobalStatePDA,
                    owner: user1.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([user1])
                .rpc();

            console.log("SPL token offer created successfully");

            // Verify offer was created correctly
            const offer = await sharedState.offerProgram.account.offer.fetch(offerPDA);
            expect(offer.owner.equals(user1.publicKey)).to.be.true;
            expect(offer.denom).to.equal("USDC");
            expect(offer.fiatCurrency).to.equal("USD");
            expect(offer.tokenMint?.equals(testMint)).to.be.true;
            expect(offer.rate.toNumber()).to.equal(2000000);
            expect(offer.minAmount.toNumber()).to.equal(10 * 10**6);
            expect(offer.maxAmount.toNumber()).to.equal(100 * 10**6);

            // Verify offer global state was updated
            const updatedGlobalState = await sharedState.offerProgram.account.offerGlobalState.fetch(
                sharedState.offerGlobalStatePDA
            );
            expect(updatedGlobalState.offersCount.toNumber()).to.equal(offerId);
        });

        it("Verifies SPL token offer state and properties", async () => {
            const offer = await sharedState.offerProgram.account.offer.fetch(offerPDA);
            
            // Verify offer type
            expect(offer.offerType).to.deep.equal({ sell: {} });
            
            // Verify offer state is active
            expect(offer.state).to.deep.equal({ active: {} });
            
            // Verify token mint is correctly set
            expect(offer.tokenMint).to.not.be.null;
            expect(offer.tokenMint?.equals(testMint)).to.be.true;
            
            // Verify contact information
            expect(offer.ownerContact).to.equal("user1@example.com");
            expect(offer.ownerEncryptionKey).to.equal("user1_encryption_key");
            
            console.log("SPL token offer verification completed");
        });
    });

    describe("SPL Token Trade Creation", () => {
        let tradeId: number;
        let tradePDA: PublicKey;
        let offerPDA: PublicKey;

        before(async () => {
            // Get the offer PDA from previous test
            const offerGlobalState = await sharedState.offerProgram.account.offerGlobalState.fetch(
                sharedState.offerGlobalStatePDA
            );
            const offerId = offerGlobalState.offersCount.toNumber();
            
            [offerPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("offer"), Buffer.from(offerId.toString().padStart(8, '0'), 'utf8')],
                sharedState.offerProgram.programId
            );
        });

        it("Creates an SPL token trade request", async () => {
            // Get current trade count to determine next trade ID
            const tradeGlobalState = await sharedState.tradeProgram.account.tradeGlobalState.fetch(
                sharedState.tradeGlobalStatePDA
            );
            tradeId = tradeGlobalState.tradesCount.toNumber();

            // Derive trade PDA
            [tradePDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("trade"), Buffer.from(tradeId.toString().padStart(8, '0'), 'utf8')],
                sharedState.tradeProgram.programId
            );

            console.log(`Creating trade ${tradeId} at PDA: ${tradePDA.toString()}`);

            // Get offer details for validation
            const offer = await sharedState.offerProgram.account.offer.fetch(offerPDA);
            const offerId = offer.id.toNumber();

            // Create a price account PDA (required for trade creation)
            const [priceAccountPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("calc_price"), Buffer.from("USDC"), Buffer.from("USD")],
                sharedState.priceProgram.programId
            );

            // Create SPL token trade request
            await sharedState.tradeProgram.methods
                .createTrade(
                    new anchor.BN(offerId),        // offerIdArg
                    new anchor.BN(50 * 10**6),     // cryptoAmountToTrade (50 tokens)
                    "user2@example.com"            // buyerContactInfoArg
                )
                .accounts({
                    buyer: user2.publicKey,
                    tradeGlobalState: sharedState.tradeGlobalStatePDA,
                    tradeAccount: tradePDA,
                    offerAccount: offerPDA,
                    priceAccount: priceAccountPDA,
                    offerProgram: sharedState.offerProgram.programId,
                    priceProgram: sharedState.priceProgram.programId,
                    systemProgram: SystemProgram.programId,
                    profileProgram: sharedState.profileProgram.programId,
                    buyerProfile: user2ProfilePDA,
                    sellerProfile: user1ProfilePDA,
                    sellerProfileAuthorityAccountInfo: user1.publicKey,
                    hubConfigForProfileCpi: sharedState.hubConfigPDA,
                    hubProgramIdForProfileCpi: sharedState.hubProgram.programId,
                    profileGlobalStateForBuyer: sharedState.profileGlobalStatePDA,
                    profileGlobalStateForSeller: sharedState.profileGlobalStatePDA,
                })
                .signers([user2])
                .rpc();

            console.log("SPL token trade created successfully");

            // Verify trade was created correctly
            const trade = await sharedState.tradeProgram.account.trade.fetch(tradePDA);
            expect(trade.buyer.equals(user2.publicKey)).to.be.true;
            expect(trade.seller.equals(user1.publicKey)).to.be.true;
            expect(trade.offerId.toNumber()).to.equal(offerId);
            expect(trade.cryptoAmount.toNumber()).to.equal(50 * 10**6);
            expect(trade.buyerContactInfo).to.equal("user2@example.com");

            // Verify trade state
            expect(trade.state).to.deep.equal({ requestCreated: {} });
            expect(trade.escrowType).to.deep.equal({ spl: {} });
            expect(trade.escrowMintAddress?.equals(testMint)).to.be.true;
        });

        it("Verifies SPL token trade properties", async () => {
            const trade = await sharedState.tradeProgram.account.trade.fetch(tradePDA);
            
            // Verify escrow type is SPL
            expect(trade.escrowType).to.deep.equal({ spl: {} });
            
            // Verify escrow mint matches offer mint
            expect(trade.escrowMintAddress).to.not.be.null;
            expect(trade.escrowMintAddress?.equals(testMint)).to.be.true;
            
            // Verify crypto denomination
            expect(trade.cryptoDenomSymbol).to.equal("USDC");
            expect(trade.fiatCurrencySymbol).to.equal("USD");
            
            // Verify amounts
            expect(trade.cryptoAmount.toNumber()).to.equal(50 * 10**6);
            expect(trade.escrowCryptoFundedAmount.toNumber()).to.equal(0); // Not funded yet
            
            console.log("SPL token trade verification completed");
        });
    });

    describe("SPL Token Balance Verification", () => {
        it("Verifies user token balances before trade operations", async () => {
            // Check user1 (seller) token balance
            const user1Balance = await getAccount(sharedState.provider.connection, user1TokenAccount);
            expect(user1Balance.amount).to.equal(BigInt(1000 * 10**6)); // 1000 tokens
            
            // Check user2 (buyer) token balance
            const user2Balance = await getAccount(sharedState.provider.connection, user2TokenAccount);
            expect(user2Balance.amount).to.equal(BigInt(0)); // No tokens initially
            
            console.log(`User1 balance: ${user1Balance.amount} tokens`);
            console.log(`User2 balance: ${user2Balance.amount} tokens`);
        });

        it("Verifies token mint properties", async () => {
            const mintInfo = await sharedState.provider.connection.getAccountInfo(testMint);
            expect(mintInfo).to.not.be.null;
            
            // Verify mint is properly initialized
            expect(mintInfo!.owner.equals(TOKEN_PROGRAM_ID)).to.be.true;
            expect(mintInfo!.data.length).to.equal(MINT_SIZE);
            
            console.log(`Test mint: ${testMint.toString()}`);
            console.log(`Mint account owner: ${mintInfo!.owner.toString()}`);
        });
    });

    describe("Cross-Program State Consistency", () => {
        it("Verifies Hub program references are consistent", async () => {
            const hubConfig = await sharedState.hubProgram.account.hubConfig.fetch(sharedState.hubConfigPDA);
            
            // Verify all programs are registered with Hub
            expect(hubConfig.offerAddr.equals(sharedState.offerProgram.programId)).to.be.true;
            expect(hubConfig.tradeAddr.equals(sharedState.tradeProgram.programId)).to.be.true;
            expect(hubConfig.profileAddr.equals(sharedState.profileProgram.programId)).to.be.true;
            expect(hubConfig.priceAddr.equals(sharedState.priceProgram.programId)).to.be.true;
        });

        it("Verifies program global states reference correct Hub", async () => {
            const offerGlobalState = await sharedState.offerProgram.account.offerGlobalState.fetch(
                sharedState.offerGlobalStatePDA
            );
            const tradeGlobalState = await sharedState.tradeProgram.account.tradeGlobalState.fetch(
                sharedState.tradeGlobalStatePDA
            );
            const profileGlobalState = await sharedState.profileProgram.account.profileGlobalState.fetch(
                sharedState.profileGlobalStatePDA
            );

            expect(offerGlobalState.hubAddress.equals(sharedState.hubProgram.programId)).to.be.true;
            expect(tradeGlobalState.hubAddress.equals(sharedState.hubProgram.programId)).to.be.true;
            expect(profileGlobalState.hubAddress.equals(sharedState.hubProgram.programId)).to.be.true;
        });

        it("Verifies counter consistency across programs", async () => {
            const offerGlobalState = await sharedState.offerProgram.account.offerGlobalState.fetch(
                sharedState.offerGlobalStatePDA
            );
            const tradeGlobalState = await sharedState.tradeProgram.account.tradeGlobalState.fetch(
                sharedState.tradeGlobalStatePDA
            );

            // Verify counters are incremented correctly
            expect(offerGlobalState.offersCount.toNumber()).to.be.greaterThan(0);
            expect(tradeGlobalState.tradesCount.toNumber()).to.be.greaterThan(0);
            
            console.log(`Offers count: ${offerGlobalState.offersCount.toNumber()}`);
            console.log(`Trades count: ${tradeGlobalState.tradesCount.toNumber()}`);
        });
    });
}); 