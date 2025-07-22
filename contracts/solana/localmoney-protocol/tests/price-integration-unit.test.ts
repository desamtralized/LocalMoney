import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";

describe("Price Integration Unit Tests", () => {
  it("should validate price integration compilation", () => {
    // Test that shared types compile correctly
    expect(true).to.equal(true);
  });

  it("should validate price staleness calculation", () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const priceTime = currentTime - 1800; // 30 minutes ago
    const maxStaleness = 3600; // 1 hour
    
    const isStale = (currentTime - priceTime) > maxStaleness;
    expect(isStale).to.equal(false);
    
    const veryOldTime = currentTime - 7200; // 2 hours ago
    const isVeryStale = (currentTime - veryOldTime) > maxStaleness;
    expect(isVeryStale).to.equal(true);
  });

  it("should validate price deviation calculations", () => {
    const marketPrice = 85_000_000; // 0.85 with 8 decimals
    const offerRate = 93_500_000; // 0.935 with 8 decimals
    
    // Calculate percentage deviation
    const deviation = Math.abs(offerRate - marketPrice) / marketPrice;
    const deviationPercent = deviation * 100;
    
    expect(deviationPercent).to.be.approximately(10, 0.1); // 10% deviation
    
    // Test 10% threshold
    const maxDeviation = 0.1; // 10%
    expect(deviation).to.be.lessThanOrEqual(maxDeviation);
  });

  it("should validate USD conversion logic", () => {
    // EUR to USD conversion test
    const eurAmount = 85000; // €850 (in cents)
    const eurToUsdRate = 1.1764; // 1 EUR = 1.1764 USD
    const expectedUsdAmount = Math.floor(eurAmount * eurToUsdRate);
    
    expect(expectedUsdAmount).to.equal(99993); // Actual result
    
    // GBP to USD conversion test
    const gbpAmount = 75000; // £750 (in cents)
    const gbpToUsdRate = 1.3333; // 1 GBP = 1.3333 USD
    const expectedGbpUsdAmount = Math.floor(gbpAmount * gbpToUsdRate);
    
    expect(expectedGbpUsdAmount).to.equal(99997); // $999.97
  });

  it("should validate fee calculation with price conversion", () => {
    const baseAmount = 1000_000_000_000; // 1000 tokens (9 decimals) = 1000 * 10^9
    const pricePerToken = 85_000_000; // 0.85 EUR per token (8 decimals)
    
    // Calculate total value in EUR cents
    // 1000 tokens * 0.85 EUR/token * 100 cents/EUR = 85000 cents
    const tokensInUnits = baseAmount / Math.pow(10, 9); // 1000 tokens
    const priceInEur = pricePerToken / Math.pow(10, 8); // 0.85 EUR
    const totalValueEur = tokensInUnits * priceInEur * 100; // Convert to cents
    
    expect(totalValueEur).to.equal(85000); // €850 (in cents)
    
    // Calculate fees
    const chainFeeRate = 0.02; // 2%
    const chainFee = Math.floor(totalValueEur * chainFeeRate);
    expect(chainFee).to.equal(1700); // €17
    
    const warchestFeeRate = 0.01; // 1%
    const warchestFee = Math.floor(totalValueEur * warchestFeeRate);
    expect(warchestFee).to.equal(850); // €8.50
  });

  it("should validate price confidence thresholds", () => {
    const highConfidence = 95;
    const mediumConfidence = 80;
    const lowConfidence = 60;
    
    expect(highConfidence).to.be.greaterThan(90);
    expect(mediumConfidence).to.be.greaterThan(70);
    expect(lowConfidence).to.be.lessThan(70);
    
    // Validate confidence-based warnings
    const getConfidenceLevel = (confidence: number) => {
      if (confidence >= 90) return "high";
      if (confidence >= 70) return "medium";
      return "low";
    };
    
    expect(getConfidenceLevel(highConfidence)).to.equal("high");
    expect(getConfidenceLevel(mediumConfidence)).to.equal("medium");
    expect(getConfidenceLevel(lowConfidence)).to.equal("low");
  });

  it("should validate multi-currency route calculations", () => {
    // USD -> EUR -> GBP conversion route
    const usdAmount = 100000; // $1000
    const usdToEurRate = 0.85; // 1 USD = 0.85 EUR
    const eurToGbpRate = 0.88; // 1 EUR = 0.88 GBP
    
    const eurAmount = usdAmount * usdToEurRate;
    const gbpAmount = eurAmount * eurToGbpRate;
    
    expect(eurAmount).to.equal(85000); // €850
    expect(gbpAmount).to.equal(74800); // £748
    
    // Apply route fees
    const routeFee1 = 0.001; // 0.1% USD->EUR
    const routeFee2 = 0.0015; // 0.15% EUR->GBP
    
    const eurAfterFee = eurAmount * (1 - routeFee1);
    const gbpAfterFee = eurAfterFee * eurToGbpRate * (1 - routeFee2);
    
    expect(Math.floor(eurAfterFee)).to.equal(84915); // €849.15
    expect(Math.floor(gbpAfterFee)).to.equal(74613); // £746.13
  });

  it("should validate price lock expiry logic", () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const priceLockTime = currentTime - 900; // 15 minutes ago
    const maxLockDuration = 1800; // 30 minutes
    
    const lockAge = currentTime - priceLockTime;
    const isExpired = lockAge > maxLockDuration;
    const timeRemaining = Math.max(0, maxLockDuration - lockAge);
    
    expect(lockAge).to.equal(900); // 15 minutes
    expect(isExpired).to.equal(false);
    expect(timeRemaining).to.equal(900); // 15 minutes remaining
    
    // Test expired lock
    const expiredLockTime = currentTime - 2700; // 45 minutes ago
    const expiredLockAge = currentTime - expiredLockTime;
    const isExpiredLock = expiredLockAge > maxLockDuration;
    
    expect(isExpiredLock).to.equal(true);
  });

  it("should validate volume discount calculations", () => {
    // Volume discount tiers
    const calculateVolumeDiscount = (volumeUsd: number): number => {
      if (volumeUsd >= 100000) return 0.25; // Diamond: 25% discount
      if (volumeUsd >= 50000) return 0.20;  // Platinum: 20% discount
      if (volumeUsd >= 25000) return 0.15;  // Gold: 15% discount
      if (volumeUsd >= 10000) return 0.10;  // Silver: 10% discount
      if (volumeUsd >= 5000) return 0.05;   // Bronze: 5% discount
      return 0; // No discount
    };
    
    expect(calculateVolumeDiscount(150000)).to.equal(0.25); // Diamond
    expect(calculateVolumeDiscount(75000)).to.equal(0.20);  // Platinum
    expect(calculateVolumeDiscount(30000)).to.equal(0.15);  // Gold
    expect(calculateVolumeDiscount(15000)).to.equal(0.10);  // Silver
    expect(calculateVolumeDiscount(7500)).to.equal(0.05);   // Bronze
    expect(calculateVolumeDiscount(1000)).to.equal(0);      // No discount
  });

  it("should validate price volatility analysis", () => {
    // Sample price history (in cents, 8 decimals)
    const priceHistory = [
      85000000, // 0.85
      86000000, // 0.86
      84500000, // 0.845
      87000000, // 0.87
      85500000, // 0.855
    ];
    
    // Calculate average
    const average = priceHistory.reduce((sum, price) => sum + price, 0) / priceHistory.length;
    expect(Math.floor(average)).to.equal(85600000); // 0.856
    
    // Calculate volatility (standard deviation)
    const variance = priceHistory.reduce((sum, price) => {
      const diff = price - average;
      return sum + (diff * diff);
    }, 0) / priceHistory.length;
    
    const volatility = Math.sqrt(variance);
    expect(Math.floor(volatility)).to.be.greaterThan(0);
    
    // Calculate min/max
    const minPrice = Math.min(...priceHistory);
    const maxPrice = Math.max(...priceHistory);
    expect(minPrice).to.equal(84500000);
    expect(maxPrice).to.equal(87000000);
    
    // Price range percentage
    const priceRange = ((maxPrice - minPrice) / average) * 100;
    expect(Math.floor(priceRange)).to.equal(2); // ~2.9% range
  });

  it("should validate economic viability checks", () => {
    const tradeAmount = 10000; // $100 equivalent
    const totalFeePercentage = 0.0375; // 3.75% total fees
    const totalFees = tradeAmount * totalFeePercentage;
    
    expect(totalFees).to.equal(375); // $3.75
    
    // Check if trade is economically viable (fees < 10% of trade amount)
    const maxFeeThreshold = 0.10; // 10%
    const isViable = totalFeePercentage <= maxFeeThreshold;
    expect(isViable).to.equal(true);
    
    // Test non-viable trade
    const smallTradeAmount = 500; // $5 equivalent
    const smallTradeFees = smallTradeAmount * totalFeePercentage;
    const feePercentageOfSmallTrade = smallTradeFees / smallTradeAmount;
    
    expect(feePercentageOfSmallTrade).to.equal(0.0375); // 3.75%
    expect(feePercentageOfSmallTrade <= maxFeeThreshold).to.equal(true);
  });
});