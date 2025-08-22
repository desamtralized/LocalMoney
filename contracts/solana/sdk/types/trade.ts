/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/trade.json`.
 */
export type Trade = {
  "address": "5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM",
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
      "name": "assignArbitrator",
      "discriminator": [
        227,
        183,
        153,
        251,
        4,
        55,
        13,
        56
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
                "path": "tradeId"
              }
            ]
          }
        },
        {
          "name": "arbitratorPool"
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "tradeId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "assignArbitratorFallback",
      "discriminator": [
        164,
        119,
        49,
        101,
        143,
        154,
        177,
        36
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
                "path": "tradeId"
              }
            ]
          }
        },
        {
          "name": "arbitratorPool"
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "tradeId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "automaticRefund",
      "docs": [
        "Automatic refund mechanism for expired trades"
      ],
      "discriminator": [
        65,
        23,
        84,
        71,
        5,
        244,
        137,
        103
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
          "name": "seller"
        },
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
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
      "name": "commitRandomness",
      "discriminator": [
        146,
        52,
        195,
        220,
        79,
        30,
        53,
        26
      ],
      "accounts": [
        {
          "name": "trade",
          "writable": true
        },
        {
          "name": "commitReveal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  109,
                  105,
                  116,
                  95,
                  114,
                  101,
                  118,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "tradeId"
              }
            ]
          }
        },
        {
          "name": "committer",
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
          "name": "tradeId",
          "type": "u64"
        },
        {
          "name": "commitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
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
            ],
            "program": {
              "kind": "const",
              "value": [
                46,
                150,
                23,
                146,
                33,
                132,
                177,
                75,
                54,
                186,
                2,
                34,
                238,
                110,
                199,
                236,
                193,
                188,
                212,
                67,
                234,
                78,
                98,
                55,
                59,
                145,
                71,
                79,
                218,
                14,
                165,
                184
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
          "name": "tokenMint"
        },
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "seller"
        },
        {
          "name": "profileProgram"
        },
        {
          "name": "priceProgram"
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
      "name": "deactivateArbitrator",
      "discriminator": [
        32,
        54,
        213,
        237,
        51,
        179,
        5,
        253
      ],
      "accounts": [
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
            ]
          }
        },
        {
          "name": "arbitratorPool",
          "writable": true
        },
        {
          "name": "arbitratorInfo",
          "writable": true
        },
        {
          "name": "arbitrator"
        },
        {
          "name": "authority",
          "signer": true
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
      "name": "initiateDispute",
      "discriminator": [
        128,
        242,
        160,
        23,
        44,
        61,
        171,
        37
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
                "path": "trade.buyer",
                "account": "trade"
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
                "path": "trade.seller",
                "account": "trade"
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
          "name": "user",
          "signer": true
        },
        {
          "name": "profileProgram",
          "docs": [
            "Profile program for CPI call"
          ],
          "address": "6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC"
        },
        {
          "name": "buyer"
        },
        {
          "name": "seller"
        },
        {
          "name": "arbitrator"
        },
        {
          "name": "hubConfig",
          "docs": [
            "Hub configuration for validating program IDs"
          ],
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
          "name": "buyerContact",
          "type": "string"
        },
        {
          "name": "sellerContact",
          "type": "string"
        }
      ]
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
            ]
          }
        },
        {
          "name": "buyer",
          "signer": true
        },
        {
          "name": "seller"
        },
        {
          "name": "arbitrator"
        }
      ],
      "args": []
    },
    {
      "name": "registerArbitrator",
      "discriminator": [
        141,
        158,
        50,
        47,
        214,
        118,
        229,
        183
      ],
      "accounts": [
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
            ]
          }
        },
        {
          "name": "arbitratorPool",
          "writable": true
        },
        {
          "name": "arbitratorInfo",
          "writable": true
        },
        {
          "name": "arbitrator"
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
        }
      ]
    },
    {
      "name": "releaseEscrow",
      "docs": [
        "ADVANCED FEE MANAGEMENT: Enhanced release_escrow with multi-destination fee distribution",
        "Matches CosmWasm pattern for complex fee distribution and LOCAL token burn"
      ],
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
                "kind": "account",
                "path": "trade.offer_id",
                "account": "trade"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                46,
                150,
                23,
                146,
                33,
                132,
                177,
                75,
                54,
                186,
                2,
                34,
                238,
                110,
                199,
                236,
                193,
                188,
                212,
                67,
                234,
                78,
                98,
                55,
                59,
                145,
                71,
                79,
                218,
                14,
                165,
                184
              ]
            }
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
          "writable": true
        },
        {
          "name": "chainFeeTokenAccount",
          "writable": true
        },
        {
          "name": "warchestTokenAccount",
          "writable": true
        },
        {
          "name": "burnReserveAccount",
          "writable": true
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
          "name": "tokenMint"
        },
        {
          "name": "treasury"
        },
        {
          "name": "chainFeeCollector"
        },
        {
          "name": "warchest"
        },
        {
          "name": "burnReserve"
        },
        {
          "name": "buyer"
        },
        {
          "name": "seller",
          "signer": true
        },
        {
          "name": "arbitrator"
        },
        {
          "name": "profileProgram",
          "docs": [
            "Profile program for CPI call"
          ],
          "address": "6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "revealRandomness",
      "discriminator": [
        30,
        130,
        85,
        220,
        208,
        80,
        28,
        169
      ],
      "accounts": [
        {
          "name": "trade",
          "writable": true
        },
        {
          "name": "commitReveal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  109,
                  105,
                  116,
                  95,
                  114,
                  101,
                  118,
                  101,
                  97,
                  108
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
          "name": "arbitratorPool"
        },
        {
          "name": "revealer",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "value",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "nonce",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "selectWeightedArbitratorEnhanced",
      "discriminator": [
        219,
        27,
        207,
        156,
        201,
        239,
        230,
        205
      ],
      "accounts": [
        {
          "name": "trade",
          "writable": true
        },
        {
          "name": "arbitratorPool"
        },
        {
          "name": "recentBlockhashes"
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "tradeId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settleDispute",
      "docs": [
        "ENHANCED SETTLE DISPUTE: Enhanced arbitration with multi-destination fee distribution",
        "Matches CosmWasm pattern for complex fee distribution and LOCAL token burn"
      ],
      "discriminator": [
        155,
        147,
        5,
        44,
        20,
        204,
        146,
        43
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
                "kind": "account",
                "path": "trade.offer_id",
                "account": "trade"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                46,
                150,
                23,
                146,
                33,
                132,
                177,
                75,
                54,
                186,
                2,
                34,
                238,
                110,
                199,
                236,
                193,
                188,
                212,
                67,
                234,
                78,
                98,
                55,
                59,
                145,
                71,
                79,
                218,
                14,
                165,
                184
              ]
            }
          }
        },
        {
          "name": "arbitratorInfo",
          "writable": true
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
          "name": "winnerTokenAccount",
          "writable": true
        },
        {
          "name": "arbitratorTokenAccount",
          "writable": true
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "chainFeeTokenAccount",
          "writable": true
        },
        {
          "name": "warchestTokenAccount",
          "writable": true
        },
        {
          "name": "burnReserveAccount",
          "writable": true
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
                "path": "trade.buyer",
                "account": "trade"
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
                "path": "trade.seller",
                "account": "trade"
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
          "name": "tokenMint"
        },
        {
          "name": "winner"
        },
        {
          "name": "treasury"
        },
        {
          "name": "chainFeeCollector"
        },
        {
          "name": "warchest"
        },
        {
          "name": "burnReserve"
        },
        {
          "name": "arbitrator",
          "signer": true
        },
        {
          "name": "profileProgram",
          "address": "6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC"
        },
        {
          "name": "buyer"
        },
        {
          "name": "seller"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "winner",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "arbitratorInfo",
      "discriminator": [
        83,
        185,
        167,
        107,
        199,
        48,
        207,
        96
      ]
    },
    {
      "name": "arbitratorPool",
      "discriminator": [
        110,
        146,
        61,
        53,
        98,
        139,
        247,
        106
      ]
    },
    {
      "name": "commitRevealRandomness",
      "discriminator": [
        95,
        181,
        97,
        252,
        120,
        162,
        126,
        10
      ]
    },
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
  "events": [
    {
      "name": "arbitratorSelectedEvent",
      "discriminator": [
        214,
        171,
        187,
        112,
        86,
        145,
        144,
        40
      ]
    },
    {
      "name": "randomnessCommittedEvent",
      "discriminator": [
        0,
        140,
        83,
        196,
        174,
        132,
        14,
        149
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
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6004,
      "name": "arithmeticUnderflow",
      "msg": "Arithmetic underflow"
    },
    {
      "code": 6005,
      "name": "divisionByZero",
      "msg": "Division by zero"
    },
    {
      "code": 6006,
      "name": "tradeExpired",
      "msg": "Trade expired"
    },
    {
      "code": 6007,
      "name": "disputeWindowNotOpen",
      "msg": "Dispute window not open"
    },
    {
      "code": 6008,
      "name": "arbitratorAlreadyExists",
      "msg": "Arbitrator already exists"
    },
    {
      "code": 6009,
      "name": "arbitratorPoolFull",
      "msg": "Arbitrator pool is full"
    },
    {
      "code": 6010,
      "name": "noArbitratorsAvailable",
      "msg": "No arbitrators available"
    },
    {
      "code": 6011,
      "name": "invalidArbitrator",
      "msg": "Invalid arbitrator"
    },
    {
      "code": 6012,
      "name": "prematureDisputeRequest",
      "msg": "Premature dispute request"
    },
    {
      "code": 6013,
      "name": "invalidWinner",
      "msg": "Invalid winner"
    },
    {
      "code": 6014,
      "name": "tradeBelowMinimum",
      "msg": "Trade amount below minimum"
    },
    {
      "code": 6015,
      "name": "tradeAboveMaximum",
      "msg": "Trade amount above maximum"
    },
    {
      "code": 6016,
      "name": "invalidTradeAmount",
      "msg": "Invalid trade amount"
    },
    {
      "code": 6017,
      "name": "invalidLockedPrice",
      "msg": "Invalid locked price"
    },
    {
      "code": 6018,
      "name": "invalidStateTransition",
      "msg": "Invalid state transition"
    },
    {
      "code": 6019,
      "name": "invalidAccount",
      "msg": "Invalid account"
    },
    {
      "code": 6020,
      "name": "selfTradeNotAllowed",
      "msg": "Self trade not allowed"
    },
    {
      "code": 6021,
      "name": "invalidArbitratorAssignment",
      "msg": "Invalid arbitrator assignment"
    },
    {
      "code": 6022,
      "name": "unauthorizedCpiCall",
      "msg": "Unauthorized CPI call"
    },
    {
      "code": 6023,
      "name": "invalidCpiData",
      "msg": "Invalid CPI data"
    },
    {
      "code": 6024,
      "name": "excessiveFees",
      "msg": "Excessive fees"
    },
    {
      "code": 6025,
      "name": "excessiveBurnFee",
      "msg": "Excessive burn fee"
    },
    {
      "code": 6026,
      "name": "excessiveChainFee",
      "msg": "Excessive chain fee"
    },
    {
      "code": 6027,
      "name": "excessiveWarchestFee",
      "msg": "Excessive warchest fee"
    },
    {
      "code": 6028,
      "name": "refundNotAllowed",
      "msg": "Refund not allowed"
    },
    {
      "code": 6029,
      "name": "refundTooEarly",
      "msg": "Refund too early"
    },
    {
      "code": 6030,
      "name": "invalidParameter",
      "msg": "Invalid parameter"
    },
    {
      "code": 6031,
      "name": "excessiveConversionFee",
      "msg": "Excessive conversion fee"
    },
    {
      "code": 6032,
      "name": "excessiveArbitrationFees",
      "msg": "Excessive arbitration fees"
    },
    {
      "code": 6033,
      "name": "excessiveArbitratorFee",
      "msg": "Excessive arbitrator fee"
    },
    {
      "code": 6034,
      "name": "tokenConversionFailed",
      "msg": "Token conversion failed"
    },
    {
      "code": 6035,
      "name": "slippageExceeded",
      "msg": "Slippage exceeded maximum"
    },
    {
      "code": 6036,
      "name": "insufficientConversionAmount",
      "msg": "Insufficient conversion amount"
    },
    {
      "code": 6037,
      "name": "invalidConversionRoute",
      "msg": "Invalid conversion route"
    },
    {
      "code": 6038,
      "name": "dexOperationFailed",
      "msg": "DEX operation failed"
    },
    {
      "code": 6039,
      "name": "tokenBurnFailed",
      "msg": "Token burn failed"
    },
    {
      "code": 6040,
      "name": "invalidFeeCalculationMethod",
      "msg": "Invalid fee calculation method"
    },
    {
      "code": 6041,
      "name": "conversionRouteTooComplex",
      "msg": "Conversion route too complex"
    },
    {
      "code": 6042,
      "name": "localTokenConversionRequired",
      "msg": "LOCAL token conversion required"
    },
    {
      "code": 6043,
      "name": "invalidDexProgram",
      "msg": "Invalid DEX program"
    },
    {
      "code": 6044,
      "name": "poolNotFound",
      "msg": "Pool not found"
    },
    {
      "code": 6045,
      "name": "invalidTreasuryAddress",
      "msg": "Invalid treasury address"
    },
    {
      "code": 6046,
      "name": "invalidChainFeeCollector",
      "msg": "Invalid chain fee collector"
    },
    {
      "code": 6047,
      "name": "invalidWarchestAddress",
      "msg": "Invalid warchest address"
    },
    {
      "code": 6048,
      "name": "invalidTokenAccount",
      "msg": "Invalid token account - does not match expected ATA"
    },
    {
      "code": 6049,
      "name": "invalidAccountOwner",
      "msg": "Invalid account owner"
    },
    {
      "code": 6050,
      "name": "invalidPda",
      "msg": "Invalid PDA - does not match expected derivation"
    },
    {
      "code": 6051,
      "name": "invalidProgramAccount",
      "msg": "Invalid program account"
    },
    {
      "code": 6052,
      "name": "stringTooLong",
      "msg": "String exceeds maximum length"
    },
    {
      "code": 6053,
      "name": "collectionFull",
      "msg": "Collection is full"
    },
    {
      "code": 6054,
      "name": "rateLimitExceeded",
      "msg": "Rate limit exceeded"
    },
    {
      "code": 6055,
      "name": "pageFull",
      "msg": "Page is full"
    },
    {
      "code": 6056,
      "name": "invalidPageNumber",
      "msg": "Invalid page number"
    },
    {
      "code": 6057,
      "name": "noRandomnessAvailable",
      "msg": "No randomness available from VRF"
    },
    {
      "code": 6058,
      "name": "noEligibleArbitrators",
      "msg": "No eligible arbitrators available"
    },
    {
      "code": 6059,
      "name": "vrfRequestFailed",
      "msg": "VRF request failed"
    },
    {
      "code": 6060,
      "name": "invalidReveal",
      "msg": "Invalid reveal in commit-reveal scheme"
    },
    {
      "code": 6061,
      "name": "notInRevealPhase",
      "msg": "Not in reveal phase"
    },
    {
      "code": 6062,
      "name": "noCommitmentFound",
      "msg": "Commitment not found"
    },
    {
      "code": 6063,
      "name": "alreadyCommitted",
      "msg": "Already committed randomness"
    },
    {
      "code": 6064,
      "name": "commitPhaseEnded",
      "msg": "Commit phase has ended"
    }
  ],
  "types": [
    {
      "name": "arbitratorInfo",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arbitrator",
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
            "name": "totalCases",
            "type": "u64"
          },
          {
            "name": "resolvedCases",
            "type": "u64"
          },
          {
            "name": "reputationScore",
            "type": "u16"
          },
          {
            "name": "registrationDate",
            "type": "i64"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "arbitratorPool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fiatCurrency",
            "type": {
              "defined": {
                "name": "fiatCurrency"
              }
            }
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "pageCount",
            "type": "u32"
          },
          {
            "name": "totalArbitrators",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "arbitratorSelectedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tradeId",
            "type": "u64"
          },
          {
            "name": "arbitrator",
            "type": "pubkey"
          },
          {
            "name": "randomness",
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
      "name": "boundedStateHistory",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "items",
            "type": {
              "array": [
                {
                  "option": {
                    "defined": {
                      "name": "tradeStateItem"
                    }
                  }
                },
                20
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
      "name": "commitData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "committer",
            "type": "pubkey"
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "commitRevealRandomness",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tradeId",
            "type": "u64"
          },
          {
            "name": "commits",
            "type": {
              "vec": {
                "defined": {
                  "name": "commitData"
                }
              }
            }
          },
          {
            "name": "reveals",
            "type": {
              "vec": {
                "defined": {
                  "name": "revealData"
                }
              }
            }
          },
          {
            "name": "finalSeed",
            "type": {
              "option": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          },
          {
            "name": "revealDeadline",
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
      "name": "randomnessCommittedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tradeId",
            "type": "u64"
          },
          {
            "name": "committer",
            "type": "pubkey"
          },
          {
            "name": "commitment",
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
      "name": "revealData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "revealer",
            "type": "pubkey"
          },
          {
            "name": "value",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "nonce",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
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
              "defined": {
                "name": "boundedStateHistory"
              }
            }
          },
          {
            "name": "buyerContact",
            "type": {
              "option": {
                "defined": {
                  "name": "boundedString"
                }
              }
            }
          },
          {
            "name": "sellerContact",
            "type": {
              "option": {
                "defined": {
                  "name": "boundedString"
                }
              }
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
            "name": "disputeOpened"
          },
          {
            "name": "disputeResolved"
          },
          {
            "name": "released"
          },
          {
            "name": "settledForMaker"
          },
          {
            "name": "settledForTaker"
          },
          {
            "name": "refunded"
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
            "type": "i64"
          }
        ]
      }
    }
  ]
};
