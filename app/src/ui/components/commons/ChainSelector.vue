<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChainClient } from '~/network/Chain'
import { useClientStore } from '~/stores/client'
import { ChainType, WalletProvider, WalletService } from '~/services/wallet'

const client = useClientStore()
const showDropdown = ref(false)

interface ChainOption {
  id: ChainClient
  name: string
  type: ChainType
  icon: string
  isTestnet: boolean
}

const chainOptions: ChainOption[] = [
  // Cosmos chains
  { id: ChainClient.cosmoshub, name: 'Cosmos Hub', type: ChainType.COSMOS, icon: '/tokens/cosmos.png', isTestnet: false },
  // EVM chains
  { id: ChainClient.bscMainnet, name: 'BNB Smart Chain', type: ChainType.EVM, icon: '/tokens/bnb.png', isTestnet: false },
]

const selectedChain = computed(() => {
  return chainOptions.find(chain => chain.id === client.chainClient) || chainOptions[0]
})

const availableWallets = computed(() => {
  return WalletService.detectAvailableWallets()
})

const walletsForChain = computed(() => {
  const chainType = selectedChain.value.type
  return availableWallets.value.filter(wallet => 
    WalletService.isWalletCompatibleWithChain(wallet, chainType)
  )
})

async function selectChain(chain: ChainOption) {
  showDropdown.value = false
  
  // Disconnect current wallet if chain type is different
  const currentChainType = client.client.getChainType()
  if (currentChainType !== chain.type && client.userWallet.isConnected) {
    await client.disconnectWallet()
  }
  
  // Switch to the new chain
  await client.setClient(chain.id)
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

// Close dropdown when clicking outside
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.chain-selector')) {
    showDropdown.value = false
  }
}
</script>

<template>
  <div class="chain-selector">
    <button class="chain-button" @click="toggleDropdown">
      <img class="chain-icon" :src="selectedChain.icon" :alt="selectedChain.name" />
      <svg 
        class="dropdown-arrow"
        :class="{ 'rotate': showDropdown }"
        width="12" 
        height="12" 
        viewBox="0 0 12 12" 
        fill="none"
      >
        <path 
          d="M3 4.5L6 7.5L9 4.5" 
          stroke="currentColor" 
          stroke-width="1.5" 
          stroke-linecap="round" 
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <div v-if="showDropdown" class="dropdown">
      <div class="dropdown-header">Select Network</div>
      
      <div class="chain-group">
        <div class="group-label">Mainnet</div>
        <button
          v-for="chain in chainOptions.filter(c => !c.isTestnet)"
          :key="chain.id"
          class="chain-option"
          :class="{ 'selected': chain.id === selectedChain.id }"
          @click="selectChain(chain)"
        >
          <img class="chain-icon" :src="chain.icon" :alt="chain.name" />
          <span class="chain-name">{{ chain.name }}</span>
          <span class="chain-type">{{ chain.type.toUpperCase() }}</span>
          <svg v-if="chain.id === selectedChain.id" class="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M13.5 4.5L6 12L2.5 8.5" stroke="#4CAF50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- Testnets removed - only mainnet chains available -->

      <div v-if="walletsForChain.length > 0" class="wallet-info">
        <div class="info-label">Compatible Wallets:</div>
        <div class="wallet-list">
          <span v-for="wallet in walletsForChain" :key="wallet" class="wallet-chip">
            {{ WalletService.getWalletIcon(wallet) }} {{ WalletService.getWalletDisplayName(wallet) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import '../../style/tokens.scss';

.chain-selector {
  position: relative;
}

.chain-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: $bg-secondary;
  border: 1px solid $border;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: $bg-hover;
    border-color: $primary;
  }

  .chain-icon {
    width: 20px;
    height: 20px;
    object-fit: contain;
  }

  .dropdown-arrow {
    transition: transform 0.2s;
    
    &.rotate {
      transform: rotate(180deg);
    }
  }
}

.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 280px;
  background: $bg-primary;
  border: 1px solid $border;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  overflow: hidden;

  .dropdown-header {
    padding: 12px 16px;
    font-weight: 600;
    border-bottom: 1px solid $border;
    color: $text-primary;
  }

  .chain-group {
    // No border needed as we only have one group now

    .group-label {
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 500;
      color: $text-secondary;
      text-transform: uppercase;
      background: $bg-secondary;
    }
  }

  .chain-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background 0.2s;
    text-align: left;

    &:hover {
      background: $bg-hover;
    }

    &.selected {
      background: $bg-selected;
    }

    .chain-icon {
      width: 18px;
      height: 18px;
      object-fit: contain;
    }

    .chain-name {
      flex: 1;
      color: $text-primary;
      font-weight: 500;
    }

    .chain-type {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      background: $bg-secondary;
      color: $text-secondary;
      font-weight: 600;
    }

    .check-icon {
      margin-left: 8px;
    }
  }

  .wallet-info {
    padding: 12px 16px;
    background: $bg-secondary;
    border-top: 1px solid $border;

    .info-label {
      font-size: 12px;
      color: $text-secondary;
      margin-bottom: 8px;
    }

    .wallet-list {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;

      .wallet-chip {
        padding: 4px 8px;
        background: $bg-primary;
        border: 1px solid $border;
        border-radius: 6px;
        font-size: 12px;
        color: $text-primary;
      }
    }
  }
}
</style>