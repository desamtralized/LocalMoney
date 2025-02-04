import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { LocalMoneyClient } from './client';
import { CurrencyPrice, PriceRoute } from './types';
import { serialize } from 'borsh';

export class PriceClient extends LocalMoneyClient {
  /**
   * Register hub
   */
  async registerHub(): Promise<string> {
    const instruction = await this.registerHubInstruction();
    return await this.sendTransaction([instruction]);
  }

  /**
   * Update prices
   */
  async updatePrices(prices: CurrencyPrice[]): Promise<string> {
    const instruction = await this.updatePricesInstruction(prices);
    return await this.sendTransaction([instruction]);
  }

  /**
   * Register price route for denom
   */
  async registerPriceRouteForDenom(
    denom: string,
    route: PriceRoute[],
  ): Promise<string> {
    const instruction = await this.registerPriceRouteForDenomInstruction(denom, route);
    return await this.sendTransaction([instruction]);
  }

  /**
   * Query price for denom in fiat
   */
  async queryPrice(
    fiat: string,
    denom: string,
  ): Promise<{ denom: string; fiat: string; price: bigint }> {
    // This is a view function, so we don't need to send a transaction
    // Instead, we'll need to implement proper account data deserialization
    // This is a placeholder
    return {
      denom,
      fiat,
      price: BigInt(0),
    };
  }

  private async registerHubInstruction(): Promise<TransactionInstruction> {
    const data = serialize(
      { struct: { variant: 'string' } },
      { variant: 'RegisterHub' },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.PRICE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async updatePricesInstruction(prices: CurrencyPrice[]): Promise<TransactionInstruction> {
    const data = serialize(
      {
        struct: {
          variant: 'string',
          prices: {
            array: {
              struct: {
                currency: 'string',
                usdPrice: 'u64',
                updatedAt: 'i64',
              },
            },
          },
        },
      },
      {
        variant: 'UpdatePrices',
        prices: prices.map(p => ({
          currency: p.currency,
          usdPrice: p.usdPrice,
          updatedAt: p.updatedAt,
        })),
      },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.PRICE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async registerPriceRouteForDenomInstruction(
    denom: string,
    route: PriceRoute[],
  ): Promise<TransactionInstruction> {
    const data = serialize(
      {
        struct: {
          variant: 'string',
          denom: 'string',
          route: {
            array: {
              struct: {
                offerAsset: 'string',
                pool: 'pubkey',
              },
            },
          },
        },
      },
      {
        variant: 'RegisterPriceRouteForDenom',
        denom,
        route: route.map(r => ({
          offerAsset: r.offerAsset,
          pool: r.pool,
        })),
      },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.PRICE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }
} 