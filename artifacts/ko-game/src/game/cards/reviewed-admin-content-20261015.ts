import type { CardAbility } from '../effects/types';
import type { PublishedCardRecord } from './published-cards';

// Authenticated administrator revisions; literal ID/text bindings, no runtime text parser.
const bindings: Record<string, { text: string; abilities: CardAbility[] }> = {
  "595fe36e-03fb-4f31-aaa3-904c999030aa": {
    "text": "턴 종료:아군 챔피언에게 3 데미지를 주고 아군 필드에 있는 무작위 선수 카드 한장에게 공격력을 2 증가시킵니다.",
    "abilities": [
      {
        "trigger": "TURN_END",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "DAMAGE",
            "target": {
              "zone": "PLAYER",
              "owner": "SELF",
              "selection": "SELF",
              "count": 1
            },
            "values": {
              "amount": 3
            }
          },
          {
            "type": "STRUCTURED",
            "action": "BUFF",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "count": 1
            },
            "values": {
              "attack": 2,
              "health": 0
            }
          }
        ]
      }
    ]
  },
  "d5911f5e-1273-4281-86f2-f35dba4dbf8d": {
    "text": "내 챔피언이 데미지를 입을때 마다 이 카드에게 공격력을 1 부여합니다.",
    "abilities": [
      {
        "trigger": "SELF_ENTERED",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "REGISTER_LISTENER",
            "values": {
              "listener": {
                "trigger": "DAMAGE_TAKEN",
                "owner": "SELF",
                "requiresActiveSource": true,
                "damageTarget": "PLAYER",
                "effect": {
                  "action": "BUFF",
                  "target": {
                    "zone": "BOARD",
                    "owner": "SELF",
                    "selection": "SELF",
                    "count": 1
                  },
                  "values": {
                    "attack": 1,
                    "health": 0
                  }
                }
              }
            }
          }
        ]
      }
    ]
  },
  "4e28e957-1148-44c3-8f8b-b6fe8f40e3a9": {
    "text": "등장:이 카드를 제외한 '디 어쏘리티' 태그가 있는 무작위 카드 1장을 내 손패에 생성하고, 내 필드와 손패에 있는 '디 어쏘리티' 태그가 있는 카드 1장마다 이 카드에게 +1/+1을 부여합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "SCRIPT",
            "script": {
              "version": "SCRIPT_V1",
              "trigger": "ENTER_FIELD",
              "steps": [
                {
                  "type": "EFFECT",
                  "effect": {
                    "action": "GENERATE",
                    "target": {
                      "zone": "HAND",
                      "owner": "SELF",
                      "selection": "RANDOM",
                      "randomScope": "STANDARD",
                      "count": 1,
                      "filter": {
                        "tagsAny": [
                          "디 어쏘리티"
                        ],
                        "excludeSource": true
                      }
                    },
                    "values": {
                      "count": 1,
                      "destination": "HAND"
                    }
                  }
                },
                {
                  "type": "SELECT",
                  "id": "tagged",
                  "target": {
                    "zones": [
                      "HAND",
                      "BOARD"
                    ],
                    "owner": "SELF",
                    "selection": "ALL",
                    "count": 100,
                    "filter": {
                      "tagsAny": [
                        "디 어쏘리티"
                      ]
                    }
                  }
                },
                {
                  "type": "AGGREGATE",
                  "id": "taggedCount",
                  "selectionId": "tagged",
                  "operation": "COUNT"
                },
                {
                  "type": "EFFECT",
                  "effect": {
                    "action": "BUFF",
                    "target": {
                      "zone": "BOARD",
                      "owner": "SELF",
                      "selection": "SELF",
                      "count": 1
                    },
                    "values": {
                      "attackExpression": {
                        "kind": "RESULT_VALUE",
                        "resultId": "taggedCount"
                      },
                      "healthExpression": {
                        "kind": "RESULT_VALUE",
                        "resultId": "taggedCount"
                      }
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  },
  "93bc21b5-4801-4931-b121-8f9fa8a551bd": {
    "text": "등장:자신의 필드에 있는 선수 카드들 중 자신을 제외한 무작위 1장에게 +1/+1을 부여합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "BUFF",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "count": 1,
              "filter": {
                "excludeSource": true
              }
            },
            "values": {
              "attack": 1,
              "health": 1
            }
          }
        ]
      }
    ]
  },
  "8dd9f1f7-0c27-4176-b98b-7a0e13bad3c9": {
    "text": "등장:필드에 있는 아군 혹은 챔피언에게 2 데미지를 주고 이 카드에게 +1/+1을 부여합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "DAMAGE",
            "target": {
              "zone": "CHARACTER",
              "owner": "SELF",
              "selection": "PLAYER_CHOICE",
              "count": 1
            },
            "values": {
              "amount": 2
            }
          },
          {
            "type": "STRUCTURED",
            "action": "BUFF",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "selection": "SELF",
              "count": 1
            },
            "values": {
              "attack": 1,
              "health": 1
            }
          }
        ]
      }
    ]
  },
  "3fef0a3f-93c9-477c-a958-2f26af360104": {
    "text": "등장:필드에 있는 아군 선수를 하나 선택해서 .파괴의 전령.으로 지정합니다! 그 카드에게 다음과 같은 효과를 부여합니다.\n파괴의 전령:이 카드가 상대 선수 카드를 리타이어시킬때 리타이어시키지 않고 파괴시킵니다. 이 카드가 있을때 필드에서 선수 카드가 파괴 될때마다 이 카드는 +1/+1을 얻습니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "GRANT_RANDOM_CARD_TEXT",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "PLAYER_CHOICE",
              "count": 1
            },
            "values": {
              "definition": {
                "id": "reviewed-destruction-messenger-20261015",
                "name": "파괴의 전령",
                "cost": 0,
                "attack": 0,
                "health": 1,
                "rulesText": "이 카드가 상대 선수 카드를 리타이어시킬때 리타이어시키지 않고 파괴시킵니다. 이 카드가 있을때 필드에서 선수 카드가 파괴 될때마다 이 카드는 +1/+1을 얻습니다.",
                "keywords": [],
                "isToken": true,
                "isChampionToken": false,
                "abilities": [
                  {
                    "trigger": "ANY_BEFORE_RETIRE",
                    "effects": [],
                    "retirementReplacementScope": "SOURCE_CAUSED_ENEMY"
                  },
                  {
                    "trigger": "CARD_DESTROYED",
                    "effects": [
                      {
                        "type": "STRUCTURED",
                        "action": "BUFF",
                        "target": {
                          "zone": "BOARD",
                          "owner": "SELF",
                          "selection": "SELF",
                          "count": 1
                        },
                        "values": {
                          "attack": 1,
                          "health": 1
                        }
                      }
                    ]
                  }
                ]
              }
            }
          }
        ]
      }
    ]
  },
  "9716aeaa-cbc4-4374-bedc-2f40054b72de": {
    "text": "등장:이 카드를 제외한 '디 어쏘리티' 태그가 있는 무작위 선수 카드 한장을 손패에 추가합니다. 그리고 그 카드에게 '치유'를 부여합니다.\n턴 종료:아군 선수와 챔피언의 체력을 1 회복합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "GENERATE",
            "target": {
              "zone": "HAND",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "randomScope": "STANDARD",
              "count": 1,
              "filter": {
                "tagsAny": [
                  "디 어쏘리티"
                ],
                "excludeSource": true
              }
            },
            "values": {
              "count": 1,
              "destination": "HAND",
              "generatedKeywords": [
                "REGEN"
              ]
            }
          }
        ]
      },
      {
        "trigger": "TURN_END",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "HEAL",
            "target": {
              "zone": "CHARACTER",
              "owner": "SELF",
              "selection": "ALL",
              "count": 5
            },
            "values": {
              "amount": 1
            }
          }
        ]
      }
    ]
  },
  "393dbf7c-7f61-418a-ba1a-4726500ab0aa": {
    "text": "등장: 선택한 적 선수에게 1 피해를 줍니다.\n핀폴:이 카드에게 +1/+1를 부여합니다. 만약에 아군 필드에 '디 어쏘리티' 태그가 있는 카드가 있었다면 해당 카드들에게도 +1/+1을 부여합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "DAMAGE",
            "target": {
              "zone": "BOARD",
              "owner": "ENEMY",
              "cardType": "WRESTLER",
              "selection": "PLAYER_CHOICE",
              "count": 1
            },
            "values": {
              "amount": 1
            }
          }
        ]
      },
      {
        "trigger": "EXACT_ZERO_DAMAGE",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "BUFF",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "selection": "SELF",
              "count": 1
            },
            "values": {
              "attack": 1,
              "health": 1
            }
          },
          {
            "type": "STRUCTURED",
            "action": "BUFF",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "ALL",
              "count": 4,
              "filter": {
                "tagsAny": [
                  "디 어쏘리티"
                ],
                "excludeSource": true
              }
            },
            "values": {
              "attack": 1,
              "health": 1
            }
          }
        ]
      }
    ]
  },
  "crisis-awakening-dealer": {
    "text": "이 카드가 필드에 소환되면 이 카드에게 이번 게임에서 리타이어하거나 파괴 된 아군 선수의 수만큼 공격력을 증가시킵니다.\n이 카드는 상대 필드에 선수 카드가 없을때만 상대 챔피언을 공격 할 수 있습니다.",
    "abilities": [
      {
        "trigger": "SELF_ENTERED",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "BUFF",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "selection": "SELF",
              "count": 1
            },
            "values": {
              "attackReference": "ALLIED_REMOVED_WRESTLER_COUNT"
            }
          }
        ]
      },
      {
        "trigger": "BEFORE_ATTACK",
        "effects": [],
        "cannotAttackChampionWhileEnemyBoardOccupied": true
      }
    ]
  },
  "29473daa-309c-41e0-bff4-c4b69b062d2f": {
    "text": "내 필드에 있는 모든 선수 카드들에게 공격력을 2 부여하고 추가로 해당 선수 카드들에게 '수배'를 추가합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "BUFF",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "ALL",
              "count": 4
            },
            "values": {
              "attack": 2,
              "health": 0
            }
          },
          {
            "type": "STRUCTURED",
            "action": "ADD_KEYWORD",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "ALL",
              "count": 4
            },
            "values": {
              "keyword": "WANTED"
            }
          }
        ]
      }
    ]
  },
  "df532c95-0e4d-4b17-8200-a86e6a682341": {
    "text": "등장: 자신의 양 옆에 '디 어쏘리티' 태그가 있는 카드들 중에서 무작위로 소환하고 자신을 제외한 생성한 그 선수 카드들에게 '도발'을 부여합니다. 이 카드가 필드에 있을때 '디 어쏘리티' 카드가 소환되거나 등장할때 그 카드에게 +1/+1을 부여합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "SUMMON",
            "target": {
              "zone": "BOARD",
              "count": 2,
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "ADJACENT_EMPTY_SLOTS",
              "randomScope": "STANDARD",
              "filter": {
                "tagsAny": [
                  "디 어쏘리티"
                ]
              }
            }
          },
          {
            "type": "STRUCTURED",
            "action": "ADD_KEYWORD",
            "target": {
              "zone": "BOARD",
              "count": 2,
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "SAME_TARGET"
            },
            "values": {
              "keyword": "TAUNT",
              "resolvedAutomaticTarget": true
            }
          }
        ]
      },
      {
        "trigger": "CARD_ENTERED",
        "eventOwner": "SELF",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "BUFF",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "SAME_TARGET",
              "count": 1,
              "filter": {
                "tagsAny": [
                  "디 어쏘리티"
                ]
              }
            },
            "values": {
              "attack": 1,
              "health": 1,
              "resolvedAutomaticTarget": true
            }
          }
        ]
      }
    ]
  },
  "latest-wrestler-11": {
    "text": "이 카드가 공격할때마다 상대 덱에서 무작위 카드 1장을 내 손으로 훔쳐옵니다. 이때 아군 필드에 '디 어쏘리티' 카드가 있었다면 '회피(1)'을 얻습니다.",
    "abilities": [
      {
        "trigger": "SELF_ATTACK",
        "effects": [
          {
            "type": "SCRIPT",
            "script": {
              "steps": [
                {
                  "id": "stolenCard",
                  "type": "SELECT",
                  "target": {
                    "zone": "DECK",
                    "count": 1,
                    "owner": "ENEMY",
                    "selection": "RANDOM",
                    "randomScope": "STANDARD"
                  }
                },
                {
                  "type": "EFFECT",
                  "effect": {
                    "action": "STEAL",
                    "target": {
                      "zone": "DECK",
                      "count": 1,
                      "owner": "ENEMY",
                      "resultId": "stolenCard",
                      "selection": "ALL"
                    }
                  }
                }
              ],
              "trigger": "SELF_ATTACK",
              "version": "SCRIPT_V1"
            }
          }
        ]
      },
      {
        "trigger": "SELF_ATTACK",
        "condition": {
          "type": "BOARD_HAS_TAG",
          "tag": "디 어쏘리티"
        },
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "ADD_KEYWORD",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "selection": "SELF",
              "count": 1
            },
            "values": {
              "keyword": "DODGE"
            }
          }
        ]
      }
    ]
  },
  "latest-wrestler-4": {
    "text": "등장:손패에 '만찬'을 비용 1 깍아서 한장 추가합니다. 만약에 필드에 '디 어쏘리티'가 있었다면 비용을 추가로 1 더 깍습니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "GENERATE",
            "values": {
              "definitionRef": {
                "id": "epic-spell-feast"
              },
              "destination": "HAND",
              "count": 1,
              "generatedModifiers": {
                "cost": -1
              }
            }
          }
        ],
        "condition": {
          "type": "BOARD_HAS_TAG",
          "tag": "디 어쏘리티",
          "present": false
        }
      },
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "GENERATE",
            "values": {
              "definitionRef": {
                "id": "epic-spell-feast"
              },
              "destination": "HAND",
              "count": 1,
              "generatedModifiers": {
                "cost": -2
              }
            }
          }
        ],
        "condition": {
          "type": "BOARD_HAS_TAG",
          "tag": "디 어쏘리티",
          "present": true
        }
      }
    ]
  },
  "9b7c0e52-2184-4ec1-8d68-39a4d5981d2a": {
    "text": "아군 필드에 '디 어쏘리티' 태그가 있는 카드가 있다면 아머(1)을 얻습니다. 그리고 추가로 아군 필드에 이름에 '조킹루이지'라는 이름이 들어간 카드가 있다면 '치유'를 얻습니다.",
    "abilities": [
      {
        "trigger": "SELF_ENTERED",
        "effects": [],
        "persistentFieldGrants": {
          "armorTag": "디 어쏘리티",
          "regenNameContains": "조킹루이지"
        }
      }
    ]
  },
  "3d11ff5a-f21c-4e89-9c68-fc7bb8f2a6b9": {
    "text": "턴 종료:자신의 필드에 있는 수배 키워드가 있는 선수 카드만큼 다음 턴에 추가 골드를 얻고, 다음턴에 얻는 추가 1 골드 당 이 카드에게 +1/+1을 부여합니다. \n이 카드가 필드에 있는 동안 상대방이 다음 턴에 기본 골드를 제외한 추가 골드를 얻을때마다 그걸 무효화하고 이 카드에게 +1/+1을 부여합니다.",
    "abilities": [
      {
        "trigger": "TURN_END",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "ADD_NEXT_TURN_GOLD",
            "values": {
              "amountReference": "BOARD_WANTED_COUNT"
            }
          },
          {
            "type": "STRUCTURED",
            "action": "BUFF",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "selection": "SELF",
              "count": 1
            },
            "values": {
              "buffFromReservedGold": true
            }
          }
        ]
      },
      {
        "trigger": "SELF_ENTERED",
        "effects": [],
        "interceptOpponentTurnBonusGold": true
      }
    ]
  }
};

export function reviewedLatestAdminAbilities(card: PublishedCardRecord): CardAbility[] | null {
 const entry = bindings[card.id];
 return entry && (!card.effectId || card.id === 'crisis-awakening-dealer') && entry.text.replace(/\s+/gu, '') === card.text.replace(/\s+/gu, '') ? structuredClone(entry.abilities) : null;
}
