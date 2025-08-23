import { ChainClient } from '~/network/Chain'

export function getExplorerUrl(chainClient: ChainClient, address: string): string {
  switch (chainClient) {
    case ChainClient.kujiraMainnet:
      return `https://finder.kujira.app/kaiyo-1/address/${address}`
    case ChainClient.kujiraTestnet:
      return `https://finder.kujira.app/harpoon-4/address/${address}`
    case ChainClient.juno:
      return `https://www.mintscan.io/juno/address/${address}`
    case ChainClient.terra:
      return `https://finder.terra.money/mainnet/address/${address}`
    case ChainClient.neutron:
      return `https://www.mintscan.io/neutron/address/${address}`
    case ChainClient.mantra:
      return `https://explorer.mantrachain.io/mantra-dukong/account/${address}`
    case ChainClient.cosmoshub:
      return `https://www.mintscan.io/cosmos/address/${address}`
    case ChainClient.dev:
      // For dev environment, default to Kujira testnet explorer
      return `https://finder.kujira.app/harpoon-4/address/${address}`
    default:
      // Fallback to Kujira mainnet explorer
      return `https://finder.kujira.app/kaiyo-1/address/${address}`
  }
}