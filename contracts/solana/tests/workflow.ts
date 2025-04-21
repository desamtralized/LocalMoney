import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import { assert } from 'chai';

// Program IDs from Anchor.toml
const HUB_PROGRAM_ID = new PublicKey("FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG");
const OFFER_PROGRAM_ID = new PublicKey("GaupCSNN86LpjFQYiLhYGBsXPwWxUW3XmRGdBLkr1tMn");
const PRICE_PROGRAM_ID = new PublicKey("51GmuXVNFTveMq1UtrmzWT8q564YjBKD5Zx2zbsMaWHG");
const PROFILE_PROGRAM_ID = new PublicKey("3FDN5CZQZrBydRA9wW2UAif4p3xmP1VQwkg97Bc8CrNq");
const TRADE_PROGRAM_ID = new PublicKey("kXcoGbvG1ib18vK6YLdkbEdnc9NsqrhAS256yhreacB");

// Connect to local validator
const connection = new Connection('http://localhost:8899', 'confirmed');

describe('LocalMoney Workflow', () => {
  // Basic verification
  it('Verifies the programs are deployed', async () => {
    for (const [name, pubkey] of Object.entries({
      'hub': HUB_PROGRAM_ID,
      'offer': OFFER_PROGRAM_ID,
      'price': PRICE_PROGRAM_ID,
      'profile': PROFILE_PROGRAM_ID,
      'trade': TRADE_PROGRAM_ID
    })) {
      const programInfo = await connection.getAccountInfo(pubkey);
      assert(programInfo !== null, `Program ${name} not found`);
      assert(programInfo.executable, `Program ${name} is not executable`);
      console.log(`✓ ${name} program verified: ${pubkey.toString()}`);
    }
  });

  // Calculate hub PDA
  it('Displays the hub PDA', () => {
    const [hubPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("hub")],
      HUB_PROGRAM_ID
    );
    console.log("Hub PDA:", hubPda.toString());
  });
}); 