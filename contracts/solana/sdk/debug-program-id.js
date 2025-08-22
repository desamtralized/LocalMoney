#!/usr/bin/env node

const { PublicKey } = require('@solana/web3.js');

// Bytes from the IDL for the profile program constraint
const bytes = [
  79, 89, 188, 116, 194, 3, 254, 176, 208, 175, 190, 160, 114, 67, 220, 189,
  211, 245, 85, 166, 208, 104, 231, 21, 239, 109, 236, 6, 84, 147, 63, 245
];

const programId = new PublicKey(Buffer.from(bytes));
console.log('Hardcoded program ID in IDL:', programId.toString());

// Compare with our actual program IDs
const actualProfileProgram = '6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC';
console.log('Actual profile program ID: ', actualProfileProgram);
console.log('Match:', programId.toString() === actualProfileProgram ? '✅' : '❌');

// Calculate what the expected PDA would be with the hardcoded program ID
const user = 'GyGKxMyg1p9SsHfm15MkNUu1u9TN2JtTspcdmrtGUdse';
const [expectedProfilePDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('profile'), new PublicKey(user).toBuffer()],
  programId
);
console.log('Expected profile PDA with hardcoded program:', expectedProfilePDA.toString());

// This might be the mysterious PDA!
const mysteriousPDA = 'Hmb9x5xy4RxdhXzqbypQzQMFJFjX5XGEa23ui8PF8Au';
console.log('Mysterious PDA:', mysteriousPDA);
console.log('Profile PDA match:', expectedProfilePDA.toString() === mysteriousPDA ? '✅' : '❌');