import { PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import { config } from "dotenv";

// Load environment variables
config();

// Helper to validate and get environment variable
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Program IDs configuration
export const PROGRAM_IDS = {
  hub: new PublicKey(getRequiredEnv("HUB_PROGRAM_ID")),
  offer: new PublicKey(getRequiredEnv("OFFER_PROGRAM_ID")),
  price: new PublicKey(getRequiredEnv("PRICE_PROGRAM_ID")),
  profile: new PublicKey(getRequiredEnv("PROFILE_PROGRAM_ID")),
  trade: new PublicKey(getRequiredEnv("TRADE_PROGRAM_ID")),
} as const; 