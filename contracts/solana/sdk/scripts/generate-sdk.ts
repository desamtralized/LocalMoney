#!/usr/bin/env ts-node

import fs from 'fs';
import path from 'path';

// Import the IDL files
const HubIDL = require('../src/types/hub.json');
const ProfileIDL = require('../src/types/profile.json');
const PriceIDL = require('../src/types/price.json');
const OfferIDL = require('../src/types/offer.json');
const TradeIDL = require('../src/types/trade.json');

// Program IDs from IDL
const PROGRAM_IDS: Record<string, string> = {
  hub: 'AJ6C5CHNQADfT2pJ9bQLx1rn5bKmYj1w1DnssmhXGHKF',
  offer: 'Gvypc9RLNbCPLUw9wvRT3fYCcNKMZyLLuRdpvDeCpN9W',
  price: 'Jn1xJ1tTEoQ5mdSkHJcWcgA9HTiKmuHqCLQrhVCnQxb',
  profile: 'H2NTK2NqRQBTgvd9wYpAUUndcBGgkCtiCHQJkCQP5xGd',
  trade: '5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM',
};

console.log('Generating SDK structure from IDL files...');

// Create generated directory for each program
const programs = ['hub', 'offer', 'price', 'profile', 'trade'];

programs.forEach(program => {
  const dir = path.join(__dirname, '..', 'src', 'generated', program);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Copy IDL to generated folder
  const idl = require(`../src/types/${program}.json`);
  fs.writeFileSync(
    path.join(dir, 'idl.json'),
    JSON.stringify(idl, null, 2)
  );
  
  // Create index.ts that exports the IDL and types
  const indexContent = `// Auto-generated from IDL
export const IDL = require('./idl.json');
export const PROGRAM_ID = '${PROGRAM_IDS[program]}';

// Re-export types from existing type definitions
export * from '../../types/${program}';
`;
  
  fs.writeFileSync(path.join(dir, 'index.ts'), indexContent);
});

// Create main generated index
const generatedIndexContent = `// Auto-generated SDK exports
export * as hub from './hub';
export * as offer from './offer';
export * as price from './price';
export * as profile from './profile';
export * as trade from './trade';

// Export all program IDs
export const PROGRAM_IDS = {
  hub: '${PROGRAM_IDS.hub}',
  offer: '${PROGRAM_IDS.offer}',
  price: '${PROGRAM_IDS.price}',
  profile: '${PROGRAM_IDS.profile}',
  trade: '${PROGRAM_IDS.trade}',
};
`;

fs.writeFileSync(
  path.join(__dirname, '..', 'src', 'generated', 'index.ts'),
  generatedIndexContent
);

console.log('✅ Generated SDK structure successfully');