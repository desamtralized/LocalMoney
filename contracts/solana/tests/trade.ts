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

}); 