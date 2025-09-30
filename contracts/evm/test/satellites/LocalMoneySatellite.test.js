const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("LocalMoneySatellite", function () {
    // Fixture for deployment
    async function deploySatelliteFixture() {
        const [owner, user1, user2, admin] = await ethers.getSigners();

        // Deploy mock contracts
        const MockAxelarGateway = await ethers.getContractFactory("MockAxelarGateway");
        const mockGateway = await MockAxelarGateway.deploy();
        await mockGateway.waitForDeployment();

        const MockAxelarGasService = await ethers.getContractFactory("MockAxelarGasService");
        const mockGasService = await MockAxelarGasService.deploy();
        await mockGasService.waitForDeployment();

        // Deploy LocalMoneySatellite
        const LocalMoneySatellite = await ethers.getContractFactory("LocalMoneySatellite");
        const satellite = await upgrades.deployProxy(
            LocalMoneySatellite,
            [
                await mockGasService.getAddress(),
                "0x696F771E329DF4550044686C995AB9028fD3a724" // BSC hub address
            ],
            {
                initializer: "initialize",
                constructorArgs: [await mockGateway.getAddress()],
                kind: "uups",
                unsafeAllow: ["constructor", "state-variable-immutable"]
            }
        );
        await satellite.waitForDeployment();

        // Grant admin role
        const ADMIN_ROLE = await satellite.ADMIN_ROLE();
        await satellite.grantRole(ADMIN_ROLE, admin.address);

        return {
            satellite,
            mockGateway,
            mockGasService,
            owner,
            user1,
            user2,
            admin
        };
    }

    describe("Initialization", function () {
        it("Should initialize with correct parameters", async function () {
            const { satellite, mockGasService } = await loadFixture(deploySatelliteFixture);

            expect(await satellite.HUB_CHAIN()).to.equal("binance");
            expect(await satellite.hubAddress()).to.equal("0x696F771E329DF4550044686C995AB9028fD3a724");
            expect(await satellite.gasService()).to.equal(await mockGasService.getAddress());
            expect(await satellite.baseGasAmount()).to.equal(300000);
            expect(await satellite.gasMultiplier()).to.equal(120);
        });

        it("Should set correct roles", async function () {
            const { satellite, owner, admin } = await loadFixture(deploySatelliteFixture);

            const DEFAULT_ADMIN_ROLE = await satellite.DEFAULT_ADMIN_ROLE();
            const ADMIN_ROLE = await satellite.ADMIN_ROLE();

            expect(await satellite.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
            expect(await satellite.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
            expect(await satellite.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
        });

        it("Should fail initialization with invalid parameters", async function () {
            const [owner] = await ethers.getSigners();

            const MockAxelarGateway = await ethers.getContractFactory("MockAxelarGateway");
            const mockGateway = await MockAxelarGateway.deploy();

            const LocalMoneySatellite = await ethers.getContractFactory("LocalMoneySatellite");

            // Invalid gas service
            await expect(
                upgrades.deployProxy(
                    LocalMoneySatellite,
                    [ethers.ZeroAddress, "0xhubAddress"],
                    { constructorArgs: [await mockGateway.getAddress()] }
                )
            ).to.be.revertedWith("Invalid gas service");

            // Invalid hub address
            await expect(
                upgrades.deployProxy(
                    LocalMoneySatellite,
                    [owner.address, ""],
                    { constructorArgs: [await mockGateway.getAddress()] }
                )
            ).to.be.revertedWith("Invalid hub address");
        });
    });

    describe("Offer Creation", function () {
        it("Should create offer and emit event", async function () {
            const { satellite, user1, mockGasService } = await loadFixture(deploySatelliteFixture);

            const token = ethers.ZeroAddress;
            const amount = ethers.parseEther("100");
            const price = ethers.parseEther("1");

            await expect(
                satellite.connect(user1).createOffer(
                    token,
                    amount,
                    price,
                    true, // isBuy
                    { value: ethers.parseEther("0.01") }
                )
            ).to.emit(satellite, "OfferCreated");
        });

        it("Should cache offer locally", async function () {
            const { satellite, user1 } = await loadFixture(deploySatelliteFixture);

            const token = ethers.ZeroAddress;
            const amount = ethers.parseEther("100");
            const price = ethers.parseEther("1");

            const tx = await satellite.connect(user1).createOffer(
                token,
                amount,
                price,
                true,
                { value: ethers.parseEther("0.01") }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(
                log => satellite.interface.parseLog(log)?.name === "OfferCreated"
            );
            const offerId = satellite.interface.parseLog(event).args[0];

            const cachedOffer = await satellite.getOfferDetails(offerId);
            expect(cachedOffer.creator).to.equal(user1.address);
            expect(cachedOffer.token).to.equal(token);
            expect(cachedOffer.amount).to.equal(amount);
            expect(cachedOffer.price).to.equal(price);
            expect(cachedOffer.isBuy).to.be.true;
            expect(cachedOffer.isActive).to.be.true;
        });

        it("Should reject offer without gas payment", async function () {
            const { satellite, user1 } = await loadFixture(deploySatelliteFixture);

            await expect(
                satellite.connect(user1).createOffer(
                    ethers.ZeroAddress,
                    ethers.parseEther("100"),
                    ethers.parseEther("1"),
                    true,
                    { value: 0 }
                )
            ).to.be.revertedWith("Gas payment required");
        });

        it("Should reject offer with invalid parameters", async function () {
            const { satellite, user1 } = await loadFixture(deploySatelliteFixture);

            // Zero amount
            await expect(
                satellite.connect(user1).createOffer(
                    ethers.ZeroAddress,
                    0,
                    ethers.parseEther("1"),
                    true,
                    { value: ethers.parseEther("0.01") }
                )
            ).to.be.revertedWith("Invalid amount");

            // Zero price
            await expect(
                satellite.connect(user1).createOffer(
                    ethers.ZeroAddress,
                    ethers.parseEther("100"),
                    0,
                    true,
                    { value: ethers.parseEther("0.01") }
                )
            ).to.be.revertedWith("Invalid price");
        });
    });

    describe("Trade Creation", function () {
        let offerId;

        beforeEach(async function () {
            const { satellite, user1 } = await loadFixture(deploySatelliteFixture);

            // Create an offer first
            const tx = await satellite.connect(user1).createOffer(
                ethers.ZeroAddress,
                ethers.parseEther("100"),
                ethers.parseEther("1"),
                false, // Sell offer
                { value: ethers.parseEther("0.01") }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(
                log => satellite.interface.parseLog(log)?.name === "OfferCreated"
            );
            offerId = satellite.interface.parseLog(event).args[0];
        });

        it("Should create trade from offer", async function () {
            const { satellite, user2 } = await loadFixture(deploySatelliteFixture);

            await expect(
                satellite.connect(user2).createTrade(
                    offerId,
                    ethers.parseEther("50"),
                    { value: ethers.parseEther("0.01") }
                )
            ).to.emit(satellite, "TradeInitiated");
        });

        it("Should cache trade locally", async function () {
            const { satellite, user1, user2 } = await loadFixture(deploySatelliteFixture);

            const tx = await satellite.connect(user2).createTrade(
                offerId,
                ethers.parseEther("50"),
                { value: ethers.parseEther("0.01") }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(
                log => satellite.interface.parseLog(log)?.name === "TradeInitiated"
            );
            const tradeId = satellite.interface.parseLog(event).args[0];

            const cachedTrade = await satellite.getTradeDetails(tradeId);
            expect(cachedTrade.offerId).to.equal(offerId);
            expect(cachedTrade.buyer).to.equal(user2.address);
            expect(cachedTrade.seller).to.equal(user1.address);
            expect(cachedTrade.amount).to.equal(ethers.parseEther("50"));
            expect(cachedTrade.status).to.equal(0); // Created
        });

        it("Should reject trade for inactive offer", async function () {
            const { satellite, user2 } = await loadFixture(deploySatelliteFixture);

            const fakeOfferId = ethers.randomBytes(32);

            await expect(
                satellite.connect(user2).createTrade(
                    fakeOfferId,
                    ethers.parseEther("50"),
                    { value: ethers.parseEther("0.01") }
                )
            ).to.be.revertedWith("Offer not active");
        });
    });

    describe("Escrow Funding", function () {
        let tradeId;

        beforeEach(async function () {
            const { satellite, user1, user2 } = await loadFixture(deploySatelliteFixture);

            // Create offer and trade
            const offerTx = await satellite.connect(user1).createOffer(
                ethers.ZeroAddress,
                ethers.parseEther("100"),
                ethers.parseEther("1"),
                false,
                { value: ethers.parseEther("0.01") }
            );

            const offerReceipt = await offerTx.wait();
            const offerEvent = offerReceipt.logs.find(
                log => satellite.interface.parseLog(log)?.name === "OfferCreated"
            );
            const offerId = satellite.interface.parseLog(offerEvent).args[0];

            const tradeTx = await satellite.connect(user2).createTrade(
                offerId,
                ethers.parseEther("50"),
                { value: ethers.parseEther("0.01") }
            );

            const tradeReceipt = await tradeTx.wait();
            const tradeEvent = tradeReceipt.logs.find(
                log => satellite.interface.parseLog(log)?.name === "TradeInitiated"
            );
            tradeId = satellite.interface.parseLog(tradeEvent).args[0];
        });

        it("Should fund escrow for trade", async function () {
            const { satellite, user1 } = await loadFixture(deploySatelliteFixture);

            await expect(
                satellite.connect(user1).fundEscrow(
                    tradeId,
                    ethers.ZeroAddress,
                    ethers.parseEther("50"),
                    { value: ethers.parseEther("0.01") }
                )
            ).to.not.be.reverted;

            // Check cache updated
            const cachedTrade = await satellite.getTradeDetails(tradeId);
            expect(cachedTrade.status).to.equal(1); // Funded
        });

        it("Should reject funding for invalid trade state", async function () {
            const { satellite, user1 } = await loadFixture(deploySatelliteFixture);

            // Fund first time
            await satellite.connect(user1).fundEscrow(
                tradeId,
                ethers.ZeroAddress,
                ethers.parseEther("50"),
                { value: ethers.parseEther("0.01") }
            );

            // Try to fund again
            await expect(
                satellite.connect(user1).fundEscrow(
                    tradeId,
                    ethers.ZeroAddress,
                    ethers.parseEther("50"),
                    { value: ethers.parseEther("0.01") }
                )
            ).to.be.revertedWith("Trade not in correct state");
        });
    });

    describe("Trade Completion", function () {
        let tradeId;

        beforeEach(async function () {
            const { satellite, user1, user2 } = await loadFixture(deploySatelliteFixture);

            // Create offer, trade, and fund
            const offerTx = await satellite.connect(user1).createOffer(
                ethers.ZeroAddress,
                ethers.parseEther("100"),
                ethers.parseEther("1"),
                false,
                { value: ethers.parseEther("0.01") }
            );

            const offerReceipt = await offerTx.wait();
            const offerEvent = offerReceipt.logs.find(
                log => satellite.interface.parseLog(log)?.name === "OfferCreated"
            );
            const offerId = satellite.interface.parseLog(offerEvent).args[0];

            const tradeTx = await satellite.connect(user2).createTrade(
                offerId,
                ethers.parseEther("50"),
                { value: ethers.parseEther("0.01") }
            );

            const tradeReceipt = await tradeTx.wait();
            const tradeEvent = tradeReceipt.logs.find(
                log => satellite.interface.parseLog(log)?.name === "TradeInitiated"
            );
            tradeId = satellite.interface.parseLog(tradeEvent).args[0];

            // Fund escrow
            await satellite.connect(user1).fundEscrow(
                tradeId,
                ethers.ZeroAddress,
                ethers.parseEther("50"),
                { value: ethers.parseEther("0.01") }
            );
        });

        it("Should complete trade by buyer", async function () {
            const { satellite, user2 } = await loadFixture(deploySatelliteFixture);

            await expect(
                satellite.connect(user2).completeTrade(
                    tradeId,
                    { value: ethers.parseEther("0.01") }
                )
            ).to.not.be.reverted;

            // Check cache updated
            const cachedTrade = await satellite.getTradeDetails(tradeId);
            expect(cachedTrade.status).to.equal(2); // Completed
        });

        it("Should reject completion by non-buyer", async function () {
            const { satellite, user1 } = await loadFixture(deploySatelliteFixture);

            await expect(
                satellite.connect(user1).completeTrade(
                    tradeId,
                    { value: ethers.parseEther("0.01") }
                )
            ).to.be.revertedWith("Only buyer can complete");
        });
    });

    describe("Gas Configuration", function () {
        it("Should update gas configuration", async function () {
            const { satellite, admin } = await loadFixture(deploySatelliteFixture);

            await satellite.connect(admin).setGasConfig(400000, 150);

            expect(await satellite.baseGasAmount()).to.equal(400000);
            expect(await satellite.gasMultiplier()).to.equal(150);
        });

        it("Should reject invalid gas configuration", async function () {
            const { satellite, admin } = await loadFixture(deploySatelliteFixture);

            // Invalid base gas amount
            await expect(
                satellite.connect(admin).setGasConfig(0, 150)
            ).to.be.revertedWith("Invalid base gas amount");

            // Invalid multiplier (too low)
            await expect(
                satellite.connect(admin).setGasConfig(400000, 50)
            ).to.be.revertedWith("Invalid multiplier");

            // Invalid multiplier (too high)
            await expect(
                satellite.connect(admin).setGasConfig(400000, 250)
            ).to.be.revertedWith("Invalid multiplier");
        });

        it("Should estimate gas fee correctly", async function () {
            const { satellite } = await loadFixture(deploySatelliteFixture);

            const estimatedFee = await satellite.estimateGasFee();
            expect(estimatedFee).to.be.gt(0);
        });
    });

    describe("Hub Address Management", function () {
        it("Should update hub address", async function () {
            const { satellite, admin } = await loadFixture(deploySatelliteFixture);

            const newHubAddress = "0x1234567890123456789012345678901234567890";
            await satellite.connect(admin).updateHubAddress(newHubAddress);

            expect(await satellite.hubAddress()).to.equal(newHubAddress);
        });

        it("Should reject empty hub address", async function () {
            const { satellite, admin } = await loadFixture(deploySatelliteFixture);

            await expect(
                satellite.connect(admin).updateHubAddress("")
            ).to.be.revertedWith("Invalid hub address");
        });
    });

    describe("Pause Mechanism", function () {
        it("Should pause and unpause contract", async function () {
            const { satellite, owner, user1 } = await loadFixture(deploySatelliteFixture);

            // Pause contract
            await satellite.connect(owner).pause();
            expect(await satellite.isPaused()).to.be.true;

            // Try to create offer while paused
            await expect(
                satellite.connect(user1).createOffer(
                    ethers.ZeroAddress,
                    ethers.parseEther("100"),
                    ethers.parseEther("1"),
                    true,
                    { value: ethers.parseEther("0.01") }
                )
            ).to.be.revertedWithCustomError(satellite, "EnforcedPause");

            // Unpause
            await satellite.connect(owner).unpause();
            expect(await satellite.isPaused()).to.be.false;

            // Should work now
            await expect(
                satellite.connect(user1).createOffer(
                    ethers.ZeroAddress,
                    ethers.parseEther("100"),
                    ethers.parseEther("1"),
                    true,
                    { value: ethers.parseEther("0.01") }
                )
            ).to.emit(satellite, "OfferCreated");
        });
    });

    describe("Access Control", function () {
        it("Should restrict admin functions", async function () {
            const { satellite, user1 } = await loadFixture(deploySatelliteFixture);

            await expect(
                satellite.connect(user1).setGasConfig(400000, 150)
            ).to.be.reverted;

            await expect(
                satellite.connect(user1).updateHubAddress("0xnewAddress")
            ).to.be.reverted;

            await expect(
                satellite.connect(user1).pause()
            ).to.be.reverted;
        });
    });

    describe("Cross-Chain Callback Handling", function () {
        it("Should handle success callback", async function () {
            const { satellite, mockGateway, user1 } = await loadFixture(deploySatelliteFixture);

            // Create an offer first
            const tx = await satellite.connect(user1).createOffer(
                ethers.ZeroAddress,
                ethers.parseEther("100"),
                ethers.parseEther("1"),
                true,
                { value: ethers.parseEther("0.01") }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(
                log => satellite.interface.parseLog(log)?.name === "OfferCreated"
            );
            const offerId = satellite.interface.parseLog(event).args[0];

            // Simulate success callback from hub
            const callbackData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["bool", "bytes32", "bytes"],
                [
                    true, // success
                    offerId,
                    ethers.solidityPacked(
                        ["uint8", "bytes32", "bool"],
                        [0, offerId, false] // Offer deactivated
                    )
                ]
            );

            // Execute callback through gateway
            // The mockGateway.callExecute will trigger _execute with the commandId
            await mockGateway.callExecute(
                await satellite.getAddress(),
                "binance",
                "0x696F771E329DF4550044686C995AB9028fD3a724",
                callbackData
            );

            // Verify cache updated
            const cachedOffer = await satellite.getOfferDetails(offerId);
            expect(cachedOffer.isActive).to.be.false;
        });

        it("Should reject callback from invalid source", async function () {
            const { satellite, mockGateway } = await loadFixture(deploySatelliteFixture);

            const callbackData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["bool", "bytes32", "bytes"],
                [true, ethers.randomBytes(32), "0x"]
            );

            // Wrong chain
            await expect(
                mockGateway.callExecute(
                    await satellite.getAddress(),
                    "polygon",
                    "0x696F771E329DF4550044686C995AB9028fD3a724",
                    callbackData
                )
            ).to.be.revertedWith("Invalid source chain");

            // Wrong address
            await expect(
                mockGateway.callExecute(
                    await satellite.getAddress(),
                    "binance",
                    "0x0000000000000000000000000000000000000000",
                    callbackData
                )
            ).to.be.revertedWith("Invalid source");
        });
    });
});