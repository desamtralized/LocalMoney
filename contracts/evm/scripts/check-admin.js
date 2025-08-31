const hre = require("hardhat");
const { ethers } = hre;

async function main() {
    const provider = new ethers.JsonRpcProvider("https://bsc-dataseed1.binance.org/");
    const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
    
    console.log("Current account:", wallet.address);
    
    const hubAddress = "0x6393FC78A62aFdBbE8589E025De3Ae34237F74A3";
    const priceOracleAddress = "0xde582A3DA43d05D16165476A0AbB2CF24dFD63de";
    
    const hub = await ethers.getContractAt("Hub", hubAddress, wallet);
    const priceOracle = await ethers.getContractAt("PriceOracle", priceOracleAddress, wallet);
    
    console.log("\nHub admin:", await hub.getAdmin());
    
    const DEFAULT_ADMIN_ROLE = await priceOracle.DEFAULT_ADMIN_ROLE();
    const PRICE_UPDATER_ROLE = await priceOracle.PRICE_UPDATER_ROLE();
    
    console.log("\nPriceOracle roles:");
    console.log("DEFAULT_ADMIN_ROLE:", DEFAULT_ADMIN_ROLE);
    console.log("PRICE_UPDATER_ROLE:", PRICE_UPDATER_ROLE);
    
    // Check who has admin role
    const adminRoleCount = await priceOracle.getRoleMemberCount(DEFAULT_ADMIN_ROLE);
    console.log("Admin role member count:", adminRoleCount.toString());
    
    if (adminRoleCount > 0) {
        for (let i = 0; i < adminRoleCount; i++) {
            const admin = await priceOracle.getRoleMember(DEFAULT_ADMIN_ROLE, i);
            console.log(`Admin ${i}:`, admin);
        }
    }
    
    // Check if current account has any roles
    const hasAdmin = await priceOracle.hasRole(DEFAULT_ADMIN_ROLE, wallet.address);
    const hasUpdater = await priceOracle.hasRole(PRICE_UPDATER_ROLE, wallet.address);
    
    console.log("\nCurrent account roles:");
    console.log("Has DEFAULT_ADMIN_ROLE:", hasAdmin);
    console.log("Has PRICE_UPDATER_ROLE:", hasUpdater);
    
    // Check original deployer
    const originalDeployer = "0x5f6acb320B94b2A954dC0C28e037D5A761C76571";
    const origHasAdmin = await priceOracle.hasRole(DEFAULT_ADMIN_ROLE, originalDeployer);
    const origHasUpdater = await priceOracle.hasRole(PRICE_UPDATER_ROLE, originalDeployer);
    
    console.log("\nOriginal deployer roles (", originalDeployer, "):");
    console.log("Has DEFAULT_ADMIN_ROLE:", origHasAdmin);
    console.log("Has PRICE_UPDATER_ROLE:", origHasUpdater);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
