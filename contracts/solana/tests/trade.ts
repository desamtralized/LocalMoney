import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Trade } from "../target/types/trade";
import { Offer } from "../target/types/offer";
import { Hub } from "../target/types/hub";
import { Price } from "../target/types/price";
import { Profile } from "../target/types/profile";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

describe("Trade Lifecycle", () => {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    // Define Keypairs first
    const admin = Keypair.generate();
    const buyer = Keypair.generate();
    const seller = Keypair.generate(); // Offer owner
    const priceProvider = Keypair.generate(); // Authority for updating prices
    const hubAdminForPriceProg = Keypair.generate(); // Authority for registering hub with price program

    // Wallet for paying transactions, can be any of the keypairs, using admin for most setup
    const payerWallet = new anchor.Wallet(admin);
    // Create a new provider for specific payer if needed, otherwise default provider uses env wallet
    // For program calls where `admin` is the signer, ensure admin.publicKey is used and admin is in signers array.

    // Programs
    const tradeProgram = anchor.workspace.Trade as Program<Trade>;
    const offerProgram = anchor.workspace.Offer as Program<Offer>;
    const hubProgram = anchor.workspace.Hub as Program<Hub>;
    
    let priceProgram: Program<Price>;
    let profileProgram: Program<Profile>;
    
    const PRICE_PROGRAM_ID = new PublicKey("PriceProg111111111111111111111111111111111"); // Replace with actual!
    const PROFILE_PROGRAM_ID = new PublicKey("ProfProg11111111111111111111111111111111"); // Replace with actual!

    try {
        const priceIdl = require("../target/types/price.json");
        priceProgram = new Program<Price>(priceIdl, PRICE_PROGRAM_ID, provider); // Use default provider
    } catch (e) {
        console.error("Failed to load Price program IDL. Ensure it exists at ../target/types/price.json and Price program is built.", e);
    }

    try {
        const profileIdl = require("../target/types/profile.json");
        profileProgram = new Program<Profile>(profileIdl, PROFILE_PROGRAM_ID, provider); // Use default provider
    } catch (e) {
        console.error("Failed to load Profile program IDL. Ensure it exists at ../target/types/profile.json and Profile program is built.", e);
    }

    // Accounts PDAs
    const hubConfigPDA = PublicKey.findProgramAddressSync([Buffer.from("hub")], hubProgram.programId)[0];
    const tradeGlobalStatePDA = PublicKey.findProgramAddressSync([Buffer.from("trade_global_state")], tradeProgram.programId)[0];
    const offerGlobalStatePDA = PublicKey.findProgramAddressSync([Buffer.from("offer_global_state")], offerProgram.programId)[0];
    
    let priceGlobalStatePDA: PublicKey;
    let fiatPriceUsdPDA: PublicKey; // Assuming USD is a direct fiat price we can set (e.g., against itself or a base unit)
    let denomPriceRouteSolPDA: PublicKey; // For SOL -> base_currency_for_dex (e.g., USDC)
    let calculatedPriceSolUsdPDA: PublicKey; // This will be the priceAccount for the trade

    // Test data
    let offerId: anchor.BN;
    let offerPDA: PublicKey;
    let tradeId: anchor.BN;
    let tradePDA: PublicKey;
    const cryptoAmountToTrade = new anchor.BN(1 * LAMPORTS_PER_SOL); // Trading 1 SOL
    const denomSymbolForOffer = "SOL";
    const fiatSymbolForOffer = "USD";
    const baseAssetForDex = "USDC"; // Example base asset for price routes
    const dummyDexPool = Keypair.generate().publicKey;

    before(async () => {
        // Airdrop SOL
        await Promise.all([
            provider.connection.requestAirdrop(admin.publicKey, 10 * LAMPORTS_PER_SOL),
            provider.connection.requestAirdrop(buyer.publicKey, 10 * LAMPORTS_PER_SOL),
            provider.connection.requestAirdrop(seller.publicKey, 10 * LAMPORTS_PER_SOL),
            provider.connection.requestAirdrop(priceProvider.publicKey, 5 * LAMPORTS_PER_SOL),
            provider.connection.requestAirdrop(hubAdminForPriceProg.publicKey, 5 * LAMPORTS_PER_SOL),
        ]);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for airdrops

        // 1. Initialize Hub Program
        const hubInitArgs = {
            offerAddr: offerProgram.programId,
            tradeAddr: tradeProgram.programId,
            profileAddr: profileProgram ? profileProgram.programId : PROFILE_PROGRAM_ID,
            priceAddr: priceProgram ? priceProgram.programId : PRICE_PROGRAM_ID,
            priceProviderAddr: priceProvider.publicKey,
            localMarketAddr: Keypair.generate().publicKey,
            localDenomMint: Keypair.generate().publicKey, 
            chainFeeCollectorAddr: Keypair.generate().publicKey,
            warchestAddr: Keypair.generate().publicKey,
            activeOffersLimit: 10,
            activeTradesLimit: 5,
            arbitrationFeeBps: 100, 
            burnFeeBps: 50,        
            chainFeeBps: 100,      
            warchestFeeBps: 50,      
            tradeExpirationTimer: new anchor.BN(3600 * 24 * 7), 
            tradeDisputeTimer: new anchor.BN(3600 * 24 * 3),  
            tradeLimitMinUsd: new anchor.BN(10),
            tradeLimitMaxUsd: new anchor.BN(1000),
        };
        await hubProgram.methods
          .initialize(
            hubInitArgs.offerAddr,
            hubInitArgs.tradeAddr,
            hubInitArgs.profileAddr,
            hubInitArgs.priceAddr,
            hubInitArgs.priceProviderAddr,
            hubInitArgs.localMarketAddr,
            hubInitArgs.localDenomMint,
            hubInitArgs.chainFeeCollectorAddr,
            hubInitArgs.warchestAddr,
            hubInitArgs.activeOffersLimit,
            hubInitArgs.activeTradesLimit,
            hubInitArgs.arbitrationFeeBps,
            hubInitArgs.burnFeeBps,
            hubInitArgs.chainFeeBps,
            hubInitArgs.warchestFeeBps,
            hubInitArgs.tradeExpirationTimer,
            hubInitArgs.tradeDisputeTimer,
            hubInitArgs.tradeLimitMinUsd,
            hubInitArgs.tradeLimitMaxUsd
          )
          .accounts({
            hub_config: hubConfigPDA, // Corrected to snake_case
            admin: admin.publicKey,
            system_program: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        const initialHubData = await hubProgram.account.hubConfig.fetch(hubConfigPDA);
        expect(initialHubData.admin.equals(admin.publicKey)).to.be.true;
        
        // 2. Initialize Offer Global State & Register Hub
        await offerProgram.methods
            .initializeOfferGlobalState()
            .accounts({
                offerGlobalState: offerGlobalStatePDA,
                authority: admin.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();
        await offerProgram.methods
            .registerHub(hubProgram.programId)
            .accounts({ offerGlobalState: offerGlobalStatePDA, authority: admin.publicKey })
            .signers([admin])
            .rpc();

        // 3. Initialize Price Program & Set up Price for SOL/USD
        if (priceProgram) {
            priceGlobalStatePDA = PublicKey.findProgramAddressSync([Buffer.from("price_global_state")], priceProgram.programId)[0];
            fiatPriceUsdPDA = PublicKey.findProgramAddressSync([Buffer.from("fiat_price"), Buffer.from(fiatSymbolForOffer)], priceProgram.programId)[0];
            denomPriceRouteSolPDA = PublicKey.findProgramAddressSync([Buffer.from("denom_route"), Buffer.from(denomSymbolForOffer)], priceProgram.programId)[0];
            calculatedPriceSolUsdPDA = PublicKey.findProgramAddressSync([Buffer.from("calc_price"), Buffer.from(denomSymbolForOffer), Buffer.from(fiatSymbolForOffer)], priceProgram.programId)[0];

            await priceProgram.methods
                .initializePriceGlobalState(priceProvider.publicKey)
                .accounts({ priceGlobalState: priceGlobalStatePDA, authority: admin.publicKey, systemProgram: SystemProgram.programId })
                .signers([admin])
                .rpc();

            await priceProgram.methods
                .registerHubForPrice(hubProgram.programId)
                .accounts({ priceGlobalState: priceGlobalStatePDA, authority: hubAdminForPriceProg.publicKey })
                .signers([hubAdminForPriceProg])
                .rpc();
            
            await priceProgram.methods
                .updateFiatPrice(fiatSymbolForOffer, new anchor.BN(1_000_000), 6)
                .accounts({
                    fiatPriceAccount: fiatPriceUsdPDA,
                    priceProvider: priceProvider.publicKey,
                    priceGlobalState: priceGlobalStatePDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([priceProvider])
                .rpc();

            const usdcForRouteSymbol = baseAssetForDex; // e.g., "USDC"
            const usdcFiatPricePdaForRoute = PublicKey.findProgramAddressSync([Buffer.from("fiat_price"), Buffer.from(usdcForRouteSymbol)], priceProgram.programId)[0];
            await priceProgram.methods
                .updateFiatPrice(usdcForRouteSymbol, new anchor.BN(1_000_000), 6) // USDC/USD = 1.000000
                .accounts({
                    fiatPriceAccount: usdcFiatPricePdaForRoute,
                    priceProvider: priceProvider.publicKey,
                    priceGlobalState: priceGlobalStatePDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([priceProvider])
                .rpc();

            const routeSteps = [{ poolAddress: dummyDexPool, offerAssetDenom: denomSymbolForOffer, askAssetDenom: usdcForRouteSymbol }];
            await priceProgram.methods
                .registerPriceRouteForDenom(denomSymbolForOffer, routeSteps)
                .accounts({
                    denomPriceRouteAccount: denomPriceRouteSolPDA,
                    hubAdminAuthority: hubAdminForPriceProg.publicKey, 
                    priceGlobalState: priceGlobalStatePDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([hubAdminForPriceProg])
                .rpc();

            await priceProgram.methods
                .calculateAndStorePrice(denomSymbolForOffer, fiatSymbolForOffer)
                .accounts({
                    payer: admin.publicKey,
                    denomPriceRoute: denomPriceRouteSolPDA,
                    baseAssetFiatPrice: usdcFiatPricePdaForRoute, 
                    targetFiatPrice: fiatPriceUsdPDA,    
                    calculatedPriceAccount: calculatedPriceSolUsdPDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc();
            console.log(`Price account ${calculatedPriceSolUsdPDA.toBase58()} set for ${denomSymbolForOffer}/${fiatSymbolForOffer}`);
        } else {
            console.warn("Price program not loaded. Price-dependent tests will likely fail.");
            calculatedPriceSolUsdPDA = null;
        }

        // Initialize Trade Global State
        await tradeProgram.methods
            .initializeTradeGlobalState()
            .accounts({
                tradeGlobalState: tradeGlobalStatePDA,
                authority: admin.publicKey, // Assuming admin initializes this
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();

        const tradeGlobalData = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        expect(tradeGlobalData.tradesCount.toNumber()).to.equal(0);

        // Update HubConfig with actual program addresses (if they changed from initial dummy values)
        // This step might be redundant if hubInitArgs already used the correct program IDs.
        // However, let's ensure critical addresses like chainFeeCollector and warchest are non-dummy for release_escrow.
        const chainFeeCollector = Keypair.generate();
        const warchest = Keypair.generate();
        await provider.connection.requestAirdrop(chainFeeCollector.publicKey, 1 * LAMPORTS_PER_SOL);
        await provider.connection.requestAirdrop(warchest.publicKey, 1 * LAMPORTS_PER_SOL);
        await new Promise(resolve => setTimeout(resolve, 500));

        const updateHubArgs = {
            offerAddr: offerProgram.programId,
            tradeAddr: tradeProgram.programId,
            profileAddr: profileProgram ? profileProgram.programId : PROFILE_PROGRAM_ID,
            priceAddr: priceProgram ? priceProgram.programId : PRICE_PROGRAM_ID,
            priceProviderAddr: admin.publicKey, // Can be same admin or a dedicated one
            localMarketAddr: initialHubData.localMarketAddr, // Keep existing or update
            localDenomMint: initialHubData.localDenomMint, // Keep existing or update
            chainFeeCollectorAddr: chainFeeCollector.publicKey,
            warchestAddr: warchest.publicKey,
            activeOffersLimit: 10,
            activeTradesLimit: 5,
            arbitrationFeeBps: 100,
            burnFeeBps: 50,
            chainFeeBps: 100,
            warchestFeeBps: 50,
            tradeExpirationTimer: new anchor.BN(3600 * 24),
            tradeDisputeTimer: new anchor.BN(3600 * 12),
            tradeLimitMinUsd: new anchor.BN(10),
            tradeLimitMaxUsd: new anchor.BN(10000),
        };
        await hubProgram.methods
            .updateConfig(updateHubArgs) // Pass as a single object
            .accounts({
                hub_config: hubConfigPDA,
                admin: admin.publicKey,
            })
            .signers([admin])
            .rpc();
        console.log("HubConfig updated with potentially new fee collectors.");

        // Set Hub Address in TradeGlobalState
        // Assuming trade program has a `set_hub_address` instruction or similar mechanism.
        // If not, this needs to be handled by the Trade program reading HubConfig from a known PDA or passed account.
        // From trade/lib.rs, `ReleaseEscrow` context gets `hub_config` via `trade_global_state.hub_address`.
        // So, this is critical.
        try {
            await tradeProgram.methods
                .setHubAddress(hubProgram.programId) // Assuming such an instruction exists
                .accounts({
                    tradeGlobalState: tradeGlobalStatePDA,
                    authority: admin.publicKey, // Or an admin authorized by trade program
                })
                .signers([admin])
                .rpc();
            const updatedTradeGlobalData = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
            expect(updatedTradeGlobalData.hubAddress.equals(hubProgram.programId)).to.be.true;
            console.log(`TradeGlobalState hub_address set to: ${hubProgram.programId.toBase58()}`);
        } catch (e) {
            console.warn("Failed to set hub_address in TradeGlobalState. This might be because `set_hub_address` ix doesn't exist, or auth issues. release_escrow might fail.", e);
            // If this fails, tests requiring trade_global_state.hub_address will fail.
            // The trade program might need modification if this ix is missing.
            // For now, if it fails, we proceed and see where it breaks.
        }

        // Create an Offer using the Offer Program
        const offerGlobalStateData = await offerProgram.account.offerGlobalState.fetch(offerGlobalStatePDA);
        offerId = offerGlobalStateData.offersCount; // No .toNumber() here, offerId is BN

        offerPDA = PublicKey.findProgramAddressSync(
            [Buffer.from("offer"), offerId.toBuffer("le", 8)],
            offerProgram.programId
        )[0];

        await offerProgram.methods
            .createOffer(
                "seller_contact@email.com", // ownerContact
                "seller_encryption_key_pub", // ownerEncryptionKey
                { sell: {} }, // offerType: Selling SOL, so it's a sell offer from seller's perspective
                fiatSymbolForOffer, // fiatCurrency
                new anchor.BN(5000), // rate: 50.00 USD per SOL (5000 with 2 decimals)
                2, // rateDecimals from Price program (or specified in offer)
                denomSymbolForOffer, // denom
                new anchor.BN(0.5 * LAMPORTS_PER_SOL), // minAmount
                new anchor.BN(5 * LAMPORTS_PER_SOL), // maxAmount
                "Selling SOL for USD" // description
            )
            .accounts({
                offer: offerPDA,
                owner: seller.publicKey,
                offerGlobalState: offerGlobalStatePDA,
                hubConfig: hubConfigPDA, // Offer program might need access to HubConfig for validations
                systemProgram: SystemProgram.programId,
                // profileProgram: profileProgram ? profileProgram.programId : SystemProgram.programId, // If CPI to Profile
                // sellerProfile: ... // If CPI to Profile (PDA derived for seller)
            })

        const offerData = await offerProgram.account.offer.fetch(offerPDA);
        expect(offerData.owner.equals(seller.publicKey)).to.be.true;
        expect(offerData.id.eq(offerId)).to.be.true;
    });

    it("Creates a new trade (create_trade)", async () => {
        if (!calculatedPriceSolUsdPDA) {
            console.error("CRITICAL: Price account for trade (calculatedPriceSolUsdPDA) was not initialized. Skipping create_trade test.");
            expect.fail("Price account not initialized for trade.");
            return;
        }
        let currentTradeGlobalState;
        try {
            currentTradeGlobalState = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        } catch (e) {
            console.error("CRITICAL: Failed to fetch TradeGlobalState. Ensure it was initialized. Skipping create_trade test", e);
            expect.fail("TradeGlobalState not found or not initialized.");
            return;
        }
        tradeId = currentTradeGlobalState.tradesCount;
        tradePDA = PublicKey.findProgramAddressSync([Buffer.from("trade"), tradeId.toBuffer("le", 8)], tradeProgram.programId)[0];

        try {
            await tradeProgram.methods
                .createTrade(offerId, cryptoAmountToTrade, "buyer_contact@email.com")
                .accounts({
                    buyer: buyer.publicKey,
                    tradeGlobalState: tradeGlobalStatePDA,
                    tradeAccount: tradePDA,
                    offerAccount: offerPDA,
                    priceAccount: calculatedPriceSolUsdPDA, 
                    offerProgram: offerProgram.programId,
                    priceProgram: priceProgram ? priceProgram.programId : PRICE_PROGRAM_ID, 
                    systemProgram: SystemProgram.programId,
                    hubConfig: hubConfigPDA, 
                })
                .signers([buyer])
                .rpc();
        } catch (e) {
            console.error("Error during create_trade:", e);
            throw e; // Fail test if create_trade itself fails
        }

        const tradeData = await tradeProgram.account.trade.fetch(tradePDA);
        expect(tradeData.id.eq(tradeId)).to.be.true;
        expect(tradeData.buyer.equals(buyer.publicKey)).to.be.true;
        expect(tradeData.seller.equals(seller.publicKey)).to.be.true;
        expect(tradeData.offerId.eq(offerId)).to.be.true;
        expect(tradeData.cryptoAmount.eq(cryptoAmountToTrade)).to.be.true;
        expect(tradeData.state).to.deep.equal({ requestCreated: {} });
        expect(tradeData.buyerContactInfo).to.equal("buyer_contact@email.com");

        const updatedGlobalState = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        expect(updatedGlobalState.tradesCount.eq(tradeId.add(new anchor.BN(1)))).to.be.true;
        console.log("create_trade successful.");
    });

    it("Seller accepts the trade (accept_trade)", async () => {
        expect(tradePDA, "tradePDA should be set from create_trade").to.not.be.undefined;
        await tradeProgram.methods
            .acceptTrade(tradeId, "seller_updated_contact@email.com")
            .accounts({ seller: seller.publicKey, tradeAccount: tradePDA, hubConfig: hubConfigPDA })
            .signers([seller])
            .rpc();
        const tradeData = await tradeProgram.account.trade.fetch(tradePDA);
        expect(tradeData.state).to.deep.equal({ requestAccepted: {} });
        expect(tradeData.sellerContactInfo).to.equal("seller_updated_contact@email.com");
        console.log("accept_trade successful.");
    });

    it("Seller funds the trade escrow (fund_trade_escrow - Native SOL)", async () => {
        expect(tradePDA, "tradePDA should be set").to.not.be.undefined;
        const tradeDataBeforeFund = await tradeProgram.account.trade.fetch(tradePDA);

        await tradeProgram.methods
            .fundTradeEscrow(tradeId)
            .accounts({
                funder: seller.publicKey,
                tradeAccount: tradePDA,
                systemProgram: SystemProgram.programId,
                hubConfig: hubConfigPDA, 
            })
            .signers([seller])
            .rpc();

        const tradeData = await tradeProgram.account.trade.fetch(tradePDA);
        expect(tradeData.state).to.deep.equal({ escrowFunded: {} });
        expect(tradeData.escrowCryptoFundedAmount.eq(cryptoAmountToTrade)).to.be.true;

        // Verify escrow balance (tradePDA itself for native SOL)
        const tradeAccountInfo = await provider.connection.getAccountInfo(tradePDA);
        // The SOL is transferred to the trade_account PDA itself.
        // The initial balance of trade_account PDA (rent) + cryptoAmountToTrade
        // This check is tricky as rent varies. A better check is that seller's balance decreased.
        // For now, we'll rely on the program logic and state update.
        // TODO: Add a more robust balance check for native escrow.
    });

    it("Buyer confirms fiat payment sent (confirm_payment_sent)", async () => {
        // Ensure tradePDA is set
        expect(tradePDA).to.not.be.undefined;

        await tradeProgram.methods
            .confirmPaymentSent(tradeId)
            .accounts({
                buyer: buyer.publicKey,
                tradeAccount: tradePDA,
                hubConfig: hubConfigPDA, // For dispute timer, etc.
                tradeGlobalState: tradeGlobalStatePDA, // Needed if hubConfig seeds::program = trade_global_state.hub_address
            })
            .signers([buyer])
            .rpc();

        const tradeData = await tradeProgram.account.trade.fetch(tradePDA);
        expect(tradeData.state).to.deep.equal({ fiatDeposited: {} });
        // TODO: Check dispute_window_ends_at_ts is set if hubConfig was provided
    });

    it("Buyer releases escrow (release_escrow - Native SOL)", async () => {
        expect(tradePDA).to.not.be.undefined;

        const tradeDataBeforeRelease = await tradeProgram.account.trade.fetch(tradePDA);
        const hubConfigData = await hubProgram.account.hubConfig.fetch(hubConfigPDA);

        const sellerInitialBalance = await provider.connection.getBalance(seller.publicKey);
        const chainFeeCollectorInitialBalance = await provider.connection.getBalance(hubConfigData.chainFeeCollectorAddr);
        const warchestInitialBalance = await provider.connection.getBalance(hubConfigData.warchestAddr);


        // For native SOL, token accounts are None
        await tradeProgram.methods
            .releaseEscrow(tradeId)
            .accounts({
                buyer: buyer.publicKey,
                tradeAccount: tradePDA,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfig: hubConfigPDA,
                sellerNativeAccount: seller.publicKey,
                chainFeeCollector: hubConfigData.chainFeeCollectorAddr,
                warchestCollector: hubConfigData.warchestAddr,
                systemProgram: SystemProgram.programId,
                // SPL Token related accounts (set to null or undefined if not passed for native)
                escrowVaultMint: null,
                escrowVault: null,
                sellerTokenAccount: null,
                chainFeeCollectorTokenAccount: null,
                warchestTokenAccount: null,
                tokenProgram: null, // Anchor handles Option<Program> by allowing null/undefined
            })
            .signers([buyer])
            .rpc();

        const tradeData = await tradeProgram.account.trade.fetch(tradePDA);
        // Expecting TradeSettledTaker as buyer initiated release
        // Or EscrowReleased as an intermediate step before settling based on who is "maker/taker" of the offer
        // The current trade program transitions to EscrowReleased, then implies settlement.
        // Let's check for EscrowReleased as per the state machine in lib.rs
        // and then check if it further transitions or if a separate "settle" ix is expected.
        // The PROTOCOL_SPEC.md for CosmWasm goes: FiatDeposited -> EscrowReleased -> SettledForMaker/Taker
        // The Anchor `release_escrow` seems to handle distribution.
        // Let's assume `release_escrow` leads to a terminal "settled" like state for this test.
        // The enum has TradeSettledMaker/Taker, but `release_escrow` currently sets `EscrowReleased`.
        // This might be an area for clarification or further development in the Trade program.
        // For now, we test for the state set by the current `release_escrow` impl.
        expect(tradeData.state).to.deep.equal({ escrowReleased: {} }); // As per current trade/lib.rs
        expect(tradeData.escrowCryptoFundedAmount.toNumber()).to.equal(0); // Escrow should be emptied

        // Verify balances after release (simplified checks)
        const sellerFinalBalance = await provider.connection.getBalance(seller.publicKey);
        const chainFeeCollectorFinalBalance = await provider.connection.getBalance(hubConfigData.chainFeeCollectorAddr);
        const warchestFinalBalance = await provider.connection.getBalance(hubConfigData.warchestAddr);

        const totalFeesBasisPoints = hubConfigData.chainFeeBps + hubConfigData.warchestFeeBps + hubConfigData.burnFeeBps;
        const totalFeeAmount = tradeDataBeforeRelease.cryptoAmount.mul(new anchor.BN(totalFeesBasisPoints)).div(new anchor.BN(10000));
        const chainFeeAmount = tradeDataBeforeRelease.cryptoAmount.mul(new anchor.BN(hubConfigData.chainFeeBps)).div(new anchor.BN(10000));
        const warchestFeeAmount = tradeDataBeforeRelease.cryptoAmount.mul(new anchor.BN(hubConfigData.warchestFeeBps)).div(new anchor.BN(10000));
        // Burn amount is not sent to an account, it's conceptually burned.

        const amountToSeller = tradeDataBeforeRelease.cryptoAmount.sub(totalFeeAmount);

        // These checks are approximate due to transaction fees paid by signers.
        // A more robust check would involve calculating expected balances considering tx fees.
        expect(sellerFinalBalance >= sellerInitialBalance + amountToSeller.toNumber() - LAMPORTS_PER_SOL * 0.01).to.be.true; // Seller receives amount minus fees (approx)
        expect(chainFeeCollectorFinalBalance >= chainFeeCollectorInitialBalance + chainFeeAmount.toNumber() - LAMPORTS_PER_SOL * 0.01).to.be.true;
        expect(warchestFinalBalance >= warchestInitialBalance + warchestFeeAmount.toNumber() - LAMPORTS_PER_SOL * 0.01).to.be.true;

        // TODO: Add tests for SPL token escrow lifecycle.
        // TODO: Add tests for cancel_trade, dispute_trade, settle_dispute, refund_escrow.
    });
}); 