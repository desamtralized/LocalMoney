const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");

describe("AUTH-002 Security Fix: Strict Timelock Enforcement", function() {
    let hub;
    let hubV2;
    let timelockController;
    let owner;
    let admin;
    let addr1;
    let minDelay = 3600; // 1 hour for testing

    beforeEach(async function() {
        [owner, admin, addr1] = await ethers.getSigners();

        // Deploy TimelockController
        const TimelockController = await ethers.getContractFactory("TimelockController");
        timelockController = await TimelockController.deploy(
            minDelay,
            [owner.address], // proposers
            [owner.address], // executors  
            owner.address     // admin (can grant/revoke roles)
        );
        await timelockController.waitForDeployment();

        // Deploy Hub with proxy
        const Hub = await ethers.getContractFactory("Hub");
        
        // Deploy initial implementation
        const hubImpl = await Hub.deploy();
        await hubImpl.waitForDeployment();

        // Create initial config
        const config = {
            admin: admin.address,
            timelockController: timelockController.target,
            profileContract: ethers.ZeroAddress,
            offerContract: ethers.ZeroAddress,
            tradeContract: ethers.ZeroAddress,
            escrowContract: ethers.ZeroAddress,
            arbitratorManager: ethers.ZeroAddress,
            priceOracle: ethers.ZeroAddress,
            localToken: ethers.ZeroAddress,
            treasury: owner.address,
            burnFeeBps: 100,
            warchestFeeBps: 100,
            chainFeeBps: 100,
            conversionFeeBps: 100,
            arbitratorFeeBps: 100,
            maxActiveOffersPerUser: 100,
            maxActiveTradesPerOffer: 100,
            maxActiveTradesPerUser: 100,
            maxActiveDisputesPerUser: 10,
            tradeExpirationTimer: 86400,
            tradeDisputeTimer: 259200,
            globalPause: false,
            createOfferPaused: false,
            createTradePaused: false,
            acceptTradePaused: false
        };

        // Deploy proxy
        hub = await upgrades.deployProxy(Hub, [config, minDelay], {
            initializer: "initialize",
            kind: "uups"
        });
        await hub.waitForDeployment();

        // Grant admin role to admin address
        const ADMIN_ROLE = await hub.ADMIN_ROLE();
        await hub.grantRole(ADMIN_ROLE, admin.address);
    });

    describe("Upgrade Authorization", function() {
        it("Should NOT allow admin to upgrade directly (AUTH-002 fix verified)", async function() {
            // Deploy new implementation
            const HubV2 = await ethers.getContractFactory("Hub", admin);
            const hubV2Impl = await HubV2.deploy();
            await hubV2Impl.waitForDeployment();

            // Try to upgrade as admin - should FAIL
            await expect(
                hub.connect(admin).upgradeToAndCall(hubV2Impl.target, "0x")
            ).to.be.revertedWith("Only timelock controller can execute upgrades");
        });

        it("Should allow timelock to upgrade", async function() {
            // Deploy new implementation
            const HubV2 = await ethers.getContractFactory("Hub");
            const hubV2Impl = await HubV2.deploy();
            await hubV2Impl.waitForDeployment();

            // Prepare upgrade through timelock
            const upgradeCalldata = hub.interface.encodeFunctionData("upgradeToAndCall", [
                hubV2Impl.target,
                "0x"
            ]);

            // Schedule upgrade
            const salt = ethers.randomBytes(32);
            await timelockController.schedule(
                hub.target,
                0,
                upgradeCalldata,
                ethers.ZeroHash,
                salt,
                minDelay
            );

            // Wait for timelock delay
            await ethers.provider.send("evm_increaseTime", [minDelay]);
            await ethers.provider.send("evm_mine");

            // Execute upgrade through timelock
            await timelockController.execute(
                hub.target,
                0,
                upgradeCalldata,
                ethers.ZeroHash,
                salt
            );

            // Verify upgrade succeeded
            const implementation = await upgrades.erc1967.getImplementationAddress(hub.target);
            expect(implementation).to.equal(hubV2Impl.target);
        });

        it("Should NOT allow arbitrary addresses to upgrade", async function() {
            // Deploy new implementation
            const HubV2 = await ethers.getContractFactory("Hub");
            const hubV2Impl = await HubV2.deploy();
            await hubV2Impl.waitForDeployment();

            // Try to upgrade as random address - should FAIL
            await expect(
                hub.connect(addr1).upgradeToAndCall(hubV2Impl.target, "0x")
            ).to.be.revertedWith("Only timelock controller can execute upgrades");
        });

        it("Should NOT allow upgrade when timelock is not configured", async function() {
            // Deploy Hub without timelock
            const Hub = await ethers.getContractFactory("Hub");
            
            const config = {
                admin: admin.address,
                timelockController: ethers.ZeroAddress, // No timelock
                profileContract: ethers.ZeroAddress,
                offerContract: ethers.ZeroAddress,
                tradeContract: ethers.ZeroAddress,
                escrowContract: ethers.ZeroAddress,
                arbitratorManager: ethers.ZeroAddress,
                priceOracle: ethers.ZeroAddress,
                localToken: ethers.ZeroAddress,
                treasury: owner.address,
                burnFeeBps: 100,
                warchestFeeBps: 100,
                chainFeeBps: 100,
                conversionFeeBps: 100,
                arbitratorFeeBps: 100,
                maxActiveOffersPerUser: 100,
                maxActiveTradesPerOffer: 100,
                maxActiveTradesPerUser: 100,
                maxActiveDisputesPerUser: 10,
                tradeExpirationTimer: 86400,
                tradeDisputeTimer: 259200,
                globalPause: false,
                createOfferPaused: false,
                createTradePaused: false,
                acceptTradePaused: false
            };

            const hubNoTimelock = await upgrades.deployProxy(Hub, [config, 0], {
                initializer: "initialize",
                kind: "uups"
            });
            await hubNoTimelock.waitForDeployment();

            // Deploy new implementation
            const hubV2Impl = await Hub.deploy();
            await hubV2Impl.waitForDeployment();

            // Try to upgrade - should FAIL due to no timelock
            await expect(
                hubNoTimelock.upgradeToAndCall(hubV2Impl.target, "0x")
            ).to.be.revertedWith("Timelock controller not configured");
        });
    });

    describe("Timelock Controller Management", function() {
        it("Should NOT allow admin to change timelock controller", async function() {
            const newTimelock = addr1.address;
            
            // Try to change timelock as admin - should FAIL
            await expect(
                hub.connect(admin).setTimelockController(newTimelock)
            ).to.be.revertedWith("Only current timelock can transfer control");
        });

        it("Should allow current timelock to transfer control", async function() {
            // Deploy new timelock
            const TimelockController = await ethers.getContractFactory("TimelockController");
            const newTimelockController = await TimelockController.deploy(
                minDelay,
                [owner.address],
                [owner.address],
                owner.address
            );
            await newTimelockController.waitForDeployment();

            // Prepare setTimelockController call through current timelock
            const setTimelockCalldata = hub.interface.encodeFunctionData("setTimelockController", [
                newTimelockController.target
            ]);

            // Schedule through current timelock
            const salt = ethers.randomBytes(32);
            await timelockController.schedule(
                hub.target,
                0,
                setTimelockCalldata,
                ethers.ZeroHash,
                salt,
                minDelay
            );

            // Wait for timelock delay
            await ethers.provider.send("evm_increaseTime", [minDelay]);
            await ethers.provider.send("evm_mine");

            // Execute through timelock
            await timelockController.execute(
                hub.target,
                0,
                setTimelockCalldata,
                ethers.ZeroHash,
                salt
            );

            // Verify timelock was updated
            expect(await hub.getTimelockController()).to.equal(newTimelockController.target);
        });
    });
});