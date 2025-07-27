/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/profile.json`.
 */
export type Profile = {
  "address": "3rXtVS7K3Lv1RGLiDiWuKKCd2uvrsD1VxQ9agDTpofg4",
  "metadata": {
    "name": "profile",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "createProfile",
      "discriminator": [
        225,
        205,
        234,
        143,
        17,
        186,
        50,
        220
      ],
      "accounts": [
        {
          "name": "profile",
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
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "user",
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
          "name": "username",
          "type": "string"
        }
      ]
    },
    {
      "name": "updateActiveOffers",
      "discriminator": [
        150,
        12,
        189,
        194,
        247,
        102,
        94,
        155
      ],
      "accounts": [
        {
          "name": "profile",
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
                "path": "profile.owner",
                "account": "profile"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "offerState",
          "type": {
            "defined": {
              "name": "offerState"
            }
          }
        }
      ]
    },
    {
      "name": "updateContact",
      "discriminator": [
        112,
        131,
        30,
        238,
        150,
        187,
        74,
        235
      ],
      "accounts": [
        {
          "name": "profile",
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
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "user",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "contact",
          "type": "string"
        },
        {
          "name": "encryptionKey",
          "type": "string"
        }
      ]
    },
    {
      "name": "updateTradeStats",
      "discriminator": [
        171,
        169,
        113,
        43,
        225,
        230,
        69,
        231
      ],
      "accounts": [
        {
          "name": "profile",
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
                "path": "profile.owner",
                "account": "profile"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "tradeState",
          "type": {
            "defined": {
              "name": "tradeState"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
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
    }
  ],
  "types": [
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
    }
  ]
};
