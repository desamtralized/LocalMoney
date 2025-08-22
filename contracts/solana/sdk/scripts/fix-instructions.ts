#!/usr/bin/env ts-node

import fs from 'fs';
import path from 'path';

// Fix mapping for method names
const methodNameFixes = {
  // Trade
  'createTrade': 'create_trade',
  'acceptRequest': 'accept_request', 
  'fundEscrow': 'fund_escrow',
  'markFiatDeposited': 'mark_fiat_deposited',
  'releaseEscrow': 'release_escrow',
  'refundEscrow': 'automatic_refund',
  'cancelRequest': 'cancel_request',
  'updateTradeContact': null, // Doesn't exist
  
  // Offer
  'createOffer': 'create_offer',
  'updateOffer': 'update_offer',
  'activateOffer': 'activate_offer',
  'deactivateOffer': 'deactivate_offer',
  'closeOffer': 'close_offer',
  
  // Profile
  'createProfile': 'create_profile',
  'updateProfile': 'update_profile',
  'updateReputation': null, // Doesn't exist
  'verifyProfile': null, // Doesn't exist
  
  // Hub
  'initializeHub': 'initialize',
  'updateHubConfig': 'update_config',
  'setHubAuthority': 'set_authority',
  'setFeeRecipient': 'update_fee_recipient',
  'pauseHub': 'pause',
  'unpauseHub': 'unpause',
  
  // Price
  'initializePriceFeed': 'initialize_feed',
  'updatePrice': 'update_price',
  'setOracle': 'set_oracle',
  'setPriceAuthority': 'set_authority',
};

// Since fixing each file would be complex, let's just output what needs to be fixed
console.log('Method names that need to be fixed in instruction files:');
console.log('========================================================');

for (const [camelCase, snakeCase] of Object.entries(methodNameFixes)) {
  if (snakeCase) {
    console.log(`  ${camelCase} -> ${snakeCase}`);
  } else {
    console.log(`  ${camelCase} -> REMOVE (doesn't exist in IDL)`);
  }
}

console.log('\nAlso need to use async/await pattern:');
console.log('  return await program.methods.method_name().accounts().instruction()');

console.log('\nNote: The old index.ts file should be removed as it conflicts with new structure');