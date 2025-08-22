<script setup lang="ts">
import { calculateFiatPriceByRate, convertOfferRateToMarginRate, formatAmount } from '~/shared'
import { useClientStore } from '~/stores/client'
import type { Denom, GetOffer } from '~/types/components.interface'
import { microDenomToDisplay } from '~/utils/denom'

const props = defineProps<{ offer: GetOffer }>()

const emit = defineEmits<{ (e: 'select'): void }>()

const client = useClientStore()

const marginRate = computed(() => convertOfferRateToMarginRate(props.offer.rate))
const offerPrice = computed(() => {
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

onBeforeMount(async () => {
  // Fetch exchange rate for non-USD currencies
  if (props.offer.fiat_currency !== 'USD') {
    await client.fetchFiatToUsdRate(props.offer.fiat_currency)
  }
  await client.updateFiatPrice(props.offer.fiat_currency, props.offer.denom)
})
</script>

<template>
  <div :key="`${offer.id}-collapsed`" class="offer collapsed">
    <div class="offer-type">
      <p class="state">
        {{ offer.state }}
      </p>
      <p class="type">{{ offer.offer_type }}ing</p>
    </div>

    <div class="inner-wrap">
      <div class="info">
        <!-- <p class="state">{{ offer.state }}</p>
      <div class="divider"></div> -->
        <div class="wrap">
          <p class="label">Limits</p>
          <p class="limit">
            {{ formatAmount(offer.min_amount, true, 6) }} -
            {{ formatAmount(offer.max_amount, true, 6) }}
            {{ microDenomToDisplay(offer.denom.native, client.chainClient) }}
          </p>
        </div>
        <div class="divider" />
        <div class="description">
          <p class="content">{{ offer.description ?? 'No Description' }}</p>
        </div>
      </div>

      <div class="price">
        <div class="wrap">
          <p class="value">
            {{ offerPrice }}
          </p>
          <p class="margin">{{ marginRate.marginOffset }}% {{ marginRate.margin }} market</p>
        </div>

        <button class="secondary bg-gray300" type="button" @click="emit('select')">edit</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import '../../style/tokens.scss';

.collapsed {
  .offer-type {
    display: flex;
    align-items: center;

    .state {
      margin-right: 24px;
      padding: 8px 16px;
      background-color: $gray150;
      border-radius: 8px;
      font-size: 14px;
      text-transform: capitalize;
      color: $gray900;
    }

    .type {
      font-size: 18px;
      font-weight: $semi-bold;
      color: $base-text;
      text-transform: capitalize;
    }
  }
}
</style>
