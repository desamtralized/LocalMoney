import { PublicKey } from '@solana/web3.js';

// Custom schema types that match borsh's requirements
export type BorshTypeDefinition = 
  | { struct: { fields: [string, string | BorshTypeDefinition][] } }
  | { option: { type: string } }
  | { array: { type: BorshTypeDefinition } }
  | { map: { key: string; value: string } }
  | { enum: { type: string } }
  | { set: { type: string } };

// Custom serializer for PublicKey
const pubkeySerializer = {
  serialize: (pubkey: PublicKey) => pubkey.toBytes(),
  deserialize: (bytes: Uint8Array) => new PublicKey(bytes),
};

// Base instruction schema
export const InstructionSchema: Record<string, any> = {
  string: 'string',
  u8: 'u8',
  u16: 'u16',
  u32: 'u32',
  u64: 'u64',
  i32: 'i32',
  i64: 'i64',
  pubkey: pubkeySerializer,
};

// Account schemas
export const ProfileSchema: BorshTypeDefinition = {
  struct: {
    fields: [
      ['username', 'string'],
      ['reputation', 'i32'],
      ['tradesCompleted', 'u32'],
      ['tradesDisputed', 'u32'],
      ['isVerified', 'u8'],
    ],
  },
};

// Currency price schema
export const CurrencyPriceSchema: BorshTypeDefinition = {
  struct: {
    fields: [
      ['currency', 'string'],
      ['usdPrice', 'u64'],
      ['updatedAt', 'i64'],
    ],
  },
};

// Price route schema
export const PriceRouteSchema: BorshTypeDefinition = {
  struct: {
    fields: [
      ['offerAsset', 'string'],
      ['pool', 'pubkey'],
    ],
  },
};

// Profile instruction schemas
export const CreateProfileSchema: BorshTypeDefinition = {
  struct: {
    fields: [
      ['variant', 'string'],
      ['username', 'string'],
    ],
  },
};

export const UpdateProfileSchema: BorshTypeDefinition = {
  struct: {
    fields: [
      ['variant', 'string'],
      ['username', { option: { type: 'string' } }],
    ],
  },
};

export const UpdateReputationSchema: BorshTypeDefinition = {
  struct: {
    fields: [
      ['variant', 'string'],
      ['scoreDelta', 'i32'],
    ],
  },
};

// Price instruction schemas
export const UpdatePricesSchema: BorshTypeDefinition = {
  struct: {
    fields: [
      ['variant', 'string'],
      ['prices', { array: { type: CurrencyPriceSchema } }],
    ],
  },
};

export const RegisterPriceRouteSchema: BorshTypeDefinition = {
  struct: {
    fields: [
      ['variant', 'string'],
      ['denom', 'string'],
      ['route', { array: { type: PriceRouteSchema } }],
    ],
  },
};

// Hub instruction schemas
export const InitializeHubSchema: BorshTypeDefinition = {
  struct: {
    fields: [
      ['variant', 'string'],
      ['priceProgram', 'pubkey'],
      ['tradeProgram', 'pubkey'],
      ['profileProgram', 'pubkey'],
      ['offerProgram', 'pubkey'],
      ['feeAccount', 'pubkey'],
      ['feeBasisPoints', 'u16'],
    ],
  },
};

export const UpdateHubConfigSchema: BorshTypeDefinition = {
  struct: {
    fields: [
      ['variant', 'string'],
      ['feeBasisPoints', { option: { type: 'u16' } }],
      ['feeAccount', { option: { type: 'pubkey' } }],
    ],
  },
};

// Simple instruction schema (no additional fields)
export const SimpleInstructionSchema: BorshTypeDefinition = {
  struct: {
    fields: [
      ['variant', 'string'],
    ],
  },
}; 