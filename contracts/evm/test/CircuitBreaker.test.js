const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Circuit Breaker", function () {
    let hub;
    let admin, emergency, user;

    // Operation constants
    let OP_CREATE_OFFER, OP_CREATE_TRADE, OP_FUND_ESCROW, OP_RELEASE_ESCROW;

    beforeEach(async function () {
        [admin, emergency, user] = await ethers.getSigners();

        // Deploy Hub
        const Hub = await ethers.getContractFactory("Hub");
        const hubConfig = {
            offerContract: ethers.ZeroAddress,
            tradeContract: ethers.ZeroAddress,
            profileContract: ethers.ZeroAddress,
            priceContract: ethers.ZeroAddress,
            treasury: admin.address,
            localMarket: admin.address,
            priceProvider: admin.address,
            localTokenAddress: ethers.ZeroAddress,
            chainFeeCollector: admin.address,
            swapRouter: ethers.ZeroAddress,
            burnFeePct: 100,   // 1%
            chainFeePct: 100,  // 1%
            warchestFeePct: 100, // 1%
            conversionFeePct: 100, // 1%
            minTradeAmount: ethers.parseEther("10"),
            maxTradeAmount: ethers.parseEther("10000"),
            maxActiveOffers: 10,
            maxActiveTrades: 5,
            tradeExpirationTimer: 24 * 60 * 60, // 24 hours
            tradeDisputeTimer: 7 * 24 * 60 * 60, // 7 days
            globalPause: false,
            pauseNewTrades: false,
            pauseDeposits: false,
            pauseWithdrawals: false
        };

        hub = await upgrades.deployProxy(Hub, [hubConfig]);
        await hub;

        // Grant emergency role
        const EMERGENCY_ROLE = await hub.EMERGENCY_ROLE();
        await hub.grantRole(EMERGENCY_ROLE, emergency.address);

        // Get operation constants
        OP_CREATE_OFFER = await hub.OP_CREATE_OFFER();
        OP_CREATE_TRADE = await hub.OP_CREATE_TRADE();
        OP_FUND_ESCROW = await hub.OP_FUND_ESCROW();
        OP_RELEASE_ESCROW = await hub.OP_RELEASE_ESCROW();
    });

    describe("Global Pause", function () {
        it("Should allow emergency role to pause globally", async function () {
            await expect(hub.connect(emergency).emergencyPause("Security incident"))
                .to.emit(hub, "CircuitBreakerActivated")
                .withArgs("Security incident", emergency.address);

            expect(await hub.isPaused()).to.be.true;
        });

        it("Should allow admin to resume operations", async function () {
            await hub.connect(emergency).emergencyPause("Test pause");
            
            await expect(hub.connect(admin).resume())
                .to.emit(hub, "CircuitBreakerDeactivated")
                .withArgs(admin.address);

            expect(await hub.isPaused()).to.be.false;
        });

        it("Should reject resume from non-admin", async function () {
            await hub.connect(emergency).emergencyPause("Test pause");

            await expect(hub.connect(user).resume())
                .to.be.reverted;
        });
    });

    describe("Enhanced Emergency Pause", function () {
        it("Should allow enhanced emergency pause with reason and timeout", async function () {
            const reason = "Critical vulnerability detected";
            const timeout = 3600; // 1 hour

            await expect(hub.connect(emergency).enhancedEmergencyPause(reason, timeout))
                .to.emit(hub, "CircuitBreakerActivated")
                .withArgs(reason, emergency.address);

            const [timestamp, storedReason] = await hub.getLastEmergencyPauseInfo();
            expect(storedReason).to.equal(reason);
            expect(timestamp).to.be.gt(0);
        });

        it("Should emit extended timeout event when specified", async function () {
            const reason = "System maintenance";
            const timeout = 7200; // 2 hours

            await expect(hub.connect(emergency).enhancedEmergencyPause(reason, timeout))
                .to.emit(hub, "EmergencyPauseExtended");
        });
    });

    describe("Operation-Specific Pausing", function () {
        it("Should allow emergency role to pause specific operation", async function () {
            await expect(hub.connect(emergency).pauseOperation(OP_CREATE_OFFER))
                .to.emit(hub, "OperationPaused")
                .withArgs(OP_CREATE_OFFER, emergency.address);

            expect(await hub.isOperationPaused(OP_CREATE_OFFER)).to.be.true;
            expect(await hub.isOperationPaused(OP_CREATE_TRADE)).to.be.false;
        });

        it("Should allow admin to unpause specific operation", async function () {
            await hub.connect(emergency).pauseOperation(OP_CREATE_TRADE);

            await expect(hub.connect(admin).unpauseOperation(OP_CREATE_TRADE))
                .to.emit(hub, "OperationUnpaused")
                .withArgs(OP_CREATE_TRADE, admin.address);

            expect(await hub.isOperationPaused(OP_CREATE_TRADE)).to.be.false;
        });

        it("Should reject operation pause from non-emergency role", async function () {
            await expect(hub.connect(user).pauseOperation(OP_CREATE_OFFER))
                .to.be.reverted;
        });

        it("Should reject operation unpause from non-admin", async function () {
            await hub.connect(emergency).pauseOperation(OP_CREATE_OFFER);

            await expect(hub.connect(user).unpauseOperation(OP_CREATE_OFFER))
                .to.be.reverted;
        });
    });

    describe("Contract-Specific Pausing", function () {
        let mockContract;

        beforeEach(async function () {
            mockContract = ethers.getAddress("0x1234567890123456789012345678901234567890");
        });

        it("Should allow admin to pause specific contract", async function () {
            await expect(hub.connect(admin).pauseContract(mockContract, true))
                .to.emit(hub, "ContractSpecificPause")
                .withArgs(mockContract, true, admin.address);

            expect(await hub.isContractPaused(mockContract)).to.be.true;
        });

        it("Should allow admin to unpause specific contract", async function () {
            await hub.connect(admin).pauseContract(mockContract, true);

            await expect(hub.connect(admin).pauseContract(mockContract, false))
                .to.emit(hub, "ContractSpecificPause")
                .withArgs(mockContract, false, admin.address);

            expect(await hub.isContractPaused(mockContract)).to.be.false;
        });

        it("Should reject contract pause from non-admin", async function () {
            await expect(hub.connect(user).pauseContract(mockContract, true))
                .to.be.reverted;
        });
    });

    describe("Batch Operations", function () {
        it("Should allow batch pausing of multiple operations", async function () {
            const operations = [OP_CREATE_OFFER, OP_CREATE_TRADE, OP_FUND_ESCROW];

            const tx = await hub.connect(emergency).batchPauseOperations(operations);
            const receipt = await tx.wait();

            // Check all operations are paused
            for (const operation of operations) {
                expect(await hub.isOperationPaused(operation)).to.be.true;
            }

            // Should emit events for each operation
            expect(receipt.events.filter(e => e.event === "OperationPaused")).to.have.length(operations.length);
        });

        it("Should allow batch unpausing of multiple operations", async function () {
            const operations = [OP_CREATE_OFFER, OP_CREATE_TRADE];

            // First pause them
            await hub.connect(emergency).batchPauseOperations(operations);

            // Then unpause
            const tx = await hub.connect(admin).batchUnpauseOperations(operations);
            const receipt = await tx.wait();

            // Check all operations are unpaused
            for (const operation of operations) {
                expect(await hub.isOperationPaused(operation)).to.be.false;
            }

            // Should emit events for each operation
            expect(receipt.events.filter(e => e.event === "OperationUnpaused")).to.have.length(operations.length);
        });
    });

    describe("Pause Interaction with Global State", function () {
        it("Should return true for operation pause when globally paused", async function () {
            await hub.connect(emergency).emergencyPause("Global test");

            // Even if operation is not specifically paused, should return true due to global pause
            expect(await hub.isOperationPaused(OP_CREATE_OFFER)).to.be.true;
            expect(await hub.isOperationPaused(OP_CREATE_TRADE)).to.be.true;
        });

        it("Should return true for contract pause when globally paused", async function () {
            const mockContract = ethers.getAddress("0x1234567890123456789012345678901234567890");
            
            await hub.connect(emergency).emergencyPause("Global test");

            expect(await hub.isContractPaused(mockContract)).to.be.true;
        });

        it("Should respect specific pauses when global is not paused", async function () {
            await hub.connect(emergency).pauseOperation(OP_CREATE_OFFER);

            expect(await hub.isOperationPaused(OP_CREATE_OFFER)).to.be.true;
            expect(await hub.isOperationPaused(OP_CREATE_TRADE)).to.be.false;
            expect(await hub.isPaused()).to.be.false;
        });
    });

    describe("Legacy Pause Type Checking", function () {
        it("Should work with existing isPausedByType function", async function () {
            // Test trades pause
            const config = await hub.getConfig();
            config.pauseNewTrades = true;
            await hub.connect(admin).updateConfig(config);

            expect(await hub.isPausedByType("trades")).to.be.true;
            expect(await hub.isPausedByType("deposits")).to.be.false;
        });

        it("Should respect global pause in legacy function", async function () {
            await hub.connect(emergency).emergencyPause("Test");

            expect(await hub.isPausedByType("trades")).to.be.true;
            expect(await hub.isPausedByType("deposits")).to.be.true;
            expect(await hub.isPausedByType("withdrawals")).to.be.true;
        });
    });

    describe("Comprehensive Status Checking", function () {
        it("Should provide comprehensive circuit breaker status", async function () {
            // Set up various pause states
            const config = await hub.getConfig();
            config.pauseNewTrades = true;
            config.pauseDeposits = true;
            await hub.connect(admin).updateConfig(config);

            const [globalPause, newTradesPaused, depositsPaused, withdrawalsPaused, lastPauseTime] = 
                await hub.getCircuitBreakerStatus();

            expect(globalPause).to.be.false;
            expect(newTradesPaused).to.be.true;
            expect(depositsPaused).to.be.true;
            expect(withdrawalsPaused).to.be.false;
        });

        it("Should batch check multiple operations efficiently", async function () {
            const operations = [OP_CREATE_OFFER, OP_CREATE_TRADE, OP_FUND_ESCROW];
            
            // Pause some operations
            await hub.connect(emergency).pauseOperation(OP_CREATE_OFFER);
            await hub.connect(emergency).pauseOperation(OP_FUND_ESCROW);

            const statuses = await hub.batchCheckOperationsPaused(operations);
            
            expect(statuses[0]).to.be.true;  // OP_CREATE_OFFER - paused
            expect(statuses[1]).to.be.false; // OP_CREATE_TRADE - not paused
            expect(statuses[2]).to.be.true;  // OP_FUND_ESCROW - paused
        });
    });

    describe("Edge Cases", function () {
        it("Should handle empty batch operations gracefully", async function () {
            await expect(hub.connect(emergency).batchPauseOperations([]))
                .to.not.be.reverted;

            await expect(hub.connect(admin).batchUnpauseOperations([]))
                .to.not.be.reverted;
        });

        it("Should handle pause/unpause of non-existent operations", async function () {
            const nonExistentOp = ethers.keccak256(ethers.toUtf8Bytes("NON_EXISTENT"));

            await expect(hub.connect(emergency).pauseOperation(nonExistentOp))
                .to.not.be.reverted;

            expect(await hub.isOperationPaused(nonExistentOp)).to.be.true;
        });

        it("Should allow multiple pause/unpause cycles", async function () {
            // Pause
            await hub.connect(emergency).pauseOperation(OP_CREATE_OFFER);
            expect(await hub.isOperationPaused(OP_CREATE_OFFER)).to.be.true;

            // Unpause
            await hub.connect(admin).unpauseOperation(OP_CREATE_OFFER);
            expect(await hub.isOperationPaused(OP_CREATE_OFFER)).to.be.false;

            // Pause again
            await hub.connect(emergency).pauseOperation(OP_CREATE_OFFER);
            expect(await hub.isOperationPaused(OP_CREATE_OFFER)).to.be.true;
        });
    });
});