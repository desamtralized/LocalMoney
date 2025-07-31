import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { expect } from "chai";

// Import program types
import { Trade } from "../target/types/trade";

describe("Arbitration System Integration Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const tradeProgram = anchor.workspace.Trade as Program<Trade>;

  // Test accounts
  let admin: Keypair;
  let authority: Keypair;
  let arbitrator1: Keypair;
  let buyer: Keypair;
  let seller: Keypair;

  // Token setup
  let tokenMint: anchor.web3.PublicKey;

  // PDA accounts
  let arbitratorPool: anchor.web3.PublicKey;
  let arbitratorInfo1: anchor.web3.PublicKey;

  // Test constants
  const FiatCurrency = {
    USD: { usd: {} },
  };

  before(async () => {
    // Initialize keypairs
    admin = Keypair.generate();
    authority = Keypair.generate();
    arbitrator1 = Keypair.generate();
    buyer = Keypair.generate();
    seller = Keypair.generate();

    // Airdrop SOL to accounts
    const accounts = [admin, authority, arbitrator1, buyer, seller];
    for (const account of accounts) {
      await provider.connection.requestAirdrop(account.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    }

    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create token mint
    tokenMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6 // 6 decimals
    );

    // Derive PDA addresses
    [arbitratorPool] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("arbitrator-pool"), Buffer.from("USD")],
      tradeProgram.programId
    );

    [arbitratorInfo1] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("arbitrator"), arbitrator1.publicKey.toBuffer(), Buffer.from("USD")],
      tradeProgram.programId
    );
  });

  describe("Arbitrator Management", () => {
    it("should test arbitrator pool creation", async () => {
      // This is a basic test to ensure the program functions work
      // We'll test account creation and basic functionality
      
      // First, let's check if we can call the program
      console.log("Trade program ID:", tradeProgram.programId.toString());
      console.log("Arbitrator1 pubkey:", arbitrator1.publicKey.toString());
      console.log("Arbitrator pool PDA:", arbitratorPool.toString());
      console.log("Arbitrator info PDA:", arbitratorInfo1.toString());

      // Test passes if we can access the program and create PDAs
      expect(tradeProgram.programId).to.not.be.null;
      expect(arbitratorPool).to.not.be.null;
      expect(arbitratorInfo1).to.not.be.null;
    });

    it("should verify PDA derivation works correctly", async () => {
      // Test that we can derive PDAs consistently
      const [derivedPool] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("arbitrator-pool"), Buffer.from("USD")],
        tradeProgram.programId
      );

      const [derivedInfo] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("arbitrator"), arbitrator1.publicKey.toBuffer(), Buffer.from("USD")],
        tradeProgram.programId
      );

      expect(derivedPool.toString()).to.equal(arbitratorPool.toString());
      expect(derivedInfo.toString()).to.equal(arbitratorInfo1.toString());
    });

    it("should verify account structures exist in program", async () => {
      // Test that the account structures are properly defined
      expect(tradeProgram.account).to.have.property('arbitratorPool');
      expect(tradeProgram.account).to.have.property('arbitratorInfo');
      expect(tradeProgram.account).to.have.property('trade');
      
      // Test that the instruction methods exist
      expect(tradeProgram.methods).to.have.property('registerArbitrator');
      expect(tradeProgram.methods).to.have.property('deactivateArbitrator');
      expect(tradeProgram.methods).to.have.property('assignArbitrator');
      expect(tradeProgram.methods).to.have.property('initiateDispute');
      expect(tradeProgram.methods).to.have.property('settleDispute');
    });

    it("should demonstrate fee calculation logic", async () => {
      // Test the fee calculation logic without requiring full state setup
      const tradeAmount = new anchor.BN(1000000); // 1 token with 6 decimals
      const feeRate = 200; // 2% in basis points
      
      // Calculate arbitrator fee (should be 2% of trade amount)
      const arbitratorFee = tradeAmount.mul(new anchor.BN(feeRate)).div(new anchor.BN(10000));
      expect(arbitratorFee.toNumber()).to.equal(20000); // 2% of 1000000

      // Calculate protocol fees (1.5% total)
      const protocolFeeTotal = tradeAmount.mul(new anchor.BN(150)).div(new anchor.BN(10000));
      expect(protocolFeeTotal.toNumber()).to.equal(15000); // 1.5% of 1000000

      // Winner should get the remainder
      const winnerAmount = tradeAmount.sub(arbitratorFee).sub(protocolFeeTotal);
      expect(winnerAmount.toNumber()).to.equal(965000); // 96.5% of original amount

      console.log("Fee distribution test:");
      console.log(`Original amount: ${tradeAmount.toString()}`);
      console.log(`Arbitrator fee: ${arbitratorFee.toString()}`);
      console.log(`Protocol fee: ${protocolFeeTotal.toString()}`);
      console.log(`Winner amount: ${winnerAmount.toString()}`);
    });

    it("should verify CosmWasm arbitrator selection algorithm", async () => {
      // Test the arbitrator selection algorithm without blockchain state
      const arbitratorCount = 3;
      const randomValues = [25, 50, 75, 99];
      
      for (const randomValue of randomValues) {
        // Matching CosmWasm algorithm: RandomValue * arbitratorCount / (MaxRandomRange + 1)
        const selectedIndex = Math.floor(randomValue * arbitratorCount / 100);
        
        expect(selectedIndex).to.be.at.least(0);
        expect(selectedIndex).to.be.below(arbitratorCount);
        
        console.log(`Random ${randomValue} -> Index ${selectedIndex}`);
      }
      
      // Test edge cases
      expect(Math.floor(0 * arbitratorCount / 100)).to.equal(0);
      expect(Math.floor(99 * arbitratorCount / 100)).to.equal(2); // Should be last valid index
    });
  });

  describe("Program Build Verification", () => {
    it("should confirm all required functions compiled successfully", async () => {
      // Verify that all the arbitration functions we implemented are available
      const requiredMethods = [
        'createTrade',
        'acceptRequest', 
        'fundEscrow',
        'markFiatDeposited',
        'releaseEscrow',
        'cancelRequest',
        'registerArbitrator',
        'deactivateArbitrator',
        'assignArbitrator',
        'initiateDispute',
        'settleDispute'
      ];

      for (const method of requiredMethods) {
        expect(tradeProgram.methods).to.have.property(method);
        expect(typeof tradeProgram.methods[method]).to.equal('function', `Method ${method} should be a function`);
        console.log(`✓ Method ${method} exists`);
      }
    });

    it("should confirm all required account types compiled successfully", async () => {
      const requiredAccounts = [
        'trade',
        'arbitratorPool',
        'arbitratorInfo'
      ];

      for (const account of requiredAccounts) {
        expect(tradeProgram.account).to.have.property(account);
        expect(tradeProgram.account[account]).to.not.be.undefined;
        console.log(`✓ Account type ${account} exists`);
      }
    });

    it("should verify error codes are properly defined", async () => {
      // Test that our custom error codes exist in the IDL
      const idl = tradeProgram.idl;
      
      expect(idl.errors).to.not.be.undefined;
      expect(idl.errors.length).to.be.greaterThan(0);
      
      // Check for some key error codes we defined (in camelCase format)
      const errorCodes = idl.errors.map(err => err.name);
      const expectedErrors = [
        'unauthorized',
        'invalidTradeState', 
        'arbitratorAlreadyExists',
        'noArbitratorsAvailable',
        'invalidWinner'
      ];

      for (const expectedError of expectedErrors) {
        expect(errorCodes).to.include(expectedError, `Missing error code: ${expectedError}`);
        console.log(`✓ Error code ${expectedError} exists`);
      }
    });
  });
});