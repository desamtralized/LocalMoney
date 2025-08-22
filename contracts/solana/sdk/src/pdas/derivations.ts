import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { PROGRAM_IDS } from '../generated';

// Seed constants
const SEED_PREFIX = Buffer.from('localmoney');
const SEED_HUB = Buffer.from('hub');
const SEED_OFFER = Buffer.from('offer');
const SEED_TRADE = Buffer.from('trade');
const SEED_PROFILE = Buffer.from('profile');
const SEED_PRICE = Buffer.from('price');
const SEED_ESCROW = Buffer.from('escrow');
const SEED_VRF = Buffer.from('vrf');
const SEED_CONFIG = Buffer.from('config');

// Hub PDAs
export function deriveHubConfigAddress(
  programId: PublicKey = new PublicKey(PROGRAM_IDS.hub)
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_HUB, SEED_CONFIG],
    programId
  );
}

// Offer PDAs
export function deriveOfferAddress(
  offerId: BN,
  programId: PublicKey = new PublicKey(PROGRAM_IDS.offer)
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_OFFER, offerId.toArrayLike(Buffer, 'le', 8)],
    programId
  );
}

// Trade PDAs
export function deriveTradeAddress(
  tradeId: BN,
  programId: PublicKey = new PublicKey(PROGRAM_IDS.trade)
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_TRADE, tradeId.toArrayLike(Buffer, 'le', 8)],
    programId
  );
}

export function deriveEscrowAddress(
  tradeId: BN,
  programId: PublicKey = new PublicKey(PROGRAM_IDS.trade)
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      SEED_PREFIX,
      SEED_TRADE,
      tradeId.toArrayLike(Buffer, 'le', 8),
      SEED_ESCROW
    ],
    programId
  );
}

export function deriveVrfSelectionAddress(
  tradeId: BN,
  programId: PublicKey = new PublicKey(PROGRAM_IDS.trade)
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      SEED_PREFIX,
      SEED_TRADE,
      tradeId.toArrayLike(Buffer, 'le', 8),
      SEED_VRF
    ],
    programId
  );
}

// Profile PDAs
export function deriveProfileAddress(
  user: PublicKey,
  programId: PublicKey = new PublicKey(PROGRAM_IDS.profile)
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_PROFILE, user.toBuffer()],
    programId
  );
}

// Price PDAs
export function derivePriceFeedAddress(
  tokenMint: PublicKey,
  programId: PublicKey = new PublicKey(PROGRAM_IDS.price)
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_PRICE, tokenMint.toBuffer()],
    programId
  );
}

// Utility functions for batch PDA derivation
export function deriveBatchOfferAddresses(
  offerIds: BN[],
  programId: PublicKey = new PublicKey(PROGRAM_IDS.offer)
): Array<[PublicKey, number]> {
  return offerIds.map(id => deriveOfferAddress(id, programId));
}

export function deriveBatchTradeAddresses(
  tradeIds: BN[],
  programId: PublicKey = new PublicKey(PROGRAM_IDS.trade)
): Array<[PublicKey, number]> {
  return tradeIds.map(id => deriveTradeAddress(id, programId));
}

export function deriveBatchProfileAddresses(
  users: PublicKey[],
  programId: PublicKey = new PublicKey(PROGRAM_IDS.profile)
): Array<[PublicKey, number]> {
  return users.map(user => deriveProfileAddress(user, programId));
}

// Helper to derive all PDAs for a trade
export interface TradePDAs {
  trade: PublicKey;
  tradeBump: number;
  escrow: PublicKey;
  escrowBump: number;
  vrf?: PublicKey;
  vrfBump?: number;
}

export function deriveAllTradePDAs(
  tradeId: BN,
  includeVrf: boolean = false,
  programId: PublicKey = new PublicKey(PROGRAM_IDS.trade)
): TradePDAs {
  const [trade, tradeBump] = deriveTradeAddress(tradeId, programId);
  const [escrow, escrowBump] = deriveEscrowAddress(tradeId, programId);
  
  const result: TradePDAs = {
    trade,
    tradeBump,
    escrow,
    escrowBump,
  };
  
  if (includeVrf) {
    const [vrf, vrfBump] = deriveVrfSelectionAddress(tradeId, programId);
    result.vrf = vrf;
    result.vrfBump = vrfBump;
  }
  
  return result;
}

// Helper to derive all PDAs for an offer and its owner
export interface OfferPDAs {
  offer: PublicKey;
  offerBump: number;
  ownerProfile: PublicKey;
  ownerProfileBump: number;
}

export function deriveOfferWithProfilePDAs(
  offerId: BN,
  owner: PublicKey,
  offerProgramId: PublicKey = new PublicKey(PROGRAM_IDS.offer),
  profileProgramId: PublicKey = new PublicKey(PROGRAM_IDS.profile)
): OfferPDAs {
  const [offer, offerBump] = deriveOfferAddress(offerId, offerProgramId);
  const [ownerProfile, ownerProfileBump] = deriveProfileAddress(owner, profileProgramId);
  
  return {
    offer,
    offerBump,
    ownerProfile,
    ownerProfileBump,
  };
}