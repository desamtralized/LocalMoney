#!/bin/bash

# BSC Mainnet Complete Deployment and Initialization Script
# This script orchestrates the complete deployment process for BSC mainnet

set -e  # Exit on error

echo "========================================================================="
echo "BSC MAINNET - COMPLETE DEPLOYMENT AND INITIALIZATION"
echo "========================================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Check if we're in the correct directory
if [ ! -f "hardhat.config.js" ]; then
    print_error "Please run this script from the contracts/evm directory"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found. Please create it with DEPLOYER_PRIVATE_KEY"
    exit 1
fi

# Check if DEPLOYER_PRIVATE_KEY is set
if ! grep -q "DEPLOYER_PRIVATE_KEY=" .env; then
    print_error "DEPLOYER_PRIVATE_KEY not found in .env file"
    exit 1
fi

echo "Starting BSC Mainnet deployment process..."
echo ""

# Step 1: Check if contracts are already deployed
echo "========================================================================="
echo "STEP 1: CHECKING EXISTING DEPLOYMENT"
echo "========================================================================="

if ls deployments/bsc-mainnet-complete-*.json 1> /dev/null 2>&1; then
    print_warning "Existing deployment found. Skipping deployment step."
    echo "To redeploy, remove files from deployments/ directory"
else
    # Step 2: Deploy contracts
    echo "========================================================================="
    echo "STEP 2: DEPLOYING CONTRACTS"
    echo "========================================================================="
    
    print_status "Running deployment script..."
    npx hardhat run scripts/deploy-all-bsc-mainnet.js --network bsc
    
    if [ $? -eq 0 ]; then
        print_status "Contracts deployed successfully!"
    else
        print_error "Deployment failed. Please check the error above."
        exit 1
    fi
fi

echo ""

# Step 3: Update environment variables
echo "========================================================================="
echo "STEP 3: UPDATING ENVIRONMENT VARIABLES"
echo "========================================================================="

print_status "Updating .env files with deployed addresses..."
node scripts/update-env-variables.js

if [ $? -eq 0 ]; then
    print_status "Environment variables updated successfully!"
else
    print_error "Failed to update environment variables"
    exit 1
fi

echo ""

# Step 4: Initialize contracts
echo "========================================================================="
echo "STEP 4: INITIALIZING CONTRACTS"
echo "========================================================================="

print_status "Initializing price oracle and registering arbitrator..."
npx hardhat run scripts/initialize-bsc-mainnet.js --network bsc

if [ $? -eq 0 ]; then
    print_status "Contracts initialized successfully!"
else
    print_error "Initialization failed. Please check the error above."
    exit 1
fi

echo ""

# Step 5: Verify deployment
echo "========================================================================="
echo "STEP 5: VERIFYING DEPLOYMENT"
echo "========================================================================="

print_status "Running deployment verification..."
npx hardhat run scripts/verify-bsc-deployment.js --network bsc

if [ $? -eq 0 ]; then
    print_status "Deployment verification passed!"
else
    print_warning "Some verification checks failed. Review the output above."
fi

echo ""

# Step 6: Run integration tests
echo "========================================================================="
echo "STEP 6: RUNNING INTEGRATION TESTS"
echo "========================================================================="

print_status "Running integration test suite..."
npx hardhat run scripts/test-bsc-integration.js --network bsc

if [ $? -eq 0 ]; then
    print_status "Integration tests completed!"
else
    print_warning "Some integration tests failed. Review the output above."
fi

echo ""
echo "========================================================================="
echo "DEPLOYMENT COMPLETE!"
echo "========================================================================="
echo ""

# Display summary
if ls deployments/bsc-mainnet-complete-*.json 1> /dev/null 2>&1; then
    LATEST_DEPLOYMENT=$(ls -t deployments/bsc-mainnet-complete-*.json | head -1)
    
    echo "Deployment Summary:"
    echo "-------------------"
    
    # Extract addresses using grep and sed
    HUB=$(grep '"Hub"' $LATEST_DEPLOYMENT | sed 's/.*: "\(0x[^"]*\)".*/\1/')
    PROFILE=$(grep '"Profile"' $LATEST_DEPLOYMENT | sed 's/.*: "\(0x[^"]*\)".*/\1/')
    PRICE_ORACLE=$(grep '"PriceOracle"' $LATEST_DEPLOYMENT | sed 's/.*: "\(0x[^"]*\)".*/\1/')
    OFFER=$(grep '"Offer"' $LATEST_DEPLOYMENT | sed 's/.*: "\(0x[^"]*\)".*/\1/')
    TRADE=$(grep '"Trade"' $LATEST_DEPLOYMENT | sed 's/.*: "\(0x[^"]*\)".*/\1/')
    ESCROW=$(grep '"Escrow"' $LATEST_DEPLOYMENT | sed 's/.*: "\(0x[^"]*\)".*/\1/')
    ARBITRATOR=$(grep '"ArbitratorManager"' $LATEST_DEPLOYMENT | sed 's/.*: "\(0x[^"]*\)".*/\1/')
    
    echo "Hub:                $HUB"
    echo "Profile:            $PROFILE"
    echo "PriceOracle:        $PRICE_ORACLE"
    echo "Offer:              $OFFER"
    echo "Trade:              $TRADE"
    echo "Escrow:             $ESCROW"
    echo "ArbitratorManager:  $ARBITRATOR"
    echo ""
    echo "View on BSCScan:"
    echo "Hub:       https://bscscan.com/address/$HUB"
    echo "Offer:     https://bscscan.com/address/$OFFER"
    echo "Trade:     https://bscscan.com/address/$TRADE"
fi

echo ""
echo "Next Steps:"
echo "-----------"
echo "1. Verify contracts on BSCScan (optional)"
echo "2. Start the fiat-prices-aggregator service"
echo "3. Deploy and test the frontend application"
echo "4. Monitor the system for proper operation"
echo ""

print_status "BSC Mainnet deployment process completed successfully!"