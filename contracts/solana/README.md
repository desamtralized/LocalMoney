# LocalMoney Protocol - Solana Implementation

This is a port of the LocalMoney protocol from CosmWasm to Solana using the Anchor framework.

## Project Structure

The LocalMoney protocol consists of the following programs:

- **Hub Program**: Central coordination program that stores configuration and connects other programs
- **Offer Program**: For creating and managing buy/sell offers
- **Trade Program**: Handles escrow mechanics and trade lifecycle
- **Price Program**: Oracle program for currency pricing
- **Profile Program**: User profile management

## Program Architecture

Each program follows Solana's account model, where data is stored in Program Derived Accounts (PDAs). Cross-program invocations (CPIs) are used for communication between programs.

## Key Design Decisions

1. **Account Model**: Used PDAs to store data that was previously in CosmWasm storage
2. **Program Interface**: Split CosmWasm execute handlers into individual Anchor instructions
3. **Data Types**: Converted CosmWasm types (Addr, Uint128, etc.) to Solana types (Pubkey, u64, etc.)
4. **Permissions**: Replaced CosmWasm sender checks with Solana signer verification
5. **Token Handling**: Integrated with Solana's SPL token program instead of CosmWasm's token handling

## Development Status

- [x] Project structure setup
- [x] Shared library with common types
- [x] Hub program core functionality
- [x] Offer program core functionality
- [ ] Trade program
- [ ] Price program
- [ ] Profile program
- [ ] Cross-program interactions
- [ ] Tests

## Usage

To build the programs:

```bash
cd solana
anchor build
```

To deploy to localnet:

```bash
cd solana
anchor deploy
``` 