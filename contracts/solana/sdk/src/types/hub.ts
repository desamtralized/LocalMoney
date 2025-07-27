/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/hub.json`.
 */
export type Hub = {
  "address": "Gr8Kfgo4KvghW2c1rSUNtTLGhJkNkfcvgP9hm4hmRLTB",
  "metadata": {
    "name": "hub",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
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
      "name": "invalidProgramType",
      "msg": "Invalid program type"
    }
  ],
  "types": [
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
          }
        ]
      }
    }
  ]
};
