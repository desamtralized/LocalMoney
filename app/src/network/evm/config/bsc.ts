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

// Deployed contract addresses on BSC Mainnet (Zero Fee Configuration)
export const BSC_MAINNET_HUB_INFO: EVMHubInfo = {
  hubAddress: '0xf4FcdA8CAf5d63781516Dea3A076E6c43E2ed9BA',
  profileAddress: '0xeD30d77f043610bE0F57aA32Ab5bcCEb7B330cBf',
  offerAddress: '0x3c98809073f76dC6d8581981E64fA69d34fb0eAF',
  tradeAddress: '0x9c9380A5054eA364Fc41f319dF397DF0E094Da4A',
  escrowAddress: '0x9ed1c2784B185A0614Ad1d51C2ffF61a7ef813cf',
  priceOracleAddress: '0x3f8f71c3A10907A196F427A3C98e01045f6008de',
  arbitratorManagerAddress: '0xe9Cc43Ad09958FaF8f3CfE92c1514A0736ff0392',
  hubConfig: {
    profile_addr: '0xeD30d77f043610bE0F57aA32Ab5bcCEb7B330cBf',
    offer_addr: '0x3c98809073f76dC6d8581981E64fA69d34fb0eAF',
    trade_addr: '0x9c9380A5054eA364Fc41f319dF397DF0E094Da4A',
    escrow_addr: '0x9ed1c2784B185A0614Ad1d51C2ffF61a7ef813cf',
    price_oracle_addr: '0x3f8f71c3A10907A196F427A3C98e01045f6008de',
    local_denom: { native: 'USDT' }, // Using USDT as the stable token on BSC
    local_market_addr: '',
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
    price_oracle_addr: '',
    local_denom: { native: 'BUSD' }, // Using BUSD as the stable token on BSC
    local_market_addr: '',
    platform_fee: 100, // 1% in basis points
    platform_fee_recipient: '0x0000000000000000000000000000000000000000',
  },
}