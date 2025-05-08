import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Price } from "../target/types/price";
import { assert } from "chai";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";

describe("price program", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.Price as Program<Price>;
    const payer = provider.wallet as anchor.Wallet;

    // Keypairs for authorities
    const priceProviderAuthority = Keypair.generate();
    const hubAdminAuthority = Keypair.generate(); // This authority will also register hub for simplicity here

    // Constant values for test
    const DENOM_SOL = "SOL";
    const FIAT_EUR = "EUR";
    const FIAT_USDC = "USDC"; // Base asset on chain

    const USDC_USD_PRICE = new anchor.BN(1_000_000); // 1 USD
    const USDC_USD_DECIMALS = 6;
    const EUR_USD_PRICE = new anchor.BN(1_080_000); // 1.08 USD
    const EUR_USD_DECIMALS = 6;

    const DUMMY_POOL_ADDRESS = Keypair.generate().publicKey;

    // Expected values from contract's placeholder DEX calculation
    // P_DB_actual = 50_000 (SOL -> USDC rate)
    // dex_output_price = 50_000 * 10^6 = 50_000_000_000
    // final_calculated_price = ( (50_000_000_000 * 1_000_000) * (10^6 * 10^6) ) / ( 1_080_000 * (10^6 * 10^6) )
    // = (5 * 10^16 * 10^12) / (1.08 * 10^6 * 10^12) = (5 * 10^28) / (1.08 * 10^18)
    // = (5 / 1.08) * 10^10 = 4.6296296296... * 10^10 = 46_296_296_296 (integer division)
    const EXPECTED_SOL_EUR_PRICE = new anchor.BN("46296296296");
    const EXPECTED_PRICE_DECIMALS = 6;

    // PDAs
    let priceGlobalStatePda: PublicKey;
    let fiatPriceUsdcPda: PublicKey;
    let fiatPriceEurPda: PublicKey;
    let denomPriceRouteSolPda: PublicKey;
    let calculatedPriceSolEurPda: PublicKey;

    before(async () => {
        // Airdrop SOL to authorities
        await provider.connection.requestAirdrop(priceProviderAuthority.publicKey, 1e9);
        await provider.connection.requestAirdrop(hubAdminAuthority.publicKey, 1e9);

        // Derive PDAs
        [priceGlobalStatePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("price_global_state")],
            program.programId
        );
        [fiatPriceUsdcPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("fiat_price"), Buffer.from(FIAT_USDC)],
            program.programId
        );
        [fiatPriceEurPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("fiat_price"), Buffer.from(FIAT_EUR)],
            program.programId
        );
        [denomPriceRouteSolPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("denom_route"), Buffer.from(DENOM_SOL)],
            program.programId
        );
        [calculatedPriceSolEurPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("calc_price"),
                Buffer.from(DENOM_SOL),
                Buffer.from(FIAT_EUR),
            ],
            program.programId
        );
    });

    it("Initializes global state", async () => {
        await program.methods
            .initializePriceGlobalState(priceProviderAuthority.publicKey)
            .accounts({
                priceGlobalState: priceGlobalStatePda,
                authority: payer.publicKey, // payer initializes, sets provider authority
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        const globalState = await program.account.priceGlobalState.fetch(priceGlobalStatePda);
        assert.ok(globalState.priceProviderAuthority.equals(priceProviderAuthority.publicKey));
        assert.ok(globalState.hubAddress.equals(PublicKey.default)); // Default until registered
    });

    it("Updates fiat prices (USDC & EUR)", async () => {
        // Update USDC price
        await program.methods
            .updateFiatPrice(FIAT_USDC, USDC_USD_PRICE, USDC_USD_DECIMALS)
            .accounts({
                fiatPriceAccount: fiatPriceUsdcPda,
                priceProvider: priceProviderAuthority.publicKey,
                priceGlobalState: priceGlobalStatePda,
                systemProgram: SystemProgram.programId,
            })
            .signers([priceProviderAuthority])
            .rpc();

        const usdcPriceAccount = await program.account.fiatPrice.fetch(fiatPriceUsdcPda);
        assert.strictEqual(usdcPriceAccount.fiatCurrency, FIAT_USDC);
        assert.ok(usdcPriceAccount.usdPrice.eq(USDC_USD_PRICE));
        assert.strictEqual(usdcPriceAccount.decimals, USDC_USD_DECIMALS);

        // Update EUR price
        await program.methods
            .updateFiatPrice(FIAT_EUR, EUR_USD_PRICE, EUR_USD_DECIMALS)
            .accounts({
                fiatPriceAccount: fiatPriceEurPda,
                priceProvider: priceProviderAuthority.publicKey,
                priceGlobalState: priceGlobalStatePda,
                systemProgram: SystemProgram.programId,
            })
            .signers([priceProviderAuthority])
            .rpc();

        const eurPriceAccount = await program.account.fiatPrice.fetch(fiatPriceEurPda);
        assert.strictEqual(eurPriceAccount.fiatCurrency, FIAT_EUR);
        assert.ok(eurPriceAccount.usdPrice.eq(EUR_USD_PRICE));
        assert.strictEqual(eurPriceAccount.decimals, EUR_USD_DECIMALS);
    });

    it("Registers Hub and Denom Price Route (SOL -> USDC)", async () => {
        const dummyHubAddress = Keypair.generate().publicKey;
        // Register hub (needed for registerPriceRouteForDenom)
        // Using hubAdminAuthority as the 'authority' that can register the hub with the price program
        await program.methods
            .registerHubForPrice(dummyHubAddress)
            .accounts({
                priceGlobalState: priceGlobalStatePda,
                authority: hubAdminAuthority.publicKey,
            })
            .signers([hubAdminAuthority])
            .rpc();

        const globalState = await program.account.priceGlobalState.fetch(priceGlobalStatePda);
        assert.ok(globalState.hubAddress.equals(dummyHubAddress));

        // Register SOL -> USDC route
        const routeSteps = [
            {
                poolAddress: DUMMY_POOL_ADDRESS,
                offerAssetDenom: DENOM_SOL,
                askAssetDenom: FIAT_USDC,
            },
        ];
        await program.methods
            .registerPriceRouteForDenom(DENOM_SOL, routeSteps)
            .accounts({
                denomPriceRouteAccount: denomPriceRouteSolPda,
                hubAdminAuthority: hubAdminAuthority.publicKey,
                priceGlobalState: priceGlobalStatePda,
                systemProgram: SystemProgram.programId,
            })
            .signers([hubAdminAuthority])
            .rpc();

        const solRouteAccount = await program.account.denomPriceRoute.fetch(denomPriceRouteSolPda);
        assert.strictEqual(solRouteAccount.denom, DENOM_SOL);
        assert.lengthOf(solRouteAccount.routeSteps, 1);
        assert.ok(solRouteAccount.routeSteps[0].poolAddress.equals(DUMMY_POOL_ADDRESS));
        assert.strictEqual(solRouteAccount.routeSteps[0].offerAssetDenom, DENOM_SOL);
        assert.strictEqual(solRouteAccount.routeSteps[0].askAssetDenom, FIAT_USDC);
    });

    it("Calculates and stores SOL/EUR price correctly", async () => {
        // Ensure dependent instructions have run by re-fetching one needed account
        const solRouteAccountPre = await program.account.denomPriceRoute.fetch(denomPriceRouteSolPda);
        assert.isNotEmpty(solRouteAccountPre.routeSteps, "SOL route should be registered before calculating price");

        await program.methods
            .calculateAndStorePrice(DENOM_SOL, FIAT_EUR)
            .accounts({
                payer: payer.publicKey,
                denomPriceRoute: denomPriceRouteSolPda,
                baseAssetFiatPrice: fiatPriceUsdcPda, // This is for FIAT_USDC (ask_asset_denom from route)
                targetFiatPrice: fiatPriceEurPda,
                calculatedPriceAccount: calculatedPriceSolEurPda,
                systemProgram: SystemProgram.programId,
            })
            // Payer signs this transaction
            .rpc();

        const calculatedPriceAccount = await program.account.calculatedPriceAccount.fetch(calculatedPriceSolEurPda);

        assert.strictEqual(calculatedPriceAccount.denomSymbol, DENOM_SOL, "Denom symbol mismatch");
        assert.strictEqual(calculatedPriceAccount.fiatSymbol, FIAT_EUR, "Fiat symbol mismatch");
        assert.ok(calculatedPriceAccount.price.eq(EXPECTED_SOL_EUR_PRICE),
            `Price mismatch. Expected: ${EXPECTED_SOL_EUR_PRICE.toString()}, Got: ${calculatedPriceAccount.price.toString()}`);
        assert.strictEqual(calculatedPriceAccount.decimals, EXPECTED_PRICE_DECIMALS, "Decimals mismatch");
        assert.ok(calculatedPriceAccount.sourceDexPool.equals(DUMMY_POOL_ADDRESS), "Source DEX pool mismatch");
        assert.ok(calculatedPriceAccount.lastUpdatedAtTimestamp.toNumber() > 0, "Timestamp not set");
    });
}); 