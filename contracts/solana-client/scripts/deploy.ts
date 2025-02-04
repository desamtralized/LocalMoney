import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createMint } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  // Connect to local Solana validator
  const connection = new Connection('http://localhost:8899', 'confirmed');
  
  // Create or load deployer keypair
  let deployer: Keypair;
  const deployerPath = path.resolve(__dirname, '../keypairs/deployer.json');
  
  if (fs.existsSync(deployerPath)) {
    const deployerJSON = JSON.parse(fs.readFileSync(deployerPath, 'utf-8'));
    deployer = Keypair.fromSecretKey(new Uint8Array(deployerJSON));
  } else {
    deployer = new Keypair();
    fs.mkdirSync(path.dirname(deployerPath), { recursive: true });
    fs.writeFileSync(deployerPath, JSON.stringify(Array.from(deployer.secretKey)));
  }

  console.log('Deployer pubkey:', deployer.publicKey.toBase58());

  // Fund deployer account
  const airdropSignature = await connection.requestAirdrop(
    deployer.publicKey,
    10 * LAMPORTS_PER_SOL,
  );
  await connection.confirmTransaction(airdropSignature);
  console.log('Funded deployer account');

  // Deploy programs
  const programPaths = {
    hub: '../target/deploy/localmoney_hub.so',
    profile: '../target/deploy/localmoney_profile.so',
    price: '../target/deploy/localmoney_price.so',
    trade: '../target/deploy/localmoney_trade.so',
    offer: '../target/deploy/localmoney_offer.so',
  };

  const programIds: Record<string, PublicKey> = {};

  for (const [name, relativePath] of Object.entries(programPaths)) {
    console.log(`Deploying ${name} program...`);
    
    // Read program data
    const programPath = path.resolve(__dirname, relativePath);
    const programData = fs.readFileSync(programPath);

    // Create program keypair
    const programKeypair = new Keypair();
    
    // Deploy program
    const programId = await deployProgram(
      connection,
      deployer,
      programData,
      programKeypair,
    );

    programIds[name] = programId;
    console.log(`${name} program deployed at:`, programId.toBase58());

    // Save program ID
    const idPath = path.resolve(__dirname, `../keypairs/${name}_program.json`);
    fs.writeFileSync(idPath, JSON.stringify({
      publicKey: programId.toBase58(),
      secretKey: Array.from(programKeypair.secretKey),
    }));
  }

  // Create USDC mint for testing
  const usdcMint = await createMint(
    connection,
    deployer,
    deployer.publicKey,
    null,
    6,
  );
  console.log('USDC mint created at:', usdcMint.toBase58());

  // Save deployment info
  const deploymentInfo = {
    network: 'localnet',
    deployer: deployer.publicKey.toBase58(),
    programIds: Object.fromEntries(
      Object.entries(programIds).map(([k, v]) => [k, v.toBase58()])
    ),
    usdcMint: usdcMint.toBase58(),
    deployedAt: new Date().toISOString(),
  };

  const deploymentPath = path.resolve(__dirname, '../deployment.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log('Deployment info saved to:', deploymentPath);
}

async function deployProgram(
  connection: Connection,
  payer: Keypair,
  programData: Buffer,
  programKeypair: Keypair,
): Promise<PublicKey> {
  // Create program account
  const lamports = await connection.getMinimumBalanceForRentExemption(programData.length);
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: programKeypair.publicKey,
      lamports,
      space: programData.length,
      programId: new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),
    })
  );
  await sendAndConfirmTransaction(connection, transaction, [payer, programKeypair]);

  // Deploy program data
  const chunkSize = 900; // Solana transaction size limit
  for (let i = 0; i < programData.length; i += chunkSize) {
    const chunk = programData.slice(i, i + chunkSize);
    const transaction = new Transaction().add({
      keys: [{ pubkey: programKeypair.publicKey, isSigner: true, isWritable: true }],
      programId: new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),
      data: Buffer.from([0, ...chunk]),
    });
    await sendAndConfirmTransaction(connection, transaction, [payer, programKeypair]);
  }

  // Finalize deployment
  const finalizeTransaction = new Transaction().add({
    keys: [{ pubkey: programKeypair.publicKey, isSigner: true, isWritable: true }],
    programId: new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),
    data: Buffer.from([1]),
  });
  await sendAndConfirmTransaction(connection, finalizeTransaction, [payer, programKeypair]);

  return programKeypair.publicKey;
}

main().catch(console.error); 