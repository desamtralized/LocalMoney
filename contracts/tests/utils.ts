import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createMint,
  mintTo,
  getAccount,
} from "@solana/spl-token";

/**
 * Derives the Program Derived Address (PDA) for the Hub Configuration account.
 * @param programId - The Program ID of the Hub program.
 * @returns A tuple containing the PublicKey of the PDA and the bump seed.
 */
export function getHubConfigPda(
  programId: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(anchor.utils.bytes.utf8.encode("config"))], // Seed: b"config"
    programId
  );
}

/**
 * Derives the Program Derived Address (PDA) for the Hub Treasury account.
 * @param programId - The Program ID of the Hub program.
 * @returns A tuple containing the PublicKey of the PDA and the bump seed.
 */
export function getHubTreasuryPda(
  programId: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(anchor.utils.bytes.utf8.encode("treasury"))], // Seed: b"treasury"
    programId
  );
}

/**
 * Derives the Program Derived Address (PDA) for a User Profile account.
 * @param owner - The PublicKey of the profile owner.
 * @param programId - The Program ID of the Profile program.
 * @returns A tuple containing the PublicKey of the PDA and the bump seed.
 */
export function getProfilePda(
  owner: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(anchor.utils.bytes.utf8.encode("profile")), // Seed: b"profile"
      owner.toBuffer(),
    ],
    programId
  );
}

/**
 * Derives the PDA for a Price Route account.
 * Seeds: [b"price_route", denom.as_bytes(), fiat_currency.as_bytes()]
 */
export function getPriceRoutePda(
  denom: string,
  fiatCurrency: string,
  programId: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(anchor.utils.bytes.utf8.encode("price_route")),
      Buffer.from(anchor.utils.bytes.utf8.encode(denom)),
      Buffer.from(anchor.utils.bytes.utf8.encode(fiatCurrency)),
    ],
    programId
  );
}

/**
 * Derives the PDA for a Denom Price account (stores the actual price data).
 * Seeds: [b"denom_price", denom.as_bytes(), fiat_currency.as_bytes()]
 */
export function getDenomPricePda(
  denom: string,
  fiatCurrency: string,
  programId: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(anchor.utils.bytes.utf8.encode("denom_price")),
      Buffer.from(anchor.utils.bytes.utf8.encode(denom)),
      Buffer.from(anchor.utils.bytes.utf8.encode(fiatCurrency)),
    ],
    programId
  );
}

/**
 * Derives the PDA for an Offer account.
 * Seeds: [b"offer", owner.key().as_ref(), offer_id.as_bytes()]
 * Note: The offer_id generation and uniqueness must be handled by the program/client.
 */
export function getOfferPda(
  owner: anchor.web3.PublicKey,
  offerId: string, // Assuming a string ID for test simplicity
  programId: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(anchor.utils.bytes.utf8.encode("offer")),
      owner.toBuffer(),
      Buffer.from(anchor.utils.bytes.utf8.encode(offerId)),
    ],
    programId
  );
}

/**
 * Derives the PDA for a Trade account.
 * Seeds: [b"trade", offer_pda.key().as_ref(), taker.key().as_ref()]
 */
export function getTradePda(
  offerPda: anchor.web3.PublicKey,
  taker: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(anchor.utils.bytes.utf8.encode("trade")),
      offerPda.toBuffer(),
      taker.toBuffer(),
    ],
    programId
  );
}

/**
 * Derives the PDA for a Trade's Escrow account.
 * Seeds: [b"escrow", trade_pda.key().as_ref()]
 */
export function getEscrowPda(
  tradePda: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(anchor.utils.bytes.utf8.encode("escrow")), tradePda.toBuffer()],
    programId
  );
}

// --- SPL Token Utilities ---

/**
 * Creates a new SPL token mint.
 * @param provider AnchorProvider instance.
 * @param authority The public key of the mint authority.
 * @param decimals The number of decimal places for the token.
 * @returns The PublicKey of the newly created mint.
 */
export async function createTestMint(
  provider: anchor.AnchorProvider,
  authority: anchor.web3.PublicKey,
  decimals: number
): Promise<anchor.web3.PublicKey> {
  return await createMint(
    provider.connection,
    (provider.wallet as anchor.Wallet).payer, // Payer for transaction fees
    authority,
    null, // Freeze authority (optional)
    decimals,
    undefined, // Keypair for mint account (optional, defaults to random)
    { commitment: "confirmed" }, // Confirmation level
    TOKEN_PROGRAM_ID
  );
}

/**
 * Gets or creates an Associated Token Account (ATA).
 * @param provider AnchorProvider instance.
 * @param mint The PublicKey of the token mint.
 * @param owner The PublicKey of the owner of the ATA.
 * @param allowOwnerOffCurve Optional: Set to true if owner is a PDA.
 * @returns The PublicKey of the ATA.
 */
export function getOrCreateAssociatedTokenAccount(
  mint: anchor.web3.PublicKey,
  owner: anchor.web3.PublicKey,
  allowOwnerOffCurve: boolean = false
): anchor.web3.PublicKey {
    // Note: This function just calculates the address. The actual creation
    // happens on first use or via a separate instruction if needed pre-emptively.
    // Anchor usually handles ATA creation implicitly in contexts.
    return getAssociatedTokenAddressSync(
        mint,
        owner,
        allowOwnerOffCurve,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
}

/**
 * Mints tokens to a specified Associated Token Account (ATA).
 * @param provider AnchorProvider instance.
 * @param mint The PublicKey of the token mint.
 * @param destinationAta The PublicKey of the destination ATA.
 * @param authority The Keypair of the mint authority.
 * @param amount The amount of tokens to mint (in base units).
 */
export async function mintTokensToATA(
  provider: anchor.AnchorProvider,
  mint: anchor.web3.PublicKey,
  destinationAta: anchor.web3.PublicKey,
  authority: anchor.web3.Keypair,
  amount: bigint | number
): Promise<void> {
  await mintTo(
    provider.connection,
    (provider.wallet as anchor.Wallet).payer, // Payer for transaction fees
    mint,
    destinationAta,
    authority, // Mint authority signs
    amount,
    [], // Multi-signers (optional)
    { commitment: "confirmed" }, // Confirmation level
    TOKEN_PROGRAM_ID
  );
}

/**
 * Gets the token balance of an account.
 * @param provider AnchorProvider instance.
 * @param tokenAccount The PublicKey of the token account (e.g., ATA).
 * @returns The balance as a bigint.
 */
export async function getTokenBalance(
    provider: anchor.AnchorProvider,
    tokenAccount: anchor.web3.PublicKey
): Promise<bigint> {
    try {
        const accountInfo = await getAccount(
            provider.connection,
            tokenAccount,
            "confirmed",
            TOKEN_PROGRAM_ID
        );
        return accountInfo.amount;
    } catch (e) {
        // If account not found, balance is 0
        if (e.message.includes("could not find account")) {
            return BigInt(0);
        }
        throw e;
    }
}

/**
 * Derives the Program Derived Address (PDA) used by a program to sign CPI calls.
 * Assumes a common seed pattern like [b"authority"].
 * **Important:** Adjust the seeds if your program uses a different pattern!
 * @param programId - The Program ID of the program whose authority PDA is needed.
 * @returns A tuple containing the PublicKey of the PDA and the bump seed.
 */
export function getProgramAuthorityPda(
  programId: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  // Common seed pattern. Verify this matches your program's actual seeds!
  const seeds = [Buffer.from(anchor.utils.bytes.utf8.encode("authority"))];
  return anchor.web3.PublicKey.findProgramAddressSync(seeds, programId);
}

// Add other PDA derivation functions here as needed (e.g., for Offer, Trade, Price Route) 