/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/price.json`.
 */
export type Price = {
  "address": "CC9asnBvEMa1hrwKAeubWr8oBmLdYGdQmCc9hSHMEFmQ",
  "metadata": {
    "name": "price",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
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
      ],
      "returns": "u64"
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
    }
  ],
  "types": [
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
    }
  ]
};
