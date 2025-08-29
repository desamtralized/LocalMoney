import { 
  createPublicClient, 
  createWalletClient, 
  custom, 
  http, 
  type Address, 
  type Hash, 
  parseEther, 
  formatEther,
  parseUnits,
  formatUnits,
  encodeAbiParameters,
  decodeAbiResult,
  type Hex,
} from 'viem'
import { bsc, bscTestnet } from 'viem/chains'
import type { Coin } from '@cosmjs/stargate'
import type { Chain } from '~/network/Chain'
import { DefaultError, WalletNotConnected, WalletNotInstalled } from '~/network/chain-error'
import type {
  Addr,
  Arbitrator,
  Denom,
  DenomFiatPrice,
  FetchOffersArgs,
  FiatCurrency,
  HubConfig,
  NewTrade,
  OfferResponse,
  PatchOffer,
  PostOffer,
  Profile,
  TradeInfo,
  OfferState,
  OfferType,
  TradeState,
} from '~/types/components.interface'
import { denomToValue } from '~/utils/denom'
import { 
  HubABI, 
  ProfileABI, 
  OfferABI, 
  TradeABI, 
  PriceOracleABI, 
  EscrowABI, 
  ArbitratorManagerABI,
  ERC20ABI,
} from './abi'
import { TOKEN_ADDRESSES } from './tokenAddresses'

export interface EVMConfig {
  chainId: number
  chainName: string
  chainShortName: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  rpcUrl: string
  blockExplorerUrl: string
  blockExplorerName: string
}

export interface EVMHubInfo {
  hubAddress: string
  profileAddress: string
  offerAddress: string
  tradeAddress: string
  escrowAddress: string
  priceOracleAddress: string
  arbitratorManagerAddress?: string
  hubConfig: HubConfig
  additionalConfig?: any // Store additional config from Hub
}

export enum WalletType {
  METAMASK = 'metamask',
  PHANTOM = 'phantom',
}

interface MetaMaskProvider {
  isMetaMask?: boolean
  request: (args: { method: string; params?: any[] }) => Promise<any>
  on: (event: string, handler: (...args: any[]) => void) => void
  removeListener: (event: string, handler: (...args: any[]) => void) => void
}

interface PhantomProvider {
  isPhantom?: boolean
  ethereum?: {
    isPhantom?: boolean
    request: (args: { method: string; params?: any[] }) => Promise<any>
    on: (event: string, handler: (...args: any[]) => void) => void
    removeListener: (event: string, handler: (...args: any[]) => void) => void
  }
}

declare global {
  interface Window {
    ethereum?: MetaMaskProvider
    phantom?: PhantomProvider
  }
}

// Helper functions to map between contract and app types
function mapOfferState(state: number): OfferState {
  const stateMap = {
    0: 'active' as OfferState,
    1: 'paused' as OfferState,
    2: 'archive' as OfferState,  // Note: app uses 'archive' not 'archived'
  }
  return stateMap[state] || 'paused'
}

function mapOfferType(type: number): OfferType {
  return type === 0 ? 'buy' : 'sell'
}

function mapTradeState(state: number): TradeState {
  const stateMap = {
    0: 'request_created' as TradeState,
    1: 'request_accepted' as TradeState,
    2: 'fiat_deposited' as TradeState,
    3: 'escrow_released' as TradeState,
    4: 'escrow_refunded' as TradeState,
    5: 'request_cancelled' as TradeState,
    6: 'request_expired' as TradeState,
    7: 'dispute_opened' as TradeState,
    8: 'dispute_settled' as TradeState,
  }
  return stateMap[state] || 'request_cancelled'
}

export class EVMChain implements Chain {
  public config: EVMConfig
  protected hubInfo: EVMHubInfo
  protected walletType?: WalletType
  protected account?: Address
  protected publicClient?: any
  protected walletClient?: any

  constructor(config: EVMConfig, hubInfo: EVMHubInfo) {
    this.config = config
    this.hubInfo = hubInfo
  }

  async init() {
    const chain = this.config.chainId === 56 ? bsc : bscTestnet
    this.publicClient = createPublicClient({
      chain,
      transport: http(this.config.rpcUrl),
    })

    // Try to fetch hub configuration from contract
    // If the contract is not initialized, use the provided addresses
    try {
      console.log('Fetching Hub config from:', this.hubInfo.hubAddress)
      
      const config = await this.publicClient.readContract({
        address: this.hubInfo.hubAddress as Address,
        abi: HubABI,
        functionName: 'getConfig',
      })

      console.log('Hub config received:', config)

      // Update hubConfig with actual contract values
      if (config) {
        this.hubInfo.hubConfig = {
          ...this.hubInfo.hubConfig,
          profile_addr: config.profileContract,
          offer_addr: config.offerContract,
          trade_addr: config.tradeContract,
          escrow_addr: this.hubInfo.escrowAddress, // Use the address from config since Hub doesn't have escrow
          price_oracle_addr: config.priceContract,
          local_market_addr: config.localMarket,
          platform_fee: Number(config.burnFeePct || 0) + Number(config.chainFeePct || 0) + Number(config.warchestFeePct || 0), // Sum of fees
          platform_fee_recipient: config.treasury,
        }

        // Store additional config for later use
        this.hubInfo.additionalConfig = {
          priceProvider: config.priceProvider,
          localTokenAddress: config.localTokenAddress,
          chainFeeCollector: config.chainFeeCollector,
          swapRouter: config.swapRouter,
          fees: {
            burnFeePct: Number(config.burnFeePct || 0),
            chainFeePct: Number(config.chainFeePct || 0),
            warchestFeePct: Number(config.warchestFeePct || 0),
            conversionFeePct: Number(config.conversionFeePct || 0),
            arbitratorFeePct: Number(config.arbitratorFeePct || 0),
          },
          limits: {
            minTradeAmount: config.minTradeAmount?.toString() || '0',
            maxTradeAmount: config.maxTradeAmount?.toString() || '0',
            maxActiveOffers: config.maxActiveOffers?.toString() || '100',
            maxActiveTrades: config.maxActiveTrades?.toString() || '100',
          },
          timers: {
            tradeExpirationTimer: config.tradeExpirationTimer?.toString() || '86400',
            tradeDisputeTimer: config.tradeDisputeTimer?.toString() || '86400',
          },
          paused: {
            globalPause: config.globalPause || false,
            pauseNewTrades: config.pauseNewTrades || false,
            pauseDeposits: config.pauseDeposits || false,
            pauseWithdrawals: config.pauseWithdrawals || false,
          },
        }

        console.log('Hub config loaded from contract')
      }
    } catch (error: any) {
      // Check if it's a revert error (contract not initialized)
      if (error?.message?.includes('reverted') || error?.message?.includes('0x')) {
        console.warn('Hub contract not initialized yet, using provided addresses')
        // Use the addresses from the constructor
        this.hubInfo.hubConfig = {
          ...this.hubInfo.hubConfig,
          profile_addr: this.hubInfo.profileAddress,
          offer_addr: this.hubInfo.offerAddress,
          trade_addr: this.hubInfo.tradeAddress,
          escrow_addr: this.hubInfo.escrowAddress,
          price_oracle_addr: this.hubInfo.priceOracleAddress,
        }
      } else {
        console.error('Failed to fetch hub config:', error)
      }
    }
  }

  getName() {
    return this.config.chainName
  }

  getChainType() {
    return 'evm'
  }

  private getProvider(): MetaMaskProvider | undefined {
    if (this.walletType === WalletType.METAMASK && window.ethereum?.isMetaMask) {
      return window.ethereum
    }
    if (this.walletType === WalletType.PHANTOM && window.phantom?.ethereum) {
      return window.phantom.ethereum as MetaMaskProvider
    }
    return undefined
  }

  async connectWallet(walletType: WalletType = WalletType.METAMASK) {
    this.walletType = walletType
    const provider = this.getProvider()
    
    if (!provider) {
      throw new WalletNotInstalled()
    }

    try {
      // Request account access
      const accounts = await provider.request({ method: 'eth_requestAccounts' })
      
      if (accounts.length === 0) {
        throw new WalletNotConnected()
      }

      this.account = accounts[0] as Address
      
      // Switch to the correct chain
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${this.config.chainId.toString(16)}` }],
        })
      } catch (switchError: any) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${this.config.chainId.toString(16)}`,
                chainName: this.config.chainName,
                nativeCurrency: this.config.nativeCurrency,
                rpcUrls: [this.config.rpcUrl],
                blockExplorerUrls: [this.config.blockExplorerUrl],
              },
            ],
          })
        } else {
          throw switchError
        }
      }

      // Create wallet client
      const chain = this.config.chainId === 56 ? bsc : bscTestnet
      this.walletClient = createWalletClient({
        account: this.account,
        chain,
        transport: custom(provider),
      })

      // Set up event listeners
      provider.on('accountsChanged', this.handleAccountsChanged.bind(this))
      provider.on('chainChanged', this.handleChainChanged.bind(this))
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  private handleAccountsChanged(accounts: string[]) {
    if (accounts.length === 0) {
      this.disconnectWallet()
    } else {
      this.account = accounts[0] as Address
    }
  }

  private handleChainChanged(chainId: string) {
    // Reload the page to reset the state
    window.location.reload()
  }

  async disconnectWallet() {
    const provider = this.getProvider()
    if (provider) {
      provider.removeListener('accountsChanged', this.handleAccountsChanged.bind(this))
      provider.removeListener('chainChanged', this.handleChainChanged.bind(this))
    }
    this.account = undefined
    this.walletClient = undefined
    this.walletType = undefined
  }

  getHubConfig(): HubConfig {
    return this.hubInfo.hubConfig
  }

  getWalletAddress(): string {
    return this.account || 'undefined'
  }

  async fetchProfile(profile_addr?: Addr): Promise<Profile> {
    if (!this.publicClient) {
      await this.init()
    }

    const address = profile_addr || this.getWalletAddress()
    if (address === 'undefined') {
      throw new WalletNotConnected()
    }

    try {
      const result = await this.publicClient!.readContract({
        address: this.hubInfo.profileAddress as Address,
        abi: ProfileABI,
        functionName: 'getProfile',
        args: [address as Address],
      })

      return {
        addr: result.owner,
        contact: result.contact,
        encryption_key: result.encryptionKey ? Array.from(result.encryptionKey as Uint8Array) : null,
      }
    } catch (error) {
      // Profile doesn't exist, return empty profile
      return {
        addr: address,
        contact: '',
        encryption_key: null,
      }
    }
  }

  async fetchTokenBalance(denom: Denom): Promise<Coin> {
    if (!this.account || !this.publicClient) {
      throw new WalletNotConnected()
    }

    try {
      // For native token
      if (denom.native === 'BNB' || denom.native === 'tBNB') {
        const balance = await this.publicClient.getBalance({
          address: this.account,
        })
        return {
          denom: denom.native,
          amount: balance.toString(),
        }
      }

      // For ERC20 tokens
      const tokenAddresses = this.config.chainId === 56 ? TOKEN_ADDRESSES.BSC_MAINNET : TOKEN_ADDRESSES.BSC_TESTNET
      const tokenAddress = tokenAddresses[denom.native as keyof typeof tokenAddresses]

      if (tokenAddress) {
        const balance = await this.publicClient.readContract({
          address: tokenAddress as Address,
          abi: ERC20ABI,
          functionName: 'balanceOf',
          args: [this.account],
        })

        return {
          denom: denom.native,
          amount: balance.toString(),
        }
      }

      return {
        denom: denom.native || '',
        amount: '0',
      }
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  async fetchOffer(offerId: string): Promise<OfferResponse> {
    if (!this.publicClient) {
      await this.init()
    }

    try {
      const result = await this.publicClient.readContract({
        address: this.hubInfo.offerAddress as Address,
        abi: OfferABI,
        functionName: 'getOffer',
        args: [BigInt(offerId)],
      })

      return {
        id: result.id.toString(),
        owner: result.owner,
        offer_type: mapOfferType(result.offerType),
        fiat_currency: result.fiatCurrency as FiatCurrency,
        rate: result.rate.toString(),
        min_amount: result.minAmount.toString(),
        max_amount: result.maxAmount.toString(),
        state: mapOfferState(result.state),
        terms: result.terms,
        timestamp: result.createdAt.toString(),
      }
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  async fetchAllOffers(limit: number, last?: number): Promise<OfferResponse[]> {
    if (!this.publicClient) {
      await this.init()
    }

    try {
      // First get the array of offer IDs
      const offerIds = await this.publicClient.readContract({
        address: this.hubInfo.offerAddress as Address,
        abi: OfferABI,
        functionName: 'getAllActiveOffers',
      }) as bigint[]

      console.log('[EVMChain.fetchAllOffers] Active offer IDs:', offerIds.map(id => id.toString()))

      // Apply pagination to IDs
      const startIndex = last || 0
      const paginatedIds = offerIds.slice(startIndex, startIndex + limit)

      // Fetch details for each offer ID
      const offerPromises = paginatedIds.map(async (offerId) => {
        try {
          const offerData = await this.publicClient.readContract({
            address: this.hubInfo.offerAddress as Address,
            abi: OfferABI,
            functionName: 'getOffer',
            args: [offerId],
          }) as any

          // Convert amounts from wei (1e18) to micro-units (1e6) for frontend compatibility
          // Frontend expects amounts in micro-units like Cosmos chains (e.g., uatom)
          const minAmountInMicroUnits = offerData.minAmount / BigInt(1e12) // wei to micro-units
          const maxAmountInMicroUnits = offerData.maxAmount / BigInt(1e12) // wei to micro-units

          console.log(`[EVMChain.fetchAllOffers] Offer ${offerId} data:`, {
            id: offerData.id?.toString(),
            state: offerData.state,
            offerType: offerData.offerType,
            fiatCurrency: offerData.fiatCurrency,
            tokenAddress: offerData.tokenAddress,
            minAmountWei: offerData.minAmount.toString(),
            maxAmountWei: offerData.maxAmount.toString(),
            minAmountMicro: minAmountInMicroUnits.toString(),
            maxAmountMicro: maxAmountInMicroUnits.toString(),
          })

          return {
            offer: {
              id: offerData.id.toString(),
              owner: offerData.owner,
              offer_type: mapOfferType(offerData.offerType),
              fiat_currency: offerData.fiatCurrency as FiatCurrency,
              rate: offerData.rate.toString(),
              min_amount: minAmountInMicroUnits.toString(),
              max_amount: maxAmountInMicroUnits.toString(),
              state: mapOfferState(offerData.state),
              denom: offerData.tokenAddress === '0x0000000000000000000000000000000000000000' 
                ? { native: 'bnb' } 
                : { native: this.mapTokenAddressToDenom(offerData.tokenAddress) },
              terms: offerData.description,
              timestamp: offerData.createdAt.toString(),
            },
            profile: null, // Profile needs to be fetched separately if needed
          } as OfferResponse
        } catch (error) {
          console.error(`Failed to fetch offer ${offerId}:`, error)
          return null
        }
      })

      const offers = await Promise.all(offerPromises)
      return offers.filter((o): o is OfferResponse => o !== null)
    } catch (error) {
      console.error('Failed to fetch offers:', error)
      return []
    }
  }

  async fetchOffers(args: FetchOffersArgs, limit: number, last?: number): Promise<OfferResponse[]> {
    const allOffers = await this.fetchAllOffers(limit * 10, 0) // Fetch more to filter
    console.log('[EVMChain.fetchOffers] Total offers fetched:', allOffers.length)
    console.log('[EVMChain.fetchOffers] Filter args:', args)
    
    // Apply filters
    let filtered = allOffers

    if (args.offerType) {
      const beforeFilter = filtered.length
      filtered = filtered.filter(o => o.offer.offer_type === args.offerType)
      console.log(`[EVMChain.fetchOffers] After offerType filter (${args.offerType}): ${beforeFilter} -> ${filtered.length}`)
    }

    if (args.fiatCurrency) {
      const beforeFilter = filtered.length
      filtered = filtered.filter(o => o.offer.fiat_currency === args.fiatCurrency)
      console.log(`[EVMChain.fetchOffers] After fiatCurrency filter (${args.fiatCurrency}): ${beforeFilter} -> ${filtered.length}`)
    }

    if (args.denom) {
      const beforeFilter = filtered.length
      const denomStr = denomToValue(args.denom).toLowerCase()
      filtered = filtered.filter(o => {
        const offerDenomStr = denomToValue(o.offer.denom).toLowerCase()
        return offerDenomStr === denomStr
      })
      console.log(`[EVMChain.fetchOffers] After denom filter (${denomStr}): ${beforeFilter} -> ${filtered.length}`)
    }

    // Apply pagination
    const startIndex = last || 0
    const result = filtered.slice(startIndex, startIndex + limit)
    console.log(`[EVMChain.fetchOffers] Returning ${result.length} offers after pagination`)
    return result
  }

  async fetchMakerOffers(maker: Addr): Promise<OfferResponse[]> {
    if (!this.publicClient) {
      await this.init()
    }

    try {
      // First get the array of offer IDs
      const offerIds = await this.publicClient.readContract({
        address: this.hubInfo.offerAddress as Address,
        abi: OfferABI,
        functionName: 'getOffersByOwner',
        args: [maker as Address],
      }) as bigint[]

      // Fetch details for each offer ID
      const offerPromises = offerIds.map(async (offerId) => {
        try {
          const offerData = await this.publicClient.readContract({
            address: this.hubInfo.offerAddress as Address,
            abi: OfferABI,
            functionName: 'getOffer',
            args: [offerId],
          }) as any

          // Convert amounts from wei (1e18) to micro-units (1e6) for frontend compatibility
          const minAmountInMicroUnits = offerData.minAmount / BigInt(1e12)
          const maxAmountInMicroUnits = offerData.maxAmount / BigInt(1e12)

          return {
            offer: {
              id: offerData.id.toString(),
              owner: offerData.owner,
              offer_type: mapOfferType(offerData.offerType),
              fiat_currency: offerData.fiatCurrency as FiatCurrency,
              rate: offerData.rate.toString(),
              min_amount: minAmountInMicroUnits.toString(),
              max_amount: maxAmountInMicroUnits.toString(),
              state: mapOfferState(offerData.state),
              denom: offerData.tokenAddress === '0x0000000000000000000000000000000000000000' 
                ? { native: 'bnb' } 
                : { native: this.mapTokenAddressToDenom(offerData.tokenAddress) },
              terms: offerData.description,
              timestamp: offerData.createdAt.toString(),
            },
            profile: null, // Profile needs to be fetched separately if needed
          } as OfferResponse
        } catch (error) {
          console.error(`Failed to fetch offer ${offerId}:`, error)
          return null
        }
      })

      const offers = await Promise.all(offerPromises)
      return offers.filter((o): o is OfferResponse => o !== null)
    } catch (error) {
      console.error('Failed to fetch maker offers:', error)
      return []
    }
  }

  async fetchMyOffers(limit: number, last?: number): Promise<OfferResponse[]> {
    if (!this.account) {
      throw new WalletNotConnected()
    }

    const offers = await this.fetchMakerOffers(this.account)
    const startIndex = last || 0
    return offers.slice(startIndex, startIndex + limit)
  }

  async fetchOffersCountByStates(states: string[]): Promise<number> {
    const allOffers = await this.fetchAllOffers(1000, 0)
    return allOffers.filter(o => states.includes(o.offer.state)).length
  }

  async fetchAllFiatsOffersCount(states: string[]): Promise<Array<{ fiat: string; count: number }>> {
    const allOffers = await this.fetchAllOffers(1000, 0)
    const filtered = allOffers.filter(o => states.includes(o.offer.state))
    
    const counts = new Map<string, number>()
    filtered.forEach(offerResponse => {
      const current = counts.get(offerResponse.offer.fiat_currency) || 0
      counts.set(offerResponse.offer.fiat_currency, current + 1)
    })

    return Array.from(counts.entries()).map(([fiat, count]) => ({ fiat, count }))
  }

  async createOffer(postOffer: PostOffer): Promise<number> {
    if (!this.walletClient || !this.account) {
      throw new WalletNotConnected()
    }

    try {
      // Map denom to token address
      let tokenAddress: Address = '0x0000000000000000000000000000000000000000' // Default to native token (BNB)
      
      const denomStr = denomToValue(postOffer.denom)
      if (denomStr !== 'bnb') {
        const chainTokens = this.config.chainId === 56 ? TOKEN_ADDRESSES.BSC_MAINNET : TOKEN_ADDRESSES.BSC_TESTNET
        const denomUpperCase = denomStr.toUpperCase() as keyof typeof chainTokens
        tokenAddress = (chainTokens[denomUpperCase] || '0x0000000000000000000000000000000000000000') as Address
      }

      // Convert amounts from micro-units (1e6) to wei (1e18) for contract
      const minAmountInWei = BigInt(postOffer.min_amount) * BigInt(1e12)
      const maxAmountInWei = BigInt(postOffer.max_amount) * BigInt(1e12)

      const { request } = await this.publicClient.simulateContract({
        account: this.account,
        address: this.hubInfo.offerAddress as Address,
        abi: OfferABI,
        functionName: 'createOffer',
        args: [
          postOffer.offer_type === 'buy' ? 0 : 1,
          postOffer.fiat_currency,
          tokenAddress,
          minAmountInWei,
          maxAmountInWei,
          BigInt(postOffer.rate),
          postOffer.description || postOffer.terms || '',
        ],
      })

      const hash = await this.walletClient.writeContract(request)
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
      
      // Extract offer ID from events (assuming event is emitted)
      // For now, return a placeholder
      return Date.now()
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  async updateOffer(updateOffer: PatchOffer): Promise<void> {
    if (!this.walletClient || !this.account) {
      throw new WalletNotConnected()
    }

    try {
      // Handle state changes
      if (updateOffer.state) {
        const functionName = updateOffer.state === 'active' ? 'activateOffer' : 
                           updateOffer.state === 'paused' ? 'pauseOffer' : 'archiveOffer'
        
        const { request } = await this.publicClient.simulateContract({
          account: this.account,
          address: this.hubInfo.offerAddress as Address,
          abi: OfferABI,
          functionName,
          args: [BigInt(updateOffer.id)],
        })

        const hash = await this.walletClient.writeContract(request)
        await this.publicClient.waitForTransactionReceipt({ hash })
      }

      // Handle other updates
      if (updateOffer.rate || updateOffer.min_amount || updateOffer.max_amount) {
        // Get current offer to fill in missing values
        const current = await this.fetchOffer(updateOffer.id.toString())
        
        // Map the current state to uint8
        const stateMap = {
          'active': 0,
          'paused': 1,
          'deleted': 2,
          'archived': 2,
        }
        const currentState = stateMap[updateOffer.state || current.state] || 0
        
        const { request } = await this.publicClient.simulateContract({
          account: this.account,
          address: this.hubInfo.offerAddress as Address,
          abi: OfferABI,
          functionName: 'updateOffer',
          args: [
            BigInt(updateOffer.id),
            currentState,
            BigInt(updateOffer.rate || current.rate),
            BigInt(updateOffer.min_amount || current.min_amount),
            BigInt(updateOffer.max_amount || current.max_amount),
          ],
        })

        const hash = await this.walletClient.writeContract(request)
        await this.publicClient.waitForTransactionReceipt({ hash })
      }
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  async openTrade(trade: NewTrade): Promise<number> {
    if (!this.walletClient || !this.account) {
      throw new WalletNotConnected()
    }

    try {
      const { request } = await this.publicClient.simulateContract({
        account: this.account,
        address: this.hubInfo.tradeAddress as Address,
        abi: TradeABI,
        functionName: 'openTrade',
        args: [
          BigInt(trade.offer_id),
          BigInt(trade.amount),
          BigInt(trade.price),
          trade.taker_contact,
        ],
      })

      const hash = await this.walletClient.writeContract(request)
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
      
      // Extract trade ID from events
      return Date.now()
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  async fetchTrades(limit: number, last?: number): Promise<TradeInfo[]> {
    if (!this.account || !this.publicClient) {
      throw new WalletNotConnected()
    }

    try {
      const results = await this.publicClient.readContract({
        address: this.hubInfo.tradeAddress as Address,
        abi: TradeABI,
        functionName: 'getTradesByUser',
        args: [this.account],
      })

      const trades = results.map((result: any) => ({
        id: result.id.toString(),
        offer_id: result.offerId.toString(),
        buyer: result.buyer,
        seller: result.seller,
        amount: result.amount.toString(),
        price: result.price.toString(),
        state: mapTradeState(result.state),
        created_at: result.createdAt.toString(),
        expires_at: result.expiresAt.toString(),
        buyer_contact: result.buyerContact,
        seller_contact: result.sellerContact,
        terms: result.terms,
      }))

      // Apply pagination
      const startIndex = last || 0
      return trades.slice(startIndex, startIndex + limit)
    } catch (error) {
      console.error('Failed to fetch trades:', error)
      return []
    }
  }

  async fetchTradesCountByStates(states: string[]): Promise<number> {
    const trades = await this.fetchTrades(1000, 0)
    return trades.filter(t => states.includes(t.state)).length
  }

  async fetchAllFiatsTradesCount(states: string[]): Promise<Array<{ fiat: string; count: number }>> {
    // This would require fetching all trades and their associated offers
    // For now, return empty array
    return []
  }

  async fetchDisputedTrades(limit: number, last?: number): Promise<{ openDisputes: TradeInfo[]; closedDisputes: TradeInfo[] }> {
    const allTrades = await this.fetchTrades(limit * 2, last)
    const openDisputes = allTrades.filter(t => t.state === 'dispute_opened')
    const closedDisputes = allTrades.filter(t => t.state === 'dispute_settled')
    return { openDisputes, closedDisputes }
  }

  async fetchTradeDetail(tradeId: number): Promise<TradeInfo> {
    if (!this.publicClient) {
      await this.init()
    }

    try {
      const result = await this.publicClient.readContract({
        address: this.hubInfo.tradeAddress as Address,
        abi: TradeABI,
        functionName: 'getTrade',
        args: [BigInt(tradeId)],
      })

      return {
        id: result.id.toString(),
        offer_id: result.offerId.toString(),
        buyer: result.buyer,
        seller: result.seller,
        amount: result.amount.toString(),
        price: result.price.toString(),
        state: mapTradeState(result.state),
        created_at: result.createdAt.toString(),
        expires_at: result.expiresAt.toString(),
        buyer_contact: result.buyerContact,
        seller_contact: result.sellerContact,
        terms: result.terms,
      }
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  async fetchArbitrators(): Promise<Arbitrator[]> {
    // For EVM chains, arbitrators are currency-specific
    // This function returns empty array as arbitrators should be fetched per currency
    // Use fetchArbitratorsForCurrency() instead
    return []
  }

  async fetchArbitratorsForCurrency(currency: string): Promise<Arbitrator[]> {
    if (!this.publicClient || !this.hubInfo.arbitratorManagerAddress) {
      return []
    }

    try {
      // Get eligible arbitrators for the currency
      const arbitratorAddresses = await this.publicClient.readContract({
        address: this.hubInfo.arbitratorManagerAddress as Address,
        abi: ArbitratorManagerABI,
        functionName: 'getEligibleArbitrators',
        args: [currency],
      }) as Address[]

      // Fetch info for each arbitrator
      const arbitrators: Arbitrator[] = []
      for (const addr of arbitratorAddresses) {
        try {
          const info = await this.publicClient.readContract({
            address: this.hubInfo.arbitratorManagerAddress as Address,
            abi: ArbitratorManagerABI,
            functionName: 'getArbitratorInfo',
            args: [addr],
          }) as any

          if (info.isActive) {
            arbitrators.push({
              addr: addr,
              name: `Arbitrator ${addr.slice(0, 6)}...${addr.slice(-4)}`, // Default name
              bio: `Reputation: ${info.reputationScore / 100}%`,
              contact: info.encryptionKey || '',
            })
          }
        } catch (err) {
          console.warn(`Failed to fetch info for arbitrator ${addr}:`, err)
        }
      }

      return arbitrators
    } catch (error) {
      console.error('Failed to fetch arbitrators for currency:', error)
      return []
    }
  }

  async updateFiatPrice(fiat: FiatCurrency, denom: Denom): Promise<DenomFiatPrice> {
    // For EVM chains, fetch fiat exchange rates from the oracle
    if (!this.publicClient) {
      await this.init()
    }

    try {
      const denomStr = denomToValue(denom).toLowerCase()
      const isStablecoin = denomStr === 'usdt' || denomStr === 'usdc' || 
                          denomStr?.includes('usdt') || denomStr?.includes('usdc')
      
      if (fiat === 'USD' && isStablecoin) {
        // For USD stablecoins, price is always 1:1
        return {
          denom,
          price: '100000000', // 1 USD with 8 decimals
          fiat,
        }
      } else {
        // Validate price oracle address
        if (!this.hubInfo.priceOracleAddress || this.hubInfo.priceOracleAddress === '0x0000000000000000000000000000000000000000') {
          console.warn(`[EVMChain.updateFiatPrice] Price oracle address not configured for ${this.config.chainName}`)
          throw new Error('Price oracle not configured')
        }
        
        // Get fiat/USD exchange rate from oracle
        const fiatPrice = await this.publicClient.readContract({
          address: this.hubInfo.priceOracleAddress as Address,
          abi: PriceOracleABI,
          functionName: 'getFiatPrice',
          args: [fiat],
        })
        
        return {
          denom,
          price: fiatPrice.toString(),
          fiat,
        }
      }
    } catch (error: any) {
      // Don't log errors for known missing prices
      if (!error?.message?.includes('FiatPriceNotFound') && !error?.message?.includes('0x4a1e0a41')) {
        console.error(`Failed to fetch price for ${fiat}:`, error)
      }
      
      // For stablecoins, we can provide reasonable defaults
      const denomStr = denomToValue(denom).toLowerCase()
      const isStablecoin = denomStr === 'usdt' || denomStr === 'usdc' || 
                          denomStr?.includes('usdt') || denomStr?.includes('usdc')
      
      if (isStablecoin) {
        // Return 1:1 rate for USD, or a reasonable default for other fiats
        const defaultPrice = fiat === 'USD' ? '100000000' : '100000000' // 1 USD with 8 decimals
        return {
          denom,
          price: defaultPrice,
          fiat,
        }
      }
      
      return {
        denom,
        price: '100000000', // Default price
        fiat,
      }
    }
  }

  async batchUpdateFiatPrices(fiats: FiatCurrency[], denom: Denom): Promise<DenomFiatPrice[]> {
    // For EVM chains, fetch fiat exchange rates from the oracle
    if (!this.publicClient) {
      await this.init()
    }

    const results: DenomFiatPrice[] = []
    const denomStr = denomToValue(denom).toLowerCase()
    const isStablecoin = denomStr === 'usdt' || denomStr === 'usdc' || 
                        denomStr?.includes('usdt') || denomStr?.includes('usdc')
    
    // Check if oracle is configured
    if (!this.hubInfo.priceOracleAddress || this.hubInfo.priceOracleAddress === '0x0000000000000000000000000000000000000000') {
      console.warn(`Price oracle not configured for ${this.config.chainName}, using fallback prices`)
      
      // Return fallback prices for stablecoins
      if (isStablecoin) {
        return fiats.map(fiat => ({
          denom,
          price: '100000000', // 1 USD with 8 decimals
          fiat,
          success: false, // Mark as failed due to missing oracle
        }))
      }
      
      return []
    }
    
    for (const fiat of fiats) {
      try {
        if (fiat === 'USD' && isStablecoin) {
          // For USD stablecoins, price is always 1:1
          results.push({
            denom,
            price: '100000000', // 1 USD with 8 decimals
            fiat,
            success: true,
          })
        } else {
          // Get fiat/USD exchange rate from oracle
          const fiatPrice = await this.publicClient.readContract({
            address: this.hubInfo.priceOracleAddress as Address,
            abi: PriceOracleABI,
            functionName: 'getFiatPrice',
            args: [fiat],
          })
          
          // For stablecoins, the price in fiat is just the fiat/USD rate
          // Since 1 USDT = 1 USD, and we have X fiat = 1 USD
          // So 1 USDT = X fiat
          results.push({
            denom,
            price: fiatPrice.toString(),
            fiat,
            success: true,
          })
        }
      } catch (err: any) {
        // Don't log errors for known missing prices
        if (!err?.message?.includes('FiatPriceNotFound') && !err?.message?.includes('0x4a1e0a41')) {
          console.error(`Failed to fetch ${fiat} price:`, err)
        }
        
        // Return a fallback price based on whether it's a stablecoin
        const fallbackPrice = isStablecoin ? '100000000' : '100000000' // 1 USD with 8 decimals
        results.push({
          denom,
          price: fallbackPrice,
          fiat,
          success: false,
        })
      }
    }

    return results
  }

  async fetchFiatToUsdRate(fiat: FiatCurrency): Promise<number> {
    if (!this.publicClient) {
      await this.init()
    }

    try {
      const rate = await this.publicClient.readContract({
        address: this.hubInfo.priceOracleAddress as Address,
        abi: PriceOracleABI,
        functionName: 'getFiatPrice',
        args: [fiat],
      })

      // PriceOracle returns how many units of fiat equal 1 USD (with 8 decimals)
      // For example, COP = 405187890000 means 1 USD = 4051.8789 COP
      // For now, return the raw value - the client will handle formatting
      return Number(rate)
    } catch (error: any) {
      // Don't log FiatPriceNotFound errors - use defaults silently
      if (!error?.message?.includes('0x4a1e0a41') && !error?.message?.includes('0x8686a196')) {
        console.error('Failed to fetch fiat rate:', error)
      }
      return 1
    }
  }

  formatFiatPrice(rawPrice: string | number): number {
    // EVM returns prices with 8 decimal places
    // Example: 405187890000 means 1 USD = 4051.8789 COP
    // Example: 85627600 means 1 USD = 0.856276 EUR
    const priceAsBigInt = typeof rawPrice === 'string' ? BigInt(rawPrice) : BigInt(rawPrice)
    return Number(priceAsBigInt) / 100000000 // Convert from 8 decimals to decimal value
  }

  private mapTokenAddressToDenom(tokenAddress: string): string {
    // Map token addresses back to denoms
    const chainTokens = this.config.chainId === 56 ? TOKEN_ADDRESSES.BSC_MAINNET : TOKEN_ADDRESSES.BSC_TESTNET
    
    // Find the denom by matching the address
    for (const [denom, address] of Object.entries(chainTokens)) {
      if (address.toLowerCase() === tokenAddress.toLowerCase()) {
        return denom.toLowerCase()
      }
    }
    
    // Default to the address if no match found
    return tokenAddress
  }

  async acceptTradeRequest(tradeId: number, makerContact: string): Promise<void> {
    if (!this.walletClient || !this.account) {
      throw new WalletNotConnected()
    }

    try {
      // Get trade details to determine amount
      const trade = await this.fetchTradeDetail(tradeId)
      const offer = await this.fetchOffer(trade.offer_id)
      
      // Calculate amount to send (assuming seller needs to escrow)
      const amount = BigInt(trade.amount)

      const { request } = await this.publicClient.simulateContract({
        account: this.account,
        address: this.hubInfo.tradeAddress as Address,
        abi: TradeABI,
        functionName: 'acceptTrade',
        args: [BigInt(tradeId), makerContact],
        value: offer.offer_type === 'sell' ? amount : BigInt(0), // Send funds if seller
      })

      const hash = await this.walletClient.writeContract(request)
      await this.publicClient.waitForTransactionReceipt({ hash })
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  async cancelTradeRequest(tradeId: number): Promise<void> {
    if (!this.walletClient || !this.account) {
      throw new WalletNotConnected()
    }

    try {
      const { request } = await this.publicClient.simulateContract({
        account: this.account,
        address: this.hubInfo.tradeAddress as Address,
        abi: TradeABI,
        functionName: 'cancelTrade',
        args: [BigInt(tradeId)],
      })

      const hash = await this.walletClient.writeContract(request)
      await this.publicClient.waitForTransactionReceipt({ hash })
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  async fundEscrow(tradeInfo: TradeInfo, maker_contact?: string): Promise<void> {
    // This is handled in acceptTradeRequest for EVM
    await this.acceptTradeRequest(Number(tradeInfo.id), maker_contact || '')
  }

  async setFiatDeposited(tradeId: number): Promise<void> {
    if (!this.walletClient || !this.account) {
      throw new WalletNotConnected()
    }

    try {
      const { request } = await this.publicClient.simulateContract({
        account: this.account,
        address: this.hubInfo.tradeAddress as Address,
        abi: TradeABI,
        functionName: 'confirmFiatDeposit',
        args: [BigInt(tradeId)],
      })

      const hash = await this.walletClient.writeContract(request)
      await this.publicClient.waitForTransactionReceipt({ hash })
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  async releaseEscrow(tradeId: number): Promise<void> {
    if (!this.walletClient || !this.account) {
      throw new WalletNotConnected()
    }

    try {
      const { request } = await this.publicClient.simulateContract({
        account: this.account,
        address: this.hubInfo.tradeAddress as Address,
        abi: TradeABI,
        functionName: 'releaseFunds',
        args: [BigInt(tradeId)],
      })

      const hash = await this.walletClient.writeContract(request)
      await this.publicClient.waitForTransactionReceipt({ hash })
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  async refundEscrow(tradeId: number): Promise<void> {
    if (!this.walletClient || !this.account) {
      throw new WalletNotConnected()
    }

    try {
      const { request } = await this.publicClient.simulateContract({
        account: this.account,
        address: this.hubInfo.tradeAddress as Address,
        abi: TradeABI,
        functionName: 'refundFunds',
        args: [BigInt(tradeId)],
      })

      const hash = await this.walletClient.writeContract(request)
      await this.publicClient.waitForTransactionReceipt({ hash })
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  async openDispute(tradeId: number, buyerContact: string, sellerContact: string): Promise<void> {
    if (!this.walletClient || !this.account) {
      throw new WalletNotConnected()
    }

    try {
      const { request } = await this.publicClient.simulateContract({
        account: this.account,
        address: this.hubInfo.tradeAddress as Address,
        abi: TradeABI,
        functionName: 'openDispute',
        args: [BigInt(tradeId)],
      })

      const hash = await this.walletClient.writeContract(request)
      await this.publicClient.waitForTransactionReceipt({ hash })
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  async settleDispute(tradeId: number, winner: string): Promise<void> {
    if (!this.walletClient || !this.account) {
      throw new WalletNotConnected()
    }

    try {
      const { request } = await this.publicClient.simulateContract({
        account: this.account,
        address: this.hubInfo.tradeAddress as Address,
        abi: TradeABI,
        functionName: 'settleDispute',
        args: [BigInt(tradeId), winner as Address],
      })

      const hash = await this.walletClient.writeContract(request)
      await this.publicClient.waitForTransactionReceipt({ hash })
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }

  async newArbitrator(arbitrator: Arbitrator): Promise<void> {
    if (!this.walletClient || !this.account || !this.hubInfo.arbitratorManagerAddress) {
      throw new WalletNotConnected()
    }

    try {
      // For EVM, we need to provide supported currencies and encryption key
      // Support all configured fiat currencies from fiats-config.json
      const supportedCurrencies = [
        'USD', 'ARS', 'BRL', 'CAD', 'CLP', 'COP', 'EUR', 'GBP',
        'MXN', 'NGN', 'THB', 'VES', 'IDR', 'PHP', 'VND', 'MYR',
        'SGD', 'ZAR', 'EGP', 'KES'
      ]
      const encryptionKey = arbitrator.contact || '' // Use contact as encryption key for now

      const { request } = await this.publicClient.simulateContract({
        account: this.account,
        address: this.hubInfo.arbitratorManagerAddress as Address,
        abi: ArbitratorManagerABI,
        functionName: 'registerArbitrator',
        args: [supportedCurrencies, encryptionKey],
      })

      const hash = await this.walletClient.writeContract(request)
      await this.publicClient.waitForTransactionReceipt({ hash })
    } catch (error) {
      throw DefaultError.fromError(error)
    }
  }
}