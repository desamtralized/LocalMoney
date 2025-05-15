import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import { Trade } from "../target/types/trade";
import { Offer } from "../target/types/offer";
import { Hub } from "../target/types/hub";
import { Price } from "../target/types/price";
import { Profile } from "../target/types/profile";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
// import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token"; // Not used yet

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

    // Programs
    const tradeProgram = anchor.workspace.Trade;
    const offerProgram = anchor.workspace.Offer;
    const hubProgram = anchor.workspace.Hub;

    let priceProgram: Program<Price>;
    let profileProgram: Program<Profile>;

    // Ensure these are actual Program IDs after deployment
    // Using SystemProgram.programId as a syntactically valid placeholder for now
    const PRICE_PROGRAM_ID_PUBKEY = SystemProgram.programId; // Replace with actual Price Program ID
    const PROFILE_PROGRAM_ID_PUBKEY = SystemProgram.programId; // Replace with actual Profile Program ID

    try {
        const priceIdlJson = require("../target/types/price.json") as Idl;
        priceProgram = new Program<Price>(priceIdlJson, PRICE_PROGRAM_ID_PUBKEY.toBase58(), provider);
    } catch (e) {
        console.error("Failed to load Price program IDL. Ensure it exists at ../target/types/price.json and Price program is built.", e);
    }

    try {
        const profileIdlJson = require("../target/types/profile.json") as Idl;
        profileProgram = new Program<Profile>(profileIdlJson, PROFILE_PROGRAM_ID_PUBKEY.toBase58(), provider);
    } catch (e) {
        console.error("Failed to load Profile program IDL. Ensure it exists at ../target/types/profile.json and Profile program is built.", e);
    }

    // Accounts PDAs
    const hubConfigPDA = PublicKey.findProgramAddressSync([Buffer.from("hub")], hubProgram.programId)[0];
    const tradeGlobalStatePDA = PublicKey.findProgramAddressSync([Buffer.from("trade_global_state")], tradeProgram.programId)[0];
    const offerGlobalStatePDA = PublicKey.findProgramAddressSync([Buffer.from("offer_global_state")], offerProgram.programId)[0];

    let priceGlobalStatePDA: PublicKey;
    let fiatPriceUsdPDA: PublicKey;
    let denomPriceRouteSolPDA: PublicKey;
    let calculatedPriceSolUsdPDA: PublicKey;
    let profileGlobalStatePDAForProfileProg: PublicKey; // Added for Profile program's global state

    // Test data & shared state across tests
    let offerId: anchor.BN;
    let offerPDA: PublicKey;
    let tradeId: anchor.BN;
    let tradePDA: PublicKey;
    let tradeEscrowPDA: PublicKey;
    let buyerProfilePDA: PublicKey;
    let sellerProfilePDA: PublicKey;
    let chainFeeCollectorKey: PublicKey;
    let warchestKey: PublicKey;

    const cryptoAmountToTrade = new anchor.BN(1 * LAMPORTS_PER_SOL);
    const denomSymbolForOffer = "SOL";
    const fiatSymbolForOffer = "USD";
    const baseAssetForDex = "USDC";
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
        await new Promise(resolve => setTimeout(resolve, 1000));

        buyerProfilePDA = PublicKey.findProgramAddressSync([Buffer.from("profile"), buyer.publicKey.toBuffer()], PROFILE_PROGRAM_ID_PUBKEY)[0];
        sellerProfilePDA = PublicKey.findProgramAddressSync([Buffer.from("profile"), seller.publicKey.toBuffer()], PROFILE_PROGRAM_ID_PUBKEY)[0];
        profileGlobalStatePDAForProfileProg = PublicKey.findProgramAddressSync([Buffer.from("profile_global_state")], PROFILE_PROGRAM_ID_PUBKEY)[0]; // Initialized here

        const tempChainFeeCollector = Keypair.generate();
        const tempWarchest = Keypair.generate();
        chainFeeCollectorKey = tempChainFeeCollector.publicKey;
        warchestKey = tempWarchest.publicKey;

        await provider.connection.requestAirdrop(chainFeeCollectorKey, 1 * LAMPORTS_PER_SOL);
        await provider.connection.requestAirdrop(warchestKey, 1 * LAMPORTS_PER_SOL);
        await new Promise(resolve => setTimeout(resolve, 500));

        const hubInitArgs = {
            offerAddr: offerProgram.programId,
            tradeAddr: tradeProgram.programId,
            profileAddr: profileProgram ? profileProgram.programId : PROFILE_PROGRAM_ID_PUBKEY,
            priceAddr: priceProgram ? priceProgram.programId : PRICE_PROGRAM_ID_PUBKEY,
            priceProviderAddr: priceProvider.publicKey,
            localMarketAddr: Keypair.generate().publicKey,
            localDenomMint: Keypair.generate().publicKey,
            chainFeeCollectorAddr: chainFeeCollectorKey,
            warchestAddr: warchestKey,
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
                hubConfig: hubConfigPDA,
                admin: admin.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();
        const initialHubData = await hubProgram.account.hubConfig.fetch(hubConfigPDA);
        expect(initialHubData.admin.equals(admin.publicKey)).to.be.true;
        expect(initialHubData.chainFeeCollectorAddr.equals(chainFeeCollectorKey)).to.be.true;
        expect(initialHubData.warchestAddr.equals(warchestKey)).to.be.true;

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
            .accounts({
                offerGlobalState: offerGlobalStatePDA,
                authority: admin.publicKey
            })
            .signers([admin])
            .rpc();

        if (priceProgram) {
            priceGlobalStatePDA = PublicKey.findProgramAddressSync([Buffer.from("price_global_state")], priceProgram.programId)[0];
            fiatPriceUsdPDA = PublicKey.findProgramAddressSync([Buffer.from("fiat_price"), Buffer.from(fiatSymbolForOffer)], priceProgram.programId)[0];
            denomPriceRouteSolPDA = PublicKey.findProgramAddressSync([Buffer.from("denom_route"), Buffer.from(denomSymbolForOffer)], priceProgram.programId)[0];
            calculatedPriceSolUsdPDA = PublicKey.findProgramAddressSync([Buffer.from("calc_price"), Buffer.from(denomSymbolForOffer), Buffer.from(fiatSymbolForOffer)], priceProgram.programId)[0];

            await priceProgram.methods
                .initializePriceGlobalState(priceProvider.publicKey)
                .accounts({
                    priceGlobalState: priceGlobalStatePDA,
                    authority: admin.publicKey,
                    systemProgram: SystemProgram.programId
                })
                .signers([admin])
                .rpc();

            await priceProgram.methods
                .registerHubForPrice(hubProgram.programId)
                .accounts({
                    priceGlobalState: priceGlobalStatePDA,
                    authority: hubAdminForPriceProg.publicKey
                })
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

            const usdcForRouteSymbol = baseAssetForDex;
            const usdcFiatPricePdaForRoute = PublicKey.findProgramAddressSync([Buffer.from("fiat_price"), Buffer.from(usdcForRouteSymbol)], priceProgram.programId)[0];
            await priceProgram.methods
                .updateFiatPrice(usdcForRouteSymbol, new anchor.BN(1_000_000), 6)
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

        await tradeProgram.methods
            .initializeTradeGlobalState()
            .accounts({
                tradeGlobalState: tradeGlobalStatePDA,
                authority: admin.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();

        const tradeGlobalData = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        expect(tradeGlobalData.tradesCount.toNumber()).to.equal(0);

        const offerGlobalStateData = await offerProgram.account.offerGlobalState.fetch(offerGlobalStatePDA);
        offerId = offerGlobalStateData.offersCount;

        offerPDA = PublicKey.findProgramAddressSync(
            [Buffer.from("offer"), offerId.toBuffer("le", 8)],
            offerProgram.programId
        )[0];

        const offerDetailsForBeforeBlock = {
            ownerContact: "seller_contact_for_setup@email.com",
            ownerEncryptionKey: "seller_enc_key_for_setup",
            offerType: { sell: {} },
            fiatCurrency: fiatSymbolForOffer,
            rate: new anchor.BN(50_000_000),
            denom: denomSymbolForOffer,
            minAmount: new anchor.BN(0.5 * LAMPORTS_PER_SOL),
            maxAmount: new anchor.BN(5 * LAMPORTS_PER_SOL),
            description: "Test offer for SOL/USD (setup)",
        };

        await offerProgram.methods
            .createOffer(
                offerDetailsForBeforeBlock.ownerContact,
                offerDetailsForBeforeBlock.ownerEncryptionKey,
                offerDetailsForBeforeBlock.offerType,
                offerDetailsForBeforeBlock.fiatCurrency,
                offerDetailsForBeforeBlock.rate,
                offerDetailsForBeforeBlock.denom,
                offerDetailsForBeforeBlock.minAmount,
                offerDetailsForBeforeBlock.maxAmount,
                offerDetailsForBeforeBlock.description
            )
            .accounts({
                offer: offerPDA,
                owner: seller.publicKey,
                offerGlobalState: offerGlobalStatePDA,
                hubConfig: hubConfigPDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([seller])
            .rpc();

        const createdOfferData = await offerProgram.account.offer.fetch(offerPDA);
        expect(createdOfferData.owner.equals(seller.publicKey)).to.be.true;
        expect(createdOfferData.id.eq(offerId)).to.be.true;
        console.log(`Offer ${offerId.toString()} created in before() block: ${offerPDA.toBase58()}`);

    });

    it("Creates a trade by the buyer against the pre-existing offer", async () => {
        expect(tradeProgram, "Trade program should be loaded").to.exist;
        expect(offerPDA, "Offer PDA must be set from before() block").to.exist;
        expect(calculatedPriceSolUsdPDA, "Calculated Price PDA for SOL/USD must be set").to.exist;

        const tradeGlobalDataBefore = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        tradeId = tradeGlobalDataBefore.tradesCount;

        tradePDA = PublicKey.findProgramAddressSync(
            [Buffer.from("trade"), tradeId.toBuffer("le", 8)],
            tradeProgram.programId
        )[0];

        tradeEscrowPDA = PublicKey.findProgramAddressSync(
            [Buffer.from("trade_escrow"), tradeId.toBuffer("le", 8)],
            tradeProgram.programId
        )[0];

        const amountToTrade = cryptoAmountToTrade;
        const buyerContact = "buyer_contact_trade@email.com";

        await tradeProgram.methods
            .createTrade(offerId, amountToTrade, buyerContact)
            .accounts({
                tradeGlobalState: tradeGlobalStatePDA,
                trade: tradePDA,
                offer: offerPDA,
                buyer: buyer.publicKey,
                seller: seller.publicKey,
                hubConfig: hubConfigPDA,
                priceAccount: calculatedPriceSolUsdPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        const tradeAccountData = await tradeProgram.account.trade.fetch(tradePDA);
        expect(tradeAccountData.buyer.equals(buyer.publicKey)).to.be.true;
        expect(tradeAccountData.seller.equals(seller.publicKey)).to.be.true;
        expect(tradeAccountData.offerId.eq(offerId)).to.be.true;
        expect(tradeAccountData.cryptoAmount.eq(amountToTrade)).to.be.true;
        expect(tradeAccountData.state.requestCreated).to.exist;

        const tradeGlobalDataAfter = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        expect(tradeGlobalDataAfter.tradesCount.eq(tradeId.add(new anchor.BN(1)))).to.be.true;
        console.log(`Trade ${tradeId.toString()} created: ${tradePDA.toBase58()}`);
    });

    it("Seller accepts the trade request", async () => {
        expect(tradePDA, "Trade PDA must be set").to.exist;
        const sellerContactForAccept = "seller_contact_accept@email.com";

        // Fetch necessary dynamic accounts for CPI contexts
        const fetchedTradeAccount = await tradeProgram.account.trade.fetch(tradePDA);
        const buyerProfileAuthority = fetchedTradeAccount.buyer;

        const fetchedTradeGlobalState = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        // Assuming IDL converts hub_address to hubAddress for tradeGlobalState
        const hubProgramIdForProfileCpi = fetchedTradeGlobalState.hubAddress; 

        await tradeProgram.methods
            .acceptTrade(tradeId, sellerContactForAccept) // Corrected arguments (removed sellerEncKeyForAccept)
            .accounts({
                seller: seller.publicKey, // Corrected from signer
                tradeAccount: tradePDA,  // Corrected from trade
                
                // Accounts for Profile CPI (as per Rust AcceptTrade struct)
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyerProfileAuthority, // Added
                tradeGlobalState: tradeGlobalStatePDA, // Added
                hubConfigForProfileCpi: hubConfigPDA, // Added (main hubConfig, Profile program expects ProfileHubConfigStub)
                hubProgramIdForProfileCpi: hubProgramIdForProfileCpi, // Added
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg, // Added
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg, // Added (can be same instance)
            })
            .signers([seller])
            .rpc();

        const tradeAccountData = await tradeProgram.account.trade.fetch(tradePDA);
        expect(tradeAccountData.state.requestAccepted).to.exist;
        console.log(`Trade ${tradeId.toString()} accepted by seller.`);
    });

    it("Seller funds the trade escrow with SOL", async () => {
        expect(tradePDA, "Trade PDA must be set").to.exist;

        const tradeAccountDataBefore = await tradeProgram.account.trade.fetch(tradePDA);
        const amountToEscrow = tradeAccountDataBefore.cryptoAmount;
        const tradeAccountLamportsBefore = await provider.connection.getBalance(tradePDA).catch(() => 0);

        const buyerProfileAuthority = tradeAccountDataBefore.buyer;
        const fetchedTradeGlobalState = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        const hubProgramIdForProfileCpi = fetchedTradeGlobalState.hubAddress;

        await tradeProgram.methods
            .fundTradeEscrow(tradeId)
            .accounts({
                funder: seller.publicKey,
                tradeAccount: tradePDA,
                systemProgram: SystemProgram.programId,
                funderTokenAccount: null,
                escrowVaultTokenAccount: null,
                tokenProgram: null,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyerProfileAuthority,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgramIdForProfileCpi,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        const tradeAccountDataAfter = await tradeProgram.account.trade.fetch(tradePDA);
        expect(tradeAccountDataAfter.state.escrowFunded).to.exist;
        expect(tradeAccountDataAfter.escrowCryptoFundedAmount.eq(amountToEscrow)).to.be.true;

        const tradeAccountLamportsAfter = await provider.connection.getBalance(tradePDA);
        expect(tradeAccountLamportsAfter - tradeAccountLamportsBefore).to.equal(amountToEscrow.toNumber());
        console.log(`Escrow for trade ${tradeId.toString()} funded by seller. Trade account balance: ${tradeAccountLamportsAfter}`);
    });

    it("Buyer confirms fiat payment sent (FiatDeposited)", async () => {
        expect(tradePDA, "Trade PDA must be set").to.exist;
        await tradeProgram.methods
            .confirmPaymentSent(tradeId)
            .accounts({
                trade: tradePDA,
                signer: buyer.publicKey,
                hubConfig: hubConfigPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
            })
            .signers([buyer])
            .rpc();

        const tradeAccountData = await tradeProgram.account.trade.fetch(tradePDA);
        expect(tradeAccountData.state.fiatDeposited).to.exist;
        console.log(`Fiat payment confirmed for trade ${tradeId.toString()}.`);
    });

    it("Buyer releases the escrow to the seller", async () => {
        expect(tradePDA, "Trade PDA must be set").to.exist;
        expect(chainFeeCollectorKey, "Chain fee collector key must be set").to.exist;
        expect(warchestKey, "Warchest key must be set").to.exist;

        // Fetch dynamic accounts
        const hubConfigData = await hubProgram.account.hubConfig.fetch(hubConfigPDA); // For fees calculation
        const tradeGlobalStateData = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        const hubProgramIdForProfileCpi = tradeGlobalStateData.hubAddress;

        const sellerBalanceBefore = await provider.connection.getBalance(seller.publicKey);
        // For native SOL, the funds are in the tradeAccount PDA itself
        const tradeAccountLamportsBefore = await provider.connection.getBalance(tradePDA); 
        const chainFeeCollectorBalanceBefore = await provider.connection.getBalance(chainFeeCollectorKey);
        const warchestBalanceBefore = await provider.connection.getBalance(warchestKey);

        const tradeAccountDataBefore = await tradeProgram.account.trade.fetch(tradePDA);
        const tradeAmount = tradeAccountDataBefore.cryptoAmount;

        await tradeProgram.methods
            .releaseEscrow(tradeId) // tradeId is _trade_id_arg
            .accounts({
                buyer: buyer.publicKey, // Signer is buyer
                tradeAccount: tradePDA, // Escrowed SOL is here
                tradeGlobalState: tradeGlobalStatePDA, // Added
                seller: seller.publicKey, // Beneficiary of the trade
                
                hubConfigAccount: hubConfigPDA, // Name change
                hubProgramIdForProfileCpi: hubProgramIdForProfileCpi, // Added
                chainFeeCollector: chainFeeCollectorKey,
                warchest: warchestKey,
                
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg, // Added
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg, // Added
                
                // SPL Token accounts are null for native SOL escrow
                escrowVaultTokenAccount: null, // Added
                sellerTokenAccount: null, // Added
                tokenProgram: null, // Added

                systemProgram: SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        const tradeAccountDataAfter = await tradeProgram.account.trade.fetch(tradePDA);
        // Check state. For release, it should be escrowReleased (or settled states if fees are zero/specific conditions)
        expect(tradeAccountDataAfter.state.escrowReleased || tradeAccountDataAfter.state.settledForMaker || tradeAccountDataAfter.state.settledForSeller).to.exist; 

        const sellerBalanceAfter = await provider.connection.getBalance(seller.publicKey);
        // Trade account PDA should be (nearly) zeroed out after release for native SOL
        const tradeAccountLamportsAfter = await provider.connection.getBalance(tradePDA).catch(() => 0); 
        const chainFeeCollectorBalanceAfter = await provider.connection.getBalance(chainFeeCollectorKey);
        const warchestBalanceAfter = await provider.connection.getBalance(warchestKey);

        const chainFeeBps = hubConfigData.chainFeeBps;
        const warchestFeeBps = hubConfigData.warchestFeeBps;
        const burnFeeBps = hubConfigData.burnFeeBps; // Assuming burn fee is handled internally by sending to a dead address or similar

        const expectedChainFee = tradeAmount.mul(new anchor.BN(chainFeeBps)).div(new anchor.BN(10000));
        const expectedWarchestFee = tradeAmount.mul(new anchor.BN(warchestFeeBps)).div(new anchor.BN(10000));
        const expectedBurnAmount = tradeAmount.mul(new anchor.BN(burnFeeBps)).div(new anchor.BN(10000)); // Burn does not go to an external account
        const totalFeesExcludingBurn = expectedChainFee.add(expectedWarchestFee); // Seller receives amount after all fees (incl. burn)
        const totalFeesIncludingBurn = totalFeesExcludingBurn.add(expectedBurnAmount);
        const expectedSellerAmount = tradeAmount.sub(totalFeesIncludingBurn);

        // Check that the trade account is now (nearly) empty
        expect(tradeAccountLamportsAfter < LAMPORTS_PER_SOL * 0.001, "Trade account should be nearly empty after release").to.be.true;

        expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedSellerAmount.toNumber());
        expect(chainFeeCollectorBalanceAfter - chainFeeCollectorBalanceBefore).to.equal(expectedChainFee.toNumber());
        expect(warchestBalanceAfter - warchestBalanceBefore).to.equal(expectedWarchestFee.toNumber());

        console.log(`Escrow released for trade ${tradeId.toString()}. Seller received SOL: ${expectedSellerAmount.toNumber() / LAMPORTS_PER_SOL}`);
        console.log(`Chain fee collector received SOL: ${expectedChainFee.toNumber() / LAMPORTS_PER_SOL}`);
        console.log(`Warchest received SOL: ${expectedWarchestFee.toNumber() / LAMPORTS_PER_SOL}`);
        console.log(`Burned amount (not transferred): ${expectedBurnAmount.toNumber() / LAMPORTS_PER_SOL}`);
    });

    it("Buyer can dispute the trade", async () => {
        expect(tradePDA, "Trade PDA must be set").to.exist;
        const disputeReason = "Seller not responding to messages";

        // Create a new trade for dispute testing
        const tradeGlobalDataBefore = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        const newTradeId = tradeGlobalDataBefore.tradesCount;

        const newTradePDA = PublicKey.findProgramAddressSync(
            [Buffer.from("trade"), newTradeId.toBuffer("le", 8)],
            tradeProgram.programId
        )[0];

        // Create trade
        await tradeProgram.methods
            .createTrade(offerId, cryptoAmountToTrade, "buyer_contact_dispute@email.com")
            .accounts({
                tradeGlobalState: tradeGlobalStatePDA,
                trade: newTradePDA,
                offer: offerPDA,
                buyer: buyer.publicKey,
                seller: seller.publicKey,
                hubConfig: hubConfigPDA,
                priceAccount: calculatedPriceSolUsdPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        // Accept trade
        await tradeProgram.methods
            .acceptTrade(newTradeId, "seller_contact_dispute@email.com")
            .accounts({
                seller: seller.publicKey,
                tradeAccount: newTradePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Fund escrow
        await tradeProgram.methods
            .fundTradeEscrow(newTradeId)
            .accounts({
                funder: seller.publicKey,
                tradeAccount: newTradePDA,
                systemProgram: SystemProgram.programId,
                funderTokenAccount: null,
                escrowVaultTokenAccount: null,
                tokenProgram: null,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Dispute the trade
        await tradeProgram.methods
            .disputeTrade(newTradeId, disputeReason)
            .accounts({
                disputer: buyer.publicKey,
                tradeAccount: newTradePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                tradeGlobalState: tradeGlobalStatePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                disputer_profile: buyerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityInfo: buyer.publicKey,
                sellerProfile: sellerProfilePDA,
                sellerProfileAuthorityInfo: seller.publicKey,
                profileGlobalState: profileGlobalStatePDAForProfileProg,
            })
            .signers([buyer])
            .rpc();

        const tradeAccountData = await tradeProgram.account.trade.fetch(newTradePDA);
        expect(tradeAccountData.state.disputeOpened).to.exist;
        expect(tradeAccountData.disputeOpener.equals(buyer.publicKey)).to.be.true;
        expect(tradeAccountData.disputeReason).to.equal(disputeReason);
        console.log(`Trade ${newTradeId.toString()} disputed by buyer. Reason: ${disputeReason}`);
    });

    it("Seller can dispute the trade", async () => {
        expect(tradePDA, "Trade PDA must be set").to.exist;
        const disputeReason = "Buyer not confirming payment";

        // Create a new trade for dispute testing
        const tradeGlobalDataBefore = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        const newTradeId = tradeGlobalDataBefore.tradesCount;

        const newTradePDA = PublicKey.findProgramAddressSync(
            [Buffer.from("trade"), newTradeId.toBuffer("le", 8)],
            tradeProgram.programId
        )[0];

        // Create trade
        await tradeProgram.methods
            .createTrade(offerId, cryptoAmountToTrade, "buyer_contact_dispute2@email.com")
            .accounts({
                tradeGlobalState: tradeGlobalStatePDA,
                trade: newTradePDA,
                offer: offerPDA,
                buyer: buyer.publicKey,
                seller: seller.publicKey,
                hubConfig: hubConfigPDA,
                priceAccount: calculatedPriceSolUsdPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        // Accept trade
        await tradeProgram.methods
            .acceptTrade(newTradeId, "seller_contact_dispute2@email.com")
            .accounts({
                seller: seller.publicKey,
                tradeAccount: newTradePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Fund escrow
        await tradeProgram.methods
            .fundTradeEscrow(newTradeId)
            .accounts({
                funder: seller.publicKey,
                tradeAccount: newTradePDA,
                systemProgram: SystemProgram.programId,
                funderTokenAccount: null,
                escrowVaultTokenAccount: null,
                tokenProgram: null,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Dispute the trade
        await tradeProgram.methods
            .disputeTrade(newTradeId, disputeReason)
            .accounts({
                disputer: seller.publicKey,
                tradeAccount: newTradePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                tradeGlobalState: tradeGlobalStatePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                disputer_profile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityInfo: buyer.publicKey,
                sellerProfile: sellerProfilePDA,
                sellerProfileAuthorityInfo: seller.publicKey,
                profileGlobalState: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        const tradeAccountData = await tradeProgram.account.trade.fetch(newTradePDA);
        expect(tradeAccountData.state.disputeOpened).to.exist;
        expect(tradeAccountData.disputeOpener.equals(seller.publicKey)).to.be.true;
        expect(tradeAccountData.disputeReason).to.equal(disputeReason);
        console.log(`Trade ${newTradeId.toString()} disputed by seller. Reason: ${disputeReason}`);
    });

    it("Cannot dispute a trade that is already disputed", async () => {
        expect(tradePDA, "Trade PDA must be set").to.exist;
        const disputeReason = "Second dispute attempt";

        // Create a new trade for dispute testing
        const tradeGlobalDataBefore = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        const newTradeId = tradeGlobalDataBefore.tradesCount;

        const newTradePDA = PublicKey.findProgramAddressSync(
            [Buffer.from("trade"), newTradeId.toBuffer("le", 8)],
            tradeProgram.programId
        )[0];

        // Create trade
        await tradeProgram.methods
            .createTrade(offerId, cryptoAmountToTrade, "buyer_contact_dispute3@email.com")
            .accounts({
                tradeGlobalState: tradeGlobalStatePDA,
                trade: newTradePDA,
                offer: offerPDA,
                buyer: buyer.publicKey,
                seller: seller.publicKey,
                hubConfig: hubConfigPDA,
                priceAccount: calculatedPriceSolUsdPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        // Accept trade
        await tradeProgram.methods
            .acceptTrade(newTradeId, "seller_contact_dispute3@email.com")
            .accounts({
                seller: seller.publicKey,
                tradeAccount: newTradePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Fund escrow
        await tradeProgram.methods
            .fundTradeEscrow(newTradeId)
            .accounts({
                funder: seller.publicKey,
                tradeAccount: newTradePDA,
                systemProgram: SystemProgram.programId,
                funderTokenAccount: null,
                escrowVaultTokenAccount: null,
                tokenProgram: null,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // First dispute
        await tradeProgram.methods
            .disputeTrade(newTradeId, "First dispute")
            .accounts({
                disputer: buyer.publicKey,
                tradeAccount: newTradePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                tradeGlobalState: tradeGlobalStatePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                disputer_profile: buyerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityInfo: buyer.publicKey,
                sellerProfile: sellerProfilePDA,
                sellerProfileAuthorityInfo: seller.publicKey,
                profileGlobalState: profileGlobalStatePDAForProfileProg,
            })
            .signers([buyer])
            .rpc();

        // Second dispute attempt should fail
        try {
            await tradeProgram.methods
                .disputeTrade(newTradeId, disputeReason)
                .accounts({
                    disputer: seller.publicKey,
                    tradeAccount: newTradePDA,
                    hubConfigForProfileCpi: hubConfigPDA,
                    hubProgramIdForProfileCpi: hubProgram.programId,
                    tradeGlobalState: tradeGlobalStatePDA,
                    profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                    disputer_profile: sellerProfilePDA,
                    buyerProfile: buyerProfilePDA,
                    buyerProfileAuthorityInfo: buyer.publicKey,
                    sellerProfile: sellerProfilePDA,
                    sellerProfileAuthorityInfo: seller.publicKey,
                    profileGlobalState: profileGlobalStatePDAForProfileProg,
                })
                .signers([seller])
                .rpc();
            assert.fail("Should have thrown error");
        } catch (err) {
            expect(err.error.errorCode.code).to.equal("TradeAlreadyDisputedOrFinalized");
            console.log("Successfully caught error when trying to dispute an already disputed trade");
        }
    });

    it("Can settle a disputed trade without arbitrator", async () => {
        expect(tradePDA, "Trade PDA must be set").to.exist;
        const disputeReason = "Dispute to be settled";

        // Create a new trade for settlement testing
        const tradeGlobalDataBefore = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        const newTradeId = tradeGlobalDataBefore.tradesCount;

        const newTradePDA = PublicKey.findProgramAddressSync(
            [Buffer.from("trade"), newTradeId.toBuffer("le", 8)],
            tradeProgram.programId
        )[0];

        // Create trade
        await tradeProgram.methods
            .createTrade(offerId, cryptoAmountToTrade, "buyer_contact_settle@email.com")
            .accounts({
                tradeGlobalState: tradeGlobalStatePDA,
                trade: newTradePDA,
                offer: offerPDA,
                buyer: buyer.publicKey,
                seller: seller.publicKey,
                hubConfig: hubConfigPDA,
                priceAccount: calculatedPriceSolUsdPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        // Accept trade
        await tradeProgram.methods
            .acceptTrade(newTradeId, "seller_contact_settle@email.com")
            .accounts({
                seller: seller.publicKey,
                tradeAccount: newTradePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Fund escrow
        await tradeProgram.methods
            .fundTradeEscrow(newTradeId)
            .accounts({
                funder: seller.publicKey,
                tradeAccount: newTradePDA,
                systemProgram: SystemProgram.programId,
                funderTokenAccount: null,
                escrowVaultTokenAccount: null,
                tokenProgram: null,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Open dispute
        await tradeProgram.methods
            .disputeTrade(newTradeId, disputeReason)
            .accounts({
                disputer: buyer.publicKey,
                tradeAccount: newTradePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                tradeGlobalState: tradeGlobalStatePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                disputer_profile: buyerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityInfo: buyer.publicKey,
                sellerProfile: sellerProfilePDA,
                sellerProfileAuthorityInfo: seller.publicKey,
                profileGlobalState: profileGlobalStatePDAForProfileProg,
            })
            .signers([buyer])
            .rpc();

        // Get balances before settlement
        const sellerBalanceBefore = await provider.connection.getBalance(seller.publicKey);
        const tradeAccountLamportsBefore = await provider.connection.getBalance(newTradePDA);
        const chainFeeCollectorBalanceBefore = await provider.connection.getBalance(chainFeeCollectorKey);
        const warchestBalanceBefore = await provider.connection.getBalance(warchestKey);

        // Settle trade (can be done by either party, let's use seller)
        await tradeProgram.methods
            .settleTrade(newTradeId)
            .accounts({
                settler: seller.publicKey,
                tradeAccount: newTradePDA,
                seller: seller.publicKey,
                hubConfig: hubConfigPDA,
                chainFeeCollector: chainFeeCollectorKey,
                warchest: warchestKey,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([seller])
            .rpc();

        // Verify trade state and balances
        const tradeAccountData = await tradeProgram.account.trade.fetch(newTradePDA);
        expect(tradeAccountData.state.settledForSeller).to.exist;

        const sellerBalanceAfter = await provider.connection.getBalance(seller.publicKey);
        const tradeAccountLamportsAfter = await provider.connection.getBalance(newTradePDA);
        const chainFeeCollectorBalanceAfter = await provider.connection.getBalance(chainFeeCollectorKey);
        const warchestBalanceAfter = await provider.connection.getBalance(warchestKey);

        // Verify balances changed correctly
        const hubConfigData = await hubProgram.account.hubConfig.fetch(hubConfigPDA);
        const chainFeeBps = hubConfigData.chainFeeBps;
        const warchestFeeBps = hubConfigData.warchestFeeBps;
        const burnFeeBps = hubConfigData.burnFeeBps;

        const tradeAmount = cryptoAmountToTrade;
        const expectedChainFee = tradeAmount.mul(new anchor.BN(chainFeeBps)).div(new anchor.BN(10000));
        const expectedWarchestFee = tradeAmount.mul(new anchor.BN(warchestFeeBps)).div(new anchor.BN(10000));
        const expectedBurnAmount = tradeAmount.mul(new anchor.BN(burnFeeBps)).div(new anchor.BN(10000));
        const totalFeesExcludingBurn = expectedChainFee.add(expectedWarchestFee);
        const totalFeesIncludingBurn = totalFeesExcludingBurn.add(expectedBurnAmount);
        const expectedSellerAmount = tradeAmount.sub(totalFeesIncludingBurn);

        expect(tradeAccountLamportsAfter < LAMPORTS_PER_SOL * 0.001, "Trade account should be nearly empty after settlement").to.be.true;
        expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedSellerAmount.toNumber());
        expect(chainFeeCollectorBalanceAfter - chainFeeCollectorBalanceBefore).to.equal(expectedChainFee.toNumber());
        expect(warchestBalanceAfter - warchestBalanceBefore).to.equal(expectedWarchestFee.toNumber());

        console.log(`Trade ${newTradeId.toString()} settled successfully. Seller received: ${expectedSellerAmount.toNumber() / LAMPORTS_PER_SOL} SOL`);
    });

    it("Can refund a disputed trade to seller without arbitrator", async () => {
        expect(tradePDA, "Trade PDA must be set").to.exist;
        const disputeReason = "Dispute to be refunded";

        // Create a new trade for refund testing
        const tradeGlobalDataBefore = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        const newTradeId = tradeGlobalDataBefore.tradesCount;

        const newTradePDA = PublicKey.findProgramAddressSync(
            [Buffer.from("trade"), newTradeId.toBuffer("le", 8)],
            tradeProgram.programId
        )[0];

        // Create trade
        await tradeProgram.methods
            .createTrade(offerId, cryptoAmountToTrade, "buyer_contact_refund@email.com")
            .accounts({
                tradeGlobalState: tradeGlobalStatePDA,
                trade: newTradePDA,
                offer: offerPDA,
                buyer: buyer.publicKey,
                seller: seller.publicKey,
                hubConfig: hubConfigPDA,
                priceAccount: calculatedPriceSolUsdPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        // Accept trade
        await tradeProgram.methods
            .acceptTrade(newTradeId, "seller_contact_refund@email.com")
            .accounts({
                seller: seller.publicKey,
                tradeAccount: newTradePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Fund escrow
        await tradeProgram.methods
            .fundTradeEscrow(newTradeId)
            .accounts({
                funder: seller.publicKey,
                tradeAccount: newTradePDA,
                systemProgram: SystemProgram.programId,
                funderTokenAccount: null,
                escrowVaultTokenAccount: null,
                tokenProgram: null,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Open dispute
        await tradeProgram.methods
            .disputeTrade(newTradeId, disputeReason)
            .accounts({
                disputer: buyer.publicKey,
                tradeAccount: newTradePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                tradeGlobalState: tradeGlobalStatePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                disputer_profile: buyerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityInfo: buyer.publicKey,
                sellerProfile: sellerProfilePDA,
                sellerProfileAuthorityInfo: seller.publicKey,
                profileGlobalState: profileGlobalStatePDAForProfileProg,
            })
            .signers([buyer])
            .rpc();

        // Get balances before refund
        const sellerBalanceBefore = await provider.connection.getBalance(seller.publicKey);
        const tradeAccountLamportsBefore = await provider.connection.getBalance(newTradePDA);

        // Refund trade to seller (can be done by either party, let's use buyer)
        await tradeProgram.methods
            .refundTrade(newTradeId)
            .accounts({
                refunder: buyer.publicKey,
                tradeAccount: newTradePDA,
                seller: seller.publicKey,
                hubConfig: hubConfigPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        // Verify trade state and balances
        const tradeAccountData = await tradeProgram.account.trade.fetch(newTradePDA);
        expect(tradeAccountData.state.refundedToSeller).to.exist;

        const sellerBalanceAfter = await provider.connection.getBalance(seller.publicKey);
        const tradeAccountLamportsAfter = await provider.connection.getBalance(newTradePDA);

        // For refund, the full amount should go back to seller without fees
        const expectedRefundAmount = cryptoAmountToTrade;
        
        expect(tradeAccountLamportsAfter < LAMPORTS_PER_SOL * 0.001, "Trade account should be nearly empty after refund").to.be.true;
        expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedRefundAmount.toNumber());

        console.log(`Trade ${newTradeId.toString()} refunded successfully. Seller received full refund: ${expectedRefundAmount.toNumber() / LAMPORTS_PER_SOL} SOL`);
    });

    it("Can assign an arbitrator to a disputed trade", async () => {
        expect(tradePDA, "Trade PDA must be set").to.exist;
        const disputeReason = "Dispute requiring arbitration";
        const arbitrator = Keypair.generate();

        // Airdrop SOL to arbitrator for rent
        await provider.connection.requestAirdrop(arbitrator.publicKey, 1 * LAMPORTS_PER_SOL);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Create a new trade for arbitration testing
        const tradeGlobalDataBefore = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        const newTradeId = tradeGlobalDataBefore.tradesCount;

        const newTradePDA = PublicKey.findProgramAddressSync(
            [Buffer.from("trade"), newTradeId.toBuffer("le", 8)],
            tradeProgram.programId
        )[0];

        // Create trade
        await tradeProgram.methods
            .createTrade(offerId, cryptoAmountToTrade, "buyer_contact_arbitration@email.com")
            .accounts({
                tradeGlobalState: tradeGlobalStatePDA,
                trade: newTradePDA,
                offer: offerPDA,
                buyer: buyer.publicKey,
                seller: seller.publicKey,
                hubConfig: hubConfigPDA,
                priceAccount: calculatedPriceSolUsdPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        // Accept trade
        await tradeProgram.methods
            .acceptTrade(newTradeId, "seller_contact_arbitration@email.com")
            .accounts({
                seller: seller.publicKey,
                tradeAccount: newTradePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Fund escrow
        await tradeProgram.methods
            .fundTradeEscrow(newTradeId)
            .accounts({
                funder: seller.publicKey,
                tradeAccount: newTradePDA,
                systemProgram: SystemProgram.programId,
                funderTokenAccount: null,
                escrowVaultTokenAccount: null,
                tokenProgram: null,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Open dispute
        await tradeProgram.methods
            .disputeTrade(newTradeId, disputeReason)
            .accounts({
                disputer: buyer.publicKey,
                tradeAccount: newTradePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                tradeGlobalState: tradeGlobalStatePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                disputer_profile: buyerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityInfo: buyer.publicKey,
                sellerProfile: sellerProfilePDA,
                sellerProfileAuthorityInfo: seller.publicKey,
                profileGlobalState: profileGlobalStatePDAForProfileProg,
            })
            .signers([buyer])
            .rpc();

        // Assign arbitrator (must be done by admin)
        await tradeProgram.methods
            .assignArbitrator(newTradeId)
            .accounts({
                admin: admin.publicKey,
                tradeAccount: newTradePDA,
                arbitrator: arbitrator.publicKey,
                hubConfig: hubConfigPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();

        // Verify trade state and arbitrator assignment
        const tradeAccountData = await tradeProgram.account.trade.fetch(newTradePDA);
        expect(tradeAccountData.state.arbitratorAssigned).to.exist;
        expect(tradeAccountData.arbitrator.equals(arbitrator.publicKey)).to.be.true;

        // Verify that the arbitration fee was taken from the escrow amount
        const hubConfigData = await hubProgram.account.hubConfig.fetch(hubConfigPDA);
        const arbitrationFeeBps = hubConfigData.arbitrationFeeBps;
        const expectedArbitrationFee = cryptoAmountToTrade.mul(new anchor.BN(arbitrationFeeBps)).div(new anchor.BN(10000));
        const expectedRemainingEscrow = cryptoAmountToTrade.sub(expectedArbitrationFee);

        expect(tradeAccountData.escrowCryptoFundedAmount.eq(expectedRemainingEscrow)).to.be.true;
        expect(tradeAccountData.arbitrationFeeAmount.eq(expectedArbitrationFee)).to.be.true;

        console.log(`Trade ${newTradeId.toString()} assigned to arbitrator: ${arbitrator.publicKey.toBase58()}`);
        console.log(`Arbitration fee: ${expectedArbitrationFee.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`Remaining escrow: ${expectedRemainingEscrow.toNumber() / LAMPORTS_PER_SOL} SOL`);
    });

    it("Arbitrator can resolve dispute in favor of buyer or seller", async () => {
        expect(tradePDA, "Trade PDA must be set").to.exist;
        const disputeReason = "Dispute for arbitration resolution";
        const arbitrator = Keypair.generate();

        // Airdrop SOL to arbitrator for rent
        await provider.connection.requestAirdrop(arbitrator.publicKey, 1 * LAMPORTS_PER_SOL);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Create a new trade for arbitration testing
        const tradeGlobalDataBefore = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        const newTradeId = tradeGlobalDataBefore.tradesCount;

        const newTradePDA = PublicKey.findProgramAddressSync(
            [Buffer.from("trade"), newTradeId.toBuffer("le", 8)],
            tradeProgram.programId
        )[0];

        // Create trade
        await tradeProgram.methods
            .createTrade(offerId, cryptoAmountToTrade, "buyer_contact_arb_resolve@email.com")
            .accounts({
                tradeGlobalState: tradeGlobalStatePDA,
                trade: newTradePDA,
                offer: offerPDA,
                buyer: buyer.publicKey,
                seller: seller.publicKey,
                hubConfig: hubConfigPDA,
                priceAccount: calculatedPriceSolUsdPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        // Accept trade
        await tradeProgram.methods
            .acceptTrade(newTradeId, "seller_contact_arb_resolve@email.com")
            .accounts({
                seller: seller.publicKey,
                tradeAccount: newTradePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Fund escrow
        await tradeProgram.methods
            .fundTradeEscrow(newTradeId)
            .accounts({
                funder: seller.publicKey,
                tradeAccount: newTradePDA,
                systemProgram: SystemProgram.programId,
                funderTokenAccount: null,
                escrowVaultTokenAccount: null,
                tokenProgram: null,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Open dispute
        await tradeProgram.methods
            .disputeTrade(newTradeId, disputeReason)
            .accounts({
                disputer: buyer.publicKey,
                tradeAccount: newTradePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                tradeGlobalState: tradeGlobalStatePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                disputer_profile: buyerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityInfo: buyer.publicKey,
                sellerProfile: sellerProfilePDA,
                sellerProfileAuthorityInfo: seller.publicKey,
                profileGlobalState: profileGlobalStatePDAForProfileProg,
            })
            .signers([buyer])
            .rpc();

        // Assign arbitrator
        await tradeProgram.methods
            .assignArbitrator(newTradeId)
            .accounts({
                admin: admin.publicKey,
                tradeAccount: newTradePDA,
                arbitrator: arbitrator.publicKey,
                hubConfig: hubConfigPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();

        // Get balances before resolution
        const buyerBalanceBefore = await provider.connection.getBalance(buyer.publicKey);
        const sellerBalanceBefore = await provider.connection.getBalance(seller.publicKey);
        const arbitratorBalanceBefore = await provider.connection.getBalance(arbitrator.publicKey);
        const chainFeeCollectorBalanceBefore = await provider.connection.getBalance(chainFeeCollectorKey);
        const warchestBalanceBefore = await provider.connection.getBalance(warchestKey);

        // Resolve dispute in favor of buyer
        const resolution = { buyerWins: {} }; // or { sellerWins: {} }
        const resolutionReason = "Evidence shows buyer's claim is valid";

        await tradeProgram.methods
            .arbitratorResolveDispute(newTradeId, resolution, resolutionReason)
            .accounts({
                arbitrator: arbitrator.publicKey,
                tradeAccount: newTradePDA,
                buyer: buyer.publicKey,
                seller: seller.publicKey,
                hubConfig: hubConfigPDA,
                chainFeeCollector: chainFeeCollectorKey,
                warchest: warchestKey,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([arbitrator])
            .rpc();

        // Verify trade state and balances
        const tradeAccountData = await tradeProgram.account.trade.fetch(newTradePDA);
        expect(tradeAccountData.state.settledByArbitrator).to.exist;
        expect(tradeAccountData.arbitratorResolution).to.deep.equal(resolution);
        expect(tradeAccountData.arbitratorResolutionReason).to.equal(resolutionReason);

        const buyerBalanceAfter = await provider.connection.getBalance(buyer.publicKey);
        const sellerBalanceAfter = await provider.connection.getBalance(seller.publicKey);
        const arbitratorBalanceAfter = await provider.connection.getBalance(arbitrator.publicKey);
        const chainFeeCollectorBalanceAfter = await provider.connection.getBalance(chainFeeCollectorKey);
        const warchestBalanceAfter = await provider.connection.getBalance(warchestKey);

        // Calculate expected amounts
        const hubConfigData = await hubProgram.account.hubConfig.fetch(hubConfigPDA);
        const arbitrationFeeBps = hubConfigData.arbitrationFeeBps;
        const chainFeeBps = hubConfigData.chainFeeBps;
        const warchestFeeBps = hubConfigData.warchestFeeBps;
        const burnFeeBps = hubConfigData.burnFeeBps;

        const arbitrationFee = cryptoAmountToTrade.mul(new anchor.BN(arbitrationFeeBps)).div(new anchor.BN(10000));
        const remainingAmount = cryptoAmountToTrade.sub(arbitrationFee);
        const chainFee = remainingAmount.mul(new anchor.BN(chainFeeBps)).div(new anchor.BN(10000));
        const warchestFee = remainingAmount.mul(new anchor.BN(warchestFeeBps)).div(new anchor.BN(10000));
        const burnAmount = remainingAmount.mul(new anchor.BN(burnFeeBps)).div(new anchor.BN(10000));
        const totalFeesExcludingArbitration = chainFee.add(warchestFee).add(burnAmount);
        const winnerAmount = remainingAmount.sub(totalFeesExcludingArbitration);

        // Since resolution was in favor of buyer
        expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(winnerAmount.toNumber());
        expect(arbitratorBalanceAfter - arbitratorBalanceBefore).to.equal(arbitrationFee.toNumber());
        expect(chainFeeCollectorBalanceAfter - chainFeeCollectorBalanceBefore).to.equal(chainFee.toNumber());
        expect(warchestBalanceAfter - warchestBalanceBefore).to.equal(warchestFee.toNumber());
        expect(sellerBalanceAfter).to.equal(sellerBalanceBefore); // Seller gets nothing

        console.log(`Trade ${newTradeId.toString()} resolved by arbitrator in favor of buyer`);
        console.log(`Arbitrator fee: ${arbitrationFee.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`Winner (buyer) received: ${winnerAmount.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`Chain fee: ${chainFee.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`Warchest fee: ${warchestFee.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`Burned amount: ${burnAmount.toNumber() / LAMPORTS_PER_SOL} SOL`);
    });

    it("Completes full trade lifecycle (happy path)", async () => {
        // 1. Setup: Create a new trade
        const tradeGlobalDataBefore = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        const happyPathTradeId = tradeGlobalDataBefore.tradesCount;

        const happyPathTradePDA = PublicKey.findProgramAddressSync(
            [Buffer.from("trade"), happyPathTradeId.toBuffer("le", 8)],
            tradeProgram.programId
        )[0];

        // Record initial balances
        const sellerBalanceInitial = await provider.connection.getBalance(seller.publicKey);
        const chainFeeCollectorBalanceInitial = await provider.connection.getBalance(chainFeeCollectorKey);
        const warchestBalanceInitial = await provider.connection.getBalance(warchestKey);

        // 2. Create Trade
        await tradeProgram.methods
            .createTrade(offerId, cryptoAmountToTrade, "buyer_contact_happy@email.com")
            .accounts({
                tradeGlobalState: tradeGlobalStatePDA,
                trade: happyPathTradePDA,
                offer: offerPDA,
                buyer: buyer.publicKey,
                seller: seller.publicKey,
                hubConfig: hubConfigPDA,
                priceAccount: calculatedPriceSolUsdPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        let tradeData = await tradeProgram.account.trade.fetch(happyPathTradePDA);
        expect(tradeData.state.requestCreated).to.exist;
        expect(tradeData.buyer.equals(buyer.publicKey)).to.be.true;
        expect(tradeData.seller.equals(seller.publicKey)).to.be.true;
        console.log(`Happy path: Trade ${happyPathTradeId.toString()} created`);

        // 3. Seller accepts trade
        await tradeProgram.methods
            .acceptTrade(happyPathTradeId, "seller_contact_happy@email.com")
            .accounts({
                trade: happyPathTradePDA,
                signer: seller.publicKey,
                hubConfig: hubConfigPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
            })
            .signers([seller])
            .rpc();

        tradeData = await tradeProgram.account.trade.fetch(happyPathTradePDA);
        expect(tradeData.state.accepted).to.exist;
        console.log("Happy path: Trade accepted by seller");

        // 4. Seller funds escrow
        const tradeAccountLamportsBefore = await provider.connection.getBalance(happyPathTradePDA);
        const fetchedTradeGlobalState = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        const hubProgramIdForProfileCpi = fetchedTradeGlobalState.hubAddress;

        await tradeProgram.methods
            .fundTradeEscrow(happyPathTradeId)
            .accounts({
                funder: seller.publicKey,
                tradeAccount: happyPathTradePDA,
                systemProgram: SystemProgram.programId,
                funderTokenAccount: null,
                escrowVaultTokenAccount: null,
                tokenProgram: null,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgramIdForProfileCpi,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        tradeData = await tradeProgram.account.trade.fetch(happyPathTradePDA);
        expect(tradeData.state.escrowFunded).to.exist;
        const tradeAccountLamportsAfterFunding = await provider.connection.getBalance(happyPathTradePDA);
        expect(tradeAccountLamportsAfterFunding - tradeAccountLamportsBefore).to.equal(cryptoAmountToTrade.toNumber());
        console.log("Happy path: Escrow funded by seller");

        // 5. Buyer confirms fiat payment sent
        await tradeProgram.methods
            .confirmPaymentSent(happyPathTradeId)
            .accounts({
                trade: happyPathTradePDA,
                signer: buyer.publicKey,
                hubConfig: hubConfigPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
            })
            .signers([buyer])
            .rpc();

        tradeData = await tradeProgram.account.trade.fetch(happyPathTradePDA);
        expect(tradeData.state.fiatDeposited).to.exist;
        console.log("Happy path: Fiat payment confirmed by buyer");

        // 6. Release escrow to complete trade
        const hubConfigData = await hubProgram.account.hubConfig.fetch(hubConfigPDA);
        const chainFeeBps = hubConfigData.chainFeeBps;
        const warchestFeeBps = hubConfigData.warchestFeeBps;
        const burnFeeBps = hubConfigData.burnFeeBps;

        await tradeProgram.methods
            .releaseEscrow(happyPathTradeId)
            .accounts({
                trade: happyPathTradePDA,
                signer: buyer.publicKey,
                seller: seller.publicKey,
                chainFeeCollector: chainFeeCollectorKey,
                warchest: warchestKey,
                hubConfig: hubConfigPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        // 7. Verify final state and balances
        tradeData = await tradeProgram.account.trade.fetch(happyPathTradePDA);
        expect(tradeData.state.completed).to.exist;

        const sellerBalanceFinal = await provider.connection.getBalance(seller.publicKey);
        const chainFeeCollectorBalanceFinal = await provider.connection.getBalance(chainFeeCollectorKey);
        const warchestBalanceFinal = await provider.connection.getBalance(warchestKey);
        const tradeAccountLamportsFinal = await provider.connection.getBalance(happyPathTradePDA);

        // Calculate expected amounts
        const expectedChainFee = cryptoAmountToTrade.mul(new anchor.BN(chainFeeBps)).div(new anchor.BN(10000));
        const expectedWarchestFee = cryptoAmountToTrade.mul(new anchor.BN(warchestFeeBps)).div(new anchor.BN(10000));
        const expectedBurnAmount = cryptoAmountToTrade.mul(new anchor.BN(burnFeeBps)).div(new anchor.BN(10000));
        const totalFeesExcludingBurn = expectedChainFee.add(expectedWarchestFee);
        const totalFeesIncludingBurn = totalFeesExcludingBurn.add(expectedBurnAmount);
        const expectedSellerAmount = cryptoAmountToTrade.sub(totalFeesIncludingBurn);

        // Verify final balances
        expect(tradeAccountLamportsFinal < LAMPORTS_PER_SOL * 0.001, "Trade account should be nearly empty after completion").to.be.true;
        expect(sellerBalanceFinal - sellerBalanceInitial).to.equal(expectedSellerAmount.toNumber());
        expect(chainFeeCollectorBalanceFinal - chainFeeCollectorBalanceInitial).to.equal(expectedChainFee.toNumber());
        expect(warchestBalanceFinal - warchestBalanceInitial).to.equal(expectedWarchestFee.toNumber());

        console.log(`Happy path: Trade ${happyPathTradeId.toString()} completed successfully`);
        console.log(`- Seller received: ${expectedSellerAmount.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`- Chain fee: ${expectedChainFee.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`- Warchest fee: ${expectedWarchestFee.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`- Burned: ${expectedBurnAmount.toNumber() / LAMPORTS_PER_SOL} SOL`);
    });

    it("Handles various dispute and resolution scenarios", async () => {
        // Test setup: Create multiple trades for different dispute scenarios
        const tradeGlobalDataBefore = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        const baseTradeId = tradeGlobalDataBefore.tradesCount;

        // Helper function to create a new trade
        const createNewTrade = async (contactSuffix: string) => {
            const tradeId = (await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA)).tradesCount;
            const tradePDA = PublicKey.findProgramAddressSync(
                [Buffer.from("trade"), tradeId.toBuffer("le", 8)],
                tradeProgram.programId
            )[0];

            await tradeProgram.methods
                .createTrade(offerId, cryptoAmountToTrade, `buyer_contact_${contactSuffix}@email.com`)
                .accounts({
                    tradeGlobalState: tradeGlobalStatePDA,
                    trade: tradePDA,
                    offer: offerPDA,
                    buyer: buyer.publicKey,
                    seller: seller.publicKey,
                    hubConfig: hubConfigPDA,
                    priceAccount: calculatedPriceSolUsdPDA,
                    profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                    buyerProfile: buyerProfilePDA,
                    sellerProfile: sellerProfilePDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([buyer])
                .rpc();

            return { tradeId, tradePDA };
        };

        // Scenario 1: Buyer disputes before escrow funding
        console.log("\nScenario 1: Buyer disputes before escrow funding");
        const { tradeId: earlyDisputeTradeId, tradePDA: earlyDisputeTradePDA } = await createNewTrade("early_dispute");
        
        await tradeProgram.methods
            .disputeTrade(earlyDisputeTradeId, "Seller not responding to messages")
            .accounts({
                disputer: buyer.publicKey,
                tradeAccount: earlyDisputeTradePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                tradeGlobalState: tradeGlobalStatePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                disputer_profile: buyerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityInfo: buyer.publicKey,
                sellerProfile: sellerProfilePDA,
                sellerProfileAuthorityInfo: seller.publicKey,
                profileGlobalState: profileGlobalStatePDAForProfileProg,
            })
            .signers([buyer])
            .rpc();

        let tradeData = await tradeProgram.account.trade.fetch(earlyDisputeTradePDA);
        expect(tradeData.state.disputeOpened).to.exist;
        expect(tradeData.disputeOpener.equals(buyer.publicKey)).to.be.true;
        console.log("Early dispute opened successfully");

        // Scenario 2: Dispute after escrow funding, resolved with refund
        console.log("\nScenario 2: Dispute after escrow funding, resolved with refund");
        const { tradeId: fundedDisputeTradeId, tradePDA: fundedDisputeTradePDA } = await createNewTrade("funded_dispute");
        
        // Accept and fund the trade
        await tradeProgram.methods
            .acceptTrade(fundedDisputeTradeId, "seller_contact_funded_dispute@email.com")
            .accounts({
                trade: fundedDisputeTradePDA,
                signer: seller.publicKey,
                hubConfig: hubConfigPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
            })
            .signers([seller])
            .rpc();

        const fetchedTradeGlobalState = await tradeProgram.account.tradeGlobalState.fetch(tradeGlobalStatePDA);
        const hubProgramIdForProfileCpi = fetchedTradeGlobalState.hubAddress;

        await tradeProgram.methods
            .fundTradeEscrow(fundedDisputeTradeId)
            .accounts({
                funder: seller.publicKey,
                tradeAccount: fundedDisputeTradePDA,
                systemProgram: SystemProgram.programId,
                funderTokenAccount: null,
                escrowVaultTokenAccount: null,
                tokenProgram: null,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgramIdForProfileCpi,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Record seller's balance before dispute and refund
        const sellerBalanceBeforeRefund = await provider.connection.getBalance(seller.publicKey);

        // Open dispute
        await tradeProgram.methods
            .disputeTrade(fundedDisputeTradeId, "Payment method unavailable")
            .accounts({
                disputer: buyer.publicKey,
                tradeAccount: fundedDisputeTradePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                tradeGlobalState: tradeGlobalStatePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                disputer_profile: buyerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityInfo: buyer.publicKey,
                sellerProfile: sellerProfilePDA,
                sellerProfileAuthorityInfo: seller.publicKey,
                profileGlobalState: profileGlobalStatePDAForProfileProg,
            })
            .signers([buyer])
            .rpc();

        // Refund the trade
        await tradeProgram.methods
            .refundTrade(fundedDisputeTradeId)
            .accounts({
                refunder: buyer.publicKey,
                tradeAccount: fundedDisputeTradePDA,
                seller: seller.publicKey,
                hubConfig: hubConfigPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        // Verify refund
        tradeData = await tradeProgram.account.trade.fetch(fundedDisputeTradePDA);
        expect(tradeData.state.refundedToSeller).to.exist;
        const sellerBalanceAfterRefund = await provider.connection.getBalance(seller.publicKey);
        expect(sellerBalanceAfterRefund - sellerBalanceBeforeRefund).to.equal(cryptoAmountToTrade.toNumber());
        console.log("Funded trade disputed and refunded successfully");

        // Scenario 3: Dispute with arbitrator resolution
        console.log("\nScenario 3: Dispute with arbitrator resolution");
        const { tradeId: arbitratedTradeId, tradePDA: arbitratedTradePDA } = await createNewTrade("arbitrated");
        const arbitrator = Keypair.generate();

        // Airdrop SOL to arbitrator for rent
        await provider.connection.requestAirdrop(arbitrator.publicKey, 1 * LAMPORTS_PER_SOL);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Accept and fund the trade
        await tradeProgram.methods
            .acceptTrade(arbitratedTradeId, "seller_contact_arbitrated@email.com")
            .accounts({
                trade: arbitratedTradePDA,
                signer: seller.publicKey,
                hubConfig: hubConfigPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
            })
            .signers([seller])
            .rpc();

        await tradeProgram.methods
            .fundTradeEscrow(arbitratedTradeId)
            .accounts({
                funder: seller.publicKey,
                tradeAccount: arbitratedTradePDA,
                systemProgram: SystemProgram.programId,
                funderTokenAccount: null,
                escrowVaultTokenAccount: null,
                tokenProgram: null,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                sellerProfile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityAccountInfo: buyer.publicKey,
                tradeGlobalState: tradeGlobalStatePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgramIdForProfileCpi,
                profileGlobalStateForSeller: profileGlobalStatePDAForProfileProg,
                profileGlobalStateForBuyer: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Open dispute
        await tradeProgram.methods
            .disputeTrade(arbitratedTradeId, "Dispute requiring arbitration")
            .accounts({
                disputer: seller.publicKey,
                tradeAccount: arbitratedTradePDA,
                hubConfigForProfileCpi: hubConfigPDA,
                hubProgramIdForProfileCpi: hubProgram.programId,
                tradeGlobalState: tradeGlobalStatePDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                disputer_profile: sellerProfilePDA,
                buyerProfile: buyerProfilePDA,
                buyerProfileAuthorityInfo: buyer.publicKey,
                sellerProfile: sellerProfilePDA,
                sellerProfileAuthorityInfo: seller.publicKey,
                profileGlobalState: profileGlobalStatePDAForProfileProg,
            })
            .signers([seller])
            .rpc();

        // Assign arbitrator
        await tradeProgram.methods
            .assignArbitrator(arbitratedTradeId)
            .accounts({
                trade: arbitratedTradePDA,
                arbitrator: arbitrator.publicKey,
                admin: admin.publicKey,
                hubConfig: hubConfigPDA,
            })
            .signers([admin])
            .rpc();

        tradeData = await tradeProgram.account.trade.fetch(arbitratedTradePDA);
        expect(tradeData.arbitrator.equals(arbitrator.publicKey)).to.be.true;
        console.log("Arbitrator assigned successfully");

        // Record balances before arbitrator resolution
        const sellerBalanceBeforeResolution = await provider.connection.getBalance(seller.publicKey);
        const chainFeeCollectorBalanceBeforeResolution = await provider.connection.getBalance(chainFeeCollectorKey);
        const warchestBalanceBeforeResolution = await provider.connection.getBalance(warchestKey);

        // Arbitrator resolves dispute in favor of seller
        await tradeProgram.methods
            .arbitratorResolveDispute(arbitratedTradeId, { seller: {} })
            .accounts({
                trade: arbitratedTradePDA,
                arbitrator: arbitrator.publicKey,
                seller: seller.publicKey,
                chainFeeCollector: chainFeeCollectorKey,
                warchest: warchestKey,
                hubConfig: hubConfigPDA,
                profileProgram: PROFILE_PROGRAM_ID_PUBKEY,
                buyerProfile: buyerProfilePDA,
                sellerProfile: sellerProfilePDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([arbitrator])
            .rpc();

        // Verify arbitrator resolution
        tradeData = await tradeProgram.account.trade.fetch(arbitratedTradePDA);
        expect(tradeData.state.arbitratedForSeller).to.exist;

        // Calculate and verify fee distribution
        const hubConfigData = await hubProgram.account.hubConfig.fetch(hubConfigPDA);
        const chainFeeBps = hubConfigData.chainFeeBps;
        const warchestFeeBps = hubConfigData.warchestFeeBps;
        const burnFeeBps = hubConfigData.burnFeeBps;
        const arbitrationFeeBps = hubConfigData.arbitrationFeeBps;

        const expectedChainFee = cryptoAmountToTrade.mul(new anchor.BN(chainFeeBps)).div(new anchor.BN(10000));
        const expectedWarchestFee = cryptoAmountToTrade.mul(new anchor.BN(warchestFeeBps)).div(new anchor.BN(10000));
        const expectedBurnAmount = cryptoAmountToTrade.mul(new anchor.BN(burnFeeBps)).div(new anchor.BN(10000));
        const expectedArbitrationFee = cryptoAmountToTrade.mul(new anchor.BN(arbitrationFeeBps)).div(new anchor.BN(10000));
        const totalFeesIncludingBurn = expectedChainFee.add(expectedWarchestFee).add(expectedBurnAmount).add(expectedArbitrationFee);
        const expectedSellerAmount = cryptoAmountToTrade.sub(totalFeesIncludingBurn);

        const sellerBalanceAfterResolution = await provider.connection.getBalance(seller.publicKey);
        const chainFeeCollectorBalanceAfterResolution = await provider.connection.getBalance(chainFeeCollectorKey);
        const warchestBalanceAfterResolution = await provider.connection.getBalance(warchestKey);

        expect(sellerBalanceAfterResolution - sellerBalanceBeforeResolution).to.equal(expectedSellerAmount.toNumber());
        expect(chainFeeCollectorBalanceAfterResolution - chainFeeCollectorBalanceBeforeResolution).to.equal(expectedChainFee.toNumber());
        expect(warchestBalanceAfterResolution - warchestBalanceBeforeResolution).to.equal(expectedWarchestFee.toNumber());

        console.log("Arbitrated dispute resolved successfully");
        console.log(`- Seller received: ${expectedSellerAmount.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`- Chain fee: ${expectedChainFee.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`- Warchest fee: ${expectedWarchestFee.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`- Arbitration fee: ${expectedArbitrationFee.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`- Burned: ${expectedBurnAmount.toNumber() / LAMPORTS_PER_SOL} SOL`);
    });

}); 