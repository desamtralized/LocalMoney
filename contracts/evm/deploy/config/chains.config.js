// Chain configuration for satellite deployments
module.exports = {
    // BSC Hub Configuration
    bsc: {
        chainId: 56,
        axelarName: "binance",
        contracts: {
            hub: "0x696F771E329DF4550044686C995AB9028fD3a724",
            trade: "0xe0cdc4bDb60fCeC0ED1FFedcbbFb86839206862f",
            escrow: "0xA07BfE2A3eE903Dde4e62ADc76cC32b57B0e0Cd2",
            offer: "0x5B1E3C79A6A84BD436Fe2141A13E1767C178E621",
            profile: "0x9a1AD40c90E5f282152Aa9F56d18B99F31794B68"
        }
    },

    // Target Chain Configurations
    networks: {
        polygon: {
            chainId: 137,
            axelarName: "Polygon",
            gateway: "0x6f015F16De9fC8791b234eF68D486d2bF203FBA8",
            gasService: "0x2d5d7d31F671F86C782533cc367F14109a082712",
            rpc: process.env.POLYGON_RPC || "https://polygon-rpc.com",
            explorer: "https://polygonscan.com",
            confirmations: 5
        },
        avalanche: {
            chainId: 43114,
            axelarName: "Avalanche",
            gateway: "0x5029C0EFf6C34351a0CEc334542cDb22c7928f78",
            gasService: "0x2d5d7d31F671F86C782533cc367F14109a082712",
            rpc: process.env.AVALANCHE_RPC || "https://api.avax.network/ext/bc/C/rpc",
            explorer: "https://snowtrace.io",
            confirmations: 3
        },
        base: {
            chainId: 8453,
            axelarName: "base",
            gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31",
            gasService: "0x2d5d7d31F671F86C782533cc367F14109a082712",
            rpc: process.env.BASE_RPC || "https://mainnet.base.org",
            explorer: "https://basescan.org",
            confirmations: 3
        }
    },

    // Testnet Configurations
    testnets: {
        "polygon-testnet": {
            chainId: 80001, // Mumbai
            axelarName: "Polygon",
            gateway: "0xBF62ef1486468a6bd26Dd669C06db43dEd5B849B",
            gasService: "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
            rpc: process.env.POLYGON_TESTNET_RPC || "https://rpc-mumbai.maticvigil.com",
            explorer: "https://mumbai.polygonscan.com",
            confirmations: 3
        },
        "avalanche-testnet": {
            chainId: 43113, // Fuji
            axelarName: "Avalanche",
            gateway: "0xC249632c2D40b9001FE907806902f63038B737Ab",
            gasService: "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
            rpc: process.env.AVALANCHE_TESTNET_RPC || "https://api.avax-test.network/ext/bc/C/rpc",
            explorer: "https://testnet.snowtrace.io",
            confirmations: 3
        },
        "base-testnet": {
            chainId: 84531, // Base Goerli
            axelarName: "base-testnet",
            gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31",
            gasService: "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
            rpc: process.env.BASE_TESTNET_RPC || "https://goerli.base.org",
            explorer: "https://goerli.basescan.org",
            confirmations: 3
        },
        "bsc-testnet": {
            chainId: 97,
            axelarName: "binance",
            gateway: "0x4D147dCb984e6affEEC47e44293DA442580A3Ec0",
            gasService: "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
            rpc: process.env.BSC_TESTNET_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545",
            explorer: "https://testnet.bscscan.com",
            confirmations: 3
        }
    },

    // Gas Price Configurations
    gasConfig: {
        polygon: {
            gasPrice: "30", // gwei
            maxFeePerGas: "100", // gwei
            maxPriorityFeePerGas: "30" // gwei
        },
        avalanche: {
            gasPrice: "25", // gwei
            maxFeePerGas: "100", // gwei
            maxPriorityFeePerGas: "2" // gwei
        },
        base: {
            gasPrice: "1", // gwei
            maxFeePerGas: "2", // gwei
            maxPriorityFeePerGas: "1" // gwei
        }
    }
};