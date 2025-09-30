const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("KujiraBridgedToken", function () {
    let token, owner, relayer, user1, user2, attacker;

    const TOKEN_NAME = "Bridged KUJI";
    const TOKEN_SYMBOL = "bKUJI";
    const DECIMALS = 6;

    const MINTER_ROLE = ethers.id("MINTER_ROLE");
    const PAUSER_ROLE = ethers.id("PAUSER_ROLE");
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

    beforeEach(async function () {
        [owner, relayer, user1, user2, attacker] = await ethers.getSigners();

        const KujiraBridgedToken = await ethers.getContractFactory("KujiraBridgedToken");
        token = await KujiraBridgedToken.deploy(TOKEN_NAME, TOKEN_SYMBOL);
        await token.waitForDeployment();

        await token.grantRole(MINTER_ROLE, relayer.address);
    });

    describe("Deployment", function () {
        it("should deploy with correct name and symbol", async function () {
            expect(await token.name()).to.equal(TOKEN_NAME);
            expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
        });

        it("should set correct decimals", async function () {
            expect(await token.decimals()).to.equal(DECIMALS);
        });

        it("should assign DEFAULT_ADMIN_ROLE to deployer", async function () {
            expect(await token.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
        });

        it("should assign PAUSER_ROLE to deployer", async function () {
            expect(await token.hasRole(PAUSER_ROLE, owner.address)).to.be.true;
        });

        it("should have zero initial supply", async function () {
            expect(await token.totalSupply()).to.equal(0);
        });
    });

    describe("Minting", function () {
        const amount = ethers.parseUnits("1000", DECIMALS);
        const txHash = ethers.id("kujira_tx_123");

        it("should mint tokens with valid parameters", async function () {
            await expect(token.connect(relayer).mintBridged(user1.address, amount, txHash))
                .to.emit(token, "TokensMinted")
                .withArgs(user1.address, amount, txHash);

            expect(await token.balanceOf(user1.address)).to.equal(amount);
            expect(await token.totalSupply()).to.equal(amount);
        });

        it("should mark transaction as processed", async function () {
            await token.connect(relayer).mintBridged(user1.address, amount, txHash);
            expect(await token.processedBurns(txHash)).to.be.true;
        });

        it("should prevent double processing", async function () {
            await token.connect(relayer).mintBridged(user1.address, amount, txHash);

            await expect(token.connect(relayer).mintBridged(user1.address, amount, txHash))
                .to.be.revertedWith("Already processed");
        });

        it("should reject invalid recipient", async function () {
            await expect(token.connect(relayer).mintBridged(ethers.ZeroAddress, amount, txHash))
                .to.be.revertedWith("Invalid recipient");
        });

        it("should reject zero amount", async function () {
            await expect(token.connect(relayer).mintBridged(user1.address, 0, txHash))
                .to.be.revertedWith("Invalid amount");
        });

        it("should reject empty tx hash", async function () {
            await expect(token.connect(relayer).mintBridged(user1.address, amount, ethers.ZeroHash))
                .to.be.revertedWith("Invalid tx hash");
        });

        it("should only allow MINTER_ROLE to mint", async function () {
            await expect(token.connect(attacker).mintBridged(user1.address, amount, txHash))
                .to.be.reverted;
        });

        it("should not mint when paused", async function () {
            await token.pause();
            await expect(token.connect(relayer).mintBridged(user1.address, amount, txHash))
                .to.be.revertedWithCustomError(token, "EnforcedPause");
        });
    });

    describe("Transfers", function () {
        const amount = ethers.parseUnits("1000", DECIMALS);
        const transferAmount = ethers.parseUnits("100", DECIMALS);
        const txHash = ethers.id("kujira_tx_123");

        beforeEach(async function () {
            await token.connect(relayer).mintBridged(user1.address, amount, txHash);
        });

        it("should allow normal transfers", async function () {
            await expect(token.connect(user1).transfer(user2.address, transferAmount))
                .to.emit(token, "Transfer")
                .withArgs(user1.address, user2.address, transferAmount);

            expect(await token.balanceOf(user1.address)).to.equal(amount - transferAmount);
            expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
        });

        it("should not allow transfers when paused", async function () {
            await token.pause();
            await expect(token.connect(user1).transfer(user2.address, transferAmount))
                .to.be.revertedWithCustomError(token, "EnforcedPause");
        });

        it("should allow transfers after unpausing", async function () {
            await token.pause();
            await token.unpause();

            await expect(token.connect(user1).transfer(user2.address, transferAmount))
                .to.emit(token, "Transfer")
                .withArgs(user1.address, user2.address, transferAmount);
        });
    });

    describe("Access Control", function () {
        it("should allow admin to grant roles", async function () {
            await token.grantRole(MINTER_ROLE, user1.address);
            expect(await token.hasRole(MINTER_ROLE, user1.address)).to.be.true;
        });

        it("should allow admin to revoke roles", async function () {
            await token.grantRole(MINTER_ROLE, user1.address);
            await token.revokeRole(MINTER_ROLE, user1.address);
            expect(await token.hasRole(MINTER_ROLE, user1.address)).to.be.false;
        });

        it("should not allow non-admin to grant roles", async function () {
            await expect(token.connect(attacker).grantRole(MINTER_ROLE, attacker.address))
                .to.be.reverted;
        });

        it("should allow admin to transfer admin role", async function () {
            await token.grantRole(DEFAULT_ADMIN_ROLE, user1.address);
            expect(await token.hasRole(DEFAULT_ADMIN_ROLE, user1.address)).to.be.true;
        });
    });

    describe("Pause Functionality", function () {
        it("should allow PAUSER_ROLE to pause", async function () {
            await token.pause();
            expect(await token.paused()).to.be.true;
        });

        it("should allow PAUSER_ROLE to unpause", async function () {
            await token.pause();
            await token.unpause();
            expect(await token.paused()).to.be.false;
        });

        it("should not allow non-PAUSER_ROLE to pause", async function () {
            await expect(token.connect(attacker).pause())
                .to.be.reverted;
        });

        it("should not allow non-PAUSER_ROLE to unpause", async function () {
            await token.pause();
            await expect(token.connect(attacker).unpause())
                .to.be.reverted;
        });
    });

    describe("Multiple Minting", function () {
        it("should handle multiple mint operations correctly", async function () {
            const amounts = [
                ethers.parseUnits("100", DECIMALS),
                ethers.parseUnits("200", DECIMALS),
                ethers.parseUnits("300", DECIMALS)
            ];

            const txHashes = [
                ethers.id("tx1"),
                ethers.id("tx2"),
                ethers.id("tx3")
            ];

            let totalMinted = 0n;

            for (let i = 0; i < amounts.length; i++) {
                await token.connect(relayer).mintBridged(user1.address, amounts[i], txHashes[i]);
                totalMinted += amounts[i];
            }

            expect(await token.balanceOf(user1.address)).to.equal(totalMinted);
            expect(await token.totalSupply()).to.equal(totalMinted);

            for (let txHash of txHashes) {
                expect(await token.processedBurns(txHash)).to.be.true;
            }
        });

        it("should mint to different recipients", async function () {
            const amount = ethers.parseUnits("100", DECIMALS);
            const users = [user1, user2];

            for (let i = 0; i < users.length; i++) {
                const txHash = ethers.id(`tx_${i}`);
                await token.connect(relayer).mintBridged(users[i].address, amount, txHash);
            }

            for (let user of users) {
                expect(await token.balanceOf(user.address)).to.equal(amount);
            }

            expect(await token.totalSupply()).to.equal(amount * BigInt(users.length));
        });
    });
});