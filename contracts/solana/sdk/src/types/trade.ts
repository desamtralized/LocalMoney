/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/trade.json`.
 */
export type Trade = {
  "address": "5Tb71Y6Z4G5We8WqJiQAo34nVmc8ZmFo5J7D3VUC5LGX",
  "metadata": {
    "name": "trade",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "acceptRequest",
      "discriminator": [
        4,
        60,
        28,
        227,
        25,
        199,
        246,
        124
      ],
      "accounts": [
        {
          "name": "trade",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "trade.id",
                "account": "trade"
              }
            ]
          }
        },
        {
          "name": "seller",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "sellerContact",
          "type": "string"
        }
      ]
    },
    {
      "name": "cancelRequest",
      "discriminator": [
        65,
        196,
        177,
        247,
        83,
        151,
        33,
        130
      ],
      "accounts": [
        {
          "name": "trade",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "trade.id",
                "account": "trade"
              }
            ]
          }
        },
        {
          "name": "user",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "createTrade",
      "discriminator": [
        183,
        82,
        24,
        245,
        248,
        30,
        204,
        246
      ],
      "accounts": [
        {
          "name": "trade",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "params.trade_id"
              }
            ]
          }
        },
        {
          "name": "offer",
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
          "name": "buyerProfile",
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
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "profileProgram"
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
              "name": "createTradeParams"
            }
          }
        }
      ]
    },
    {
      "name": "fundEscrow",
      "discriminator": [
        155,
        18,
        218,
        141,
        182,
        213,
        69,
        201
      ],
      "accounts": [
        {
          "name": "trade",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "trade.id",
                "account": "trade"
              }
            ]
          }
        },
        {
          "name": "escrowTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101
                ]
              },
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "trade.id",
                "account": "trade"
              }
            ]
          }
        },
        {
          "name": "sellerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "markFiatDeposited",
      "discriminator": [
        67,
        11,
        71,
        238,
        43,
        82,
        71,
        165
      ],
      "accounts": [
        {
          "name": "trade",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "trade.id",
                "account": "trade"
              }
            ]
          }
        },
        {
          "name": "buyer",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "releaseEscrow",
      "discriminator": [
        146,
        253,
        129,
        233,
        20,
        145,
        181,
        206
      ],
      "accounts": [
        {
          "name": "trade",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "trade.id",
                "account": "trade"
              }
            ]
          }
        },
        {
          "name": "escrowTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101
                ]
              },
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "trade.id",
                "account": "trade"
              }
            ]
          }
        },
        {
          "name": "buyerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "buyerProfile",
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
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "sellerProfile",
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
                "path": "seller"
              }
            ]
          }
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "treasury"
        },
        {
          "name": "buyer"
        },
        {
          "name": "seller",
          "signer": true
        },
        {
          "name": "profileProgram"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
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
    },
    {
      "name": "trade",
      "discriminator": [
        132,
        139,
        123,
        31,
        157,
        196,
        244,
        190
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
      "name": "invalidTradeState",
      "msg": "Invalid trade state"
    },
    {
      "code": 6002,
      "name": "arithmeticError",
      "msg": "Arithmetic error"
    },
    {
      "code": 6003,
      "name": "tradeExpired",
      "msg": "Trade expired"
    },
    {
      "code": 6004,
      "name": "disputeWindowNotOpen",
      "msg": "Dispute window not open"
    }
  ],
  "types": [
    {
      "name": "createTradeParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tradeId",
            "type": "u64"
          },
          {
            "name": "offerId",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "lockedPrice",
            "type": "u64"
          },
          {
            "name": "expiryDuration",
            "type": "u64"
          },
          {
            "name": "arbitrator",
            "type": "pubkey"
          },
          {
            "name": "buyerContact",
            "type": "string"
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
              "option": "string"
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
              "option": "string"
            }
          },
          {
            "name": "encryptionKey",
            "type": {
              "option": "string"
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
      "name": "trade",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "offerId",
            "type": "u64"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "arbitrator",
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
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
            "name": "lockedPrice",
            "type": "u64"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "tradeState"
              }
            }
          },
          {
            "name": "createdAt",
            "type": "u64"
          },
          {
            "name": "expiresAt",
            "type": "u64"
          },
          {
            "name": "disputeWindowAt",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "stateHistory",
            "type": {
              "vec": {
                "defined": {
                  "name": "tradeStateItem"
                }
              }
            }
          },
          {
            "name": "buyerContact",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "sellerContact",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tradeState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "requestCreated"
          },
          {
            "name": "requestCanceled"
          },
          {
            "name": "requestExpired"
          },
          {
            "name": "requestAccepted"
          },
          {
            "name": "escrowFunded"
          },
          {
            "name": "escrowCanceled"
          },
          {
            "name": "escrowRefunded"
          },
          {
            "name": "fiatDeposited"
          },
          {
            "name": "escrowReleased"
          },
          {
            "name": "escrowDisputed"
          },
          {
            "name": "settledForMaker"
          },
          {
            "name": "settledForTaker"
          }
        ]
      }
    },
    {
      "name": "tradeStateItem",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "actor",
            "type": "pubkey"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "tradeState"
              }
            }
          },
          {
            "name": "timestamp",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
