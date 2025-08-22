<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useClientStore } from '~/stores/client'
import { Page, trackPage } from '~/analytics/analytics'
import type { Denom } from '~/types/components.interface'
import { getFiatInfo } from '~/utils/fiat'
import { denomToValue } from '~/utils/denom'
import { FiatCurrency, OfferState, TradeState } from '~/types/components.interface'

const client = useClientStore()
const { fiatPrices, offers, trades, myOffers } = storeToRefs(client)

interface Stats {
  totalOffers: number
  activeOffers: number
  completedTrades: number
  activeTrades: number
}

interface PriceData {
  fiat: string
  price: number
  loading: boolean
}

const stats = ref<Stats>({
  totalOffers: 0,
  activeOffers: 0,
  completedTrades: 0,
  activeTrades: 0,
})

const currencyPrices = ref<PriceData[]>([])
const isLoading = ref(true)
const lastUpdated = ref(new Date())

const supportedFiats = [
  FiatCurrency.USD,
  FiatCurrency.EUR,
  FiatCurrency.GBP,
  FiatCurrency.CAD,
  FiatCurrency.ARS,
  FiatCurrency.BRL,
  FiatCurrency.CLP,
  FiatCurrency.COP,
  FiatCurrency.MXN,
  FiatCurrency.NGN,
  FiatCurrency.THB,
  FiatCurrency.VES,
  FiatCurrency.IDR,
  FiatCurrency.PHP,
  FiatCurrency.VND,
  FiatCurrency.MYR,
  FiatCurrency.SGD,
]

const denomOptions = [
  { value: 'uusdc', display: 'USDC' },
]

const selectedDenom = ref('uusdc')

async function fetchAllPrices() {
  const denom: Denom = { native: selectedDenom.value }
  
  // Sort currencies alphabetically
  const sortedFiats = [...supportedFiats].sort((a, b) => a.localeCompare(b))
  
  // Initialize currency prices with loading state
  currencyPrices.value = sortedFiats.map(fiat => ({
    fiat: fiat as string,
    price: 0,
    loading: true,
  }))

  try {
    // Use batched price fetching for better performance
    const results = await client.batchUpdateFiatPrices(sortedFiats, denom)
    
    // Get the denomination key
    const denomKey = denomToValue(denom)
    
    // Update the currency prices from the results directly
    if (results && results.length > 0) {
      currencyPrices.value = sortedFiats.map(fiat => {
        // Find the result for this fiat currency
        const result = results.find(r => r && r.fiat === fiat)
        if (result && result.success) {
          return {
            fiat: fiat as string,
            price: result.price,
            loading: false,
          }
        }
        
        // Fallback to store if not in results
        const priceMap = client.fiatPrices.get(fiat)
        const price = priceMap?.get(denomKey)
        return {
          fiat: fiat as string,
          price: typeof price === 'number' ? price : 0,
          loading: false,
        }
      })
    } else {
      // No results, try to get from store
      currencyPrices.value = sortedFiats.map(fiat => {
        const priceMap = client.fiatPrices.get(fiat)
        const price = priceMap?.get(denomKey)
        return {
          fiat: fiat as string,
          price: typeof price === 'number' ? price : 0,
          loading: false,
        }
      })
    }
    console.log('Fetched prices:', currencyPrices.value.filter(p => p.price > 0).length, 'out of', currencyPrices.value.length)
  } catch (error) {
    console.error('Failed to fetch prices:', error)
    // Set all currencies to not loading on error
    currencyPrices.value = currencyPrices.value.map(p => ({
      ...p,
      loading: false,
    }))
  }
  
  lastUpdated.value = new Date()
}

async function fetchStats() {
  try {
    await client.fetchOffers({ 
      type: undefined, 
      fiatCurrency: undefined, 
      denom: undefined 
    })
    
    await client.fetchMyOffers()
    
    await client.fetchTrades()
    
    const allOffers = offers.value.data
    const allMyOffers = myOffers.value.data
    const allTrades = trades.value.data
    
    stats.value = {
      totalOffers: allOffers.length + allMyOffers.length,
      activeOffers: allOffers.filter(o => o.offer.state === OfferState.active).length +
                   allMyOffers.filter(o => o.offer.state === OfferState.active).length,
      completedTrades: allTrades.filter(t => 
        t.trade.state === TradeState.escrow_released ||
        t.trade.state === TradeState.escrow_refunded
      ).length,
      activeTrades: allTrades.filter(t => 
        t.trade.state === TradeState.request_created ||
        t.trade.state === TradeState.request_accepted ||
        t.trade.state === TradeState.escrow_funded ||
        t.trade.state === TradeState.fiat_deposited
      ).length,
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error)
  }
}

async function refreshData() {
  isLoading.value = true
  try {
    // Fetch prices first, then stats
    await fetchAllPrices()
    await fetchStats()
  } catch (error) {
    console.error('Error refreshing data:', error)
  } finally {
    isLoading.value = false
  }
}

function formatPrice(price: number | undefined): string {
  if (price === undefined || price === null || price === 0) return '—'
  let num = Number(price)
  if (isNaN(num)) return '—'
  
  // Convert from cents to currency value (price is stored as cents in the contract)
  num = num / 100
  
  // Format to at most 2 decimals, removing unnecessary trailing zeros
  const formatted = num.toFixed(2)
  // Remove trailing zeros after decimal point
  return formatted.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString()
}

onMounted(async () => {
  trackPage(Page.home)
  await refreshData()
})

watch(selectedDenom, async () => {
  await fetchAllPrices()
})
</script>

<template>
  <section class="page">
    <div class="dashboard-header">
      <h3>Market Dashboard</h3>
      <button class="btn-refresh" @click="refreshData" :disabled="isLoading">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M1 4V10H7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M23 20V14H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Refresh</span>
      </button>
    </div>

    <div class="stats-grid">
      <div class="stat-card card">
        <div class="stat-label">Total Offers</div>
        <div class="stat-value">{{ stats.totalOffers }}</div>
      </div>
      <div class="stat-card card">
        <div class="stat-label">Active Offers</div>
        <div class="stat-value">{{ stats.activeOffers }}</div>
      </div>
      <div class="stat-card card">
        <div class="stat-label">Completed Trades</div>
        <div class="stat-value">{{ stats.completedTrades }}</div>
      </div>
      <div class="stat-card card">
        <div class="stat-label">Active Trades</div>
        <div class="stat-value">{{ stats.activeTrades }}</div>
      </div>
    </div>

    <div class="prices-section">
      <div class="prices-header">
        <h3>Currency Prices</h3>
        <div class="controls">
          <select v-model="selectedDenom" class="denom-select">
            <option v-for="option in denomOptions" :key="option.value" :value="option.value">
              {{ option.display }}
            </option>
          </select>
          <span class="last-updated">Last updated: {{ formatTime(lastUpdated) }}</span>
        </div>
      </div>

      <div class="prices-grid">
        <div v-for="priceData in currencyPrices" :key="priceData.fiat" class="price-card card">
          <div class="currency-info">
            <img :src="getFiatInfo(priceData.fiat)?.icon" :alt="priceData.fiat" class="currency-flag">
            <span class="currency-code">{{ priceData.fiat }}</span>
          </div>
          <div class="price-value" v-if="!priceData.loading">
            <span class="price">{{ formatPrice(priceData.price) }}</span>
            <span class="unit">{{ priceData.fiat }}/{{ denomOptions.find(d => d.value === selectedDenom)?.display }}</span>
          </div>
          <div class="price-loading" v-else>
            <Loading />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
@import '../style/pages.scss';

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;

  h3 {
    margin: 0;
  }

  .btn-refresh {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background-color: $surface;
    color: $primary;
    border: 1px solid $border;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      background-color: $gray100;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    svg {
      width: 20px;
      height: 20px;
    }
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
  margin-bottom: 48px;

  .stat-card {
    text-align: center;
    padding: 32px 24px;

    .stat-label {
      font-size: 14px;
      color: $gray600;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stat-value {
      font-size: 36px;
      font-weight: $bold;
      color: $primary;
    }
  }
}

.prices-section {
  .prices-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;

    h3 {
      margin: 0;
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 16px;

      .denom-select {
        padding: 8px 12px;
        background-color: $surface;
        border: 1px solid $border;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;

        &:focus {
          outline: none;
          border-color: $primary;
        }
      }

      .last-updated {
        font-size: 12px;
        color: $gray600;
      }
    }
  }

  .prices-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;

    .price-card {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;

      .currency-info {
        display: flex;
        align-items: center;
        gap: 12px;

        .currency-flag {
          width: 24px;
          height: 24px;
          object-fit: contain;
        }

        .currency-code {
          font-weight: $semi-bold;
          font-size: 16px;
        }
      }

      .price-value {
        display: flex;
        flex-direction: column;
        gap: 4px;

        .price {
          font-size: 20px;
          font-weight: $bold;
          color: $primary;
        }

        .unit {
          font-size: 12px;
          color: $gray600;
        }
      }

      .price-loading {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 48px;
      }
    }
  }
}

@media only screen and (max-width: $mobile) {
  .dashboard-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .prices-section {
    .prices-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;

      .controls {
        width: 100%;
        justify-content: space-between;
      }
    }

    .prices-grid {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    }
  }
}
</style>