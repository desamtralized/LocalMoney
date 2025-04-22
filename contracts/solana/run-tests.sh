#!/bin/bash

# run-tests.sh - Script to run LocalMoney integration tests
# Usage: ./run-tests.sh [options]
# Options:
#  --no-build: Skip building and deploying the programs
#  --suite=<test-suite>: Specify which test suite to run
#     Available suites: full-lifecycle, integration, unit, hub, all, anchor (default: full-lifecycle)
#  --anchor-client: Use anchor client approach instead of manual serialization (used with anchor suite)
#  --verify-deploy: Verify program deployment before running tests

# Exit on error
set -e

# Always stop existing validator first to ensure reset if needed
echo "🛑 Attempting to stop any running local validator..."
pkill -f solana-test-validator || true
sleep 2 # Give time for the process to terminate

# Parse command line arguments
SKIP_BUILD=false
TEST_SUITE="full-lifecycle"
USE_ANCHOR_CLIENT=false
VERIFY_DEPLOY=false

for arg in "$@"
do
    if [ "$arg" == "--no-build" ]; then
        SKIP_BUILD=true
    elif [[ "$arg" == "--suite="* ]]; then
        TEST_SUITE="${arg#*=}"
    elif [ "$arg" == "--anchor-client" ]; then
        USE_ANCHOR_CLIENT=true
    elif [ "$arg" == "--verify-deploy" ]; then
        VERIFY_DEPLOY=true
    fi
done

echo "🚀 Starting LocalMoney test process for suite: $TEST_SUITE..."
if [ "$USE_ANCHOR_CLIENT" = true ]; then
    echo "Using Anchor client approach where possible"
fi
if [ "$VERIFY_DEPLOY" = true ]; then
    echo "Verifying program deployment before running tests"
fi

# Check if solana is installed
if ! command -v solana &> /dev/null; then
    echo "❌ Error: Solana CLI is not installed. Please install it first."
    exit 1
fi

# Check if anchor is installed
if ! command -v anchor &> /dev/null; then
    echo "❌ Error: Anchor CLI is not installed. Please install it first."
    exit 1
fi

echo "📋 Checking Solana version..."
solana --version

echo "📋 Checking Anchor version..."
anchor --version

# Flag to track if we started the validator ourselves
STARTED_VALIDATOR=false

# Function to check if a validator is already running
check_validator_running() {
    if curl --silent --head http://localhost:8899/health >/dev/null 2>&1; then
        return 0 # Running
    else
        return 1 # Not running
    fi
}

# Check if validator is already running (should be false now unless manually started *after* pkill)
if check_validator_running; then
    echo "✅ Validator already running at http://localhost:8899" # This path should ideally not be taken now
else
    echo "🧹 Cleaning up previous validator instances (redundant check)..."
    # pkill -f solana-test-validator || true # Already done above
    # sleep 2

    # Create log directory if it doesn't exist
    mkdir -p test-ledger

    echo "🔄 Starting Solana local validator in the background..."
    solana-test-validator --reset > test-ledger/validator.log 2>&1 &
    VALIDATOR_PID=$!

    # Capture the PID to ensure we can kill it later
    echo $VALIDATOR_PID > test-ledger/validator.pid
    STARTED_VALIDATOR=true

    # Wait for validator to start
    echo "⏳ Waiting for validator to start..."
    sleep 10

    # Check if validator is running
    echo "🔍 Verifying validator is running..."
    if ! solana cluster-version; then
        echo "❌ Error: Failed to start local validator."
        kill $VALIDATOR_PID 2>/dev/null || true
        exit 1
    fi

    echo "✅ Local validator running with PID $VALIDATOR_PID"
fi

# Set Solana config to use localhost
echo "⚙️ Configuring Solana to use localhost..."
solana config set --url localhost

# Export environment variables for Anchor provider
export ANCHOR_PROVIDER_URL=http://localhost:8899
# Assuming the default keypair path is used for testing, 
# otherwise, this needs to point to the correct test wallet keypair
export ANCHOR_WALLET=/root/.config/solana/id.json 

echo "⚓ Anchor environment variables set:"
echo "ANCHOR_PROVIDER_URL: $ANCHOR_PROVIDER_URL"
echo "ANCHOR_WALLET: $ANCHOR_WALLET"

# Build and deploy programs if not skipped
if [ "$SKIP_BUILD" = false ]; then
    echo "🔨 Building programs..."
    anchor build
    if [ $? -ne 0 ]; then
        echo "❌ Build failed. See errors above."
        exit 1
    fi
    
    echo "📦 Deploying programs to local validator..."
    anchor deploy
    if [ $? -ne 0 ]; then
        echo "❌ Deployment failed. See errors above."
        exit 1
    fi
    
    echo "✅ Programs built and deployed successfully!"
fi

# Verify program deployment if requested
if [ "$VERIFY_DEPLOY" = true ]; then
    echo "🔍 Verifying program deployment..."
    
    # Get program IDs from Anchor.toml
    HUB_PROGRAM_ID=$(grep "hub =" Anchor.toml | awk -F'"' '{print $2}')
    OFFER_PROGRAM_ID=$(grep "offer =" Anchor.toml | awk -F'"' '{print $2}')
    TRADE_PROGRAM_ID=$(grep "trade =" Anchor.toml | awk -F'"' '{print $2}')
    PRICE_PROGRAM_ID=$(grep "price =" Anchor.toml | awk -F'"' '{print $2}')
    PROFILE_PROGRAM_ID=$(grep "profile =" Anchor.toml | awk -F'"' '{print $2}')
    
    echo "Checking Hub program (${HUB_PROGRAM_ID})..."
    solana program show ${HUB_PROGRAM_ID} || { echo "❌ Hub program not deployed"; exit 1; }
    
    echo "Checking Offer program (${OFFER_PROGRAM_ID})..."
    solana program show ${OFFER_PROGRAM_ID} || { echo "❌ Offer program not deployed"; exit 1; }
    
    echo "Checking Trade program (${TRADE_PROGRAM_ID})..."
    solana program show ${TRADE_PROGRAM_ID} || { echo "❌ Trade program not deployed"; exit 1; }
    
    echo "Checking Price program (${PRICE_PROGRAM_ID})..."
    solana program show ${PRICE_PROGRAM_ID} || { echo "❌ Price program not deployed"; exit 1; }
    
    echo "Checking Profile program (${PROFILE_PROGRAM_ID})..."
    solana program show ${PROFILE_PROGRAM_ID} || { echo "❌ Profile program not deployed"; exit 1; }
    
    echo "✅ All programs verified as deployed!"
fi

# Run the specified test suite
echo "🛠️ Setting up test environment and running tests: $TEST_SUITE"
if [ "$SKIP_BUILD" = true ]; then
    echo "⏩ Running tests without build and deploy..."
    case $TEST_SUITE in
        "full-lifecycle")
            npm run setup-test-env:no-build && npm run test:direct:full-lifecycle
            ;;
        "integration")
            npm run setup-test-env:no-build && npm run test:direct:integration
            ;;
        "unit")
            npm run setup-test-env:no-build && npm run test:direct:unit
            ;;
        "hub")
            npm run setup-test-env:no-build && npm run test:direct:hub
            ;;
        "anchor")
            if [ "$USE_ANCHOR_CLIENT" = true ]; then
                npm run setup-test-env:no-build && npm run test:anchor
            else
                echo "❌ Anchor suite requires --anchor-client flag"
                exit 1
            fi
            ;;
        "all")
            npm run setup-test-env:no-build && npm run test:direct:all
            ;;
        *)
            echo "❌ Unknown test suite: $TEST_SUITE. Using default (full-lifecycle)."
            npm run setup-test-env:no-build && npm run test:direct:full-lifecycle
            ;;
    esac
else
    echo "⚙️ Running tests WITH build and deploy..."
    case $TEST_SUITE in
        "full-lifecycle")
            npm run setup-test-env:no-build && npm run test:direct:full-lifecycle
            ;;
        "integration")
            npm run setup-test-env:no-build && npm run test:direct:integration
            ;;
        "unit")
            npm run setup-test-env:no-build && npm run test:direct:unit
            ;;
        "hub")
            npm run setup-test-env:no-build && npm run test:direct:hub
            ;;
        "anchor")
            if [ "$USE_ANCHOR_CLIENT" = true ]; then
                npm run setup-test-env:no-build && npm run test:anchor
            else
                echo "❌ Anchor suite requires --anchor-client flag"
                exit 1
            fi
            ;;
        "all")
            npm run setup-test-env:no-build && npm run test:direct:all
            ;;
        *)
            echo "❌ Unknown test suite: $TEST_SUITE. Using default (full-lifecycle)."
            npm run setup-test-env:no-build && npm run test:direct:full-lifecycle
            ;;
    esac
fi

# Cleanup - stop the validator only if we started it
if [ "$STARTED_VALIDATOR" = true ]; then
    echo "🧹 Stopping local validator..."
    if [ -f test-ledger/validator.pid ]; then
        VALIDATOR_PID=$(cat test-ledger/validator.pid)
        kill $VALIDATOR_PID 2>/dev/null || true
        sleep 2
        # Extra cleanup check to make sure the validator is really stopped
        pkill -f solana-test-validator 2>/dev/null || true
    fi
    echo "✅ Cleaned up validator process"
else
    echo "✅ Leaving existing validator running"
fi

echo "✅ Tests completed for suite: $TEST_SUITE" 