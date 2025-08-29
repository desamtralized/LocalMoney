<script setup lang="ts">
import { OfferType } from '~/types/components.interface'
import type { GetOffer } from '~/types/components.interface'
import { calculateFiatPriceByRate, formatAmount, formatDate } from '~/shared'
import { useClientStore } from '~/stores/client'
import { denomToValue, microDenomToDisplay } from '~/utils/denom'

const props = defineProps<{ offer: GetOffer }>()

const client = useClientStore()
const currentDate = computed(() => formatDate(new Date(props.offer.timestamp * 1000), false))
const fiatCurrency = computed(() => props.offer.fiat_currency)
const price = computed(() => {
  const baseFiatPrice = client.getFiatPrice(props.offer.fiat_currency, props.offer.denom)
  
  // If no price is available (0), show price unavailable
  if (baseFiatPrice === 0) {
    return `${props.offer.fiat_currency} -`
  }
  
  return `${props.offer.fiat_currency} ${formatAmount(
    calculateFiatPriceByRate(baseFiatPrice * 100, props.offer.rate) / 100,
    false
  )}`
})
const limit = computed(() => {
  const min = formatAmount(Number(props.offer.min_amount), true, 6)
  const max = formatAmount(Number(props.offer.max_amount), true, 6)
  const denom = microDenomToDisplay(denomToValue(props.offer.denom), client.chainClient)
  return `${min} - ${max} ${denom}`
})

// Fetch exchange rate for non-USD currencies
onBeforeMount(async () => {
  if (props.offer.fiat_currency !== 'USD') {
    await client.fetchFiatToUsdRate(props.offer.fiat_currency)
  }
})
const type = computed(() => (props.offer.offer_type === OfferType.buy ? 'Buying' : 'Selling'))

function unarchive() {
  client.unarchiveOffer({ ...props.offer })
}

onBeforeMount(async () => {
  // Price updates handled by backend/oracle
})
</script>

<template>
  <div class="wrap-table-item">
    <div class="col-1">
      <p>{{ currentDate }}</p>
    </div>
    <div class="col-2">
      <p>{{ type }}</p>
    </div>
    <div class="col-3">
      <p>{{ fiatCurrency }}</p>
    </div>
    <div class="col-4">
      <p>{{ limit }}</p>
    </div>
    <div class="col-5">
      <p>{{ price }}</p>
    </div>
    <div class="col-6 unarchive">
      <p @click="unarchive()">Unarchive</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import '../../style/tokens';

.wrap-table-item {
  display: flex;
  flex-direction: row;
  padding: 16px;

  p {
    font-size: 14px;
    font-weight: $regular;
  }

  .unarchive {
    cursor: pointer;
    color: $primary;

    p {
      font-weight: 600;
    }
  }
}
</style>
