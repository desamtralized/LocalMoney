import type { CosmosConfig, HubInfo } from '~/network/cosmos/config'

export const MANTRA_CONFIG: CosmosConfig = {
  chainId: 'mantra-dukong-1',
  chainName: 'Mantra Testnet',
  lcdUrl: 'https://api.dukong.mantrachain.io/',
  rpcUrl: 'https://rpc.dukong.mantrachain.io/',
  addressPrefix: 'mantra',
  coinDenom: 'om',
  coinMinimalDenom: 'uom',
  coinDecimals: 6,
}

export const MANTRA_HUB_INFO: HubInfo = {
  hubAddress: 'mantra1s2phzqhdejh52fnzws45q5k5dggha5zs5fu74lv5vk0w9aewgreq7pe8jf',
  hubConfig: {
    offer_addr: 'mantra1txmmx9xd8677nfthqv3cr4ywr2ym4vxdc975z5g442s2y8gr246s57p048',
    trade_addr: 'mantra12a07r8wjllfyt8hs75z3z2lhssjp4s43tgk2hhlyeaaftymmyyeq2atj3y',
    profile_addr: 'mantra1wgmkuwkj3mwdvhnwlcf7s8vtx3240fr9uksv428pgqjt5h79fqtsdey35n',
    price_addr: 'mantra19k7tke6p2vntun2zmaslur064jywcpljl94auyvfyqn5q6ak6t5qqqqd8h',
    price_provider_addr: 'mantra1cc0jfcd3rv3d36g6m575mdk8p2nmdjgnaf7ngq', // deployer address for now
    local_market_addr: 'mantra1cc0jfcd3rv3d36g6m575mdk8p2nmdjgnaf7ngq', // deployer address for now
    local_denom: {
      native: 'uom',
    },
    chain_fee_collector_addr: 'mantra1cc0jfcd3rv3d36g6m575mdk8p2nmdjgnaf7ngq', // deployer address for now
    warchest_addr: 'mantra1cc0jfcd3rv3d36g6m575mdk8p2nmdjgnaf7ngq', // deployer address for now
    active_offers_limit: 4,
    active_trades_limit: 20,
    arbitration_fee_pct: 0.01,
    burn_fee_pct: 0.005,
    chain_fee_pct: 0.01,
    warchest_fee_pct: 0.005,
    trade_expiration_timer: 86400,
    trade_dispute_timer: 86400,
    trade_limit_min: { denom: 'uom', amount: '1000000' },
    trade_limit_max: { denom: 'uom', amount: '100000000000' },
  },
}