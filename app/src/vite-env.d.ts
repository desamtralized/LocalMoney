/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BSC_HUB_ADDRESS: string
  readonly VITE_BSC_PROFILE_ADDRESS: string
  readonly VITE_BSC_OFFER_ADDRESS: string
  readonly VITE_BSC_TRADE_ADDRESS: string
  readonly VITE_BSC_ESCROW_ADDRESS: string
  readonly VITE_BSC_PRICE_ORACLE_ADDRESS: string
  readonly VITE_BSC_ARBITRATOR_MANAGER_ADDRESS: string
  readonly VITE_BSC_PRICE_PROVIDER_ADDRESS: string
  readonly VITE_BSC_LOCAL_MARKET_ADDRESS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}