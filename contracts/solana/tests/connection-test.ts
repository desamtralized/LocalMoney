import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import * as fs from 'fs';
import * as path from 'path';

describe("LocalMoney Connection Test", () => {
  // Program IDs from Anchor.toml
  const programIds = {
    hub: "FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG",
    offer: "GaupCSNN86LpjFQYiLhYGBsXPwWxUW3XmRGdBLkr1tMn",
    price: "51GmuXVNFTveMq1UtrmzWT8q564YjBKD5Zx2zbsMaWHG",
    profile: "3FDN5CZQZrBydRA9wW2UAif4p3xmP1VQwkg97Bc8CrNq",
    trade: "kXcoGbvG1ib18vK6YLdkbEdnc9NsqrhAS256yhreacB"
  };

  it("should connect to a local validator", async () => {
    const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
    const latestBlockhash = await connection.getLatestBlockhash();
    assert.isDefined(latestBlockhash, "Should be able to get latest blockhash from provider");
    console.log("Successfully connected to local validator");
  });

  it("should verify IDL files exist", () => {
    const hubIdlPath = path.join(__dirname, '../target/idl/hub.json');
    const offerIdlPath = path.join(__dirname, '../target/idl/offer.json');
    const tradeIdlPath = path.join(__dirname, '../target/idl/trade.json');
    const priceIdlPath = path.join(__dirname, '../target/idl/price.json');
    const profileIdlPath = path.join(__dirname, '../target/idl/profile.json');
    
    assert.isTrue(fs.existsSync(hubIdlPath), `Hub IDL file doesn't exist at ${hubIdlPath}`);
    assert.isTrue(fs.existsSync(offerIdlPath), `Offer IDL file doesn't exist at ${offerIdlPath}`);
    assert.isTrue(fs.existsSync(tradeIdlPath), `Trade IDL file doesn't exist at ${tradeIdlPath}`);
    assert.isTrue(fs.existsSync(priceIdlPath), `Price IDL file doesn't exist at ${priceIdlPath}`);
    assert.isTrue(fs.existsSync(profileIdlPath), `Profile IDL file doesn't exist at ${profileIdlPath}`);
  });
  
  it("should examine IDL instruction names", () => {
    const hubIdlPath = path.join(__dirname, '../target/idl/hub.json');
    const offerIdlPath = path.join(__dirname, '../target/idl/offer.json');
    const tradeIdlPath = path.join(__dirname, '../target/idl/trade.json');
    const priceIdlPath = path.join(__dirname, '../target/idl/price.json');
    const profileIdlPath = path.join(__dirname, '../target/idl/profile.json');
    
    const hubIdl = JSON.parse(fs.readFileSync(hubIdlPath, 'utf8'));
    const offerIdl = JSON.parse(fs.readFileSync(offerIdlPath, 'utf8'));
    const tradeIdl = JSON.parse(fs.readFileSync(tradeIdlPath, 'utf8'));
    const priceIdl = JSON.parse(fs.readFileSync(priceIdlPath, 'utf8'));
    const profileIdl = JSON.parse(fs.readFileSync(profileIdlPath, 'utf8'));
    
    console.log("Hub Instructions:");
    hubIdl.instructions.forEach(ix => console.log(` - ${ix.name}`));
    
    console.log("\nOffer Instructions:");
    offerIdl.instructions.forEach(ix => console.log(` - ${ix.name}`));
    
    console.log("\nTrade Instructions:");
    tradeIdl.instructions.forEach(ix => console.log(` - ${ix.name}`));
    
    console.log("\nPrice Instructions:");
    priceIdl.instructions.forEach(ix => console.log(` - ${ix.name}`));
    
    console.log("\nProfile Instructions:");
    profileIdl.instructions.forEach(ix => console.log(` - ${ix.name}`));
  });
  
  it("should verify program accounts exist", async () => {
    const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
    
    const hubInfo = await connection.getAccountInfo(new PublicKey(programIds.hub));
    assert.isDefined(hubInfo, "Should be able to get Hub program account info");
    console.log("✅ Hub program account exists");
    
    const offerInfo = await connection.getAccountInfo(new PublicKey(programIds.offer));
    assert.isDefined(offerInfo, "Should be able to get Offer program account info");
    console.log("✅ Offer program account exists");
    
    const tradeInfo = await connection.getAccountInfo(new PublicKey(programIds.trade));
    assert.isDefined(tradeInfo, "Should be able to get Trade program account info");
    console.log("✅ Trade program account exists");
    
    const priceInfo = await connection.getAccountInfo(new PublicKey(programIds.price));
    assert.isDefined(priceInfo, "Should be able to get Price program account info");
    console.log("✅ Price program account exists");
    
    const profileInfo = await connection.getAccountInfo(new PublicKey(programIds.profile));
    assert.isDefined(profileInfo, "Should be able to get Profile program account info");
    console.log("✅ Profile program account exists");
  });
}); 