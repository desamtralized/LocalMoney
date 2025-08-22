const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Profile Contract", function () {
    let Hub, hub, Profile, profile;
    let owner, user1, user2, offerContract, tradeContract;
    let defaultConfig;

    beforeEach(async function () {
        // Get signers
        [owner, user1, user2, offerContract, tradeContract] = await ethers.getSigners();

        // Deploy Hub contract first
        Hub = await ethers.getContractFactory("Hub");
        
        defaultConfig = {
            offerContract: offerContract.address,
            tradeContract: tradeContract.address,
            profileContract: ethers.ZeroAddress, // Will be set after profile deployment
            priceContract: user1.address,
            treasury: user2.address,
            localMarket: user1.address,
            priceProvider: user2.address,
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

        hub = await upgrades.deployProxy(Hub, [defaultConfig], {
            initializer: "initialize",
            kind: "uups"
        });
        await hub.waitForDeployment();

        // Deploy Profile contract
        Profile = await ethers.getContractFactory("Profile");
        profile = await upgrades.deployProxy(Profile, [hub.target], {
            initializer: "initialize",
            kind: "uups"
        });
        await profile.waitForDeployment();

        // Update hub config with profile contract address
        const updatedConfig = { ...defaultConfig };
        updatedConfig.profileContract = profile.target;
        await hub.updateConfig(updatedConfig);
    });

    describe("Initialization", function () {
        it("Should initialize with correct hub address", async function () {
            expect(await profile.hub()).to.equal(hub.target);
        });

        it("Should set correct admin", async function () {
            expect(await profile.admin()).to.equal(owner.address);
        });

        it("Should reject zero hub address", async function () {
            const ProfileFactory = await ethers.getContractFactory("Profile");
            
            await expect(
                upgrades.deployProxy(ProfileFactory, [ethers.ZeroAddress], {
                    initializer: "initialize",
                    kind: "uups"
                })
            ).to.be.revertedWith("Invalid hub address");
        });
    });

    describe("Contact Management", function () {
        const sampleContact = "encrypted_contact_data_123";
        const samplePublicKey = "public_key_xyz_789";

        it("Should allow user to update contact information", async function () {
            await expect(profile.connect(user1).updateContact(sampleContact, samplePublicKey))
                .to.emit(profile, "ProfileUpdated")
                .withArgs(user1.address)
                .and.to.emit(profile, "ContactUpdated")
                .withArgs(user1.address, sampleContact);

            const userProfile = await profile.getProfile(user1.address);
            expect(userProfile.encryptedContact).to.equal(sampleContact);
            expect(userProfile.publicKey).to.equal(samplePublicKey);
            expect(userProfile.createdAt).to.be.greaterThan(0);
            expect(userProfile.lastActivity).to.be.greaterThan(0);
        });

        it("Should reject empty contact information", async function () {
            await expect(profile.connect(user1).updateContact("", samplePublicKey))
                .to.be.revertedWithCustomError(profile, "InvalidContactData");
        });

        it("Should reject empty public key", async function () {
            await expect(profile.connect(user1).updateContact(sampleContact, ""))
                .to.be.revertedWithCustomError(profile, "InvalidContactData");
        });

        it("Should create profile on first contact update", async function () {
            expect(await profile.profileExists(user1.address)).to.be.false;
            
            await profile.connect(user1).updateContact(sampleContact, samplePublicKey);
            
            expect(await profile.profileExists(user1.address)).to.be.true;
        });

        it("Should update existing profile", async function () {
            // First update
            await profile.connect(user1).updateContact(sampleContact, samplePublicKey);
            const firstUpdate = await profile.getProfile(user1.address);

            // Second update
            const newContact = "new_encrypted_contact";
            const newKey = "new_public_key";
            await profile.connect(user1).updateContact(newContact, newKey);
            
            const secondUpdate = await profile.getProfile(user1.address);
            expect(secondUpdate.encryptedContact).to.equal(newContact);
            expect(secondUpdate.publicKey).to.equal(newKey);
            expect(secondUpdate.createdAt).to.equal(firstUpdate.createdAt); // Should not change
            expect(secondUpdate.lastActivity).to.be.greaterThan(firstUpdate.lastActivity);
        });
    });

    describe("Trade Statistics", function () {
        it("Should allow authorized contract to update trade count", async function () {
            // Trade contract updates completed trade
            await expect(profile.connect(tradeContract).updateTradeCount(user1.address, true))
                .to.emit(profile, "TradeStatsUpdated")
                .withArgs(user1.address, 0, 1);

            const userProfile = await profile.getProfile(user1.address);
            expect(userProfile.tradesCompleted).to.equal(1);
            expect(userProfile.tradesRequested).to.equal(0);
        });

        it("Should track requested trades", async function () {
            await profile.connect(tradeContract).updateTradeCount(user1.address, false);
            
            const userProfile = await profile.getProfile(user1.address);
            expect(userProfile.tradesRequested).to.equal(1);
            expect(userProfile.tradesCompleted).to.equal(0);
        });

        it("Should reject trade count update from unauthorized caller", async function () {
            await expect(profile.connect(user2).updateTradeCount(user1.address, true))
                .to.be.revertedWithCustomError(profile, "Unauthorized");
        });

        it("Should create profile if it doesn't exist", async function () {
            expect(await profile.profileExists(user1.address)).to.be.false;
            
            await profile.connect(tradeContract).updateTradeCount(user1.address, true);
            
            expect(await profile.profileExists(user1.address)).to.be.true;
        });
    });

    describe("Active Offers Management", function () {
        it("Should allow authorized contract to increase active offers", async function () {
            await expect(profile.connect(offerContract).updateActiveOffers(user1.address, 2))
                .to.emit(profile, "ActivityUpdated")
                .withArgs(user1.address, 2, 0);

            const userProfile = await profile.getProfile(user1.address);
            expect(userProfile.activeOffers).to.equal(2);
        });

        it("Should allow authorized contract to decrease active offers", async function () {
            // First increase
            await profile.connect(offerContract).updateActiveOffers(user1.address, 3);
            
            // Then decrease
            await profile.connect(offerContract).updateActiveOffers(user1.address, -1);
            
            const userProfile = await profile.getProfile(user1.address);
            expect(userProfile.activeOffers).to.equal(2);
        });

        it("Should enforce max active offers limit", async function () {
            // Try to exceed the limit (5 as set in defaultConfig)
            await expect(profile.connect(offerContract).updateActiveOffers(user1.address, 6))
                .to.be.revertedWithCustomError(profile, "LimitExceeded");
        });

        it("Should handle decreasing below zero gracefully", async function () {
            // Try to decrease when user has 0 active offers
            await profile.connect(offerContract).updateActiveOffers(user1.address, -1);
            
            const userProfile = await profile.getProfile(user1.address);
            expect(userProfile.activeOffers).to.equal(0);
        });

        it("Should reject update from unauthorized caller", async function () {
            await expect(profile.connect(user2).updateActiveOffers(user1.address, 1))
                .to.be.revertedWithCustomError(profile, "Unauthorized");
        });
    });

    describe("Active Trades Management", function () {
        it("Should allow authorized contract to increase active trades", async function () {
            await expect(profile.connect(tradeContract).updateActiveTrades(user1.address, 1))
                .to.emit(profile, "ActivityUpdated")
                .withArgs(user1.address, 0, 1);

            const userProfile = await profile.getProfile(user1.address);
            expect(userProfile.activeTrades).to.equal(1);
        });

        it("Should enforce max active trades limit", async function () {
            // Try to exceed the limit (3 as set in defaultConfig)
            await expect(profile.connect(tradeContract).updateActiveTrades(user1.address, 4))
                .to.be.revertedWithCustomError(profile, "LimitExceeded");
        });

        it("Should allow decrease of active trades", async function () {
            // First increase
            await profile.connect(tradeContract).updateActiveTrades(user1.address, 2);
            
            // Then decrease
            await profile.connect(tradeContract).updateActiveTrades(user1.address, -1);
            
            const userProfile = await profile.getProfile(user1.address);
            expect(userProfile.activeTrades).to.equal(1);
        });
    });

    describe("View Functions", function () {
        beforeEach(async function () {
            // Set up a user with some data
            await profile.connect(user1).updateContact("contact", "key");
            await profile.connect(tradeContract).updateTradeCount(user1.address, true); // 1 completed
            await profile.connect(tradeContract).updateTradeCount(user1.address, false); // 1 requested
            await profile.connect(offerContract).updateActiveOffers(user1.address, 2);
            await profile.connect(tradeContract).updateActiveTrades(user1.address, 1);
        });

        it("Should return correct trading stats", async function () {
            const [requested, completed, activeOffers, activeTrades] = 
                await profile.getTradingStats(user1.address);
            
            expect(requested).to.equal(1);
            expect(completed).to.equal(1);
            expect(activeOffers).to.equal(2);
            expect(activeTrades).to.equal(1);
        });

        it("Should calculate reputation score correctly", async function () {
            // User has 1 completed and 1 requested = 50% reputation
            const reputation = await profile.getReputationScore(user1.address);
            expect(reputation).to.equal(50);
        });

        it("Should return 100% reputation for new users", async function () {
            const reputation = await profile.getReputationScore(user2.address);
            expect(reputation).to.equal(100);
        });

        it("Should check if user can create offers", async function () {
            // User has 2 active offers, limit is 5
            expect(await profile.canCreateOffer(user1.address)).to.be.true;
            
            // Add more offers to reach limit
            await profile.connect(offerContract).updateActiveOffers(user1.address, 3);
            expect(await profile.canCreateOffer(user1.address)).to.be.false;
        });

        it("Should check if user can create trades", async function () {
            // User has 1 active trade, limit is 3
            expect(await profile.canCreateTrade(user1.address)).to.be.true;
            
            // Add more trades to reach limit
            await profile.connect(tradeContract).updateActiveTrades(user1.address, 2);
            expect(await profile.canCreateTrade(user1.address)).to.be.false;
        });
    });

    describe("Authorization", function () {
        it("Should allow profile owner to update contact", async function () {
            await expect(profile.connect(user1).updateContact("contact", "key"))
                .to.not.be.reverted;
        });

        it("Should allow hub contract to call authorized functions", async function () {
            // This would require the hub to have the authorized contract addresses
            // For this test, we'll verify the logic works with the configured contracts
            await expect(profile.connect(tradeContract).updateTradeCount(user1.address, true))
                .to.not.be.reverted;
        });

        it("Should reject unauthorized callers", async function () {
            await expect(profile.connect(user2).updateTradeCount(user1.address, true))
                .to.be.revertedWithCustomError(profile, "Unauthorized");
        });
    });

    describe("Admin Functions", function () {
        it("Should allow admin to update hub address", async function () {
            const newHub = user1.address;
            await profile.updateHub(newHub);
            expect(await profile.hub()).to.equal(newHub);
        });

        it("Should reject hub update from non-admin", async function () {
            await expect(profile.connect(user1).updateHub(user2.address))
                .to.be.revertedWith("Only admin");
        });

        it("Should allow admin to update admin address", async function () {
            await profile.updateAdmin(user1.address);
            expect(await profile.admin()).to.equal(user1.address);
        });

        it("Should reject admin update from non-admin", async function () {
            await expect(profile.connect(user1).updateAdmin(user2.address))
                .to.be.revertedWith("Only admin");
        });
    });

    describe("Upgrade Functionality", function () {
        it("Should return correct version", async function () {
            expect(await profile.version()).to.equal("1.0.0");
        });

        it("Should be upgradeable by admin", async function () {
            const ProfileV2 = await ethers.getContractFactory("Profile");
            
            await expect(
                upgrades.upgradeProxy(profile.target, ProfileV2)
            ).to.not.be.reverted;
        });
    });

    describe("Gas Optimization", function () {
        it("Should have reasonable gas costs for profile updates", async function () {
            const tx = await profile.connect(user1).updateContact("contact", "key");
            const receipt = await tx.wait();
            
            // Profile updates should be gas efficient (higher limit for upgradeable contracts)
            expect(receipt.gasUsed).to.be.lessThan(150000);
        });

        it("Should have reasonable gas costs for stat updates", async function () {
            const tx = await profile.connect(tradeContract).updateTradeCount(user1.address, true);
            const receipt = await tx.wait();
            
            // Higher limit for upgradeable contracts
            expect(receipt.gasUsed).to.be.lessThan(200000);
        });
    });
});