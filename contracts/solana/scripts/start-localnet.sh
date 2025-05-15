#!/bin/bash

# Exit on error
set -e

# Function to cleanup background processes on exit
cleanup() {
    echo "Cleaning up..."
    if [ -n "$VALIDATOR_PID" ]; then
        kill $VALIDATOR_PID 2>/dev/null || true
    fi
}

# Register the cleanup function
trap cleanup EXIT

echo "Starting local test environment..."

# Check if solana-test-validator is already running
if pgrep -x "solana-test-val" > /dev/null; then
    echo "Solana test validator is already running. Killing existing instance..."
    pkill -x "solana-test-val" || true
    sleep 2
fi

# Create test ledger directory if it doesn't exist
mkdir -p .anchor/test-ledger

# Start the local validator with required programs
echo "Starting Solana test validator..."
solana-test-validator \
    --reset \
    --quiet \
    --bpf-program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA BPFLoader2111111111111111111111111111111111 \
    --clone metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s \
    --ledger .anchor/test-ledger \
    --rpc-port 8899 \
    --bind-address 127.0.0.1 &

VALIDATOR_PID=$!

# Wait for validator to start
echo "Waiting for validator to start..."
sleep 5

# Build all programs
echo "Building programs..."
anchor build

# Run the tests
echo "Running tests..."
anchor test --skip-local-validator

# Keep validator running unless script is interrupted
wait $VALIDATOR_PID 