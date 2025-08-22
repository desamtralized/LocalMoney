/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/hub.json`.
 */
export type Hub = {
  "address": "2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2",
  "metadata": {
    "name": "hub",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addGuardian",
      "discriminator": [
        167,
        189,
        170,
        27,
        74,
        240,
        201,
        241
      ],
      "accounts": [
        {
          "name": "hubConfig",
          "writable": true,
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
          "name": "authority",
          "signer": true,
          "relations": [
            "hubConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "guardian",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "approvePause",
      "discriminator": [
        149,
        48,
        3,
        81,
        156,
        74,
        195,
        172
      ],
      "accounts": [
        {
          "name": "hubConfig",
          "writable": true,
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
          "name": "pauseApproval",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  117,
                  115,
                  101,
                  95,
                  97,
                  112,
                  112,
                  114,
                  111,
                  118,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pause_approval.pause_type",
                "account": "pauseApproval"
              }
            ]
          }
        },
        {
          "name": "guardian",
          "signer": true
        }
      ],
      "args": []
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
          "name": "hubConfig",
          "writable": true,
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
          "name": "params",
          "type": {
            "defined": {
              "name": "initializeParams"
            }
          }
        }
      ]
    },
    {
      "name": "initiatePause",
      "discriminator": [
        127,
        34,
        235,
        228,
        144,
        146,
        49,
        132
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
          "name": "pauseApproval",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  117,
                  115,
                  101,
                  95,
                  97,
                  112,
                  112,
                  114,
                  111,
                  118,
                  97,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "pauseType"
              }
            ]
          }
        },
        {
          "name": "guardian",
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
          "name": "pauseType",
          "type": {
            "defined": {
              "name": "pauseType"
            }
          }
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
      "name": "registerProgram",
      "discriminator": [
        104,
        9,
        166,
        5,
        200,
        228,
        112,
        131
      ],
      "accounts": [
        {
          "name": "hubConfig",
          "writable": true,
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
          "name": "authority",
          "signer": true,
          "relations": [
            "hubConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "programId",
          "type": "pubkey"
        },
        {
          "name": "programType",
          "type": {
            "defined": {
              "name": "programType"
            }
          }
        }
      ]
    },
    {
      "name": "removeGuardian",
      "discriminator": [
        72,
        117,
        160,
        244,
        155,
        185,
        71,
        18
      ],
      "accounts": [
        {
          "name": "hubConfig",
          "writable": true,
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
          "name": "authority",
          "signer": true,
          "relations": [
            "hubConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "guardian",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "resumeProtocol",
      "discriminator": [
        62,
        91,
        76,
        18,
        174,
        87,
        87,
        208
      ],
      "accounts": [
        {
          "name": "hubConfig",
          "writable": true,
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
          "name": "authority",
          "signer": true,
          "relations": [
            "hubConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "pauseType",
          "type": {
            "defined": {
              "name": "pauseType"
            }
          }
        }
      ]
    },
    {
      "name": "setGuardianThreshold",
      "discriminator": [
        85,
        225,
        97,
        126,
        126,
        73,
        15,
        44
      ],
      "accounts": [
        {
          "name": "hubConfig",
          "writable": true,
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
          "name": "authority",
          "signer": true,
          "relations": [
            "hubConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "requiredSignatures",
          "type": "u8"
        }
      ]
    },
    {
      "name": "updateConfig",
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "hubConfig",
          "writable": true,
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
          "name": "authority",
          "signer": true,
          "relations": [
            "hubConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "updateConfigParams"
            }
          }
        }
      ]
    },
    {
      "name": "updateProgramVersions",
      "discriminator": [
        123,
        66,
        238,
        247,
        10,
        247,
        182,
        206
      ],
      "accounts": [
        {
          "name": "hubConfig",
          "writable": true,
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
          "name": "upgradeAuthority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "updateProgramVersionsParams"
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
      "name": "pauseApproval",
      "discriminator": [
        15,
        81,
        106,
        186,
        217,
        158,
        170,
        11
      ]
    }
  ],
  "events": [
    {
      "name": "emergencyPauseEvent",
      "discriminator": [
        159,
        241,
        192,
        232,
        29,
        208,
        51,
        21
      ]
    },
    {
      "name": "guardianAddedEvent",
      "discriminator": [
        70,
        163,
        168,
        110,
        229,
        33,
        222,
        72
      ]
    },
    {
      "name": "guardianRemovedEvent",
      "discriminator": [
        96,
        80,
        129,
        201,
        8,
        10,
        133,
        66
      ]
    },
    {
      "name": "protocolResumedEvent",
      "discriminator": [
        213,
        125,
        245,
        148,
        202,
        50,
        203,
        63
      ]
    },
    {
      "name": "thresholdUpdatedEvent",
      "discriminator": [
        92,
        37,
        94,
        1,
        80,
        168,
        25,
        222
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
      "name": "invalidFeeRate",
      "msg": "Invalid fee rate"
    },
    {
      "code": 6002,
      "name": "invalidFeePercentage",
      "msg": "Invalid fee percentage (must be <= 10000 bps)"
    },
    {
      "code": 6003,
      "name": "excessiveFeeTotal",
      "msg": "Total fee percentages exceed 10000 bps"
    },
    {
      "code": 6004,
      "name": "invalidProgramType",
      "msg": "Invalid program type"
    },
    {
      "code": 6005,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6006,
      "name": "unauthorizedUpgrade",
      "msg": "Unauthorized program upgrade attempt"
    },
    {
      "code": 6007,
      "name": "arithmeticUnderflow",
      "msg": "Arithmetic underflow"
    },
    {
      "code": 6008,
      "name": "divisionByZero",
      "msg": "Division by zero"
    },
    {
      "code": 6009,
      "name": "globalPause",
      "msg": "Protocol is globally paused"
    },
    {
      "code": 6010,
      "name": "tradingPaused",
      "msg": "Trading is temporarily paused"
    },
    {
      "code": 6011,
      "name": "depositsPaused",
      "msg": "Deposits are temporarily paused"
    },
    {
      "code": 6012,
      "name": "withdrawalsPaused",
      "msg": "Withdrawals are temporarily paused"
    },
    {
      "code": 6013,
      "name": "offersPaused",
      "msg": "Offer creation is temporarily paused"
    },
    {
      "code": 6014,
      "name": "notGuardian",
      "msg": "Not an authorized guardian"
    },
    {
      "code": 6015,
      "name": "maxGuardiansReached",
      "msg": "Maximum guardians reached"
    },
    {
      "code": 6016,
      "name": "insufficientSignatures",
      "msg": "Insufficient guardian signatures"
    },
    {
      "code": 6017,
      "name": "resumeTooEarly",
      "msg": "Resume time not reached"
    },
    {
      "code": 6018,
      "name": "invalidPauseType",
      "msg": "Invalid pause type"
    },
    {
      "code": 6019,
      "name": "approvalExpired",
      "msg": "Approval expired"
    },
    {
      "code": 6020,
      "name": "alreadySigned",
      "msg": "Already signed this pause approval"
    },
    {
      "code": 6021,
      "name": "pauseApprovalNotFound",
      "msg": "Pause approval not found"
    },
    {
      "code": 6022,
      "name": "pauseAlreadyExecuted",
      "msg": "Pause already executed"
    },
    {
      "code": 6023,
      "name": "invalidThreshold",
      "msg": "Invalid guardian threshold"
    },
    {
      "code": 6024,
      "name": "stringTooLong",
      "msg": "String exceeds maximum length"
    },
    {
      "code": 6025,
      "name": "collectionFull",
      "msg": "Collection is full"
    },
    {
      "code": 6026,
      "name": "rateLimitExceeded",
      "msg": "Rate limit exceeded"
    },
    {
      "code": 6027,
      "name": "pageFull",
      "msg": "Page is full"
    },
    {
      "code": 6028,
      "name": "invalidPageNumber",
      "msg": "Invalid page number"
    }
  ],
  "types": [
    {
      "name": "emergencyPauseEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pauseType",
            "type": {
              "defined": {
                "name": "pauseType"
              }
            }
          },
          {
            "name": "guardian",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
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
            "name": "autoResumeAfter",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "guardianAddedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "guardian",
            "type": "pubkey"
          },
          {
            "name": "addedBy",
            "type": "pubkey"
          },
          {
            "name": "guardianCount",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "guardianRemovedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "guardian",
            "type": "pubkey"
          },
          {
            "name": "removedBy",
            "type": "pubkey"
          },
          {
            "name": "guardianCount",
            "type": "u8"
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
      "name": "initializeParams",
      "type": {
        "kind": "struct",
        "fields": [
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
            "name": "upgradeAuthority",
            "type": "pubkey"
          },
          {
            "name": "requiredSignatures",
            "type": {
              "option": "u8"
            }
          }
        ]
      }
    },
    {
      "name": "pauseApproval",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pauseType",
            "type": {
              "defined": {
                "name": "pauseType"
              }
            }
          },
          {
            "name": "signatures",
            "type": {
              "array": [
                "pubkey",
                5
              ]
            }
          },
          {
            "name": "signatureCount",
            "type": "u8"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "executed",
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
      "name": "pauseType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "global"
          },
          {
            "name": "trading"
          },
          {
            "name": "deposits"
          },
          {
            "name": "withdrawals"
          },
          {
            "name": "offers"
          }
        ]
      }
    },
    {
      "name": "programType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "profile"
          },
          {
            "name": "offer"
          },
          {
            "name": "trade"
          },
          {
            "name": "price"
          }
        ]
      }
    },
    {
      "name": "protocolResumedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pauseType",
            "type": {
              "defined": {
                "name": "pauseType"
              }
            }
          },
          {
            "name": "resumedBy",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "thresholdUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "newThreshold",
            "type": "u8"
          },
          {
            "name": "updatedBy",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "updateConfigParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "localTokenMint",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "jupiterProgram",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "chainFeeCollector",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "warchestAddress",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "burnFeePct",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "chainFeePct",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "warchestFeePct",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "conversionFeePct",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "maxSlippageBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "minConversionAmount",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "maxConversionRoutes",
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "feeRate",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "burnRate",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "warchestRate",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "tradeLimitMin",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "tradeLimitMax",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "tradeExpirationTimer",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "tradeDisputeTimer",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "arbitrationFeeRate",
            "type": {
              "option": "u16"
            }
          }
        ]
      }
    },
    {
      "name": "updateProgramVersionsParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "profileProgramVersion",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "offerProgramVersion",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "tradeProgramVersion",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "priceProgramVersion",
            "type": {
              "option": "u16"
            }
          }
        ]
      }
    }
  ]
};
