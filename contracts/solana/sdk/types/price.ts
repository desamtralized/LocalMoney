/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/price.json`.
 */
export type Price = {
  "address": "GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL",
  "metadata": {
    "name": "price",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addOracleSource",
      "discriminator": [
        189,
        213,
        129,
        129,
        226,
        87,
        34,
        23
      ],
      "accounts": [
        {
          "name": "priceConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "priceConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "sourceType",
          "type": {
            "defined": {
              "name": "oracleType"
            }
          }
        },
        {
          "name": "address",
          "type": "pubkey"
        },
        {
          "name": "weight",
          "type": "u16"
        }
      ]
    },
    {
      "name": "calculateTwap",
      "discriminator": [
        20,
        80,
        81,
        119,
        12,
        212,
        164,
        114
      ],
      "accounts": [
        {
          "name": "priceFeed",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ]
          }
        },
        {
          "name": "tokenMint"
        }
      ],
      "args": [
        {
          "name": "fiatCurrency",
          "type": {
            "defined": {
              "name": "fiatCurrency"
            }
          }
        },
        {
          "name": "windowSeconds",
          "type": "u64"
        }
      ]
    },
    {
      "name": "getPrice",
      "discriminator": [
        238,
        38,
        193,
        106,
        228,
        32,
        210,
        33
      ],
      "accounts": [
        {
          "name": "priceFeed",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "fiatCurrency"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "mint",
          "type": "pubkey"
        },
        {
          "name": "fiatCurrency",
          "type": {
            "defined": {
              "name": "fiatCurrency"
            }
          }
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "priceConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeEnhanced",
      "discriminator": [
        209,
        204,
        38,
        126,
        114,
        74,
        62,
        249
      ],
      "accounts": [
        {
          "name": "priceConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "maxPriceAgeSeconds",
          "type": "u64"
        },
        {
          "name": "maxDeviationBps",
          "type": "u16"
        },
        {
          "name": "minRequiredSources",
          "type": "u8"
        },
        {
          "name": "twapWindowSeconds",
          "type": "u64"
        }
      ]
    },
    {
      "name": "togglePriceCircuitBreaker",
      "discriminator": [
        23,
        217,
        97,
        3,
        239,
        31,
        137,
        197
      ],
      "accounts": [
        {
          "name": "priceConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "priceConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "pause",
          "type": "bool"
        },
        {
          "name": "reason",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "autoResumeSeconds",
          "type": "i64"
        }
      ]
    },
    {
      "name": "updatePrice",
      "discriminator": [
        61,
        34,
        117,
        155,
        75,
        34,
        123,
        208
      ],
      "accounts": [
        {
          "name": "priceConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "priceFeed",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "fiatCurrency"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "fiatCurrency",
          "type": {
            "defined": {
              "name": "fiatCurrency"
            }
          }
        },
        {
          "name": "pricePerToken",
          "type": "u64"
        },
        {
          "name": "decimals",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "enhancedPriceConfig",
      "discriminator": [
        109,
        119,
        128,
        189,
        236,
        165,
        253,
        29
      ]
    },
    {
      "name": "priceConfig",
      "discriminator": [
        182,
        159,
        212,
        53,
        192,
        28,
        71,
        108
      ]
    },
    {
      "name": "priceFeed",
      "discriminator": [
        189,
        103,
        252,
        23,
        152,
        35,
        243,
        156
      ]
    },
    {
      "name": "priceFeedAggregate",
      "discriminator": [
        126,
        179,
        3,
        255,
        232,
        140,
        181,
        111
      ]
    }
  ],
  "events": [
    {
      "name": "oracleSourceUpdatedEvent",
      "discriminator": [
        39,
        176,
        12,
        84,
        215,
        199,
        45,
        50
      ]
    },
    {
      "name": "priceAnomalyEvent",
      "discriminator": [
        144,
        127,
        61,
        12,
        8,
        236,
        207,
        245
      ]
    },
    {
      "name": "priceCircuitBreakerEvent",
      "discriminator": [
        49,
        58,
        193,
        62,
        237,
        47,
        1,
        67
      ]
    },
    {
      "name": "priceUpdateEvent",
      "discriminator": [
        176,
        152,
        211,
        252,
        92,
        105,
        194,
        103
      ]
    },
    {
      "name": "twapCalculatedEvent",
      "discriminator": [
        69,
        240,
        79,
        218,
        122,
        107,
        24,
        215
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Unauthorized access"
    },
    {
      "code": 6001,
      "name": "invalidCurrency",
      "msg": "Invalid currency for this price feed"
    },
    {
      "code": 6002,
      "name": "priceUpdatesPaused",
      "msg": "Price updates are currently paused"
    },
    {
      "code": 6003,
      "name": "insufficientPriceSources",
      "msg": "Insufficient price sources available"
    },
    {
      "code": 6004,
      "name": "excessivePriceDeviation",
      "msg": "Excessive price deviation between sources"
    },
    {
      "code": 6005,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow in calculation"
    },
    {
      "code": 6006,
      "name": "arithmeticUnderflow",
      "msg": "Arithmetic underflow"
    },
    {
      "code": 6007,
      "name": "divisionByZero",
      "msg": "Division by zero"
    },
    {
      "code": 6008,
      "name": "stalePrice",
      "msg": "Price data is stale"
    },
    {
      "code": 6009,
      "name": "tooManyPriceAnomalies",
      "msg": "Too many price anomalies detected"
    },
    {
      "code": 6010,
      "name": "insufficientPriceHistory",
      "msg": "Insufficient price history for TWAP"
    },
    {
      "code": 6011,
      "name": "invalidOracleData",
      "msg": "Oracle data is invalid"
    },
    {
      "code": 6012,
      "name": "pricesPaused",
      "msg": "Prices are currently paused"
    },
    {
      "code": 6013,
      "name": "oracleFailures",
      "msg": "Too many oracle failures"
    },
    {
      "code": 6014,
      "name": "invalidOracleConfig",
      "msg": "Invalid oracle configuration"
    },
    {
      "code": 6015,
      "name": "maxOracleSourcesReached",
      "msg": "Maximum oracle sources reached"
    },
    {
      "code": 6016,
      "name": "stringTooLong",
      "msg": "String exceeds maximum length"
    },
    {
      "code": 6017,
      "name": "collectionFull",
      "msg": "Collection is full"
    },
    {
      "code": 6018,
      "name": "rateLimitExceeded",
      "msg": "Rate limit exceeded"
    },
    {
      "code": 6019,
      "name": "pageFull",
      "msg": "Page is full"
    },
    {
      "code": 6020,
      "name": "invalidPageNumber",
      "msg": "Invalid page number"
    }
  ],
  "types": [
    {
      "name": "boundedPriceHistory",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "prices",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "pricePoint"
                  }
                },
                24
              ]
            }
          },
          {
            "name": "head",
            "type": "u8"
          },
          {
            "name": "count",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "enhancedPriceConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "oracleSources",
            "type": {
              "vec": {
                "defined": {
                  "name": "oracleSource"
                }
              }
            }
          },
          {
            "name": "maxPriceAgeSeconds",
            "type": "u64"
          },
          {
            "name": "maxDeviationBps",
            "type": "u16"
          },
          {
            "name": "minRequiredSources",
            "type": "u8"
          },
          {
            "name": "twapWindowSeconds",
            "type": "u64"
          },
          {
            "name": "emergencyFallbackPrice",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "pricePause",
            "type": "bool"
          },
          {
            "name": "pauseReason",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pauseTimestamp",
            "type": "i64"
          },
          {
            "name": "autoResumeAfter",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "fiatCurrency",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "usd"
          },
          {
            "name": "eur"
          },
          {
            "name": "gbp"
          },
          {
            "name": "cad"
          },
          {
            "name": "aud"
          },
          {
            "name": "jpy"
          },
          {
            "name": "brl"
          },
          {
            "name": "mxn"
          },
          {
            "name": "ars"
          },
          {
            "name": "clp"
          },
          {
            "name": "cop"
          },
          {
            "name": "ngn"
          },
          {
            "name": "thb"
          },
          {
            "name": "ves"
          }
        ]
      }
    },
    {
      "name": "oracleSource",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "sourceType",
            "type": {
              "defined": {
                "name": "oracleType"
              }
            }
          },
          {
            "name": "address",
            "type": "pubkey"
          },
          {
            "name": "weight",
            "type": "u16"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "lastUpdate",
            "type": "i64"
          },
          {
            "name": "lastPrice",
            "type": "u64"
          },
          {
            "name": "failureCount",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "oracleSourceUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "sourceType",
            "type": {
              "defined": {
                "name": "oracleType"
              }
            }
          },
          {
            "name": "address",
            "type": "pubkey"
          },
          {
            "name": "weight",
            "type": "u16"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "action",
            "type": "string"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "oracleType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pyth"
          },
          {
            "name": "switchboard"
          },
          {
            "name": "internal"
          },
          {
            "name": "chainlink"
          }
        ]
      }
    },
    {
      "name": "priceAnomalyEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "fiatCurrency",
            "type": {
              "defined": {
                "name": "fiatCurrency"
              }
            }
          },
          {
            "name": "oldPrice",
            "type": "u64"
          },
          {
            "name": "newPrice",
            "type": "u64"
          },
          {
            "name": "changeBps",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "priceCircuitBreakerEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
            "type": "string"
          },
          {
            "name": "reason",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "autoResumeAfter",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "priceConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "priceFeed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "fiatCurrency",
            "type": {
              "defined": {
                "name": "fiatCurrency"
              }
            }
          },
          {
            "name": "pricePerToken",
            "type": "u64"
          },
          {
            "name": "decimals",
            "type": "u8"
          },
          {
            "name": "lastUpdated",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "priceFeedAggregate",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "fiatCurrency",
            "type": {
              "defined": {
                "name": "fiatCurrency"
              }
            }
          },
          {
            "name": "priceHistory",
            "type": {
              "defined": {
                "name": "boundedPriceHistory"
              }
            }
          },
          {
            "name": "currentPrice",
            "type": "u64"
          },
          {
            "name": "currentConfidence",
            "type": "u64"
          },
          {
            "name": "lastUpdate",
            "type": "i64"
          },
          {
            "name": "totalUpdates",
            "type": "u64"
          },
          {
            "name": "anomalyCount",
            "type": "u32"
          },
          {
            "name": "consecutiveFailures",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pricePoint",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "sourceCount",
            "type": "u8"
          },
          {
            "name": "confidence",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "priceUpdateEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "fiatCurrency",
            "type": {
              "defined": {
                "name": "fiatCurrency"
              }
            }
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "confidence",
            "type": "u64"
          },
          {
            "name": "sourcesUsed",
            "type": "u8"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "twapCalculatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "fiatCurrency",
            "type": {
              "defined": {
                "name": "fiatCurrency"
              }
            }
          },
          {
            "name": "twapPrice",
            "type": "u64"
          },
          {
            "name": "windowSeconds",
            "type": "u64"
          },
          {
            "name": "dataPoints",
            "type": "u8"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
