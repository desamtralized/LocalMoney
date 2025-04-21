import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, SystemProgram, PublicKey, Connection } from "@solana/web3.js";
import { MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMintInstruction, getMinimumBalanceForRentExemptMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction } from "@solana/spl-token";

// Import program types (adjust paths as necessary)
// Assumingidl definesarein target/types/
import { Hub } from "../target/types/hub";
import { Offer } from "../target/types/offer";
import { Trade } from "../target/types/trade";
import { Price } from "../target/types/price";
import { Profile } from "../target/types/profile";

// --- Constants ---
const SOL_AIRDROP_AMOUNT = 2 * anchor.web3.LAMPORTS_PER_SOL; // 2 SOL
const MOCK_TOKEN_DECIMALS = 6;
const MOCK_TOKEN_MINT_AMOUNT = 1_000_000 * (10 ** MOCK_TOKEN_DECIMALS); // 1 Million tokens

// --- Interfaces ---
export interface TestAccounts {
    admin: Keypair;
    offerMaker: Keypair;
    offerTaker: Keypair;
    arbitrator: Keypair;
}

export interface TestPrograms {
    hub: Program<Hub>;
    offer: Program<Offer>;
    trade: Program<Trade>;
    price: Program<Price>;
    profile: Program<Profile>;
}

export interface TestMints {
    mockUsdcMint: Keypair;
}

export interface TestContext {
    provider: anchor.AnchorProvider;
    program: TestPrograms; // Keep 'program' for anchor test standard, map specific ones inside
    users: TestAccounts;
    mints: TestMints;
    hubPda: PublicKey;
    hubBump: number;
}


// --- Setup Function ---
export async function setupTestEnvironment(): Promise<TestContext> {
    anchor.setProvider(anchor.AnchorProvider.env());
    const provider = anchor.getProvider() as anchor.AnchorProvider;

    // Load Programs
    const programs: TestPrograms = {
        hub: anchor.workspace.Hub as Program<Hub>,
        offer: anchor.workspace.Offer as Program<Offer>,
        trade: anchor.workspace.Trade as Program<Trade>,
        price: anchor.workspace.Price as Program<Price>,
        profile: anchor.workspace.Profile as Program<Profile>,
    };

    // Create Users
    const users: TestAccounts = {
        admin: Keypair.generate(),
        offerMaker: Keypair.generate(),
        offerTaker: Keypair.generate(),
        arbitrator: Keypair.generate(),
    };

    // Fund Users
    console.log("Airdropping SOL to users...");
    await Promise.all(
        Object.values(users).map(user => airdropSol(provider.connection, user.publicKey))
    );
    console.log("Airdrops complete.");

    // Create Mints
    console.log("Creating Mock USDC Mint...");
    const mockUsdcMint = Keypair.generate();
    await createMint(provider, mockUsdcMint, users.admin.publicKey, MOCK_TOKEN_DECIMALS);
    const mints: TestMints = { mockUsdcMint };
    console.log("Mock USDC Mint created:", mockUsdcMint.publicKey.toBase58());

    // --- Program Initializations ---

    // 1. Initialize Hub
    console.log("Initializing Hub Program...");
    const [hubPda, hubBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("hub")],
        programs.hub.programId
    );

    // Define initial HubConfig (adjust values as needed)
    const initialHubConfig = {
        offerProgram: programs.offer.programId,
        tradeProgram: programs.trade.programId,
        profileProgram: programs.profile.programId,
        priceProgram: programs.price.programId,
        priceProvider: users.admin.publicKey, // Use admin as placeholder price provider
        localMarket: PublicKey.default, // Placeholder
        localTokenMint: mints.mockUsdcMint.publicKey, // Using our mock USDC
        chainFeeCollector: Keypair.generate().publicKey, // Placeholder fee collector ATA
        warchest: Keypair.generate().publicKey,        // Placeholder warchest ATA
        activeOffersLimit: 10,
        activeTradesLimit: 10,
        arbitrationFeePct: 1, // 1%
        burnFeePct: 0, // 0%
        chainFeePct: 1, // 1%
        warchestFeePct: 1, // 1%
        tradeExpirationTimer: 60 * 60 * 24, // 1 day in seconds
        tradeDisputeTimer: 60 * 60 * 48, // 2 days in seconds
        tradeLimitMin: 10, // $10 USD min
        tradeLimitMax: 10000, // $10,000 USD max
    };


    try {
         await programs.hub.methods
            .initialize(initialHubConfig)
            .accounts({
                hub: hubPda,
                admin: users.admin.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([users.admin])
            .rpc();
        console.log("Hub initialized successfully.");
    } catch (err) {
         console.error("Error initializing Hub:", err);
         // Check if already initialized (error code might vary)
         // Example check (adjust based on actual error):
         // if (!err.toString().includes("already in use")) {
         //     throw err;
         // }
         // console.log("Hub might be already initialized.");
         throw err; // Re-throw for now, handle specific errors if needed
    }

    // TODO: Initialize other programs if they have specific init/register steps
    // Example: programs.trade.methods.registerHub()...

    // --- Create Token Accounts and Mint Tokens ---
    console.log("Creating and funding token accounts...");
    await Promise.all(
        Object.values(users).map(user =>
            createAndFundTokenAccount(provider, mints.mockUsdcMint.publicKey, MOCK_TOKEN_MINT_AMOUNT, user, users.admin)
        )
    );
    console.log("Token accounts created and funded.");
    
    // TODO: Initialize user profiles?
    // Example: createProfile(programs.profile, users.offerMaker, hubPda);


    return {
        provider,
        program: programs, // Pass all programs for convenience
        users,
        mints,
        hubPda,
        hubBump,
    };
}


// --- Helper Functions ---

export async function airdropSol(connection: Connection, publicKey: PublicKey, amount = SOL_AIRDROP_AMOUNT) {
    try {
        const signature = await connection.requestAirdrop(publicKey, amount);
        const latestBlockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction({
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        }, "confirmed");
    } catch (error) {
        console.warn(`Airdrop failed for ${publicKey.toBase58()}: ${error.message}. Continuing...`);
        // Don't fail the whole setup for a potential rate limit issue
    }
}

export async function createMint(
    provider: anchor.AnchorProvider,
    mintKeypair: Keypair,
    mintAuthority: PublicKey,
    decimals: number
): Promise<void> {
    const lamports = await getMinimumBalanceForRentExemptMint(provider.connection);
    const transaction = new anchor.web3.Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: provider.wallet.publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: MINT_SIZE,
            lamports,
            programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
            mintKeypair.publicKey,
            decimals,
            mintAuthority,
            null // freeze authority optional
        )
    );

    await provider.sendAndConfirm(transaction, [mintKeypair]);
}

export async function createAndFundTokenAccount(
    provider: anchor.AnchorProvider,
    mintPublicKey: PublicKey,
    amount: number,
    userKeypair: Keypair, // User who will own the account
    mintAuthorityKeypair: Keypair // Authority allowed to mint
): Promise<PublicKey> {
    const userAta = await getAssociatedTokenAddress(
        mintPublicKey,
        userKeypair.publicKey
    );

    const transaction = new anchor.web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
            provider.wallet.publicKey, // Payer
            userAta,
            userKeypair.publicKey,
            mintPublicKey
        ),
        createMintToInstruction(
            mintPublicKey,
            userAta,
            mintAuthorityKeypair.publicKey,
            amount
        )
    );

    try {
        await provider.sendAndConfirm(transaction, [mintAuthorityKeypair]);
    } catch (err) {
        // Handle potential ATA already exists error gracefully
        if (!err.toString().includes("already in use") && !err.toString().includes("already exists")) {
             console.error(`Failed to create/fund ATA for ${userKeypair.publicKey.toBase58()}:`, err);
             throw err;
        }
        // If ATA exists, try just minting
        console.warn(`ATA for ${userKeypair.publicKey.toBase58()} might already exist. Attempting mint only.`);
        const mintTx = new anchor.web3.Transaction().add(
             createMintToInstruction(
                mintPublicKey,
                userAta,
                mintAuthorityKeypair.publicKey,
                amount
             )
        );
        try {
             await provider.sendAndConfirm(mintTx, [mintAuthorityKeypair]);
        } catch (mintErr) {
             console.error(`Minting only also failed for ${userKeypair.publicKey.toBase58()}:`, mintErr);
             throw mintErr; // Throw if minting also fails
        }
    }


    return userAta;
}

// --- Test Utility Functions ---

export async function createProfile(
    program: Program<Profile>,
    user: Keypair,
    contactInfo: string = "DefaultContact",
    encryptionKey: string = "DefaultKey"
): Promise<PublicKey> {
    console.log(`Initializing/Updating profile for ${user.publicKey.toBase58()}...`);
    const [profilePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("profile"), user.publicKey.toBuffer()],
        program.programId
    );

    // Using update_contact which handles init_if_needed
    await program.methods
        .updateContact({ contact: contactInfo, encryptionKey: encryptionKey })
        .accounts({
            profile: profilePda,
            authority: user.publicKey,
            // hubConfig: Not strictly needed by update_contact but part of context
            // We might need to pass a dummy or fetch the real one if constraints require
            hubConfig: Keypair.generate().publicKey, // Placeholder - CHECK IF NEEDED
            systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

    console.log(`Profile updated for ${user.publicKey.toBase58()} at ${profilePda.toBase58()}`);
    return profilePda;
}


export async function createOffer(
    context: TestContext,
    offerOwner: Keypair, // Usually offerMaker
    direction: any, // Pass OfferDirection enum/object from program types
    fiatCurrency: string,
    paymentMethods: any[], // Pass PaymentMethod array from program types
    minAmount: anchor.BN,
    maxAmount: anchor.BN,
    pricePremium: number // i8
): Promise<{ offerPda: PublicKey, offerCounterPda: PublicKey }> {
    const { program, mints } = context;
    const ownerKey = offerOwner.publicKey;

    console.log(`Creating offer for ${ownerKey.toBase58()}...`);

    const [offerCounterPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("offer_counter"), ownerKey.toBuffer()],
        program.offer.programId
    );

    // Need to fetch the counter state first to get the next ID
    let counterAccount;
    try {
        counterAccount = await program.offer.account.offerCounter.fetch(offerCounterPda);
    } catch (e) {
        // Initialize counter if it doesn't exist (Offer program should have init_if_needed or separate init)
        // Assuming Offer program needs explicit init or create_offer handles it.
        // For simplicity, we'll assume create_offer might fail if counter not init
        // OR we need an initialize_counter instruction if separate.
        console.warn("Offer counter not found, attempting creation anyway...");
        // If Offer has separate initialize: Call it here first.
        // await program.offer.methods.initialize().accounts({...}).signers([offerOwner]).rpc();
        // counterAccount = await program.offer.account.offerCounter.fetch(offerCounterPda);
        // For now, assume create_offer works or fails
        counterAccount = { count: new anchor.BN(0) }; // Simulate initial state
    }

    const nextOfferId = counterAccount.count; // ID used in seeds is the *current* count before increment

    const [offerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("offer"), ownerKey.toBuffer(), nextOfferId.toBuffer('le', 8)],
        program.offer.programId
    );

    await program.offer.methods
        .createOffer(
            direction,
            fiatCurrency,
            paymentMethods,
            minAmount,
            maxAmount,
            pricePremium,
            "Test Offer Description" // Default description
        )
        .accounts({
            owner: ownerKey,
            hub: context.hubPda,
            tokenMint: mints.mockUsdcMint.publicKey,
            offerCounter: offerCounterPda,
            offer: offerPda,
            hubProgram: program.hub.programId, // Pass actual Hub program ID
            systemProgram: SystemProgram.programId,
        })
        .signers([offerOwner])
        .rpc();

    console.log(`Offer ${nextOfferId.toString()} created at ${offerPda.toBase58()} by ${ownerKey.toBase58()}`);
    return { offerPda, offerCounterPda };
}

export async function fetchAccountData<T>(
    program: Program<any>, // Program client (e.g., context.program.trade)
    accountPda: PublicKey,
    accountType: string // Account type name (e.g., "trade", "offer")
): Promise<T | null> {
    try {
        const accountData = await program.account[accountType].fetch(accountPda);
        return accountData as T;
    } catch (error) {
        // Handle account not found gracefully
        if (error.message.includes("Account does not exist")) {
            console.warn(`Account ${accountPda.toBase58()} of type ${accountType} not found.`);
            return null;
        }
        console.error(`Error fetching account ${accountPda.toBase58()} (${accountType}):`, error);
        throw error; // Re-throw other errors
    }
}


// Example function placeholder - implement actual CPI call
// export async function createProfile(program: Program<Profile>, user: Keypair, hubConfigPda: PublicKey) {
//      console.log(`Initializing profile for ${user.publicKey.toBase58()}...`);
//      // const [profilePda, profileBump] = PublicKey.findProgramAddressSync(
//      //     [Buffer.from("profile"), user.publicKey.toBuffer()],
//      //     program.programId
//      // );
//      // await program.methods
//      //     .initializeProfile(/* params if needed */) // Or updateContact if that creates profile
//      //     .accounts({
//      //         profile: profilePda,
//      //         user: user.publicKey,
//      //         hubConfig: hubConfigPda, // Pass hub config if needed by instruction
//      //         systemProgram: SystemProgram.programId,
//      //     })
//      //     .signers([user])
//      //     .rpc();
//      console.log(`Profile initialized for ${user.publicKey.toBase58()}`);
// } 