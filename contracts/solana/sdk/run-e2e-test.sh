#!/bin/bash

# LocalMoney SDK E2E Trading Flow Test Runner
echo "🚀 Running LocalMoney SDK E2E Trading Flow Test"
echo "==============================================="

# Parse command line arguments
DEPLOY_PROGRAMS=false
SHOW_HELP=false
for arg in "$@"; do
    case $arg in
        --deploy)
            DEPLOY_PROGRAMS=true
            shift
            ;;
        --help|-h)
            SHOW_HELP=true
            shift
            ;;
        *)
            # Unknown option
            ;;
    esac
done

# Show help if requested
if [ "$SHOW_HELP" = "true" ]; then
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --deploy    Deploy programs before running tests"
    echo "  --help, -h  Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                # Run tests with existing programs"
    echo "  $0 --deploy       # Deploy programs then run tests"
    echo ""
    exit 0
fi

# Navigate to SDK directory
cd "$(dirname "$0")"

# Check if solana-test-validator is available
if ! command -v solana-test-validator &> /dev/null; then
    echo "❌ solana-test-validator not found"
    echo "   Install Solana CLI tools first"
    exit 1
fi

echo "✅ solana-test-validator found"

# Check if validator is already running
if curl -s http://localhost:8899 > /dev/null 2>&1; then
    echo "✅ Local validator already running"
    VALIDATOR_RUNNING=true
else
    echo "⚡ Starting solana-test-validator..."
    
    # Start validator in background
    solana-test-validator --quiet --reset &
    VALIDATOR_PID=$!
    
    # Wait for validator to be ready
    echo "   Waiting for validator to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:8899 > /dev/null 2>&1; then
            echo "✅ Validator ready after ${i} seconds"
            VALIDATOR_RUNNING=true
            break
        fi
        sleep 1
    done
    
    if [ "$VALIDATOR_RUNNING" != "true" ]; then
        echo "❌ Validator failed to start after 30 seconds"
        kill $VALIDATOR_PID 2>/dev/null
        exit 1
    fi
fi

# Deploy programs if requested
if [ "$DEPLOY_PROGRAMS" = "true" ]; then
    # Create keypair if needed
    if [ ! -f ~/.config/solana/id.json ]; then
        echo "🔑 Creating deployment keypair..."
        solana-keygen new -o ~/.config/solana/id.json --no-bip39-passphrase --force > /dev/null
    fi

    # Airdrop SOL for deployment
    echo "💰 Funding deployment account..."
    solana airdrop 10 --url http://localhost:8899 > /dev/null 2>&1

    # Deploy programs
    echo "📦 Deploying programs..."
    cd ..
    anchor deploy --provider.cluster localnet > /dev/null 2>&1

    # Get deployed program IDs
    PROFILE_PROGRAM=$(solana address -k target/deploy/profile-keypair.json 2>/dev/null || echo "BMH3GaQKHbUG1X3wSASq6fN6qy8jRFf1WgdfMzaxWXmC")
    OFFER_PROGRAM=$(solana address -k target/deploy/offer-keypair.json 2>/dev/null || echo "D89P5L26y2wcLRYc5g3AgHVRpJiSGTWJZnrGGJoAiobj")
    TRADE_PROGRAM=$(solana address -k target/deploy/trade-keypair.json 2>/dev/null || echo "HjzdQZjxWcs514U2qiqecXuEGeMA2FnX9vAdDZPHUiwQ")
    PRICE_PROGRAM=$(solana address -k target/deploy/price-keypair.json 2>/dev/null || echo "AHDAzufTjFXHkJPrD85xoKMn9Cj4GRusWDQtZaG37dT")

    echo "✅ Programs deployed:"
    echo "   Profile: $PROFILE_PROGRAM"
    echo "   Offer:   $OFFER_PROGRAM"  
    echo "   Trade:   $TRADE_PROGRAM"
    echo "   Price:   $PRICE_PROGRAM"
    
    cd sdk
else
    echo "⏭️  Skipping program deployment (use --deploy flag to deploy)"
    
    # Use existing deployed program IDs (fallback to hardcoded ones)
    PROFILE_PROGRAM=$(solana address -k ../target/deploy/profile-keypair.json 2>/dev/null || echo "BMH3GaQKHbUG1X3wSASq6fN6qy8jRFf1WgdfMzaxWXmC")
    OFFER_PROGRAM=$(solana address -k ../target/deploy/offer-keypair.json 2>/dev/null || echo "D89P5L26y2wcLRYc5g3AgHVRpJiSGTWJZnrGGJoAiobj")
    TRADE_PROGRAM=$(solana address -k ../target/deploy/trade-keypair.json 2>/dev/null || echo "HjzdQZjxWcs514U2qiqecXuEGeMA2FnX9vAdDZPHUiwQ")
    PRICE_PROGRAM=$(solana address -k ../target/deploy/price-keypair.json 2>/dev/null || echo "AHDAzufTjFXHkJPrD85xoKMn9Cj4GRuswDQtZaG37dT")
    
    echo "📋 Using existing programs:"
    echo "   Profile: $PROFILE_PROGRAM"
    echo "   Offer:   $OFFER_PROGRAM"
    echo "   Trade:   $TRADE_PROGRAM"  
    echo "   Price:   $PRICE_PROGRAM"
fi

# Run the E2E test
echo ""
echo "🧪 Running E2E Trading Flow Test..."
echo "=================================="

# Restrict Jest to integration tests to avoid unrelated unit test TS errors
INTEGRATION_TESTS=true npm run test:integration -- --testNamePattern="should execute complete trading flow"

TEST_EXIT_CODE=$?

# Clean up validator if we started it
if [ ! -z "$VALIDATOR_PID" ]; then
    echo ""
    echo "🛑 Stopping validator..."
    kill $VALIDATOR_PID 2>/dev/null
    wait $VALIDATOR_PID 2>/dev/null
    echo "✅ Validator stopped"
fi

echo ""
echo "==============================================="
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ E2E Trading Flow Test PASSED!"
    echo ""
    echo "🎉 The SDK successfully executed a complete trading workflow:"
    echo "   • Created trade request"
    echo "   • Accepted trade request" 
    echo "   • Funded escrow account"
    echo "   • Marked fiat as deposited"
    echo "   • Released escrow funds"
    echo ""
    echo "📋 All 5 transaction steps completed successfully!"
else
    echo "❌ E2E Trading Flow Test failed"
    echo ""
    echo "💡 This may be expected if:"
    echo "   • Programs need account structure updates"
    echo "   • Required accounts are missing"
    echo "   • IDL types need synchronization"
    echo ""
    echo "🔧 Try running with fresh program deployment:"
    echo "   $0 --deploy"
fi

exit $TEST_EXIT_CODE
