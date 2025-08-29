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

// Deployed contract addresses on BSC Mainnet (Zero Fee Configuration with Offer Description Updates)
export const BSC_MAINNET_HUB_INFO: EVMHubInfo = {
  hubAddress: '0x27c6799e07f12bB90cf037eAbfD8bd0aA8345e01',
  profileAddress: '0x88dAd4bdf0465456CF916F994c2faD7b41501939',
  offerAddress: '0xe42b406Aca4b66597b215836BdAaDbF02f6d30f0',
  tradeAddress: '0x21D26b89d228bAa4597a87cffAbD7554FD8058A9',
  escrowAddress: '0xCd1BFEb7D0aAdA1e2CBbEEf7D1E3c84a08aFf01F',
  priceOracleAddress: '0xCc0f796822c58eed5F58BDf72DfC8433AdE66345',
  arbitratorManagerAddress: '0x79cAeB526AD74213ed3A923Ddc147720D21b4768',
  hubConfig: {
    profile_addr: '0x88dAd4bdf0465456CF916F994c2faD7b41501939',
    offer_addr: '0xe42b406Aca4b66597b215836BdAaDbF02f6d30f0',
    trade_addr: '0x21D26b89d228bAa4597a87cffAbD7554FD8058A9',
    escrow_addr: '0xCd1BFEb7D0aAdA1e2CBbEEf7D1E3c84a08aFf01F',
    price_addr: '0xCc0f796822c58eed5F58BDf72DfC8433AdE66345',
    price_oracle_addr: '0xCc0f796822c58eed5F58BDf72DfC8433AdE66345',
    price_provider_addr: '',
    local_denom: { native: 'USDT' }, // Using USDT as the stable token on BSC
    local_market_addr: '',
    chain_fee_collector_addr: '',
    warchest_addr: '0x5f6acb320B94b2A954dC0C28e037D5A761C76571',
    arbitration_fee_pct: 0, // 0% - Zero fees configuration
    burn_fee_pct: 0, // 0% - Zero fees configuration
    chain_fee_pct: 0, // 0% - Zero fees configuration
    warchest_fee_pct: 0, // 0% - Zero fees configuration
    active_offers_limit: 100,
    active_trades_limit: 100,
    trade_expiration_timer: 86400, // 24 hours in seconds
    platform_fee: 0, // 0% - Zero fees configuration
    platform_fee_recipient: '0x5f6acb320B94b2A954dC0C28e037D5A761C76571',
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