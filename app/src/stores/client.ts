import { acceptHMRUpdate, defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'
import type { Coin } from '@cosmjs/stargate'
import axios from 'axios'
import { ListResult } from './ListResult'
import { ChainClient, chainFactory } from '~/network/Chain'
import type { ChainError } from '~/network/chain-error'
import { WalletNotConnected } from '~/network/chain-error'
import type {
  Addr,
  Arbitrator,
  Denom,
  FetchOffersArgs,
  FiatCurrency,
  HubConfig,
  NewTrade,
  OfferResponse,
  OfferType,
  PatchOffer,
  PostOffer,
  Profile,
  TradeInfo,
  UserWallet,
} from '~/types/components.interface'
import { LoadingState, OfferState, TradeState } from '~/types/components.interface'
import type { Secrets } from '~/utils/crypto'
import { encryptData, generateKeys } from '~/utils/crypto'
import { denomToValue } from '~/utils/denom'
import { CRYPTO_DECIMAL_PLACES } from '~/utils/constants'
import { OfferEvents, TradeEvents, toOfferData, toTradeData, trackOffer, trackTrade } from '~/analytics/analytics'

const LIMIT_ITEMS_PER_PAGE = 10

export const useClientStore = defineStore({
  id: 'client',
  state: () => {
    return {
      chainClient: ChainClient.cosmoshub,
      client: chainFactory(ChainClient.cosmoshub),
      applicationConnected: useLocalStorage('walletAlreadyConnected', false),
      userWallet: <UserWallet>{ isConnected: false, address: 'undefined' },
      secrets: useLocalStorage('secrets', new Map<string, Secrets>()),
      profile: <Profile>{},
      localBalance: <Coin>{},
      fiatPrices: new Map<String, Map<String, number>>(),
      fiatExchangeRates: new Map<String, number>(), // Store fiat to USD exchange rates
      offers: <ListResult<OfferResponse>>ListResult.loading(),
      makerOffers: <ListResult<OfferResponse>>ListResult.loading(),
      myOffers: <ListResult<OfferResponse>>ListResult.loading(),
      trades: <ListResult<TradeInfo>>ListResult.loading(),
      arbitrators: <ListResult<Arbitrator>>ListResult.loading(),
      openDisputes: <ListResult<TradeInfo>>ListResult.loading(),
      closedDisputes: <ListResult<TradeInfo>>ListResult.loading(),
      loadingState: <LoadingState>LoadingState.dismiss(),
    }
  },
  actions: {
    /**
     * Set the blockchain
     * @param {ChainClient} chainClient - The Blockchain backend to connect to
     */
    async setClient(chainClient: ChainClient) {
      this.$reset()
      // TODO disconnect old chain adapter
      this.chainClient = chainClient
      this.client = chainFactory(this.chainClient)
      await this.client.init()
      if (this.applicationConnected) {
        await this.connectWallet()
      }
    },
    async connectWallet() {
      try {
        await this.client.connectWallet()
        const address = this.client.getWalletAddress()
        await this.syncSecrets(address)
        this.userWallet = { isConnected: true, address }
        await this.fetchBalances()
        this.applicationConnected = true
        await this.fetchArbitrators()
      } catch (e) {
        this.userWallet = { isConnected: false, address: 'undefined' }
        this.handle.error(e)
      }
    },
    async fetchBalances() {
      await this.fetchLocalBalance()
    },
    async fetchLocalBalance() {
      // Todo we should change this to get the LOCAL denom from some config
      let localDenom: Denom
      if (this.chainClient === ChainClient.kujiraMainnet) {
        localDenom = { native: 'factory/kujira1swkuyt08z74n5jl7zr6hx0ru5sa2yev5v896p6/local' }
      } else {
        localDenom = { native: 'factory/kujira12w0ua4eqnkk0aahtnjlt6h3dhxael6x25s507w/local' }
      }

      this.localBalance = await this.client.fetchTokenBalance(localDenom)
    },
    async disconnectWallet() {
      await this.client.disconnectWallet()
      this.userWallet = { isConnected: false, address: 'undefined' }
      this.applicationConnected = false
    },
    getHubConfig(): HubConfig {
      return this.client.getHubConfig()
    },
    async fetchProfile() {
      this.profile = await this.client.fetchProfile()
    },
    async syncSecrets(address: string) {
      await this.fetchProfile()
      const secrets = this.secrets.get(address) ?? (await generateKeys())
      console.log(`${address} - secrets: `, secrets)
      if (!this.secrets.has(address)) {
        this.secrets.set(address, secrets)
      }
    },
    getSecrets() {
      const address = this.userWallet.address
      const userSecrets = this.secrets.get(address)
      if (userSecrets === undefined) {
        throw new WalletNotConnected()
      }
      return userSecrets!
    },
    async fetchMakerProfile(maker: Addr) {
      return await this.client.fetchProfile(maker)
    },
    async fetchMakerOffers(maker: Addr) {
      this.makerOffers = ListResult.loading()
      try {
        let offers = await this.client.fetchMakerOffers(maker)
        offers = offers.filter(({ offer }) => offer.state === OfferState.active)
        
        // Fetch exchange rates for all unique fiat currencies
        const uniqueFiatCurrencies = new Set(offers.map(({ offer }) => offer.fiat_currency))
        for (const fiat of uniqueFiatCurrencies) {
          if (fiat !== 'USD' && !this.fiatExchangeRates.has(fiat)) {
            await this.fetchFiatToUsdRate(fiat)
          }
        }
        
        for (const { offer } of offers) {
          await this.updateFiatPrice(offer.fiat_currency, offer.denom)
        }
        this.makerOffers = ListResult.success(offers)
      } catch (e) {
        this.makerOffers = ListResult.error(e as ChainError)
      }
    },
    async fetchOffers(offersArgs: FetchOffersArgs) {
      this.offers = ListResult.loading()
      try {
        const offers = await this.client.fetchOffers(offersArgs, LIMIT_ITEMS_PER_PAGE)
        
        // Fetch exchange rate for the fiat currency if not USD
        if (offersArgs.fiatCurrency && offersArgs.fiatCurrency !== 'USD' && !this.fiatExchangeRates.has(offersArgs.fiatCurrency)) {
          await this.fetchFiatToUsdRate(offersArgs.fiatCurrency)
        }
        
        this.offers = ListResult.success(offers, LIMIT_ITEMS_PER_PAGE)
      } catch (e) {
        this.offers = ListResult.error(e as ChainError)
      }
    },

    // We can improve this code if we return the total amount of offers from the protocol
    async fetchMoreOffers(offersArgs: FetchOffersArgs, last?: number) {
      this.offers.setLoadingMore()
      try {
        const offers = await this.client.fetchOffers(offersArgs, LIMIT_ITEMS_PER_PAGE, last)
        this.offers.addMoreItems(offers, LIMIT_ITEMS_PER_PAGE)
      } catch (e) {
        this.handle.error(e)
      }
    },
    async fetchMyOffers() {
      this.myOffers = ListResult.loading()
      try {
        const myOffers = await this.client.fetchMyOffers(LIMIT_ITEMS_PER_PAGE)
        this.myOffers = ListResult.success(myOffers, LIMIT_ITEMS_PER_PAGE)
      } catch (e) {
        this.myOffers = ListResult.error(e as ChainError)
      }
    },
    // We can improve this code if we return the total amount of my offers from the protocol
    async fetchMoreMyOffers(last: number) {
      this.myOffers.setLoadingMore()
      try {
        const myOffers = await this.client.fetchMyOffers(LIMIT_ITEMS_PER_PAGE, last)
        this.myOffers.addMoreItems(myOffers, LIMIT_ITEMS_PER_PAGE)
      } catch (e) {
        this.handle.error(e)
      }
    },
    async createOffer(param: {
      telegram_handle: string
      offer_type: OfferType
      fiat_currency: FiatCurrency
      rate: string
      denom: Denom
      min_amount: number
      max_amount: number
      description: string
    }) {
      this.loadingState = LoadingState.show('Creating Offer...')
      try {
        // Encrypt contact to save on the profile when an offer is created
        const owner_encryption_key = this.getSecrets().publicKey
        const owner_contact = await encryptData(owner_encryption_key, param.telegram_handle)
        // Use BigInt to avoid floating point precision issues when converting to micro-units
        const minAmountInMicroUnits = BigInt(Math.round(param.min_amount * CRYPTO_DECIMAL_PLACES))
        const maxAmountInMicroUnits = BigInt(Math.round(param.max_amount * CRYPTO_DECIMAL_PLACES))
        const postOffer = {
          ...param,
          min_amount: minAmountInMicroUnits.toString(),
          max_amount: maxAmountInMicroUnits.toString(),
          owner_contact,
          owner_encryption_key,
        } as PostOffer
        const offerId = await this.client.createOffer(postOffer)
        trackOffer(OfferEvents.created, toOfferData(offerId, postOffer, this.chainClient))
        await this.fetchProfile()
        await this.fetchMyOffers()
      } catch (e) {
        this.handle.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async updateOffer(updateOffer: PatchOffer) {
      this.loadingState = LoadingState.show('Updating Offer...')
      try {
        await this.client.updateOffer(updateOffer)
        trackOffer(OfferEvents.updated, toOfferData(updateOffer.id, updateOffer, this.chainClient))
        await this.fetchMyOffers()
      } catch (e) {
        this.handle.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async unarchiveOffer(updateOffer: PatchOffer) {
      this.loadingState = LoadingState.show('Archiving Offer...')
      try {
        updateOffer.state = OfferState.paused
        await this.client.updateOffer(updateOffer)
        trackOffer(OfferEvents.unarchived, toOfferData(updateOffer.id, updateOffer, this.chainClient))
        await this.fetchMyOffers()
      } catch (e) {
        this.handle.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async openTrade(offerResponse: OfferResponse, telegramHandle: string, amount: number) {
      this.loadingState = LoadingState.show('Opening trade...')
      try {
        const profile_taker_encryption_key = this.getSecrets().publicKey
        if (!profile_taker_encryption_key) {
          throw new Error('Your profile does not have an encryption key. Please reconnect your wallet.')
        }
        
        // Handle cases where the offer creator's profile doesn't have an encryption key
        let taker_contact: string
        if (offerResponse.profile?.encryption_key) {
          try {
            taker_contact = await encryptData(offerResponse.profile.encryption_key, telegramHandle)
          } catch (e) {
            console.warn('Failed to encrypt contact for maker, using plaintext fallback:', e)
            // Fallback to plaintext if encryption fails
            taker_contact = telegramHandle
          }
        } else {
          console.warn('Offer profile does not have an encryption key, using plaintext contact')
          // If no encryption key, use plaintext
          taker_contact = telegramHandle
        }
        
        const profile_taker_contact = await encryptData(profile_taker_encryption_key, telegramHandle)
        // Use BigInt to avoid floating point precision issues when converting to micro-units
        const amountInMicroUnits = BigInt(Math.round(amount * CRYPTO_DECIMAL_PLACES))
        const newTrade: NewTrade = {
          offer_id: offerResponse.offer.id,
          amount: amountInMicroUnits.toString(),
          taker: `${this.userWallet.address}`,
          profile_taker_contact,
          taker_contact,
          profile_taker_encryption_key,
        }
        const trade_id = await this.client.openTrade(newTrade)
        const tradeInfo = await this.fetchTradeDetail(trade_id)
        trackTrade(TradeEvents.created, toTradeData(tradeInfo.trade, tradeInfo.offer.offer, this.chainClient))
        this.notifyOnBot({ ...tradeInfo.trade, state: TradeState.request_created })
        await this.fetchProfile()
        const route = isNaN(trade_id) ? { name: 'Trades' } : { name: 'TradeDetail', params: { id: trade_id } }
        await this.router.push(route)
      } catch (e) {
        this.handle.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async fetchTrades() {
      this.trades = ListResult.loading()
      try {
        const tradesList = await this.client.fetchTrades(LIMIT_ITEMS_PER_PAGE)
        this.trades = ListResult.success(tradesList, LIMIT_ITEMS_PER_PAGE)
      } catch (e) {
        this.trades = ListResult.error(e as ChainError)
      }
    },
    async fetchMoreTrades(last: number) {
      this.trades.setLoadingMore()
      try {
        const trades = await this.client.fetchTrades(LIMIT_ITEMS_PER_PAGE, last)
        this.trades.addMoreItems(trades, LIMIT_ITEMS_PER_PAGE)
      } catch (e) {
        this.handle.error(e)
      }
    },
    async fetchTradeDetail(tradeId: number) {
      return await this.client.fetchTradeDetail(tradeId)
    },
    async fetchArbitrators() {
      this.arbitrators = ListResult.loading()
      try {
        const arbitratorsList = await this.client.fetchArbitrators()
        this.arbitrators = ListResult.success(arbitratorsList)
      } catch (e) {
        this.arbitrators = ListResult.error(e as ChainError)
      }
    },
    async fetchDisputedTrades(limit = 30, last?: number) {
      this.openDisputes = ListResult.loading()
      this.closedDisputes = ListResult.loading()
      try {
        const disputedTrades = await this.client.fetchDisputedTrades(limit, last)
        this.openDisputes = ListResult.success(disputedTrades.openDisputes)
        this.closedDisputes = ListResult.success(disputedTrades.closedDisputes)
      } catch (e) {
        console.error(e)
      }
    },
    async updateFiatPrice(fiat: FiatCurrency, denom: Denom) {
      try {
        // Fetch the exchange rate for non-USD currencies if not already cached
        if (fiat !== 'USD' && !this.fiatExchangeRates.has(fiat)) {
          await this.fetchFiatToUsdRate(fiat)
        }
        
        const price = await this.client.updateFiatPrice(fiat, denom)
        if (this.fiatPrices.has(fiat)) {
          this.fiatPrices.get(fiat)?.set(denomToValue(denom), price.price)
        } else {
          const priceForDenom = new Map([[denomToValue(denom), price.price]])
          this.fiatPrices.set(fiat, priceForDenom)
        }
      } catch (e) {
        console.error(e)
      }
    },
    async batchUpdateFiatPrices(fiats: FiatCurrency[], denom: Denom) {
      try {
        // Batch fetch all exchange rates first for non-USD currencies
        const exchangeRatePromises = fiats
          .filter(fiat => fiat !== 'USD' && !this.fiatExchangeRates.has(fiat))
          .map(fiat => this.fetchFiatToUsdRate(fiat))
        
        await Promise.allSettled(exchangeRatePromises)
        
        console.log('Exchange rates available:', Array.from(this.fiatExchangeRates.entries()))
        
        // Check if batch method is available, otherwise fall back to individual queries
        if (this.client.batchUpdateFiatPrices) {
          // Use the new batched RPC method from CosmosChain
          const prices = await this.client.batchUpdateFiatPrices(fiats, denom)
          
          // Store the fetched prices in the state
          for (const priceData of prices) {
            if (this.fiatPrices.has(priceData.fiat)) {
              this.fiatPrices.get(priceData.fiat)?.set(denomToValue(denom), priceData.price)
            } else {
              const priceForDenom = new Map([[denomToValue(denom), priceData.price]])
              this.fiatPrices.set(priceData.fiat, priceForDenom)
            }
          }
          
          // If no prices were returned, fall back to individual queries
          if (!prices || prices.length === 0) {
            console.log('No prices from batch method, using individual queries')
            return await this.individualPriceFetch(fiats, denom)
          }
          
          const result = prices.map(p => ({ 
            fiat: p.fiat, 
            price: p.price, 
            success: true 
          }))
          return result
        } else {
          // Fallback to individual queries if batch method not available
          console.log('Batch method not available, falling back to individual queries')
          return await this.individualPriceFetch(fiats, denom)
        }
      } catch (e) {
        console.error('Failed to batch fetch prices:', e)
        return []
      }
    },
    async individualPriceFetch(fiats: FiatCurrency[], denom: Denom) {
      // For USDC, we can calculate prices using exchange rates
      const denomStr = denomToValue(denom)
      const isUSDC = denomStr?.toLowerCase().includes('usdc')
      
      if (isUSDC) {
        console.log('Using exchange rates for USDC pricing')
        // For USDC, use exchange rates directly (1 USDC = 1 USD)
        const results = fiats.map(fiat => {
          if (fiat === 'USD') {
            // 1 USDC = 1 USD = 100 cents
            const price = 100
            if (this.fiatPrices.has(fiat)) {
              this.fiatPrices.get(fiat)?.set(denomStr, price)
            } else {
              this.fiatPrices.set(fiat, new Map([[denomStr, price]]))
            }
            return { fiat, price, success: true }
          } else {
            // Use the exchange rate if we have it
            const rate = this.fiatExchangeRates.get(fiat)
            console.log(`Exchange rate for ${fiat}: ${rate}`)
            if (rate && rate > 0) {
              // rate is how many cents of the fiat currency equal 1 USD
              // Since 1 USDC = 1 USD, the price is the same as the rate
              if (this.fiatPrices.has(fiat)) {
                this.fiatPrices.get(fiat)?.set(denomStr, rate)
              } else {
                this.fiatPrices.set(fiat, new Map([[denomStr, rate]]))
              }
              return { fiat, price: rate, success: true }
            }
            console.log(`No exchange rate for ${fiat}`)
            return { fiat, price: 0, success: false }
          }
        })
        console.log('USDC price results:', results)
        return results.filter(r => r.success)
      }
      
      // For non-USDC denoms, try to fetch prices from the contract
      const pricePromises = fiats.map(async (fiat) => {
        try {
          const price = await this.client.updateFiatPrice(fiat, denom)
          if (this.fiatPrices.has(fiat)) {
            this.fiatPrices.get(fiat)?.set(denomToValue(denom), price.price)
          } else {
            const priceForDenom = new Map([[denomToValue(denom), price.price]])
            this.fiatPrices.set(fiat, priceForDenom)
          }
          return { fiat, price: price.price, success: true }
        } catch (e) {
          console.error(`Failed to fetch price for ${fiat}:`, e)
          return { fiat, price: 0, success: false }
        }
      })
      
      const results = await Promise.allSettled(pricePromises)
      return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean)
    },
    async fetchFiatPriceForDenom(fiat: FiatCurrency, denom: Denom) {
      return await this.client.updateFiatPrice(fiat, denom)
    },
    async fetchFiatToUsdRate(fiat: FiatCurrency): Promise<number> {
      try {
        const rate = await this.client.fetchFiatToUsdRate(fiat)
        // Store the exchange rate for future use only if valid
        if (rate > 0) {
          this.fiatExchangeRates.set(fiat, rate)
        }
        return rate
      } catch (e) {
        console.error(`Failed to fetch ${fiat}/USD rate:`, e)
        return 0 // Return 0 to indicate no rate available
      }
    },
    async acceptTradeRequest(tradeId: number, makerContact: string) {
      this.loadingState = LoadingState.show('Accepting trade...')
      try {
        await this.client.acceptTradeRequest(tradeId, makerContact)
        const tradeInfo = await this.fetchTradeDetail(tradeId)
        trackTrade(TradeEvents.accepted, toTradeData(tradeInfo.trade, tradeInfo.offer.offer, this.chainClient))
        this.notifyOnBot({ ...tradeInfo.trade, state: TradeState.request_accepted })
      } catch (e) {
        this.handle.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async cancelTradeRequest(tradeId: number) {
      this.loadingState = LoadingState.show('Canceling trade...')
      try {
        await this.client.cancelTradeRequest(tradeId)
        const tradeInfo = await this.fetchTradeDetail(tradeId)
        trackTrade(TradeEvents.canceled, toTradeData(tradeInfo.trade, tradeInfo.offer.offer, this.chainClient))
        this.notifyOnBot({ ...tradeInfo.trade, state: TradeState.request_canceled })
      } catch (e) {
        this.handle.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async fundEscrow(tradeInfo: TradeInfo, makerContact?: string) {
      this.loadingState = LoadingState.show('Funding trade...')
      try {
        await this.client.fundEscrow(tradeInfo, makerContact)
        const trade = await this.fetchTradeDetail(tradeInfo.trade.id)
        trackTrade(TradeEvents.funded, toTradeData(trade.trade, trade.offer.offer, this.chainClient))
        this.notifyOnBot({ ...tradeInfo.trade, state: TradeState.escrow_funded })
      } catch (e) {
        this.handle.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async setFiatDeposited(tradeId: number) {
      this.loadingState = LoadingState.show('Marking trade as paid...')
      try {
        await this.client.setFiatDeposited(tradeId)
        const tradeInfo = await this.fetchTradeDetail(tradeId)
        trackTrade(TradeEvents.paid, toTradeData(tradeInfo.trade, tradeInfo.offer.offer, this.chainClient))
        this.notifyOnBot({ ...tradeInfo.trade, state: TradeState.fiat_deposited })
      } catch (e) {
        this.handle.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async releaseEscrow(tradeId: number) {
      this.loadingState = LoadingState.show('Funding trade...')
      try {
        await this.client.releaseEscrow(tradeId)
        const tradeInfo = await this.fetchTradeDetail(tradeId)
        trackTrade(TradeEvents.released, toTradeData(tradeInfo.trade, tradeInfo.offer.offer, this.chainClient))
        this.notifyOnBot({ ...tradeInfo.trade, state: TradeState.escrow_released })
      } catch (e) {
        this.handle.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async refundEscrow(tradeId: number) {
      this.loadingState = LoadingState.show('Refunding trade...')
      try {
        await this.client.refundEscrow(tradeId)
        const tradeInfo = await this.fetchTradeDetail(tradeId)
        trackTrade(TradeEvents.refunded, toTradeData(tradeInfo.trade, tradeInfo.offer.offer, this.chainClient))
      } catch (e) {
        this.handle.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async openDispute(tradeId: number, buyerContact: string, sellerContact: string) {
      this.loadingState = LoadingState.show('Opening dispute...')
      try {
        await this.client.openDispute(tradeId, buyerContact, sellerContact)
        const tradeInfo = await this.fetchTradeDetail(tradeId)
        trackTrade(TradeEvents.disputed, toTradeData(tradeInfo.trade, tradeInfo.offer.offer, this.chainClient))
        this.notifyOnBot({ ...tradeInfo.trade, state: TradeState.escrow_disputed })
      } catch (e) {
        this.handle.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async settleDispute(tradeId: number, winner: string) {
      this.loadingState = LoadingState.show('Settling dispute...')
      try {
        await this.client.settleDispute(tradeId, winner)
        const tradeInfo = await this.fetchTradeDetail(tradeId)
        trackTrade(TradeEvents.dispute_settled, toTradeData(tradeInfo.trade, tradeInfo.offer.offer, this.chainClient))
        this.notifyOnBot({ ...tradeInfo.trade, state: TradeState.settled_for_maker })
      } catch (e) {
        this.handle.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    notifyOnBot(trade: { id: number; state: TradeState; buyer: string; seller: string }) {
      // only on mainnet it will trigger the bot
      if (this.chainClient === ChainClient.kujiraMainnet) {
        const address = this.userWallet.address === trade.seller ? trade.buyer : trade.seller
        const notification = JSON.stringify({ data: [{ trade_id: trade.id, trade_state: trade.state, address }] })
        axios
          .post('/notify', notification, {
            headers: {
              'Content-Type': 'application/json',
            },
          })
          .then((result) => console.log('result: ', result.data))
          .catch((e) => console.error(e))
      }
    },
    getFiatPrice(fiatCurrency: FiatCurrency, denom: Denom): number {
      // Check if this is USDC
      const denomStr = denomToValue(denom)
      const isUSDC = denomStr === 'usdc' || 
                     denomStr === 'ibc/F663521BF1836B00F5F177680F74BFB9A8B5654A694D0D2BC249E03CF2509013' ||
                     denomStr === 'ibc/295548A78785A1007F232DE286149A6FF512F180AF5657780FC89C009E2C348F' ||
                     denomStr?.toLowerCase().includes('usdc')
      
      if (isUSDC) {
        // For USDC, 1 USDC = 1 USD
        if (fiatCurrency === 'USD') {
          return 1.00 // 1 USDC = 1 USD
        }
        
        // For other fiat currencies, convert using exchange rate
        const exchangeRate = this.fiatExchangeRates.get(fiatCurrency)
        if (exchangeRate && exchangeRate > 0) {
          // exchangeRate is in cents of the fiat currency that equal 1 USD
          // For COP: if 1 USD = 4000 COP, then exchangeRate = 400000 cents (since 1 COP = 100 cents)
          // But we want to return the price in the fiat currency (not cents)
          // So we divide by 100 to get the actual currency value
          return exchangeRate / 100
        }
        
        // No exchange rate available - return 0 to indicate price unavailable
        console.warn(`No exchange rate found for ${fiatCurrency}, price unavailable`)
        return 0
      }
      
      // For other denoms, use the price from the map
      const fiatPrice = this.fiatPrices.get(fiatCurrency)?.get(denomStr) ?? 0
      try {
        return fiatPrice / 100
      } catch (e) {
        return 0
      }
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useClientStore, import.meta.hot))
}
