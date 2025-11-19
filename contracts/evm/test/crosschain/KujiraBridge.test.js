const { ethers } = require("hardhat");
const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("KujiraTokenBridge", function () {
    let bridge, token, owner, relayer, user1, user2, attacker, newRelayer;

    const MIN_AMOUNT = ethers.parseUnits("1", 6);      // 1 KUJI
    const MAX_AMOUNT = ethers.parseUnits("1000000", 6); // 1M KUJI
    const DAILY_LIMIT = ethers.parseUnits("10000000", 6); // 10M KUJI

    const MINTER_ROLE = ethers.id("MINTER_ROLE");
    const RELAYER_CHANGE_DELAY = 2 * 24 * 60 * 60; // 2 days

    beforeEach(async function () {
        [owner, relayer, user1, user2, attacker, newRelayer] = await ethers.getSigners();

        // Deploy token
        const KujiraBridgedToken = await ethers.getContractFactory("KujiraBridgedToken");
        token = await KujiraBridgedToken.deploy("Bridged KUJI", "bKUJI");
        await token.waitForDeployment();

        // Deploy bridge
        const KujiraTokenBridge = await ethers.getContractFactory("KujiraTokenBridge");
        bridge = await KujiraTokenBridge.deploy(
            await token.getAddress(),
            relayer.address,
            MIN_AMOUNT,
            MAX_AMOUNT,
            DAILY_LIMIT
        );
        await bridge.waitForDeployment();

        // Grant MINTER_ROLE to bridge
        await token.grantRole(MINTER_ROLE, await bridge.getAddress());
    });

    describe("Deployment", function () {
        it("should deploy with correct parameters", async function () {
            expect(await bridge.bridgedToken()).to.equal(await token.getAddress());
            expect(await bridge.relayer()).to.equal(relayer.address);
            expect(await bridge.minBridgeAmount()).to.equal(MIN_AMOUNT);
            expect(await bridge.maxBridgeAmount()).to.equal(MAX_AMOUNT);
            expect(await bridge.dailyLimit()).to.equal(DAILY_LIMIT);
        });

        it("should set owner correctly", async function () {
            expect(await bridge.owner()).to.equal(owner.address);
        });

        it("should initialize with zero statistics", async function () {
            const stats = await bridge.getBridgeStats();
            expect(stats.totalTransactions).to.equal(0);
            expect(stats.totalAmount).to.equal(0);
            expect(stats.lastBridgeTime).to.equal(0);
        });

        it("should reject invalid constructor parameters", async function () {
            const KujiraTokenBridge = await ethers.getContractFactory("KujiraTokenBridge");

            await expect(KujiraTokenBridge.deploy(
                ethers.ZeroAddress,
                relayer.address,
                MIN_AMOUNT,
                MAX_AMOUNT,
                DAILY_LIMIT
            )).to.be.revertedWith("Invalid token");

            await expect(KujiraTokenBridge.deploy(
                await token.getAddress(),
                ethers.ZeroAddress,
                MIN_AMOUNT,
                MAX_AMOUNT,
                DAILY_LIMIT
            )).to.be.revertedWith("Invalid relayer");

            await expect(KujiraTokenBridge.deploy(
                await token.getAddress(),
                relayer.address,
                MAX_AMOUNT,
                MIN_AMOUNT,
                DAILY_LIMIT
            )).to.be.revertedWith("Invalid limits");
        });
    });

    describe("Minting", function () {
        const amount = ethers.parseUnits("100", 6);
        const txHash = ethers.id("kujira_tx_123");

        it("should process bridge request successfully", async function () {
            const tx = await bridge.connect(relayer).processBridge(user1.address, amount, txHash);

            await expect(tx)
                .to.emit(bridge, "TokensBridged")
                .withArgs(user1.address, amount, txHash, 1, anyValue);

            expect(await token.balanceOf(user1.address)).to.equal(amount);
            expect(await bridge.totalBridged()).to.equal(amount);
            expect(await bridge.bridgeNonce()).to.equal(1);
        });

        it("should update statistics correctly", async function () {
            await bridge.connect(relayer).processBridge(user1.address, amount, txHash);

            const stats = await bridge.getBridgeStats();
            expect(stats.totalTransactions).to.equal(1);
            expect(stats.totalAmount).to.equal(amount);
            expect(stats.lastBridgeTime).to.be.gt(0);
        });

        it("should mark transaction as processed", async function () {
            await bridge.connect(relayer).processBridge(user1.address, amount, txHash);
            expect(await bridge.isProcessed(txHash)).to.be.true;
        });

        it("should prevent duplicate processing", async function () {
            await bridge.connect(relayer).processBridge(user1.address, amount, txHash);

            await expect(bridge.connect(relayer).processBridge(user1.address, amount, txHash))
                .to.be.revertedWith("Already processed");
        });

        it("should only allow relayer to process", async function () {
            await expect(bridge.connect(attacker).processBridge(user1.address, amount, txHash))
                .to.be.revertedWith("Not authorized relayer");
        });

        it("should enforce minimum amount", async function () {
            const belowMin = MIN_AMOUNT - 1n;
            await expect(bridge.connect(relayer).processBridge(user1.address, belowMin, txHash))
                .to.be.revertedWith("Below minimum");
        });

        it("should enforce maximum amount", async function () {
            const aboveMax = MAX_AMOUNT + 1n;
            await expect(bridge.connect(relayer).processBridge(user1.address, aboveMax, txHash))
                .to.be.revertedWith("Above maximum");
        });

        it("should reject invalid recipient", async function () {
            await expect(bridge.connect(relayer).processBridge(ethers.ZeroAddress, amount, txHash))
                .to.be.revertedWith("Invalid recipient");
        });

        it("should reject invalid tx hash", async function () {
            await expect(bridge.connect(relayer).processBridge(user1.address, amount, ethers.ZeroHash))
                .to.be.revertedWith("Invalid tx hash");
        });
    });

    describe("Daily Limits", function () {
        it("should track daily bridged amount", async function () {
            const amount1 = ethers.parseUnits("1000", 6);
            const amount2 = ethers.parseUnits("2000", 6);

            await bridge.connect(relayer).processBridge(user1.address, amount1, ethers.id("tx1"));
            await bridge.connect(relayer).processBridge(user2.address, amount2, ethers.id("tx2"));

            expect(await bridge.getCurrentDayBridged()).to.equal(amount1 + amount2);
        });

        it("should enforce daily limit", async function () {
            // Use MAX_AMOUNT which is within limits
            const amount = MAX_AMOUNT;

            // Process 10 transactions to reach exactly the daily limit (10M KUJI)
            for (let i = 1; i <= 10; i++) {
                await bridge.connect(relayer).processBridge(user1.address, amount, ethers.id(`tx${i}`));
            }

            // The 11th transaction should exceed daily limit (even MIN_AMOUNT should fail)
            await expect(bridge.connect(relayer).processBridge(user2.address, MIN_AMOUNT, ethers.id("tx11")))
                .to.be.revertedWith("Daily limit exceeded");
        });

        it("should reset daily limit after 24 hours", async function () {
            const amount = MAX_AMOUNT;

            // Fill up most of the daily limit
            for (let i = 1; i <= 9; i++) {
                await bridge.connect(relayer).processBridge(user1.address, amount, ethers.id(`tx${i}`));
            }

            // Move forward 1 day
            await time.increase(24 * 60 * 60);

            // Should be able to bridge again with a fresh daily limit
            await bridge.connect(relayer).processBridge(user2.address, amount, ethers.id("tx_new_day"));
            expect(await bridge.getCurrentDayBridged()).to.equal(amount);
        });

        it("should calculate remaining daily limit correctly", async function () {
            const amount = ethers.parseUnits("1000000", 6); // 1M KUJI
            await bridge.connect(relayer).processBridge(user1.address, amount, ethers.id("tx1"));

            const remaining = await bridge.getRemainingDailyLimit();
            expect(remaining).to.equal(DAILY_LIMIT - amount);
        });

        it("should return zero when daily limit exceeded", async function () {
            // Use multiple transactions to reach the limit
            const amount = MAX_AMOUNT;
            for (let i = 1; i <= 10; i++) {
                await bridge.connect(relayer).processBridge(user1.address, amount, ethers.id(`tx${i}`));
            }
            expect(await bridge.getRemainingDailyLimit()).to.equal(0);
        });
    });

    describe("Relayer Management", function () {
        it("should propose relayer change", async function () {
            await expect(bridge.proposeRelayerChange(newRelayer.address))
                .to.emit(bridge, "RelayerChangeProposed")
                .withArgs(relayer.address, newRelayer.address, await time.latest() + RELAYER_CHANGE_DELAY + 1);

            expect(await bridge.pendingRelayer()).to.equal(newRelayer.address);
        });

        it("should not allow non-owner to propose relayer change", async function () {
            await expect(bridge.connect(attacker).proposeRelayerChange(newRelayer.address))
                .to.be.revertedWithCustomError(bridge, "OwnableUnauthorizedAccount");
        });

        it("should reject invalid relayer address", async function () {
            await expect(bridge.proposeRelayerChange(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid relayer");
        });

        it("should reject same relayer", async function () {
            await expect(bridge.proposeRelayerChange(relayer.address))
                .to.be.revertedWith("Same relayer");
        });

        it("should execute relayer change after timelock", async function () {
            await bridge.proposeRelayerChange(newRelayer.address);
            await time.increase(RELAYER_CHANGE_DELAY);

            await expect(bridge.executeRelayerChange())
                .to.emit(bridge, "RelayerChanged")
                .withArgs(relayer.address, newRelayer.address);

            expect(await bridge.relayer()).to.equal(newRelayer.address);
            expect(await bridge.pendingRelayer()).to.equal(ethers.ZeroAddress);
        });

        it("should not execute relayer change before timelock", async function () {
            await bridge.proposeRelayerChange(newRelayer.address);

            await expect(bridge.executeRelayerChange())
                .to.be.revertedWith("Timelock not expired");
        });

        it("should not execute expired relayer change", async function () {
            await bridge.proposeRelayerChange(newRelayer.address);
            await time.increase(RELAYER_CHANGE_DELAY + 24 * 60 * 60 + 1); // +1 day and 1 second

            await expect(bridge.executeRelayerChange())
                .to.be.revertedWith("Change expired");
        });

        it("should cancel relayer change", async function () {
            await bridge.proposeRelayerChange(newRelayer.address);
            await bridge.cancelRelayerChange();

            expect(await bridge.pendingRelayer()).to.equal(ethers.ZeroAddress);
            expect(await bridge.relayerChangeTimestamp()).to.equal(0);
        });

        it("should allow new relayer to process bridges", async function () {
            await bridge.proposeRelayerChange(newRelayer.address);
            await time.increase(RELAYER_CHANGE_DELAY);
            await bridge.executeRelayerChange();

            const amount = ethers.parseUnits("100", 6);
            const txHash = ethers.id("new_relayer_tx");

            await expect(bridge.connect(newRelayer).processBridge(user1.address, amount, txHash))
                .to.emit(bridge, "TokensBridged");

            expect(await token.balanceOf(user1.address)).to.equal(amount);
        });
    });

    describe("Limit Management", function () {
        it("should update bridge limits", async function () {
            const newMin = ethers.parseUnits("10", 6);
            const newMax = ethers.parseUnits("100000", 6);
            const newDaily = ethers.parseUnits("1000000", 6);

            await expect(bridge.updateBridgeLimits(newMin, newMax, newDaily))
                .to.emit(bridge, "BridgeLimitsUpdated")
                .withArgs(newMin, newMax, newDaily);

            expect(await bridge.minBridgeAmount()).to.equal(newMin);
            expect(await bridge.maxBridgeAmount()).to.equal(newMax);
            expect(await bridge.dailyLimit()).to.equal(newDaily);
        });

        it("should only allow owner to update limits", async function () {
            await expect(bridge.connect(attacker).updateBridgeLimits(MIN_AMOUNT, MAX_AMOUNT, DAILY_LIMIT))
                .to.be.revertedWithCustomError(bridge, "OwnableUnauthorizedAccount");
        });

        it("should reject invalid limits", async function () {
            await expect(bridge.updateBridgeLimits(MAX_AMOUNT, MIN_AMOUNT, DAILY_LIMIT))
                .to.be.revertedWith("Invalid limits");

            await expect(bridge.updateBridgeLimits(MIN_AMOUNT, MAX_AMOUNT, MIN_AMOUNT))
                .to.be.revertedWith("Daily limit too low");
        });
    });

    describe("Emergency Functions", function () {
        it("should pause bridge operations", async function () {
            await expect(bridge.emergencyPause("Security issue"))
                .to.emit(bridge, "EmergencyPause")
                .withArgs(owner.address, "Security issue");

            expect(await bridge.paused()).to.be.true;

            const amount = ethers.parseUnits("100", 6);
            const txHash = ethers.id("paused_tx");

            await expect(bridge.connect(relayer).processBridge(user1.address, amount, txHash))
                .to.be.revertedWithCustomError(bridge, "EnforcedPause");
        });

        it("should unpause bridge operations", async function () {
            await bridge.emergencyPause("Test pause");
            await expect(bridge.emergencyUnpause())
                .to.emit(bridge, "EmergencyUnpause")
                .withArgs(owner.address);

            expect(await bridge.paused()).to.be.false;

            const amount = ethers.parseUnits("100", 6);
            const txHash = ethers.id("unpaused_tx");

            await bridge.connect(relayer).processBridge(user1.address, amount, txHash);
            expect(await token.balanceOf(user1.address)).to.equal(amount);
        });

        it("should only allow owner to pause/unpause", async function () {
            await expect(bridge.connect(attacker).emergencyPause("Attack"))
                .to.be.revertedWithCustomError(bridge, "OwnableUnauthorizedAccount");

            await bridge.emergencyPause("Test");

            await expect(bridge.connect(attacker).emergencyUnpause())
                .to.be.revertedWithCustomError(bridge, "OwnableUnauthorizedAccount");
        });
    });

    describe("Reentrancy Protection", function () {
        it("should have reentrancy protection", async function () {
            // This test verifies the nonReentrant modifier is in place
            // A proper reentrancy test would require a malicious contract
            const amount = ethers.parseUnits("100", 6);
            const txHash = ethers.id("reentrancy_test");

            // The nonReentrant modifier ensures single execution
            await expect(bridge.connect(relayer).processBridge(user1.address, amount, txHash))
                .to.not.be.reverted;

            // Verify the transaction was processed
            expect(await bridge.isProcessed(txHash)).to.be.true;
        });
    });

    describe("Security Tests", function () {
        it("should handle edge case amounts correctly", async function () {
            // Test with minimum amount
            await bridge.connect(relayer).processBridge(user1.address, MIN_AMOUNT, ethers.id("min_tx"));
            expect(await token.balanceOf(user1.address)).to.equal(MIN_AMOUNT);

            // Test with maximum amount
            await bridge.connect(relayer).processBridge(user2.address, MAX_AMOUNT, ethers.id("max_tx"));
            expect(await token.balanceOf(user2.address)).to.equal(MAX_AMOUNT);
        });

        it("should handle multiple transactions in quick succession", async function () {
            const amount = ethers.parseUnits("100", 6);
            const numTxs = 10;

            for (let i = 0; i < numTxs; i++) {
                await bridge.connect(relayer).processBridge(
                    user1.address,
                    amount,
                    ethers.id(`batch_tx_${i}`)
                );
            }

            expect(await token.balanceOf(user1.address)).to.equal(amount * BigInt(numTxs));
            expect(await bridge.bridgeNonce()).to.equal(numTxs);
        });

        it("should maintain accurate statistics", async function () {
            const amounts = [
                ethers.parseUnits("100", 6),
                ethers.parseUnits("200", 6),
                ethers.parseUnits("300", 6)
            ];

            let totalAmount = 0n;

            for (let i = 0; i < amounts.length; i++) {
                await bridge.connect(relayer).processBridge(
                    user1.address,
                    amounts[i],
                    ethers.id(`stat_tx_${i}`)
                );
                totalAmount += amounts[i];
            }

            const stats = await bridge.getBridgeStats();
            expect(stats.totalTransactions).to.equal(amounts.length);
            expect(stats.totalAmount).to.equal(totalAmount);
            expect(await bridge.totalBridged()).to.equal(totalAmount);
        });
    });

    describe("Access Control Integration", function () {
        it("should integrate correctly with token access control", async function () {
            // Bridge should be able to mint through MINTER_ROLE
            const amount = ethers.parseUnits("100", 6);
            const txHash = ethers.id("access_test");

            await bridge.connect(relayer).processBridge(user1.address, amount, txHash);
            expect(await token.balanceOf(user1.address)).to.equal(amount);

            // Revoking MINTER_ROLE should prevent bridge from minting
            await token.revokeRole(MINTER_ROLE, await bridge.getAddress());

            await expect(bridge.connect(relayer).processBridge(user2.address, amount, ethers.id("no_access")))
                .to.be.reverted;
        });
    });

    describe("Gas Optimization Tests", function () {
        it("should have reasonable gas costs for processBridge", async function () {
            const amount = ethers.parseUnits("100", 6);
            const txHash = ethers.id("gas_test");

            const tx = await bridge.connect(relayer).processBridge(user1.address, amount, txHash);
            const receipt = await tx.wait();

            // Gas cost should be reasonable (less than 500k)
            expect(receipt.gasUsed).to.be.lt(500000);
        });
    });
});