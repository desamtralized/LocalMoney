// Contract ABIs for LocalMoney EVM contracts

export const HubABI = [
  {
    inputs: [],
    name: 'getConfig',
    outputs: [
      {
        components: [
          { name: 'offerContract', type: 'address' },
          { name: 'tradeContract', type: 'address' },
          { name: 'profileContract', type: 'address' },
          { name: 'priceContract', type: 'address' },
          { name: 'treasury', type: 'address' },
          { name: 'localMarket', type: 'address' },
          { name: 'priceProvider', type: 'address' },
          { name: 'localTokenAddress', type: 'address' },
          { name: 'chainFeeCollector', type: 'address' },
          { name: 'swapRouter', type: 'address' },
          { name: 'burnFeePct', type: 'uint16' },
          { name: 'chainFeePct', type: 'uint16' },
          { name: 'warchestFeePct', type: 'uint16' },
          { name: 'conversionFeePct', type: 'uint16' },
          { name: 'arbitratorFeePct', type: 'uint16' },
          { name: 'minTradeAmount', type: 'uint256' },
          { name: 'maxTradeAmount', type: 'uint256' },
          { name: 'maxActiveOffers', type: 'uint256' },
          { name: 'maxActiveTrades', type: 'uint256' },
          { name: 'tradeExpirationTimer', type: 'uint256' },
          { name: 'tradeDisputeTimer', type: 'uint256' },
          { name: 'globalPause', type: 'bool' },
          { name: 'pauseNewTrades', type: 'bool' },
          { name: 'pauseDeposits', type: 'bool' },
          { name: 'pauseWithdrawals', type: 'bool' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const ProfileABI = [
  {
    inputs: [{ name: 'addr', type: 'address' }],
    name: 'getProfile',
    outputs: [
      {
        components: [
          { name: 'owner', type: 'address' },
          { name: 'contact', type: 'string' },
          { name: 'encryptionKey', type: 'bytes' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'contact', type: 'string' },
      { name: 'encryptionKey', type: 'bytes' },
    ],
    name: 'createProfile',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'contact', type: 'string' },
      { name: 'encryptionKey', type: 'bytes' },
    ],
    name: 'updateProfile',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export const OfferABI = [
  {
    inputs: [{ name: 'offerId', type: 'uint256' }],
    name: 'getOffer',
    outputs: [
      {
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'owner', type: 'address' },
          { name: 'offerType', type: 'uint8' },
          { name: 'state', type: 'uint8' },
          { name: 'fiatCurrency', type: 'string' },
          { name: 'tokenAddress', type: 'address' },
          { name: 'minAmount', type: 'uint256' },
          { name: 'maxAmount', type: 'uint256' },
          { name: 'rate', type: 'uint256' },
          { name: 'description', type: 'string' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getAllActiveOffers',
    outputs: [
      {
        name: '',
        type: 'uint256[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_offerId', type: 'uint256' }],
    name: 'getOffer',
    outputs: [
      {
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'owner', type: 'address' },
          { name: 'offerType', type: 'uint8' },
          { name: 'state', type: 'uint8' },
          { name: 'fiatCurrency', type: 'string' },
          { name: 'tokenAddress', type: 'address' },
          { name: 'minAmount', type: 'uint256' },
          { name: 'maxAmount', type: 'uint256' },
          { name: 'rate', type: 'uint256' },
          { name: 'description', type: 'string' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'offerType', type: 'uint8' },
      { name: 'fiatCurrency', type: 'string' },
      { name: 'token', type: 'address' },
      { name: 'minAmount', type: 'uint256' },
      { name: 'maxAmount', type: 'uint256' },
      { name: 'rate', type: 'uint256' },
      { name: 'description', type: 'string' },
    ],
    name: 'createOffer',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'offerId', type: 'uint256' },
      { name: 'newState', type: 'uint8' },
      { name: 'newRate', type: 'uint256' },
      { name: 'newMin', type: 'uint256' },
      { name: 'newMax', type: 'uint256' },
    ],
    name: 'updateOffer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'offerId', type: 'uint256' }],
    name: 'activateOffer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'offerId', type: 'uint256' }],
    name: 'pauseOffer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'offerId', type: 'uint256' }],
    name: 'archiveOffer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'getOffersByOwner',
    outputs: [
      {
        name: '',
        type: 'uint256[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const TradeABI = [
  {
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    name: 'getTrade',
    outputs: [
      {
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'offerId', type: 'uint256' },
          { name: 'buyer', type: 'address' },
          { name: 'seller', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'state', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
          { name: 'buyerContact', type: 'string' },
          { name: 'sellerContact', type: 'string' },
          { name: 'terms', type: 'string' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getAllTrades',
    outputs: [
      {
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'offerId', type: 'uint256' },
          { name: 'buyer', type: 'address' },
          { name: 'seller', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'state', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
          { name: 'buyerContact', type: 'string' },
          { name: 'sellerContact', type: 'string' },
          { name: 'terms', type: 'string' },
        ],
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'offerId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'price', type: 'uint256' },
      { name: 'takerContact', type: 'string' },
    ],
    name: 'openTrade',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tradeId', type: 'uint256' },
      { name: 'makerContact', type: 'string' },
    ],
    name: 'acceptTrade',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    name: 'cancelTrade',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    name: 'confirmFiatDeposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    name: 'releaseFunds',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    name: 'refundFunds',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    name: 'openDispute',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tradeId', type: 'uint256' },
      { name: 'winner', type: 'address' },
    ],
    name: 'settleDispute',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getTradesByUser',
    outputs: [
      {
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'offerId', type: 'uint256' },
          { name: 'buyer', type: 'address' },
          { name: 'seller', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'state', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
          { name: 'buyerContact', type: 'string' },
          { name: 'sellerContact', type: 'string' },
          { name: 'terms', type: 'string' },
        ],
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const PriceOracleABI = [
  {
    inputs: [{ name: '_currency', type: 'string' }],
    name: 'getFiatPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: '_token', type: 'address' },
      { name: '_fiatCurrency', type: 'string' },
      { name: '_amount', type: 'uint256' },
    ],
    name: 'getTokenPriceInFiat',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '_token', type: 'address' }],
    name: 'getTokenPriceInUSD',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_currencies', type: 'string[]' },
      { name: '_prices', type: 'uint256[]' },
    ],
    name: 'updateFiatPrices',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_currencies', type: 'string[]' },
      { name: '_prices', type: 'uint256[]' },
    ],
    name: 'updatePrices',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export const EscrowABI = [
  {
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    name: 'getEscrow',
    outputs: [
      {
        components: [
          { name: 'tradeId', type: 'uint256' },
          { name: 'seller', type: 'address' },
          { name: 'buyer', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'state', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tradeId', type: 'uint256' },
      { name: 'buyer', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'createEscrow',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    name: 'releaseEscrow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    name: 'refundEscrow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tradeId', type: 'uint256' },
      { name: 'winner', type: 'address' },
    ],
    name: 'settleEscrow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export const ArbitratorManagerABI = [
  {
    inputs: [{ name: '_arbitrator', type: 'address' }],
    name: 'getArbitratorInfo',
    outputs: [
      {
        components: [
          { name: 'isActive', type: 'bool' },
          { name: 'supportedFiats', type: 'string[]' },
          { name: 'encryptionKey', type: 'string' },
          { name: 'disputesHandled', type: 'uint256' },
          { name: 'disputesWon', type: 'uint256' },
          { name: 'reputationScore', type: 'uint256' },
          { name: 'joinedAt', type: 'uint256' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_currency', type: 'string' }],
    name: 'getArbitratorsForCurrency',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_fiatCurrency', type: 'string' }],
    name: 'getEligibleArbitrators',
    outputs: [{ name: 'eligible', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: '_supportedCurrencies', type: 'string[]' },
      { name: '_encryptionKey', type: 'string' },
    ],
    name: 'registerArbitrator',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '_arbitrator', type: 'address' }],
    name: 'isActiveArbitrator',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: '_arbitrator', type: 'address' },
      { name: '_currency', type: 'string' },
    ],
    name: 'arbitratorSupportsCurrency',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_currency', type: 'string' }],
    name: 'getActiveArbitratorCountForCurrency',
    outputs: [{ name: 'count', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Token ABIs for ERC20 tokens (USDT, BUSD, etc.)
export const ERC20ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const