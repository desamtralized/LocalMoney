import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Price } from "../target/types/price";
import { Hub } from "../target/types/hub";
import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";

describe("Price Program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const priceProgram = anchor.workspace.Price as Program<Price>;
  const hubProgram = anchor.workspace.Hub as Program<Hub>;

  let authority: Keypair;
  let priceProvider: Keypair;
  let priceConfig: PublicKey;
  let hubConfig: PublicKey;

  before(async () => {
    authority = Keypair.generate();
    priceProvider = Keypair.generate();

    // Airdrop SOL to test accounts
    await provider.connection.requestAirdrop(
      authority.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.requestAirdrop(
      priceProvider.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );

    // Wait for airdrops to confirm
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Derive PDAs
    [priceConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      priceProgram.programId,
    );

    [hubConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      hubProgram.programId,
    );

    // Initialize hub first (required dependency)
    try {
      await hubProgram.methods
        .initialize()
        .accounts({
          config: hubConfig,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    } catch (error) {
      // Hub might already be initialized
      console.log("Hub initialization skipped (might already exist)");
    }
  });

  describe("Initialization", () => {
    it("Should initialize price program successfully", async () => {
      await priceProgram.methods
        .initialize(hubProgram.programId)
        .accounts({
          config: priceConfig,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const config = await priceProgram.account.priceConfig.fetch(priceConfig);
      expect(config.authority.toString()).to.equal(
        authority.publicKey.toString(),
      );
      expect(config.hubProgram.toString()).to.equal(
        hubProgram.programId.toString(),
      );
      expect(config.priceProvider.toString()).to.equal(
        authority.publicKey.toString(),
      );
      expect(config.maxStalenessSeconds.toNumber()).to.equal(3600);
    });

    it("Should update price provider", async () => {
      await priceProgram.methods
        .updatePriceProvider(priceProvider.publicKey)
        .accounts({
          config: priceConfig,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      const config = await priceProgram.account.priceConfig.fetch(priceConfig);
      expect(config.priceProvider.toString()).to.equal(
        priceProvider.publicKey.toString(),
      );
    });
  });

  describe("Price Updates", () => {
    let usdPriceAccount: PublicKey;
    let eurPriceAccount: PublicKey;

    before(async () => {
      // Derive currency price PDAs
      [usdPriceAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("currency_price"), Buffer.from("USD")],
        priceProgram.programId,
      );

      [eurPriceAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("currency_price"), Buffer.from("EUR")],
        priceProgram.programId,
      );
    });

    it("Should update USD price", async () => {
      const priceUsd = new anchor.BN(1000000); // 1.0 USD with 6 decimals

      await priceProgram.methods
        .updatePrices({ usd: {} }, priceUsd)
        .accounts({
          config: priceConfig,
          currencyPrice: usdPriceAccount,
          priceProvider: priceProvider.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([priceProvider])
        .rpc();

      const currencyPrice =
        await priceProgram.account.currencyPrice.fetch(usdPriceAccount);
      expect(currencyPrice.currency).to.deep.equal({ usd: {} });
      expect(currencyPrice.priceUsd.toString()).to.equal(priceUsd.toString());
      expect(currencyPrice.isActive).to.be.true;
    });

    it("Should update EUR price", async () => {
      const priceUsd = new anchor.BN(1100000); // 1.1 USD with 6 decimals

      await priceProgram.methods
        .updatePrices({ eur: {} }, priceUsd)
        .accounts({
          config: priceConfig,
          currencyPrice: eurPriceAccount,
          priceProvider: priceProvider.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([priceProvider])
        .rpc();

      const currencyPrice =
        await priceProgram.account.currencyPrice.fetch(eurPriceAccount);
      expect(currencyPrice.currency).to.deep.equal({ eur: {} });
      expect(currencyPrice.priceUsd.toString()).to.equal(priceUsd.toString());
      expect(currencyPrice.isActive).to.be.true;
    });

    it("Should reject zero price", async () => {
      const priceUsd = new anchor.BN(0);

      try {
        await priceProgram.methods
          .updatePrices({ gbp: {} }, priceUsd)
          .accounts({
            config: priceConfig,
            currencyPrice: PublicKey.findProgramAddressSync(
              [Buffer.from("currency_price"), Buffer.from("GBP")],
              priceProgram.programId,
            )[0],
            priceProvider: priceProvider.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([priceProvider])
          .rpc();

        expect.fail("Should have rejected zero price");
      } catch (error) {
        expect(error.message).to.include("InvalidPrice");
      }
    });

    it("Should reject unauthorized price provider", async () => {
      const unauthorizedProvider = Keypair.generate();
      await provider.connection.requestAirdrop(
        unauthorizedProvider.publicKey,
        anchor.web3.LAMPORTS_PER_SOL,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        await priceProgram.methods
          .updatePrices({ jpy: {} }, new anchor.BN(900000))
          .accounts({
            config: priceConfig,
            currencyPrice: PublicKey.findProgramAddressSync(
              [Buffer.from("currency_price"), Buffer.from("JPY")],
              priceProgram.programId,
            )[0],
            priceProvider: unauthorizedProvider.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([unauthorizedProvider])
          .rpc();

        expect.fail("Should have rejected unauthorized provider");
      } catch (error) {
        expect(error.message).to.include("Unauthorized");
      }
    });
  });

  describe("Price Queries", () => {
    it("Should get USD price", async () => {
      const usdPriceAccount = PublicKey.findProgramAddressSync(
        [Buffer.from("currency_price"), Buffer.from("USD")],
        priceProgram.programId,
      )[0];

      const result = await priceProgram.methods
        .getPrice({ usd: {} })
        .accounts({
          config: priceConfig,
          currencyPrice: usdPriceAccount,
        })
        .view();

      expect(result.toString()).to.equal("1000000");
    });

    it("Should get EUR price", async () => {
      const eurPriceAccount = PublicKey.findProgramAddressSync(
        [Buffer.from("currency_price"), Buffer.from("EUR")],
        priceProgram.programId,
      )[0];

      const result = await priceProgram.methods
        .getPrice({ eur: {} })
        .accounts({
          config: priceConfig,
          currencyPrice: eurPriceAccount,
        })
        .view();

      expect(result.toString()).to.equal("1100000");
    });
  });

  describe("Currency Conversion", () => {
    it("Should convert USD to EUR", async () => {
      const usdPriceAccount = PublicKey.findProgramAddressSync(
        [Buffer.from("currency_price"), Buffer.from("USD")],
        priceProgram.programId,
      )[0];

      const eurPriceAccount = PublicKey.findProgramAddressSync(
        [Buffer.from("currency_price"), Buffer.from("EUR")],
        priceProgram.programId,
      )[0];

      const amount = new anchor.BN(1000000); // 1 USD
      const result = await priceProgram.methods
        .convertCurrency(amount, { usd: {} }, { eur: {} })
        .accounts({
          config: priceConfig,
          fromCurrencyPrice: usdPriceAccount,
          toCurrencyPrice: eurPriceAccount,
        })
        .view();

      // 1 USD * 1000000 / 1100000 = ~909090 (approximately 0.909 EUR)
      expect(result.toNumber()).to.be.approximately(909090, 10);
    });

    it("Should convert EUR to USD", async () => {
      const usdPriceAccount = PublicKey.findProgramAddressSync(
        [Buffer.from("currency_price"), Buffer.from("USD")],
        priceProgram.programId,
      )[0];

      const eurPriceAccount = PublicKey.findProgramAddressSync(
        [Buffer.from("currency_price"), Buffer.from("EUR")],
        priceProgram.programId,
      )[0];

      const amount = new anchor.BN(1000000); // 1 EUR
      const result = await priceProgram.methods
        .convertCurrency(amount, { eur: {} }, { usd: {} })
        .accounts({
          config: priceConfig,
          fromCurrencyPrice: eurPriceAccount,
          toCurrencyPrice: usdPriceAccount,
        })
        .view();

      // 1 EUR * 1100000 / 1000000 = 1100000 (1.1 USD)
      expect(result.toString()).to.equal("1100000");
    });

    it("Should return same amount for same currency", async () => {
      const usdPriceAccount = PublicKey.findProgramAddressSync(
        [Buffer.from("currency_price"), Buffer.from("USD")],
        priceProgram.programId,
      )[0];

      const amount = new anchor.BN(1000000);
      const result = await priceProgram.methods
        .convertCurrency(amount, { usd: {} }, { usd: {} })
        .accounts({
          config: priceConfig,
          fromCurrencyPrice: usdPriceAccount,
          toCurrencyPrice: usdPriceAccount,
        })
        .view();

      expect(result.toString()).to.equal(amount.toString());
    });
  });

  describe("Price Routes", () => {
    it("Should register a price route", async () => {
      const priceRouteAccount = PublicKey.findProgramAddressSync(
        [Buffer.from("price_route"), Buffer.from("USD"), Buffer.from("EUR")],
        priceProgram.programId,
      )[0];

      const routeSteps = [
        {
          pool: Keypair.generate().publicKey,
          offerAsset: Keypair.generate().publicKey,
        },
      ];

      await priceProgram.methods
        .registerPriceRoute({ usd: {} }, { eur: {} }, routeSteps)
        .accounts({
          config: priceConfig,
          priceRoute: priceRouteAccount,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const priceRoute =
        await priceProgram.account.priceRoute.fetch(priceRouteAccount);
      expect(priceRoute.fromCurrency).to.deep.equal({ usd: {} });
      expect(priceRoute.toCurrency).to.deep.equal({ eur: {} });
      expect(priceRoute.routeSteps).to.have.length(1);
      expect(priceRoute.isActive).to.be.true;
    });

    it("Should reject empty route steps", async () => {
      const priceRouteAccount = PublicKey.findProgramAddressSync(
        [Buffer.from("price_route"), Buffer.from("EUR"), Buffer.from("GBP")],
        priceProgram.programId,
      )[0];

      try {
        await priceProgram.methods
          .registerPriceRoute({ eur: {} }, { gbp: {} }, [])
          .accounts({
            config: priceConfig,
            priceRoute: priceRouteAccount,
            authority: authority.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([authority])
          .rpc();

        expect.fail("Should have rejected empty route steps");
      } catch (error) {
        expect(error.message).to.include("InvalidRoute");
      }
    });

    it("Should reject too many route steps", async () => {
      const priceRouteAccount = PublicKey.findProgramAddressSync(
        [Buffer.from("price_route"), Buffer.from("CAD"), Buffer.from("AUD")],
        priceProgram.programId,
      )[0];

      // Create 11 route steps (exceeds limit of 10)
      const routeSteps = Array.from({ length: 11 }, () => ({
        pool: Keypair.generate().publicKey,
        offerAsset: Keypair.generate().publicKey,
      }));

      try {
        await priceProgram.methods
          .registerPriceRoute({ cad: {} }, { aud: {} }, routeSteps)
          .accounts({
            config: priceConfig,
            priceRoute: priceRouteAccount,
            authority: authority.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([authority])
          .rpc();

        expect.fail("Should have rejected too many route steps");
      } catch (error) {
        expect(error.message).to.include("RouteTooLong");
      }
    });
  });

  describe("Access Control", () => {
    it("Should reject unauthorized authority operations", async () => {
      const unauthorizedUser = Keypair.generate();
      await provider.connection.requestAirdrop(
        unauthorizedUser.publicKey,
        anchor.web3.LAMPORTS_PER_SOL,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        await priceProgram.methods
          .updatePriceProvider(Keypair.generate().publicKey)
          .accounts({
            config: priceConfig,
            authority: unauthorizedUser.publicKey,
          })
          .signers([unauthorizedUser])
          .rpc();

        expect.fail("Should have rejected unauthorized authority");
      } catch (error) {
        expect(error.message).to.include("Unauthorized");
      }
    });
  });
});
