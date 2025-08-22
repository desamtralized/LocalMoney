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
      "name": "closeOffer",
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
          "name": "profileProgram",
          "address": "6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC"
        },
        {
          "name": "userProfile",
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
                "account": "offer"
              }
            ]
          }
        },
        {
          "name": "hubConfig",
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
      "name": "createOffer",
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
          "name": "profileProgram",
          "address": "6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC"
        },
        {
          "name": "userProfile",
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
                "path": "params.offer_id"
              }
            ]
          }
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "hubConfig",
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createOfferParams"
            }
          }
        }
      ]
    },
    {
      "name": "updateOffer",
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
          "name": "profileProgram",
          "address": "6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC"
        },
        {
          "name": "userProfile",
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
                "account": "offer"
              }
            ]
          }
        },
        {
          "name": "hubConfig",
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
              "name": "updateOfferParams"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "hubConfig",
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
      "name": "offer",
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
      "name": "profile",
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
      "name": "unauthorized",
      "msg": "Unauthorized access"
    },
    {
      "code": 6001,
      "name": "invalidOfferParams",
      "msg": "Invalid offer parameters"
    },
    {
      "code": 6002,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6003,
      "name": "arithmeticUnderflow",
      "msg": "Arithmetic underflow"
    },
    {
      "code": 6004,
      "name": "divisionByZero",
      "msg": "Division by zero"
    },
    {
      "code": 6005,
      "name": "stringTooLong",
      "msg": "String exceeds maximum length"
    },
    {
      "code": 6006,
      "name": "collectionFull",
      "msg": "Collection is full"
    },
    {
      "code": 6007,
      "name": "rateLimitExceeded",
      "msg": "Rate limit exceeded"
    },
    {
      "code": 6008,
      "name": "pageFull",
      "msg": "Page is full"
    },
    {
      "code": 6009,
      "name": "invalidPageNumber",
      "msg": "Invalid page number"
    }
  ],
  "types": [
    {
      "name": "boundedString",
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
      "name": "createOfferParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offerId",
            "type": "u64"
          },
          {
            "name": "offerType",
            "type": {
              "defined": {
                "name": "offerType"
              }
            }
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
                  "name": "boundedString"
                }
              }
            }
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
      "name": "hubConfig",
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
      "name": "offer",
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
                "name": "offerType"
              }
            }
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
                  "name": "boundedString"
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
                "name": "offerState"
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
      "name": "offerState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "paused"
          },
          {
            "name": "archive"
          }
        ]
      }
    },
    {
      "name": "offerType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "buy"
          },
          {
            "name": "sell"
          }
        ]
      }
    },
    {
      "name": "profile",
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
                  "name": "boundedString"
                }
              }
            }
          },
          {
            "name": "encryptionKey",
            "type": {
              "option": {
                "defined": {
                  "name": "boundedString"
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
      "name": "updateOfferParams",
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
                "name": "offerState"
              }
            }
          },
          {
            "name": "description",
            "type": {
              "option": {
                "defined": {
                  "name": "boundedString"
                }
              }
            }
          }
        ]
      }
    }
  ]
};
