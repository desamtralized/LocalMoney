import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Hub } from "../../target/types/hub";
import { Offer } from "../../target/types/offer";
import { Trade } from "../../target/types/trade";
import { Profile } from "../../target/types/profile";
import { Price } from "../../target/types/price";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";

export interface SharedTestState {
    provider: anchor.AnchorProvider;
    hubProgram: Program<Hub>;
    offerProgram: Program<Offer>;
    tradeProgram: Program<Trade>;
    profileProgram: Program<Profile>;
    priceProgram: Program<Price>;
    admin: Keypair;
    priceProvider: Keypair;
    hubConfigPDA: PublicKey;
    offerGlobalStatePDA: PublicKey;
    tradeGlobalStatePDA: PublicKey;
    profileGlobalStatePDA: PublicKey;
    priceGlobalStatePDA: PublicKey;
    isInitialized: boolean;
}

let sharedState: SharedTestState | null = null;
let initializationPromise: Promise<SharedTestState> | null = null;

export async function getSharedTestState(): Promise<SharedTestState> {
    if (sharedState && sharedState.isInitialized) {
        return sharedState;
    }
    
    // If initialization is already in progress, wait for it
    if (initializationPromise) {
        return await initializationPromise;
    }
    
    // Start initialization
    initializationPromise = initializeSharedState();
    const result = await initializationPromise;
    initializationPromise = null; // Reset for future calls
    return result;
}

async function initializeSharedState(): Promise<SharedTestState> {

    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    // Programs
    const hubProgram = anchor.workspace.Hub as Program<Hub>;
    const offerProgram = anchor.workspace.Offer as Program<Offer>;
    const tradeProgram = anchor.workspace.Trade as Program<Trade>;
    const profileProgram = anchor.workspace.Profile as Program<Profile>;
    const priceProgram = anchor.workspace.Price as Program<Price>;

    // Use consistent keypairs for shared state
    const admin = Keypair.fromSeed(new Uint8Array(32).fill(100)); // Shared admin
    const priceProvider = Keypair.fromSeed(new Uint8Array(32).fill(101)); // Shared price provider

    // Derive PDAs
    const [hubConfigPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("hub")], 
        hubProgram.programId
    );

    const [offerGlobalStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("offer_global_state")], 
        offerProgram.programId
    );

    const [tradeGlobalStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("trade_global_state")], 
        tradeProgram.programId
    );

    const [profileGlobalStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("profile_global_state")], 
        profileProgram.programId
    );

    const [priceGlobalStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("price_global_state")], 
        priceProgram.programId
    );

    sharedState = {
        provider,
        hubProgram,
        offerProgram,
        tradeProgram,
        profileProgram,
        priceProgram,
        admin,
        priceProvider,
        hubConfigPDA,
        offerGlobalStatePDA,
        tradeGlobalStatePDA,
        profileGlobalStatePDA,
        priceGlobalStatePDA,
        isInitialized: false,
    };

    // Check if all programs are already initialized
    try {
        await hubProgram.account.hubConfig.fetch(hubConfigPDA);
        await offerProgram.account.offerGlobalState.fetch(offerGlobalStatePDA);
        await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        await profileProgram.account.profileGlobalState.fetch(profileGlobalStatePDA);
        await priceProgram.account.priceGlobalState.fetch(priceGlobalStatePDA);
        
        console.log("All programs already initialized, reusing existing state");
        sharedState.isInitialized = true;
        return sharedState;
    } catch (error) {
        // Some programs not initialized, proceed with full initialization
        console.log("Initializing Hub and all programs...");
    }

    // Airdrop SOL to shared accounts
    await Promise.all([
        provider.connection.requestAirdrop(admin.publicKey, 10 * LAMPORTS_PER_SOL),
        provider.connection.requestAirdrop(priceProvider.publicKey, 5 * LAMPORTS_PER_SOL),
    ]);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Initialize Hub program first (central coordinator)
    try {
        await hubProgram.methods
            .initialize(
                offerProgram.programId,      // offerAddr
                tradeProgram.programId,      // tradeAddr  
                profileProgram.programId,    // profileAddr
                priceProgram.programId,      // priceAddr
                priceProvider.publicKey,     // priceProviderAddr
                Keypair.generate().publicKey, // localMarketAddr
                Keypair.generate().publicKey, // localDenomMint
                Keypair.generate().publicKey, // chainFeeCollectorAddr
                Keypair.generate().publicKey, // warchestAddr
                10,                          // activeOffersLimit
                5,                           // activeTradesLimit
                100,                         // arbitrationFeeBps
                50,                          // burnFeeBps
                100,                         // chainFeeBps
                50,                          // warchestFeeBps
                new anchor.BN(3600 * 24 * 7), // tradeExpirationTimer
                new anchor.BN(3600 * 24 * 3), // tradeDisputeTimer
                new anchor.BN(10),           // tradeLimitMinUsd
                new anchor.BN(1000)          // tradeLimitMaxUsd
            )
            .accounts({
                hubConfig: hubConfigPDA,
                admin: admin.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();
    } catch (error) {
        if (error.message.includes("already in use")) {
            console.log("Hub already initialized, skipping...");
        } else {
            throw error;
        }
    }

    // Initialize all other programs and register them with Hub
    try {
        await offerProgram.methods
            .initializeOfferGlobalState()
            .accounts({
                offerGlobalState: offerGlobalStatePDA,
                authority: admin.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();
    } catch (error) {
        if (error.message.includes("already in use")) {
            console.log("Offer global state already initialized, skipping...");
        } else {
            throw error;
        }
    }

    try {
        await offerProgram.methods
            .registerHub(hubProgram.programId)
            .accounts({
                offerGlobalState: offerGlobalStatePDA,
                authority: admin.publicKey,
            })
            .signers([admin])
            .rpc();
    } catch (error) {
        console.log("Offer hub registration skipped (may already be registered)");
    }

    try {
        await tradeProgram.methods
            .initializeTradeGlobalState()
            .accounts({
                tradeGlobalState: tradeGlobalStatePDA,
                authority: admin.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();
    } catch (error) {
        if (error.message.includes("already in use")) {
            console.log("Trade global state already initialized, skipping...");
        } else {
            throw error;
        }
    }

    try {
        await tradeProgram.methods
            .registerHub(hubProgram.programId)
            .accounts({
                tradeGlobalState: tradeGlobalStatePDA,
                admin: admin.publicKey,
            })
            .signers([admin])
            .rpc();
    } catch (error) {
        console.log("Trade hub registration skipped (may already be registered)");
    }

    try {
        await profileProgram.methods
            .initializeProfileGlobalState()
            .accounts({
                profileGlobalState: profileGlobalStatePDA,
                authority: admin.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();
    } catch (error) {
        if (error.message.includes("already in use")) {
            console.log("Profile global state already initialized, skipping...");
        } else {
            throw error;
        }
    }

    try {
        await profileProgram.methods
            .registerHubForProfile(hubProgram.programId)
            .accounts({
                profileGlobalState: profileGlobalStatePDA,
                authority: admin.publicKey,
            })
            .signers([admin])
            .rpc();
    } catch (error) {
        console.log("Profile hub registration skipped (may already be registered)");
    }

    try {
        await priceProgram.methods
            .initializePriceGlobalState(priceProvider.publicKey)
            .accounts({
                priceGlobalState: priceGlobalStatePDA,
                authority: admin.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();
    } catch (error) {
        if (error.message.includes("already in use")) {
            console.log("Price global state already initialized, skipping...");
        } else {
            throw error;
        }
    }

    try {
        await priceProgram.methods
            .registerHubForPrice(hubProgram.programId)
            .accounts({
                priceGlobalState: priceGlobalStatePDA,
                authority: admin.publicKey,
            })
            .signers([admin])
            .rpc();
    } catch (error) {
        console.log("Price hub registration skipped (may already be registered)");
    }

    sharedState.isInitialized = true;
    console.log("All programs initialized successfully");
    return sharedState;
}

export async function createTestUser(userSeed: number): Promise<Keypair> {
    const user = Keypair.fromSeed(new Uint8Array(32).fill(userSeed));
    const provider = anchor.AnchorProvider.env();
    
    // Airdrop SOL to user
    await provider.connection.requestAirdrop(user.publicKey, 10 * LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return user;
}

export function getUserProfilePDA(userPublicKey: PublicKey, profileProgramId: PublicKey): PublicKey {
    const [profilePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("profile"), userPublicKey.toBuffer()], 
        profileProgramId
    );
    return profilePDA;
} 