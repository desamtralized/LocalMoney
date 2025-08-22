/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/offer.json`.
 */
export type Offer = {
  "address": "48rVnWh2DrKFUF1YS7A9cPNs6CZsTtQwodEGfT8xV2JB",
  "metadata": {
    "name": "offer",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "close_offer",
      "discriminator": [
        191,
        72,
        67,
        35,
        239,
        209,
        97,
        132
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "profile_program",
          "address": "6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC"
        },
        {
          "name": "user_profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                79,
                89,
                188,
                116,
                194,
                3,
                254,
                176,
                208,
                175,
                190,
                160,
                114,
                67,
                220,
                189,
                211,
                245,
                85,
                166,
                208,
                104,
                231,
                21,
                239,
                109,
                236,
                6,
                84,
                147,
                63,
                245
              ]
            }
          }
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "offer.id",
                "account": "Offer"
              }
            ]
          }
        },
        {
          "name": "hub_config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  117,
                  98
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
            ],
            "program": {
              "kind": "const",
              "value": [
                22,
                62,
                129,
                6,
                203,
                104,
                154,
                101,
                214,
                223,
                141,
                45,
                217,
                184,
                36,
                3,
                198,
                54,
                179,
                107,
                50,
                197,
                85,
                219,
                132,
                116,
                48,
                30,
                45,
                119,
                151,
                147
              ]
            }
          }
        }
      ],
      "args": []
    },
    {
      "name": "create_offer",
      "discriminator": [
        237,
        233,
        192,
        168,
        248,
        7,
        249,
        241
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "profile_program",
          "address": "6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC"
        },
        {
          "name": "user_profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                79,
                89,
                188,
                116,
                194,
                3,
                254,
                176,
                208,
                175,
                190,
                160,
                114,
                67,
                220,
                189,
                211,
                245,
                85,
                166,
                208,
                104,
                231,
                21,
                239,
                109,
                236,
                6,
                84,
                147,
                63,
                245
              ]
            }
          }
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "offerId"
              }
            ]
          }
        },
        {
          "name": "token_mint"
        },
        {
          "name": "token_program"
        },
        {
          "name": "hub_config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  117,
                  98
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
            ],
            "program": {
              "kind": "const",
              "value": [
                22,
                62,
                129,
                6,
                203,
                104,
                154,
                101,
                214,
                223,
                141,
                45,
                217,
                184,
                36,
                3,
                198,
                54,
                179,
                107,
                50,
                197,
                85,
                219,
                132,
                116,
                48,
                30,
                45,
                119,
                151,
                147
              ]
            }
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "offerId",
          "type": "u64"
        },
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "CreateOfferParams"
            }
          }
        }
      ]
    },
    {
      "name": "update_offer",
      "discriminator": [
        191,
        70,
        15,
        66,
        224,
        2,
        249,
        223
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "profile_program",
          "address": "6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC"
        },
        {
          "name": "user_profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                79,
                89,
                188,
                116,
                194,
                3,
                254,
                176,
                208,
                175,
                190,
                160,
                114,
                67,
                220,
                189,
                211,
                245,
                85,
                166,
                208,
                104,
                231,
                21,
                239,
                109,
                236,
                6,
                84,
                147,
                63,
                245
              ]
            }
          }
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "offer.id",
                "account": "Offer"
              }
            ]
          }
        },
        {
          "name": "hub_config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  117,
                  98
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
            ],
            "program": {
              "kind": "const",
              "value": [
                22,
                62,
                129,
                6,
                203,
                104,
                154,
                101,
                214,
                223,
                141,
                45,
                217,
                184,
                36,
                3,
                198,
                54,
                179,
                107,
                50,
                197,
                85,
                219,
                132,
                116,
                48,
                30,
                45,
                119,
                151,
                147
              ]
            }
          }
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "UpdateOfferParams"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "HubConfig",
      "discriminator": [
        115,
        89,
        81,
        4,
        182,
        207,
        219,
        46
      ]
    },
    {
      "name": "Offer",
      "discriminator": [
        215,
        88,
        60,
        71,
        170,
        162,
        73,
        229
      ]
    },
    {
      "name": "Profile",
      "discriminator": [
        184,
        101,
        165,
        188,
        95,
        63,
        127,
        188
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "Unauthorized",
      "msg": "Unauthorized access"
    },
    {
      "code": 6001,
      "name": "InvalidOfferParams",
      "msg": "Invalid offer parameters"
    },
    {
      "code": 6002,
      "name": "ArithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6003,
      "name": "ArithmeticUnderflow",
      "msg": "Arithmetic underflow"
    },
    {
      "code": 6004,
      "name": "DivisionByZero",
      "msg": "Division by zero"
    },
    {
      "code": 6005,
      "name": "StringTooLong",
      "msg": "String exceeds maximum length"
    },
    {
      "code": 6006,
      "name": "CollectionFull",
      "msg": "Collection is full"
    },
    {
      "code": 6007,
      "name": "RateLimitExceeded",
      "msg": "Rate limit exceeded"
    },
    {
      "code": 6008,
      "name": "PageFull",
      "msg": "Page is full"
    },
    {
      "code": 6009,
      "name": "InvalidPageNumber",
      "msg": "Invalid page number"
    }
  ],
  "types": [
    {
      "name": "BoundedString",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "value",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "CreateOfferParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offerType",
            "type": {
              "defined": {
                "name": "OfferType"
              }
            }
          },
          {
            "name": "fiatCurrency",
            "type": {
              "defined": {
                "name": "FiatCurrency"
              }
            }
          },
          {
            "name": "rate",
            "type": "u64"
          },
          {
            "name": "minAmount",
            "type": "u64"
          },
          {
            "name": "maxAmount",
            "type": "u64"
          },
          {
            "name": "description",
            "type": {
              "option": {
                "defined": {
                  "name": "BoundedString"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "FiatCurrency",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Usd"
          },
          {
            "name": "Eur"
          },
          {
            "name": "Gbp"
          },
          {
            "name": "Cad"
          },
          {
            "name": "Aud"
          },
          {
            "name": "Jpy"
          },
          {
            "name": "Brl"
          },
          {
            "name": "Mxn"
          },
          {
            "name": "Ars"
          },
          {
            "name": "Clp"
          },
          {
            "name": "Cop"
          },
          {
            "name": "Ngn"
          },
          {
            "name": "Thb"
          },
          {
            "name": "Ves"
          }
        ]
      }
    },
    {
      "name": "HubConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "profileProgram",
            "type": "pubkey"
          },
          {
            "name": "offerProgram",
            "type": "pubkey"
          },
          {
            "name": "tradeProgram",
            "type": "pubkey"
          },
          {
            "name": "priceProgram",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "localTokenMint",
            "type": "pubkey"
          },
          {
            "name": "jupiterProgram",
            "type": "pubkey"
          },
          {
            "name": "chainFeeCollector",
            "type": "pubkey"
          },
          {
            "name": "warchestAddress",
            "type": "pubkey"
          },
          {
            "name": "burnFeePct",
            "type": "u16"
          },
          {
            "name": "chainFeePct",
            "type": "u16"
          },
          {
            "name": "warchestFeePct",
            "type": "u16"
          },
          {
            "name": "conversionFeePct",
            "type": "u16"
          },
          {
            "name": "maxSlippageBps",
            "type": "u16"
          },
          {
            "name": "minConversionAmount",
            "type": "u64"
          },
          {
            "name": "maxConversionRoutes",
            "type": "u8"
          },
          {
            "name": "feeRate",
            "type": "u16"
          },
          {
            "name": "burnRate",
            "type": "u16"
          },
          {
            "name": "warchestRate",
            "type": "u16"
          },
          {
            "name": "tradeLimitMin",
            "type": "u64"
          },
          {
            "name": "tradeLimitMax",
            "type": "u64"
          },
          {
            "name": "tradeExpirationTimer",
            "type": "u64"
          },
          {
            "name": "tradeDisputeTimer",
            "type": "u64"
          },
          {
            "name": "arbitrationFeeRate",
            "type": "u16"
          },
          {
            "name": "profileProgramVersion",
            "type": "u16"
          },
          {
            "name": "offerProgramVersion",
            "type": "u16"
          },
          {
            "name": "tradeProgramVersion",
            "type": "u16"
          },
          {
            "name": "priceProgramVersion",
            "type": "u16"
          },
          {
            "name": "lastUpgradeTimestamp",
            "type": "i64"
          },
          {
            "name": "upgradeAuthority",
            "type": "pubkey"
          },
          {
            "name": "emergencyCouncil",
            "type": {
              "array": [
                "pubkey",
                5
              ]
            }
          },
          {
            "name": "guardianCount",
            "type": "u8"
          },
          {
            "name": "requiredSignatures",
            "type": "u8"
          },
          {
            "name": "globalPause",
            "type": "bool"
          },
          {
            "name": "pauseNewTrades",
            "type": "bool"
          },
          {
            "name": "pauseDeposits",
            "type": "bool"
          },
          {
            "name": "pauseWithdrawals",
            "type": "bool"
          },
          {
            "name": "pauseNewOffers",
            "type": "bool"
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
            "name": "pauseReason",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pauseCount",
            "type": "u32"
          },
          {
            "name": "lastPauseBy",
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
      "name": "Offer",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "offerType",
            "type": {
              "defined": {
                "name": "OfferType"
              }
            }
          },
          {
            "name": "fiatCurrency",
            "type": {
              "defined": {
                "name": "FiatCurrency"
              }
            }
          },
          {
            "name": "rate",
            "type": "u64"
          },
          {
            "name": "minAmount",
            "type": "u64"
          },
          {
            "name": "maxAmount",
            "type": "u64"
          },
          {
            "name": "description",
            "type": {
              "option": {
                "defined": {
                  "name": "BoundedString"
                }
              }
            }
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "OfferState"
              }
            }
          },
          {
            "name": "createdAt",
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
      "name": "OfferState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Active"
          },
          {
            "name": "Paused"
          },
          {
            "name": "Archive"
          }
        ]
      }
    },
    {
      "name": "OfferType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Buy"
          },
          {
            "name": "Sell"
          }
        ]
      }
    },
    {
      "name": "Profile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "username",
            "type": "string"
          },
          {
            "name": "createdAt",
            "type": "u64"
          },
          {
            "name": "requestedTradesCount",
            "type": "u64"
          },
          {
            "name": "activeTradesCount",
            "type": "u8"
          },
          {
            "name": "releasedTradesCount",
            "type": "u64"
          },
          {
            "name": "lastTrade",
            "type": "u64"
          },
          {
            "name": "contact",
            "type": {
              "option": {
                "defined": {
                  "name": "BoundedString"
                }
              }
            }
          },
          {
            "name": "encryptionKey",
            "type": {
              "option": {
                "defined": {
                  "name": "BoundedString"
                }
              }
            }
          },
          {
            "name": "activeOffersCount",
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
      "name": "UpdateOfferParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rate",
            "type": "u64"
          },
          {
            "name": "minAmount",
            "type": "u64"
          },
          {
            "name": "maxAmount",
            "type": "u64"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "OfferState"
              }
            }
          },
          {
            "name": "description",
            "type": {
              "option": {
                "defined": {
                  "name": "BoundedString"
                }
              }
            }
          }
        ]
      }
    }
  ]
};
