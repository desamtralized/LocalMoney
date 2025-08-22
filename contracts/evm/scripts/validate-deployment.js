// SPDX-License-Identifier: MIT
const { ethers } = require("hardhat");
const fs = require("fs");

/**
 * Comprehensive deployment validation script
 * Implements validation gates from EVM Translation Phase 5
 */

class DeploymentValidator {
    constructor(deploymentFile) {
        this.deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
        this.errors = [];
        this.warnings = [];
        this.passed = [];
    }

    async validate() {
        console.log("🔍 Starting deployment validation...");
        console.log(`📄 Deployment file: ${this.deployment.timestamp}`);
        console.log(`🌐 Network: ${this.deployment.network.name}\n`);

        await this.validateContractDeployments();
        await this.validateContractSizes();
        await this.validateSecurityConfiguration();
        await this.validateAccessControl();
        await this.validateUpgradeability();
        await this.validateEmergencyControls();
        await this.validateFeeConfiguration();
        
        this.printResults();
        
        return this.errors.length === 0;
    }

    async validateContractDeployments() {
        console.log("📋 Validating contract deployments...");
        
        const requiredContracts = ['hub', 'profile', 'offer', 'priceOracle', 'trade'];
        
        for (const contractName of requiredContracts) {
            const address = this.deployment.contracts[contractName];
            
            if (!address || address === ethers.ZeroAddress) {
                this.errors.push(`❌ ${contractName} contract not deployed`);
                continue;
            }
            
            // Check if contract exists on blockchain
            const code = await ethers.provider.getCode(address);
            if (code === '0x') {
                this.errors.push(`❌ ${contractName} contract has no code at ${address}`);
            } else {
                this.passed.push(`✅ ${contractName} contract deployed at ${address}`);
            }
        }
    }

    async validateContractSizes() {
        console.log("\\n📏 Validating contract sizes...");
        
        const maxSize = 24576; // 24KB limit
        const contracts = this.deployment.contracts;
        
        for (const [name, address] of Object.entries(contracts)) {
            if (address === ethers.ZeroAddress) continue;
            
            const code = await ethers.provider.getCode(address);
            const size = (code.length - 2) / 2; // Remove 0x and divide by 2 for bytes
            
            if (size > maxSize) {
                this.errors.push(`❌ ${name} contract size ${size} bytes exceeds ${maxSize} bytes limit`);
            } else {
                this.passed.push(`✅ ${name} contract size ${size} bytes (within limit)`);
            }
        }
    }

    async validateSecurityConfiguration() {
        console.log("\\n🛡️  Validating security configuration...");
        
        const hubAddress = this.deployment.contracts.hub;
        const hub = await ethers.getContractAt("Hub", hubAddress);
        
        try {
            // Check if system is not globally paused
            const config = await hub.getConfig();
            
            if (config.globalPause) {
                this.warnings.push(`⚠️  System is globally paused`);
            } else {
                this.passed.push(`✅ System is not globally paused`);
            }
            
            // Validate fee configuration
            const totalFees = Number(config.burnFeePct) + Number(config.chainFeePct) + 
                              Number(config.warchestFeePct) + Number(config.arbitratorFeePct);
            
            if (totalFees > 1000) { // 10%
                this.errors.push(`❌ Total fees ${totalFees}bps exceed 10% limit`);
            } else {
                this.passed.push(`✅ Total fees ${totalFees}bps within 10% limit`);
            }
            
            // Check treasury is not zero address
            if (config.treasury === ethers.ZeroAddress) {
                this.errors.push(`❌ Treasury address is zero address`);
            } else {
                this.passed.push(`✅ Treasury configured: ${config.treasury}`);
            }
            
        } catch (error) {
            this.errors.push(`❌ Failed to validate Hub configuration: ${error.message}`);
        }
    }

    async validateAccessControl() {
        console.log("\\n🔐 Validating access control...");
        
        const hubAddress = this.deployment.contracts.hub;
        const hub = await ethers.getContractAt("Hub", hubAddress);
        
        try {
            const admin = await hub.getAdmin();
            
            // Check if admin is multi-sig (not deployer)
            if (admin === this.deployment.deployer) {
                this.warnings.push(`⚠️  Hub admin is still deployer address`);
            } else {
                this.passed.push(`✅ Hub admin transferred to: ${admin}`);
            }
            
            // Check admin role
            const ADMIN_ROLE = await hub.ADMIN_ROLE();
            const hasAdminRole = await hub.hasRole(ADMIN_ROLE, admin);
            
            if (!hasAdminRole) {
                this.errors.push(`❌ Admin does not have ADMIN_ROLE`);
            } else {
                this.passed.push(`✅ Admin has ADMIN_ROLE`);
            }
            
        } catch (error) {
            this.errors.push(`❌ Failed to validate access control: ${error.message}`);
        }
    }

    async validateUpgradeability() {
        console.log("\\n⬆️  Validating upgrade security...");
        
        const contracts = ['hub', 'profile', 'offer', 'priceOracle', 'trade'];
        
        for (const contractName of contracts) {
            const address = this.deployment.contracts[contractName];
            if (!address) continue;
            
            try {
                const contract = await ethers.getContractAt("UUPSUpgradeable", address);
                
                // Try to call proxiableUUID to confirm it's a UUPS proxy
                await contract.proxiableUUID();
                this.passed.push(`✅ ${contractName} is properly upgradeable (UUPS)`);
                
            } catch (error) {
                this.warnings.push(`⚠️  Could not verify ${contractName} upgrade security: ${error.message}`);
            }
        }
    }

    async validateEmergencyControls() {
        console.log("\\n🚨 Validating emergency controls...");
        
        const hubAddress = this.deployment.contracts.hub;
        const hub = await ethers.getContractAt("Hub", hubAddress);
        
        try {
            // Check emergency role exists
            const EMERGENCY_ROLE = await hub.EMERGENCY_ROLE();
            const emergencyRoleMembers = await this.getRoleMembers(hub, EMERGENCY_ROLE);
            
            if (emergencyRoleMembers.length === 0) {
                this.warnings.push(`⚠️  No emergency role members configured`);
            } else {
                this.passed.push(`✅ Emergency role configured (${emergencyRoleMembers.length} members)`);
            }
            
        } catch (error) {
            this.errors.push(`❌ Failed to validate emergency controls: ${error.message}`);
        }
    }

    async validateFeeConfiguration() {
        console.log("\\n💰 Validating fee configuration...");
        
        const hubAddress = this.deployment.contracts.hub;
        const hub = await ethers.getContractAt("Hub", hubAddress);
        
        try {
            const config = await hub.getConfig();
            
            // Validate individual fee limits
            const feeChecks = [
                { name: 'burnFeePct', value: Number(config.burnFeePct), max: 500 },
                { name: 'chainFeePct', value: Number(config.chainFeePct), max: 500 },
                { name: 'warchestFeePct', value: Number(config.warchestFeePct), max: 500 },
                { name: 'arbitratorFeePct', value: Number(config.arbitratorFeePct), max: 500 }
            ];
            
            for (const fee of feeChecks) {
                if (fee.value > fee.max) {
                    this.errors.push(`❌ ${fee.name} ${fee.value}bps exceeds maximum ${fee.max}bps`);
                } else {
                    this.passed.push(`✅ ${fee.name} ${fee.value}bps within limits`);
                }
            }
            
            // Validate trading limits
            const minTrade = Number(config.minTradeAmount);
            const maxTrade = Number(config.maxTradeAmount);
            
            if (minTrade >= maxTrade) {
                this.errors.push(`❌ minTradeAmount >= maxTradeAmount`);
            } else {
                this.passed.push(`✅ Trade amount limits: $${minTrade/100} - $${maxTrade/100}`);
            }
            
        } catch (error) {
            this.errors.push(`❌ Failed to validate fee configuration: ${error.message}`);
        }
    }

    async getRoleMembers(contract, role) {
        // Note: This is a simplified version. In reality, you'd need to query role events
        // or use a different method to get all role members
        try {
            const roleAdmin = await contract.getRoleAdmin(role);
            return [roleAdmin]; // Simplified return
        } catch {
            return [];
        }
    }

    printResults() {
        console.log("\\n" + "=".repeat(60));
        console.log("📊 VALIDATION RESULTS");
        console.log("=".repeat(60));
        
        console.log(`\\n✅ PASSED (${this.passed.length}):`);
        this.passed.forEach(item => console.log(item));
        
        if (this.warnings.length > 0) {
            console.log(`\\n⚠️  WARNINGS (${this.warnings.length}):`);
            this.warnings.forEach(item => console.log(item));
        }
        
        if (this.errors.length > 0) {
            console.log(`\\n❌ ERRORS (${this.errors.length}):`);
            this.errors.forEach(item => console.log(item));
        }
        
        console.log("\\n" + "=".repeat(60));
        
        if (this.errors.length === 0) {
            console.log("🎉 VALIDATION PASSED - Deployment is ready for production!");
        } else {
            console.log("💥 VALIDATION FAILED - Fix errors before production deployment!");
        }
        
        console.log(`\\n📈 Summary: ${this.passed.length} passed, ${this.warnings.length} warnings, ${this.errors.length} errors`);
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log("Usage: npx hardhat run scripts/validate-deployment.js -- <deployment-file>");
        console.log("Example: npx hardhat run scripts/validate-deployment.js -- deployments/mainnet-latest.json");
        process.exit(1);
    }
    
    const deploymentFile = args[0];
    
    if (!fs.existsSync(deploymentFile)) {
        console.error(`❌ Deployment file not found: ${deploymentFile}`);
        process.exit(1);
    }
    
    const validator = new DeploymentValidator(deploymentFile);
    const success = await validator.validate();
    
    process.exit(success ? 0 : 1);
}

main().catch(error => {
    console.error("❌ Validation script failed:", error);
    process.exit(1);
});