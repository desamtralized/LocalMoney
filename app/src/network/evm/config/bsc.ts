import type { EVMConfig, EVMHubInfo } from '../EVMChain'

export const BSC_MAINNET_CONFIG: EVMConfig = {
  chainId: 56,
  chainName: 'BNB Smart Chain',
  chainShortName: 'BSC',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18,
  },
  rpcUrl: 'https://bsc-rpc.publicnode.com', // More reliable public RPC
  blockExplorerUrl: 'https://bscscan.com',
  blockExplorerName: 'BscScan',
}

export const BSC_TESTNET_CONFIG: EVMConfig = {
  chainId: 97,
  chainName: 'BNB Smart Chain Testnet',
  chainShortName: 'BSC Testnet',
  nativeCurrency: {
    name: 'tBNB',
    symbol: 'tBNB',
    decimals: 18,
  },
  rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
  blockExplorerUrl: 'https://testnet.bscscan.com',
  blockExplorerName: 'BscScan Testnet',
}

// Deployed contract addresses on BSC Mainnet (2025-08-31 Redeployment - With Description Support)
export const BSC_MAINNET_HUB_INFO: EVMHubInfo = {
  hubAddress: import.meta.env.VITE_BSC_HUB_ADDRESS || '0x45Ea91961F00fD0452273Aa4DB128e07B2FC9E9c',
  profileAddress: import.meta.env.VITE_BSC_PROFILE_ADDRESS || '0x4D5Ff987926159C27CF40d2B14580C1A164E81bf',
  offerAddress: import.meta.env.VITE_BSC_OFFER_ADDRESS || '0x8057C2fc06B5C1ceB0A7D723D75d672eE52AB914',
  tradeAddress: import.meta.env.VITE_BSC_TRADE_ADDRESS || '0xFEfC8C3A108D44C9cCc2E1559796dfAa408ed361',
  escrowAddress: import.meta.env.VITE_BSC_ESCROW_ADDRESS || '0xCE0Db55B56df81adEbdBFB548C5f59379435a1b0',
  priceOracleAddress: import.meta.env.VITE_BSC_PRICE_ORACLE_ADDRESS || '0x89876349f314255bD06bC5C354662d0dA6D1E58d',
  arbitratorManagerAddress: import.meta.env.VITE_BSC_ARBITRATOR_MANAGER_ADDRESS || '0x9bD53D5F0C91cF20a820080bB681c13F45F3F571',
  hubConfig: {
    profile_addr: import.meta.env.VITE_BSC_PROFILE_ADDRESS || '0x4D5Ff987926159C27CF40d2B14580C1A164E81bf',
    offer_addr: import.meta.env.VITE_BSC_OFFER_ADDRESS || '0x8057C2fc06B5C1ceB0A7D723D75d672eE52AB914',
    trade_addr: import.meta.env.VITE_BSC_TRADE_ADDRESS || '0xFEfC8C3A108D44C9cCc2E1559796dfAa408ed361',
    escrow_addr: import.meta.env.VITE_BSC_ESCROW_ADDRESS || '0xCE0Db55B56df81adEbdBFB548C5f59379435a1b0',
    price_addr: import.meta.env.VITE_BSC_PRICE_ORACLE_ADDRESS || '0x89876349f314255bD06bC5C354662d0dA6D1E58d',
    price_oracle_addr: import.meta.env.VITE_BSC_PRICE_ORACLE_ADDRESS || '0x89876349f314255bD06bC5C354662d0dA6D1E58d',
    price_provider_addr: import.meta.env.VITE_BSC_PRICE_PROVIDER_ADDRESS || '0x6d16709103235a95Dd314DaFaD37E6594298BD52',
    local_denom: { native: 'USDT' }, // Using USDT as the stable token on BSC
    local_market_addr: import.meta.env.VITE_BSC_LOCAL_MARKET_ADDRESS || '0x6d16709103235a95Dd314DaFaD37E6594298BD52',
    chain_fee_collector_addr: import.meta.env.VITE_BSC_PRICE_PROVIDER_ADDRESS || '0x6d16709103235a95Dd314DaFaD37E6594298BD52',
    warchest_addr: import.meta.env.VITE_BSC_PRICE_PROVIDER_ADDRESS || '0x6d16709103235a95Dd314DaFaD37E6594298BD52',
    arbitration_fee_pct: 0, // 0% - Zero fees configuration
    burn_fee_pct: 0, // 0% - Zero fees configuration
    chain_fee_pct: 0, // 0% - Zero fees configuration
    warchest_fee_pct: 0, // 0% - Zero fees configuration
    active_offers_limit: 100,
    active_trades_limit: 100,
    trade_expiration_timer: 86400, // 24 hours in seconds
    platform_fee: 0, // 0% - Zero fees configuration
    platform_fee_recipient: import.meta.env.VITE_BSC_PRICE_PROVIDER_ADDRESS || '0x6d16709103235a95Dd314DaFaD37E6594298BD52',
  },
}

export const BSC_TESTNET_HUB_INFO: EVMHubInfo = {
  hubAddress: '0x0000000000000000000000000000000000000000', // Replace with actual deployed Hub contract
  profileAddress: '0x0000000000000000000000000000000000000000', // Replace with actual deployed Profile contract
  offerAddress: '0x0000000000000000000000000000000000000000', // Replace with actual deployed Offer contract
  tradeAddress: '0x0000000000000000000000000000000000000000', // Replace with actual deployed Trade contract
  escrowAddress: '0x0000000000000000000000000000000000000000', // Replace with actual deployed Escrow contract
  priceOracleAddress: '0x0000000000000000000000000000000000000000', // Replace with actual deployed PriceOracle contract
  hubConfig: {
    profile_addr: '',
    offer_addr: '',
    trade_addr: '',
    escrow_addr: '',
    price_addr: '',
    price_oracle_addr: '',
    price_provider_addr: '',
    local_denom: { native: 'BUSD' }, // Using BUSD as the stable token on BSC
    local_market_addr: '',
    chain_fee_collector_addr: '',
    warchest_addr: '',
    arbitration_fee_pct: 0.01, // 1%
    burn_fee_pct: 0.003, // 0.3%
    chain_fee_pct: 0.003, // 0.3%
    warchest_fee_pct: 0.004, // 0.4%
    active_offers_limit: 100,
    active_trades_limit: 100,
    trade_expiration_timer: 86400, // 24 hours in seconds
    platform_fee: 100, // 1% in basis points
    platform_fee_recipient: '0x0000000000000000000000000000000000000000',
  },
}