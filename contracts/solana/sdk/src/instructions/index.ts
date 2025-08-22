// Layer 1: Instruction Builders
// Export all instruction builders for each program

export * as hub from './hub';
export * as offer from './offer';
export * as price from './price';
export * as profile from './profile';
export * as trade from './trade';

// Re-export commonly used instruction builders at top level
export {
  // Hub instructions
  initializeHubInstruction,
  updateHubConfigInstruction,
  setHubAuthorityInstruction,
  setFeeRecipientInstruction,
  pauseHubInstruction,
  unpauseHubInstruction,
} from './hub';

export {
  // Offer instructions
  createOfferInstruction,
  updateOfferInstruction,
  activateOfferInstruction,
  deactivateOfferInstruction,
  closeOfferInstruction,
} from './offer';

export {
  // Price instructions
  initializePriceFeedInstruction,
  updatePriceInstruction,
  setOracleInstruction,
  setPriceAuthorityInstruction,
} from './price';

export {
  // Profile instructions
  createProfileInstruction,
  updateProfileInstruction,
  updateReputationInstruction,
  verifyProfileInstruction,
} from './profile';

export {
  // Trade instructions
  createTradeInstruction,
  acceptRequestInstruction,
  fundEscrowInstruction,
  markFiatDepositedInstruction,
  releaseEscrowInstruction,
  refundEscrowInstruction,
  cancelRequestInstruction,
  updateTradeContactInstruction,
} from './trade';