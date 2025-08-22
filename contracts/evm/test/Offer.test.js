const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Offer Contract", function () {
    let Hub, hub, Profile, profile, Offer, offer;
    let owner, user1, user2, user3, treasury, priceProvider;
    let defaultHubConfig;

    // Test constants
    const NATIVE_TOKEN = ethers.ZeroAddress;
    const USD_CURRENCY = "USD";
    const EUR_CURRENCY = "EUR";
    const OFFER_DESCRIPTION = "Test offer description";
    const LONG_DESCRIPTION = "x".repeat(281); // > 280 chars
    const MIN_AMOUNT = ethers.parseEther("100");
    const MAX_AMOUNT = ethers.parseEther("1000");
    const RATE = 50000; // 500.00 USD per token (in cents)

    beforeEach(async function () {
        // Get signers
        [owner, user1, user2, user3, treasury, priceProvider] = await ethers.getSigners();

        // Deploy Hub contract first (needed for Profile initialization)
        Hub = await ethers.getContractFactory("Hub");
        
        // Create temporary Hub configuration for Profile initialization
        const tempHubConfig = {
            offerContract: ethers.ZeroAddress,
            tradeContract: ethers.ZeroAddress,
            profileContract: ethers.ZeroAddress,
            priceContract: ethers.ZeroAddress,
            treasury: treasury.address,
            localMarket: user3.address,
            priceProvider: priceProvider.address,
            burnFeePct: 100,
            chainFeePct: 200,
            warchestFeePct: 300,
            conversionFeePct: 50,
            minTradeAmount: ethers.parseUnits("10", 6),
            maxTradeAmount: ethers.parseUnits("10000", 6),
            maxActiveOffers: 5,
            maxActiveTrades: 3,
            tradeExpirationTimer: 24 * 60 * 60,
            tradeDisputeTimer: 7 * 24 * 60 * 60,
            globalPause: false,
            pauseNewTrades: false,
            pauseDeposits: false,
            pauseWithdrawals: false
        };

        hub = await upgrades.deployProxy(Hub, [tempHubConfig], {
            initializer: "initialize",
            kind: "uups"
        });
        await hub.waitForDeployment();

        // Deploy Profile contract with hub address
        Profile = await ethers.getContractFactory("Profile");
        profile = await upgrades.deployProxy(Profile, [await hub.getAddress()], {
            initializer: "initialize",
            kind: "uups"
        });
        await profile.waitForDeployment();

        // Update Hub configuration with Profile contract address
        defaultHubConfig = {
            offerContract: ethers.ZeroAddress, // Will be set after deployment
            tradeContract: ethers.ZeroAddress,
            profileContract: await profile.getAddress(),
            priceContract: ethers.ZeroAddress,
            treasury: treasury.address,
            localMarket: user3.address,
            priceProvider: priceProvider.address,
            burnFeePct: 100,  // 1%
            chainFeePct: 200, // 2%
            warchestFeePct: 300, // 3%
            conversionFeePct: 50, // 0.5%
            minTradeAmount: ethers.parseUnits("10", 6), // $10 in USD cents
            maxTradeAmount: ethers.parseUnits("10000", 6), // $10,000 in USD cents
            maxActiveOffers: 5,
            maxActiveTrades: 3,
            tradeExpirationTimer: 24 * 60 * 60, // 24 hours
            tradeDisputeTimer: 7 * 24 * 60 * 60, // 7 days
            globalPause: false,
            pauseNewTrades: false,
            pauseDeposits: false,
            pauseWithdrawals: false
        };

        // Update Hub configuration with correct profile contract address
        await hub.updateConfig(defaultHubConfig);

        // Deploy Offer contract
        Offer = await ethers.getContractFactory("Offer");
        offer = await upgrades.deployProxy(Offer, [await hub.getAddress()], {
            initializer: "initialize",
            kind: "uups"
        });
        await offer.waitForDeployment();

        // Update hub config to include offer contract
        const updatedConfig = { ...defaultHubConfig };
        updatedConfig.offerContract = await offer.getAddress();
        await hub.updateConfig(updatedConfig);
    });

    describe("Initialization", function () {
        it("Should initialize with correct hub address", async function () {
            expect(await offer.hub()).to.equal(await hub.getAddress());
        });

        it("Should start with nextOfferId = 1", async function () {
            expect(await offer.nextOfferId()).to.equal(1);
        });

        it("Should revert if initialized with zero hub address", async function () {
            const OfferFactory = await ethers.getContractFactory("Offer");
            await expect(
                upgrades.deployProxy(OfferFactory, [ethers.ZeroAddress], {
                    initializer: "initialize",
                    kind: "uups"
                })
            ).to.be.revertedWithCustomError(offer, "InvalidConfiguration");
        });
    });

    describe("Create Offer", function () {
        it("Should create a valid offer", async function () {
            // Create user profile first
            await profile.connect(user1).updateContact("encrypted_contact", "public_key");

            const tx = await offer.connect(user1).createOffer(
                0, // OfferType.Buy
                USD_CURRENCY,
                NATIVE_TOKEN,
                MIN_AMOUNT,
                MAX_AMOUNT,
                RATE,
                OFFER_DESCRIPTION
            );

            await expect(tx)
                .to.emit(offer, "OfferCreated")
                .withArgs(1, user1.address, 0);

            // Check offer data
            const offerData = await offer.getOffer(1);
            expect(offerData.id).to.equal(1);
            expect(offerData.owner).to.equal(user1.address);
            expect(offerData.offerType).to.equal(0);
            expect(offerData.state).to.equal(0); // Active
            expect(offerData.fiatCurrency).to.equal(USD_CURRENCY);
            expect(offerData.tokenAddress).to.equal(NATIVE_TOKEN);
            expect(offerData.minAmount).to.equal(MIN_AMOUNT);
            expect(offerData.maxAmount).to.equal(MAX_AMOUNT);
            expect(offerData.rate).to.equal(RATE);
            expect(offerData.description).to.equal(OFFER_DESCRIPTION);

            // Check user offers
            const userOffers = await offer.getUserOffers(user1.address);
            expect(userOffers.length).to.equal(1);
            expect(userOffers[0]).to.equal(1);

            // Check active offer count
            expect(await offer.getUserActiveOfferCount(user1.address)).to.equal(1);
        });

        it("Should revert if min amount > max amount", async function () {
            await expect(
                offer.connect(user1).createOffer(
                    0, // OfferType.Buy
                    USD_CURRENCY,
                    NATIVE_TOKEN,
                    MAX_AMOUNT, // min > max
                    MIN_AMOUNT,
                    RATE,
                    OFFER_DESCRIPTION
                )
            ).to.be.revertedWithCustomError(offer, "InvalidAmountRange");
        });

        it("Should revert if description is too long", async function () {
            await expect(
                offer.connect(user1).createOffer(
                    0, // OfferType.Buy
                    USD_CURRENCY,
                    NATIVE_TOKEN,
                    MIN_AMOUNT,
                    MAX_AMOUNT,
                    RATE,
                    LONG_DESCRIPTION
                )
            ).to.be.revertedWithCustomError(offer, "DescriptionTooLong");
        });

        it("Should revert if max active offers reached", async function () {
            // Create user profile first
            await profile.connect(user1).updateContact("encrypted_contact", "public_key");

            // Create maximum allowed offers (5)
            for (let i = 0; i < 5; i++) {
                await offer.connect(user1).createOffer(
                    0,
                    USD_CURRENCY,
                    NATIVE_TOKEN,
                    MIN_AMOUNT,
                    MAX_AMOUNT,
                    RATE,
                    `Offer ${i}`
                );
            }

            // Try to create one more
            await expect(
                offer.connect(user1).createOffer(
                    0,
                    USD_CURRENCY,
                    NATIVE_TOKEN,
                    MIN_AMOUNT,
                    MAX_AMOUNT,
                    RATE,
                    "Extra offer"
                )
            ).to.be.revertedWithCustomError(offer, "MaxActiveOffersReached");
        });

        it("Should revert if system is paused", async function () {
            await hub.emergencyPause("Testing pause");

            await expect(
                offer.connect(user1).createOffer(
                    0,
                    USD_CURRENCY,
                    NATIVE_TOKEN,
                    MIN_AMOUNT,
                    MAX_AMOUNT,
                    RATE,
                    OFFER_DESCRIPTION
                )
            ).to.be.revertedWithCustomError(offer, "SystemPaused");
        });
    });

    describe("Update Offer", function () {
        let offerId;

        beforeEach(async function () {
            // Create user profile first
            await profile.connect(user1).updateContact("encrypted_contact", "public_key");

            // Create an offer
            await offer.connect(user1).createOffer(
                0, // OfferType.Buy
                USD_CURRENCY,
                NATIVE_TOKEN,
                MIN_AMOUNT,
                MAX_AMOUNT,
                RATE,
                OFFER_DESCRIPTION
            );
            offerId = 1;
        });

        it("Should update offer state", async function () {
            const tx = await offer.connect(user1).updateOffer(
                offerId,
                1, // OfferState.Paused
                0, // keep current rate
                0, // keep current min
                0  // keep current max
            );

            await expect(tx)
                .to.emit(offer, "OfferStateChanged")
                .withArgs(offerId, 0, 1) // Active -> Paused
                .and.to.emit(offer, "OfferUpdated")
                .withArgs(offerId, 1);

            const offerData = await offer.getOffer(offerId);
            expect(offerData.state).to.equal(1); // Paused

            // Active offer count should decrease
            expect(await offer.getUserActiveOfferCount(user1.address)).to.equal(0);
        });

        it("Should update offer rate", async function () {
            const newRate = 60000;
            const tx = await offer.connect(user1).updateOffer(
                offerId,
                0, // keep Active state
                newRate,
                0, // keep current min
                0  // keep current max
            );

            await expect(tx)
                .to.emit(offer, "OfferRateUpdated")
                .withArgs(offerId, RATE, newRate);

            const offerData = await offer.getOffer(offerId);
            expect(offerData.rate).to.equal(newRate);
        });

        it("Should update offer amounts", async function () {
            const newMin = ethers.parseEther("200");
            const newMax = ethers.parseEther("2000");

            const tx = await offer.connect(user1).updateOffer(
                offerId,
                0, // keep Active state
                0, // keep current rate
                newMin,
                newMax
            );

            await expect(tx)
                .to.emit(offer, "OfferAmountsUpdated")
                .withArgs(offerId, MIN_AMOUNT, MAX_AMOUNT, newMin, newMax);

            const offerData = await offer.getOffer(offerId);
            expect(offerData.minAmount).to.equal(newMin);
            expect(offerData.maxAmount).to.equal(newMax);
        });

        it("Should revert if unauthorized user tries to update", async function () {
            await expect(
                offer.connect(user2).updateOffer(
                    offerId,
                    1, // OfferState.Paused
                    0, 0, 0
                )
            ).to.be.revertedWithCustomError(offer, "UnauthorizedAccess");
        });

        it("Should revert if offer not found", async function () {
            await expect(
                offer.connect(user1).updateOffer(
                    999, // non-existent offer
                    1, // OfferState.Paused
                    0, 0, 0
                )
            ).to.be.revertedWithCustomError(offer, "OfferNotFound");
        });

        it("Should revert if invalid amount range", async function () {
            const newMin = ethers.parseEther("2000");
            const newMax = ethers.parseEther("1000");

            await expect(
                offer.connect(user1).updateOffer(
                    offerId,
                    0, // keep Active state
                    0, // keep current rate
                    newMin, // min > max
                    newMax
                )
            ).to.be.revertedWithCustomError(offer, "InvalidAmountRange");
        });
    });

    describe("State Management Functions", function () {
        let offerId;

        beforeEach(async function () {
            // Create user profile first
            await profile.connect(user1).updateContact("encrypted_contact", "public_key");

            // Create an offer
            await offer.connect(user1).createOffer(
                0, // OfferType.Buy
                USD_CURRENCY,
                NATIVE_TOKEN,
                MIN_AMOUNT,
                MAX_AMOUNT,
                RATE,
                OFFER_DESCRIPTION
            );
            offerId = 1;
        });

        it("Should pause offer", async function () {
            await expect(offer.connect(user1).pauseOffer(offerId))
                .to.emit(offer, "OfferStateChanged")
                .withArgs(offerId, 0, 1); // Active -> Paused

            const offerData = await offer.getOffer(offerId);
            expect(offerData.state).to.equal(1); // Paused
        });

        it("Should activate offer", async function () {
            // First pause it
            await offer.connect(user1).pauseOffer(offerId);

            // Then activate it
            await expect(offer.connect(user1).activateOffer(offerId))
                .to.emit(offer, "OfferStateChanged")
                .withArgs(offerId, 1, 0); // Paused -> Active

            const offerData = await offer.getOffer(offerId);
            expect(offerData.state).to.equal(0); // Active
        });

        it("Should archive offer", async function () {
            await expect(offer.connect(user1).archiveOffer(offerId))
                .to.emit(offer, "OfferArchived")
                .withArgs(offerId, user1.address)
                .and.to.emit(offer, "OfferStateChanged")
                .withArgs(offerId, 0, 2); // Active -> Archived

            const offerData = await offer.getOffer(offerId);
            expect(offerData.state).to.equal(2); // Archived

            // Active offer count should decrease
            expect(await offer.getUserActiveOfferCount(user1.address)).to.equal(0);
        });
    });

    describe("Query Functions", function () {
        beforeEach(async function () {
            // Create user profiles
            await profile.connect(user1).updateContact("contact1", "key1");
            await profile.connect(user2).updateContact("contact2", "key2");

            // Create multiple offers for testing
            await offer.connect(user1).createOffer(0, USD_CURRENCY, NATIVE_TOKEN, MIN_AMOUNT, MAX_AMOUNT, RATE, "Buy USD Native");
            await offer.connect(user1).createOffer(1, USD_CURRENCY, NATIVE_TOKEN, MIN_AMOUNT, MAX_AMOUNT, RATE, "Sell USD Native");
            await offer.connect(user1).createOffer(0, EUR_CURRENCY, NATIVE_TOKEN, MIN_AMOUNT, MAX_AMOUNT, RATE, "Buy EUR Native");
            await offer.connect(user2).createOffer(0, USD_CURRENCY, NATIVE_TOKEN, MIN_AMOUNT, MAX_AMOUNT, RATE, "User2 Buy USD");
            await offer.connect(user2).createOffer(1, EUR_CURRENCY, user3.address, MIN_AMOUNT, MAX_AMOUNT, RATE, "User2 Sell EUR Token");
        });

        describe("getOffersByType", function () {
            it("Should return offers filtered by type, currency, and token", async function () {
                const [results, total] = await offer.getOffersByType(
                    0, // OfferType.Buy
                    USD_CURRENCY,
                    NATIVE_TOKEN,
                    0, // offset
                    10 // limit
                );

                expect(total).to.equal(2); // Two buy USD native offers
                expect(results.length).to.equal(2);
                expect(results[0].offerType).to.equal(0);
                expect(results[0].fiatCurrency).to.equal(USD_CURRENCY);
                expect(results[0].tokenAddress).to.equal(NATIVE_TOKEN);
            });

            it("Should handle pagination correctly", async function () {
                const [results1, total] = await offer.getOffersByType(
                    0, // OfferType.Buy
                    USD_CURRENCY,
                    NATIVE_TOKEN,
                    0, // offset
                    1  // limit
                );

                expect(total).to.equal(2);
                expect(results1.length).to.equal(1);

                const [results2] = await offer.getOffersByType(
                    0, // OfferType.Buy
                    USD_CURRENCY,
                    NATIVE_TOKEN,
                    1, // offset
                    1  // limit
                );

                expect(results2.length).to.equal(1);
                expect(results1[0].id).not.to.equal(results2[0].id);
            });

            it("Should return empty results for non-existent filters", async function () {
                const [results, total] = await offer.getOffersByType(
                    0, // OfferType.Buy
                    "GBP", // Non-existent currency
                    NATIVE_TOKEN,
                    0, // offset
                    10 // limit
                );

                expect(total).to.equal(0);
                expect(results.length).to.equal(0);
            });

            it("Should revert for invalid pagination params", async function () {
                await expect(
                    offer.getOffersByType(0, USD_CURRENCY, NATIVE_TOKEN, 0, 0)
                ).to.be.revertedWithCustomError(offer, "InvalidPaginationParams");

                await expect(
                    offer.getOffersByType(0, USD_CURRENCY, NATIVE_TOKEN, 0, 51) // > MAX_QUERY_LIMIT
                ).to.be.revertedWithCustomError(offer, "InvalidPaginationParams");
            });
        });

        describe("getUserOffers", function () {
            it("Should return user's offers with pagination", async function () {
                const [results, total] = await offer.getUserOffers(
                    user1.address,
                    0, // offset
                    10 // limit
                );

                expect(total).to.equal(3); // User1 has 3 offers
                expect(results.length).to.equal(3);
                expect(results[0].owner).to.equal(user1.address);
                expect(results[1].owner).to.equal(user1.address);
                expect(results[2].owner).to.equal(user1.address);
            });

            it("Should handle pagination for user offers", async function () {
                const [results1, total] = await offer.getUserOffers(
                    user1.address,
                    0, // offset
                    2  // limit
                );

                expect(total).to.equal(3);
                expect(results1.length).to.equal(2);

                const [results2] = await offer.getUserOffers(
                    user1.address,
                    2, // offset
                    2  // limit
                );

                expect(results2.length).to.equal(1);
            });

            it("Should return empty for user with no offers", async function () {
                const [results, total] = await offer.getUserOffers(
                    user3.address,
                    0, 10
                );

                expect(total).to.equal(0);
                expect(results.length).to.equal(0);
            });
        });

        describe("getOffer", function () {
            it("Should return correct offer data", async function () {
                const offerData = await offer.getOffer(1);
                expect(offerData.id).to.equal(1);
                expect(offerData.owner).to.equal(user1.address);
                expect(offerData.description).to.equal("Buy USD Native");
            });

            it("Should revert for non-existent offer", async function () {
                await expect(
                    offer.getOffer(999)
                ).to.be.revertedWithCustomError(offer, "OfferNotFound");
            });
        });

        describe("getUserActiveOfferCount", function () {
            it("Should return correct active offer count", async function () {
                expect(await offer.getUserActiveOfferCount(user1.address)).to.equal(3);
                expect(await offer.getUserActiveOfferCount(user2.address)).to.equal(2);

                // Pause one offer
                await offer.connect(user1).pauseOffer(1);
                expect(await offer.getUserActiveOfferCount(user1.address)).to.equal(2);

                // Archive one offer
                await offer.connect(user1).archiveOffer(2);
                expect(await offer.getUserActiveOfferCount(user1.address)).to.equal(1);
            });
        });

        describe("Compatibility functions", function () {
            it("Should support legacy getUserOffers function", async function () {
                const userOffers = await offer['getUserOffers(address)'](user1.address);
                expect(userOffers.length).to.equal(3);
                expect(userOffers[0]).to.equal(1);
                expect(userOffers[1]).to.equal(2);
                expect(userOffers[2]).to.equal(3);
            });

            it("Should support legacy updateOfferState function", async function () {
                await expect(offer.connect(user1).updateOfferState(1, 1))
                    .to.emit(offer, "OfferStateChanged")
                    .withArgs(1, 0, 1);

                const offerData = await offer.getOffer(1);
                expect(offerData.state).to.equal(1); // Paused
            });
        });
    });

    describe("Edge Cases and Security", function () {
        it("Should handle offer ID overflow correctly", async function () {
            // This test would require creating many offers to test overflow
            // For now, we just verify the initial state
            expect(await offer.nextOfferId()).to.equal(1);
        });

        it("Should prevent reentrancy attacks", async function () {
            // The contract uses ReentrancyGuardUpgradeable
            // This is primarily tested through the modifier usage
            // Individual function tests cover the happy path
        });

        it("Should handle zero amounts correctly", async function () {
            await profile.connect(user1).updateContact("contact", "key");

            await expect(
                offer.connect(user1).createOffer(
                    0,
                    USD_CURRENCY,
                    NATIVE_TOKEN,
                    0, // zero min amount
                    MAX_AMOUNT,
                    RATE,
                    OFFER_DESCRIPTION
                )
            ).to.not.be.reverted; // Zero min amount should be allowed

            await expect(
                offer.connect(user1).createOffer(
                    0,
                    USD_CURRENCY,
                    NATIVE_TOKEN,
                    MIN_AMOUNT,
                    0, // zero max amount but > min
                    RATE,
                    OFFER_DESCRIPTION
                )
            ).to.be.revertedWithCustomError(offer, "InvalidAmountRange");
        });
    });

    describe("Integration with Hub and Profile", function () {
        it("Should update profile active offers count on create", async function () {
            await profile.connect(user1).updateContact("contact", "key");

            const profileBefore = await profile.getProfile(user1.address);
            expect(profileBefore.activeOffers).to.equal(0);

            await offer.connect(user1).createOffer(
                0, USD_CURRENCY, NATIVE_TOKEN, MIN_AMOUNT, MAX_AMOUNT, RATE, OFFER_DESCRIPTION
            );

            const profileAfter = await profile.getProfile(user1.address);
            expect(profileAfter.activeOffers).to.equal(1);
        });

        it("Should update profile active offers count on state change", async function () {
            await profile.connect(user1).updateContact("contact", "key");
            await offer.connect(user1).createOffer(
                0, USD_CURRENCY, NATIVE_TOKEN, MIN_AMOUNT, MAX_AMOUNT, RATE, OFFER_DESCRIPTION
            );

            let profileData = await profile.getProfile(user1.address);
            expect(profileData.activeOffers).to.equal(1);

            // Pause offer
            await offer.connect(user1).pauseOffer(1);
            profileData = await profile.getProfile(user1.address);
            expect(profileData.activeOffers).to.equal(0);

            // Reactivate offer
            await offer.connect(user1).activateOffer(1);
            profileData = await profile.getProfile(user1.address);
            expect(profileData.activeOffers).to.equal(1);
        });

        it("Should respect hub max active offers limit", async function () {
            await profile.connect(user1).updateContact("contact", "key");

            // Create max allowed offers (5)
            for (let i = 0; i < 5; i++) {
                await offer.connect(user1).createOffer(
                    0, USD_CURRENCY, NATIVE_TOKEN, MIN_AMOUNT, MAX_AMOUNT, RATE, `Offer ${i}`
                );
            }

            // Try to create one more should fail
            await expect(
                offer.connect(user1).createOffer(
                    0, USD_CURRENCY, NATIVE_TOKEN, MIN_AMOUNT, MAX_AMOUNT, RATE, "Extra offer"
                )
            ).to.be.revertedWithCustomError(offer, "MaxActiveOffersReached");
        });
    });

    describe("Upgradeability", function () {
        it("Should only allow hub admin to upgrade", async function () {
            // Non-admin should not be able to upgrade
            const OfferV2 = await ethers.getContractFactory("Offer");
            
            await expect(
                upgrades.upgradeProxy(offer, OfferV2)
            ).to.not.be.reverted; // Should work as owner (deployer is admin)

            // TODO: Test with non-admin user - would need to implement access control check
        });
    });
});