import type { CardAbility, CardKeyword } from '../effects/types';
import type { PublishedCardRecord } from './published-cards';

// Literal, reviewed administrator revisions. No runtime language interpretation.
// User clarifications: effect summons skip entry effects; Blood Donor hits own champion.
const bindings: Record<string, {text: string; textAliases?: string[]; abilities: CardAbility[]; keywords?:CardKeyword[]}> = {
  // Administrator revision 14, verified by authenticated read on 2026-10-15.
  "b723c7e6-c668-4afb-b77d-da0d16f16c31": {
  "text": "등장:상대 필드에 있는 선수 카드들 중 무작위로 한장을 파괴합니다.",
  "abilities": [
    {
      "trigger": "ENTER_FIELD",
      "effects": [
        {
          "type": "STRUCTURED",
          "action": "DESTROY",
          "target": {
            "zone": "BOARD",
            "owner": "ENEMY",
            "cardType": "WRESTLER",
            "selection": "RANDOM",
            "count": 1
          }
        }
      ]
    }
  ]
},
  "7653f417-ea62-4924-8605-3d88a435d728": {
    "text": "등장:상대 필드에 있는 선수 카드들 중에서 이 카드보다 공격력이 낮은 카드 1장을 침묵시킵니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "SILENCE",
            "target": {
              "zone": "BOARD",
              "owner": "ENEMY",
              "cardType": "WRESTLER",
              "selection": "PLAYER_CHOICE",
              "count": 1
            },
            "values": {
              "targetAttackBelowSource": true
            }
          }
        ]
      }
    ]
  },
  "31b1e88f-87cb-43e0-9ccd-d45e90b65ee1": {
    "text": "등장:선택한 상대 선수 카드의 공격력을 1 빼았습니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "MODIFY_STAT",
            "target": {
              "zone": "BOARD",
              "owner": "ENEMY",
              "cardType": "WRESTLER",
              "selection": "PLAYER_CHOICE",
              "count": 1
            },
            "values": {
              "stat": "ATTACK",
              "drainAttackAmount": 1
            }
          }
        ]
      }
    ]
  },
  "5d568663-55e8-4ad9-88b3-3afadae538d0": {
    text: "등장: 상대 선수 1장의 공격력을 최대 2 감소시키고, 실제로 감소시킨 만큼 이 카드의 공격력을 증가시킵니다.",
    // Keep already-published records usable while their wording is synchronized.
    textAliases: ["등장: 상대 선수 1장의 공격력을 2 감소시키고, 이 카드의 공격력을 3 증가시킵니다."],
    abilities: [{
      trigger: 'ENTER_FIELD',
      effects: [{
        type: 'STRUCTURED', action: 'MODIFY_STAT',
        target: {zone: 'BOARD', owner: 'ENEMY', cardType: 'WRESTLER', selection: 'PLAYER_CHOICE', count: 1},
        values: {stat: 'ATTACK', drainAttackAmount: 2},
      }],
    }],
  },
  "595fe36e-03fb-4f31-aaa3-904c999030aa": {
    "text": "턴 종료:아군 챔피언에게 2 데미지를 주고 아군 필드에 있는 무작위 선수 카드 한장에게 공격력을 2 증가시킵니다.",
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
              "amount": 2
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
  "0070ec99-c8ea-4d6c-acaf-39e6a0e1544b": {
    "text": "등장:챔피언에게 3 데미지를 주고 다음 턴에 1 골드를 추가로 받습니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
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
            "action": "ADD_NEXT_TURN_GOLD",
            "values": {
              "amount": 1
            }
          }
        ]
      }
    ]
  },
  "4ffa6b14-6a68-454e-97c8-c54d913967b3": {
    "text": "등장:무작위 선수 카드 1장을 손패에 추가합니다.",
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
              "selection": "RANDOM",
              "randomScope": "STANDARD",
              "count": 1,
              "cardType": "WRESTLER"
            },
            "values": {
              "count": 1,
              "destination": "HAND"
            }
          }
        ]
      }
    ]
  },
  "cd84d2e5-1622-4f41-b8db-b77b439d6753": {
    "text": "등장:'닌자'를 자신의 필드에 소환합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "SUMMON",
            "values": {
              "definitionRef": {
                "id": "cd84d2e5-1622-4f41-b8db-b77b439d6753"
              },
              "count": 1
            }
          }
        ]
      }
    ]
  },
  "64e55d20-de58-477a-9312-e49caebef116": {
    "text": "등장:내 필드에 있는 선수 카드 중 한장을 선택해서 그 카드에게 공격력을 1 부여합니다.",
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
              "selection": "PLAYER_CHOICE",
              "count": 1
            },
            "values": {
              "attack": 1,
              "health": 0
            }
          }
        ]
      }
    ]
  },
  "505f864f-65cc-47fb-a894-8385ac439031": {
    "text": "턴 종료:상대 필드에 있는 선수 카드들의 공격력을 1 깍습니다.",
    "abilities": [
      {
        "trigger": "TURN_END",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "MODIFY_STAT",
            "target": {
              "zone": "BOARD",
              "owner": "ENEMY",
              "cardType": "WRESTLER",
              "selection": "ALL",
              "count": 4
            },
            "values": {
              "stat": "ATTACK",
              "amount": -1
            }
          }
        ]
      }
    ]
  },
  "6dd8a678-e2fc-45a2-9bd6-831d7a990333": {
    "text": "턴 종료:내 필드에 있는 선수 카드들의 체력을 1 증가시킵니다.",
    "abilities": [
      {
        "trigger": "TURN_END",
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
              "attack": 0,
              "health": 1
            }
          }
        ]
      }
    ]
  },
  "8c3df344-0937-4116-b6e2-d08dd0b98beb": {
    "text": "등장:내 무덤에서 3 코스트 이하의 무작위 선수 카드들 중 무작위로 한장을 내 손패로 보냅니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "MOVE_TO_HAND",
            "target": {
              "zone": "GRAVEYARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "randomScope": "FULL",
              "count": 1,
              "filter": {
                "maxCost": 3
              }
            }
          }
        ]
      }
    ]
  },
  "93bc21b5-4801-4931-b121-8f9fa8a551bd": {
    "text": "등장:자신의 필드에 있는 선수 카드들 중 무작위로 1장에게 +1/+1을 부여합니다.",
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
  "ac8d04b3-f100-4f99-a34e-344383820d76": {
    "text": "등장:아군 챔피언에게 2 데미지를 줍니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
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
              "amount": 2
            }
          }
        ]
      }
    ]
  },
  "773890ac-e23c-420b-880e-645994eb0026": {
    "text": "등장:내 손패에 있는 카드 수가 3장 이하라면 무작위 카드 1장을 생성합니다.",
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
              "selection": "RANDOM",
              "randomScope": "STANDARD",
              "count": 1
            },
            "values": {
              "count": 1,
              "destination": "HAND"
            }
          }
        ],
        "condition": {
          "type": "HAND_COUNT",
          "compare": "LTE",
          "amount": 3
        }
      }
    ]
  },
  "ee5b9c22-57e3-4995-b725-6a0936216f98": {
    "text": "등장:자신의 무덤에 있는 선수 카드중 무작위로 한장을 덱으로 보냅니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "MOVE_TO_DECK",
            "target": {
              "zone": "GRAVEYARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "randomScope": "FULL",
              "count": 1
            }
          }
        ]
      }
    ]
  },
  "77e5661f-c621-4e51-8fc2-5e65d74e91bd": {
    "text": "퇴장:'토끼 기사'를 필드에 소환한다.",
    "abilities": [
      {
        "trigger": "LEAVE_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "SUMMON",
            "values": {
              "definitionRef": {
                "id": "1438e0b7-b5f5-49e2-aa07-ef4b47ae29bd"
              },
              "count": 1
            }
          }
        ],
        "reasons": [
          "RETIRE"
        ]
      }
    ]
  },
  "2a85d647-691c-4366-a0f5-4a93a8e917d6": {
    "text": "등장:상대 챔피언에게 1 데미지를 줍니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "DAMAGE_OPPONENT_CHAMPION",
            "amount": 1
          }
        ]
      }
    ]
  },
  "dbc6dc3e-a9d2-4956-883b-e6b68a5d814e": {
    "text": "등장:필드에 있는 아군 선수 카드중 한장을 선택해서 그 카드의 체력을 2 증가시킵니다.",
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
              "selection": "PLAYER_CHOICE",
              "count": 1
            },
            "values": {
              "attack": 0,
              "health": 2
            }
          }
        ]
      }
    ]
  },
  "8dd9f1f7-0c27-4176-b98b-7a0e13bad3c9": {
    "text": "등장:필드에 있는 아군 혹은 챔피언에게 1 데미지를 주고 이 카드에게 +1/+1을 부여합니다.",
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
              "amount": 1
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
  "9e60c494-5191-43de-909f-4a1fb50db9c4": {
    "text": "카운트다운(1):이 카드의 '공격불가'를 제거하고 공격력을 4 증가시킨다.",
    "abilities": [
      {
        "trigger": "COUNTDOWN",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "REMOVE_KEYWORD",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "selection": "SELF",
              "count": 1
            },
            "values": {
              "keyword": "CANNOT_ATTACK"
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
              "attack": 4,
              "health": 0
            }
          }
        ]
      }
    ]
  },
  "6c3fdab7-0c52-468d-9d4d-f015f272d9cd": {
    "text": "이 카드가 상대 선수 카드를 리타이어 시키면 공격력을 1 얻습니다.",
    "abilities": [
      {
        "trigger": "SOURCE_RETIRED_TARGET",
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
              "health": 0
            }
          }
        ]
      }
    ]
  },
  "7334facd-d689-42b1-a09d-b261471657b6": {
    "text": "등장:내 무덤에 있는 비용이 1 코스트 이하인 선수 카드 중 무작위로 한장을 내 필드에 소환합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "REVIVE",
            "target": {
              "zone": "GRAVEYARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "randomScope": "FULL",
              "count": 1,
              "filter": {
                "maxCost": 1
              }
            }
          }
        ]
      }
    ]
  },
  "879430fd-88e0-4b2d-b697-2a8ee6e95a4c": {
    "text": "등장:상대 필드에 있는 선수 카드들에게 총 3데미지를 무작위로 줍니다.",
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
                  "type": "REPEAT",
                  "count": {
                    "kind": "CONSTANT",
                    "value": 3
                  },
                  "steps": [
                    {
                      "type": "EFFECT",
                      "effect": {
                        "action": "DAMAGE",
                        "target": {
                          "zone": "BOARD",
                          "owner": "ENEMY",
                          "cardType": "WRESTLER",
                          "selection": "RANDOM",
                          "count": 1
                        },
                        "values": {
                          "amount": 1
                        }
                      }
                    }
                  ]
                }
              ]
            }
          }
        ]
      }
    ]
  },
  "6a6ff9d2-88b1-4177-ba09-374f27ec334a": {
    "text": "등장:자신의 필드에 있는 아군 선수 카드의 수만큼 공격력을 증가시킨다.",
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
              "selection": "SELF",
              "count": 1
            },
            "values": {
              "attackReference": "BOARD_WRESTLER_COUNT",
              "health": 0
            }
          }
        ]
      }
    ]
  },
  "0efee24f-3aa9-49ae-891c-5fff42e11135": {
    "text": "턴 종료:무작위 상대 선수 혹은 챔피언에게 1 데미지를 줍니다.",
    "abilities": [
      {
        "trigger": "TURN_END",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "DAMAGE",
            "target": {
              "zone": "CHARACTER",
              "owner": "ENEMY",
              "selection": "RANDOM",
              "count": 1
            },
            "values": {
              "amount": 1
            }
          }
        ]
      }
    ]
  },
  "62a10600-5a0e-4aec-b959-f0f15cd8c012": {
    "text": "턴 종료:아군 필드에 이 카드만 있다면, 이 카드에게 +2/+2을 부여하고 '도발'을 부여합니다.",
    "abilities": [
      {
        "trigger": "TURN_END",
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
              "attack": 2,
              "health": 2
            }
          },
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
              "keyword": "TAUNT"
            }
          }
        ],
        "condition": {
          "type": "BOARD_COUNT",
          "compare": "EQ",
          "amount": 1
        }
      }
    ]
  },
  "latest-wrestler-6": {
    "text": "이 카드의 공격력이 증가할때마다, 공격력을 추가로 2 얻습니다.",
    "abilities": [
      {
        "trigger": "STAT_CHANGED",
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
              "attack": 2,
              "health": 0
            }
          }
        ],
        "condition": {
          "type": "ATTACK_GAIN"
        }
      }
    ]
  },
  "2e99f465-4bc7-461f-ad45-674a3ed04b10": {
    "text": "내 손패나 필드에서 이 카드의 체력이 증가하면 추가로 +2 증가합니다",
    "abilities": [
      {
        "trigger": "STAT_CHANGED",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "BUFF",
            "target": {
              "zones": [
                "HAND",
                "BOARD"
              ],
              "owner": "SELF",
              "selection": "SELF",
              "count": 1
            },
            "values": {
              "attack": 0,
              "health": 2
            }
          }
        ],
        "condition": {
          "type": "HEALTH_GAIN"
        },
        "sourceZones": [
          "HAND",
          "BOARD"
        ]
      }
    ]
  },
  "latest-wrestler-10": {
    "text": "이 카드가 상대 선수 카드를 리타이어 시킬때마다 +1/+1을 얻습니다.",
    "abilities": [
      {
        "trigger": "SOURCE_RETIRED_TARGET",
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
  },
  "8aeb73b2-f4be-44ad-837e-4ac66641ab62": {
    "text": "이 카드가 상대 선수 카드를 리타이어시키면 공격력이 +2 증가합니다.\n턴 종료:내 덱 맨 위에 있는 선수 카드에게 이 카드의 공격력만큼 공격력을 증가시킵니다.",
    "abilities": [
      {
        "trigger": "SOURCE_RETIRED_TARGET",
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
              "attack": 2,
              "health": 0
            }
          }
        ]
      },
      {
        "trigger": "TURN_END",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "BUFF",
            "target": {
              "zone": "DECK",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "TOP",
              "count": 1
            },
            "values": {
              "reference": "SOURCE",
              "referenceStat": "CURRENT_ATTACK",
              "health": 0,
              "topCardOnly": true
            }
          }
        ]
      }
    ]
  },
  "75863228-ae51-48cb-afec-43cc391672a8": {
    "text": "등장:'좀비'를 하나 소환합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "SUMMON",
            "values": {
              "definitionRef": {
                "name": "좀비"
              },
              "count": 1
            }
          }
        ]
      }
    ]
  },
  "latest-wrestler-4": {
    "text": "등장:손패에 '만찬'을 비용 1 깍아서 한장 추가합니다.",
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
        ]
      }
    ]
  },
  "bba1d3a2-57e8-4ca7-8a68-391589cd3ae5": {
    "text": "등장:아군 선수를 하나 선택해서 '어둠의 사자'로 지정합니다! '어둠의 사자'는 다음과 같은 효과를 갖고 있습니다!\n'어둠의 사자':이 카드는 상대 선수 카드를 공격하거나 받을때 해당 상대 선수 카드의 공격력을 절반으로 내리고, 내린 만큼의 공격력을 얻습니다.",
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
                "id": "reviewed-dark-messenger-20261014",
                "name": "어둠의 사자",
                "cost": 0,
                "attack": 0,
                "health": 1,
                "rulesText": "이 카드는 상대 선수 카드를 공격하거나 받을때 해당 상대 선수 카드의 공격력을 절반으로 내리고, 내린 만큼의 공격력을 얻습니다.",
                "keywords": [],
                "isToken": true,
                "isChampionToken": false,
                "abilities": [
                  {
                    "trigger": "BEFORE_ATTACK",
                    "effects": [
                      {
                        "type": "STRUCTURED",
                        "action": "MODIFY_STAT",
                        "target": {
                          "zone": "BOARD",
                          "owner": "ENEMY",
                          "cardType": "WRESTLER",
                          "selection": "SAME_TARGET",
                          "count": 1
                        },
                        "values": {
                          "stat": "ATTACK",
                          "drainAttackFraction": 0.5
                        }
                      }
                    ]
                  },
                  {
                    "trigger": "BEFORE_DAMAGE",
                    "effects": [
                      {
                        "type": "STRUCTURED",
                        "action": "MODIFY_STAT",
                        "target": {
                          "zone": "BOARD",
                          "owner": "ENEMY",
                          "cardType": "WRESTLER",
                          "selection": "LAST_ATTACKER",
                          "count": 1
                        },
                        "values": {
                          "stat": "ATTACK",
                          "drainAttackFraction": 0.5
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
  "37047fdf-bf94-4d09-97a3-f2750e82a0be": {
    "text": "등장: 내 손패에서 카드 한장을 선택합니다. 선택한 카드를 덱으로 보내고 카드 1장을 드로우합니다.",
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
                  "type": "SELECT",
                  "id": "returned",
                  "target": {
                    "zone": "HAND",
                    "owner": "SELF",
                    "selection": "PLAYER_CHOICE",
                    "count": 1
                  }
                },
                {
                  "type": "EFFECT",
                  "effect": {
                    "action": "MOVE_TO_DECK",
                    "target": {
                      "zone": "HAND",
                      "owner": "SELF",
                      "resultId": "returned"
                    }
                  }
                },
                {
                  "type": "EFFECT",
                  "effect": {
                    "action": "DRAW",
                    "values": {
                      "amount": 1
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
  "888a12bd-e1e2-41b3-9f22-abbc36af8544": {
    "text": "등장:상대방의 손패에 있는 선수 카드들 중 한장을 상대 필드에 소환합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "SUMMON_FROM_HAND",
            "target": {
              "zone": "HAND",
              "owner": "ENEMY",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "count": 1
            }
          }
        ]
      }
    ]
  },
  "8a351c20-b7b0-4305-8bd4-4430fc6e7276": {
    "text": "등장:이 카드의 공격력과 체력을 반으로 깍은 이 카드의 복사본을 이 카드의 옆에 소환합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "SUMMON",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "selection": "ADJACENT_EMPTY_SLOTS",
              "count": 1
            },
            "values": {
              "adjacentCopyFraction": 0.5
            }
          }
        ]
      }
    ]
  },
  "latest-wrestler-12": {
    "text": "등장:필드에 있는 아군 선수 하나를 선택하여 손으로 되돌립니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "MOVE_TO_HAND",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "PLAYER_CHOICE",
              "count": 1
            }
          }
        ]
      }
    ]
  },
  "ba3107e0-99ad-45af-a651-12c44926c261": {
    "text": "이 카드는 직접 타격당할때 상대의 공격력을 먼저 1 깍고 타격을 당합니다.",
    "abilities": [
      {
        "trigger": "BEFORE_DAMAGE",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "MODIFY_STAT",
            "target": {
              "zone": "BOARD",
              "owner": "ENEMY",
              "cardType": "WRESTLER",
              "selection": "LAST_ATTACKER",
              "count": 1
            },
            "values": {
              "stat": "ATTACK",
              "amount": -1
            }
          }
        ]
      }
    ]
  },
  "9b7c0e52-2184-4ec1-8d68-39a4d5981d2a": {
    "text": "이 카드는 데미지를 입을때마다 '아머(1)'를 받습니다.",
    "abilities": [
      {
        "trigger": "SELF_DAMAGED",
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
              "attack": 0,
              "health": 0,
              "armorGain": 1
            }
          }
        ],
        "condition": {
          "type": "ACTUAL_DAMAGE"
        }
      }
    ]
  },
  "9478516b-5756-411d-8ba2-3ff300234c3b": {
    "text": "핀폴:이 카드를 손패로 돌려보내고, 다음턴에 1 골드를 받습니다.",
    "abilities": [
      {
        "trigger": "EXACT_ZERO_DAMAGE",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "MOVE_TO_HAND",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "selection": "SELF",
              "count": 1
            }
          },
          {
            "type": "STRUCTURED",
            "action": "ADD_NEXT_TURN_GOLD",
            "values": {
              "amount": 1
            }
          }
        ]
      }
    ]
  },
  "latest-wrestler-9": {
    "text": "퇴장:자신의 턴에 죽었다면 '레이븐'을 내 덱에 넣습니다.",
    "abilities": [
      {
        "trigger": "LEAVE_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "MOVE_TO_DECK",
            "target": {
              "zones": [
                "BOARD",
                "GRAVEYARD"
              ],
              "owner": "SELF",
              "selection": "SELF",
              "count": 1
            }
          }
        ],
        "reasons": [
          "RETIRE"
        ],
        "condition": {
          "type": "OWNER_TURN"
        }
      }
    ]
  },
  "828969e2-363a-4cc2-8156-5de5ed86b822": {
    "text": "등장:어디에 있든 비용이 1이하인 아군 선수 카드들에게 +1/+1을 부여하고 '기습'을 부여합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "BUFF",
            "target": {
              "zones": [
                "HAND",
                "DECK",
                "BOARD"
              ],
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "ALL",
              "count": 100,
              "filter": {
                "maxCost": 1
              }
            },
            "values": {
              "attack": 1,
              "health": 1
            }
          },
          {
            "type": "STRUCTURED",
            "action": "ADD_KEYWORD",
            "target": {
              "zones": [
                "HAND",
                "DECK",
                "BOARD"
              ],
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "ALL",
              "count": 100,
              "filter": {
                "maxCost": 1
              }
            },
            "values": {
              "keyword": "SURPRISE"
            }
          }
        ]
      }
    ]
  },
  "76c02a39-f641-47f3-89a7-09a3f3490dc0": {
    "text": "등장:이 카드를 제외한 '구슬마스터' 태그를 가지고 있는 무작위 선수 카드 한장을 비용을 1 감소시켜서 손에 생성합니다.",
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
                  "구슬마스터"
                ],
                "excludeSource": true
              }
            },
            "values": {
              "destination": "HAND",
              "count": 1,
              "generatedModifiers": {
                "cost": -1
              }
            }
          }
        ]
      }
    ]
  },
  "49f79c04-41b4-4d2c-83df-10541a7eceef": {
    "text": "이 카드가 상대 선수 카드를 리타이어 시킬때마다 '회피(1)'을 얻습니다.",
    "abilities": [
      {
        "trigger": "SOURCE_RETIRED_TARGET",
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
  "latest-wrestler-1": {
    "text": "이 카드가 데미지를 입으면 무작위 상대 선수에게 1 데미지를 줍니다.",
    "abilities": [
      {
        "trigger": "SELF_DAMAGED",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "DAMAGE",
            "target": {
              "zone": "BOARD",
              "owner": "ENEMY",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "count": 1
            },
            "values": {
              "amount": 1
            }
          }
        ],
        "condition": {
          "type": "ACTUAL_DAMAGE"
        }
      }
    ]
  },
  "06445529-c159-4066-854f-31ad97529246": {
    "text": "아군 카드가 리타이어 할때마다 필드에 있는 다른 아군 선수 카드에게 +1/+1 부여",
    "abilities": [
      {
        "trigger": "SELF_ENTERED",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "REGISTER_LISTENER",
            "values": {
              "listener": {
                "trigger": "CARD_RETIRED",
                "owner": "SELF",
                "requiresActiveSource": true,
                "effect": {
                  "action": "BUFF",
                  "target": {
                    "zone": "BOARD",
                    "owner": "SELF",
                    "cardType": "WRESTLER",
                    "selection": "ALL",
                    "count": 4,
                    "filter": {
                      "excludeSource": true
                    }
                  },
                  "values": {
                    "attack": 1,
                    "health": 1
                  }
                }
              }
            }
          }
        ]
      }
    ]
  },
  "0710e9b3-a8ef-4f09-9e63-c0b872c18068": {
    "text": "이 카드가 필드에 있을때 상대 선수 카드가 소환되거나 등장하면 그 카드에게 1 데미지를 줍니다.",
    "abilities": [
      {
        "trigger": "CARD_ENTERED",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "DAMAGE",
            "target": {
              "zone": "BOARD",
              "owner": "ENEMY",
              "cardType": "WRESTLER",
              "selection": "SAME_TARGET",
              "count": 1
            },
            "values": {
              "amount": 1
            }
          }
        ],
        "eventOwner": "ENEMY"
      }
    ]
  },
  "4e28e957-1148-44c3-8f8b-b6fe8f40e3a9": {
    "text": "등장:'디 어쏘리티' 태그가 있는 무작위 카드 1장을 내 손패에 생성하고, 내 필드와 손패에 있는 '디 어쏘리티' 태그가 있는 카드 1장마다 이 카드에게 +1/+1을 부여합니다.",
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
                        ]
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
  "cb226840-3d8d-4c2c-a596-acb886fdb2d5": {
    "text": "이 카드가 필드에 있을때 아군 선수 카드 혹은 챔피언이 데미지를 입을때마다 이 카드의 공격력이 1 증가합니다.",
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
  "d5911f5e-1273-4281-86f2-f35dba4dbf8d": {
    "text": "내 챔피언이 데미지를 입을때 마다 이 카드에게 +1/+1을 부여합니다.",
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
                    "health": 1
                  }
                }
              }
            }
          }
        ]
      }
    ]
  },
  "15a6a381-90ce-4691-bdeb-6498c519a5a4": {
    "text": "상대 턴일때 이 카드의 체력이 2 증가합니다.",
    "abilities": [
      {
        "trigger": "TURN_END",
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
              "attack": 0,
              "health": 2,
              "healthUntilOwnerTurnStart": true
            }
          }
        ]
      },
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
              "attack": 0,
              "health": 2,
              "healthUntilOwnerTurnStart": true
            }
          }
        ],
        "condition": {
          "type": "OPPONENT_TURN"
        }
      }
    ]
  },
  "855e87f9-1769-4036-ad49-491ab4b2058a": {
    "text": "이 카드가 데미지를 입을때 손패에 '밀크메이드' 혹은 '카미사토르'가 있다면 그 카드들 중 한장의 비용을 1 감소시킵니다.",
    "abilities": [
      {
        "trigger": "SELF_DAMAGED",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "REDUCE_COST",
            "target": {
              "zone": "HAND",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "count": 1
            },
            "values": {
              "amount": 1,
              "targetDefinitionIds": [
                "ba3107e0-99ad-45af-a651-12c44926c261",
                "latest-wrestler-11"
              ]
            }
          }
        ],
        "condition": {
          "type": "ACTUAL_DAMAGE"
        }
      }
    ]
  },
  "latest-wrestler-2": {
    "text": "이 카드는 한턴에 최대 3 데미지만 입을 수 있습니다.(이 카드는 '도발' 키워드를 보유 할 수 없습니다.)",
    "abilities": [
      {
        "trigger": "BEFORE_DAMAGE",
        "effects": [],
        "incomingDamageLimitPerTurn": 3,
        "forbiddenKeywords": [
          "TAUNT"
        ]
      }
    ]
  },
  "8a09fec1-16d8-452b-85c3-a38c7a3a03f6": {
    "text": "이 카드가 필드에서 자신의 손으로 돌아가면 상대 선수 카드들에게 무작위로 5 데미지를 나눠줍니다.",
    "abilities": [
      {
        "trigger": "SELF_RETURNED_TO_HAND",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "DAMAGE",
            "target": {
              "zone": "BOARD",
              "owner": "ENEMY",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "count": 1
            },
            "values": {
              "amount": 1
            }
          },
          {
            "type": "STRUCTURED",
            "action": "DAMAGE",
            "target": {
              "zone": "BOARD",
              "owner": "ENEMY",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "count": 1
            },
            "values": {
              "amount": 1
            }
          },
          {
            "type": "STRUCTURED",
            "action": "DAMAGE",
            "target": {
              "zone": "BOARD",
              "owner": "ENEMY",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "count": 1
            },
            "values": {
              "amount": 1
            }
          },
          {
            "type": "STRUCTURED",
            "action": "DAMAGE",
            "target": {
              "zone": "BOARD",
              "owner": "ENEMY",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "count": 1
            },
            "values": {
              "amount": 1
            }
          },
          {
            "type": "STRUCTURED",
            "action": "DAMAGE",
            "target": {
              "zone": "BOARD",
              "owner": "ENEMY",
              "cardType": "WRESTLER",
              "selection": "RANDOM",
              "count": 1
            },
            "values": {
              "amount": 1
            }
          }
        ],
        "sourceZones": [
          "HAND"
        ]
      }
    ]
  },
  "a6efe85e-a76e-4c6c-a81e-2b6d91b19c56": {
    "text": "게임시작:이 카드가 덱에 있다면 멀리건이 끝나고 손패에 드로우됩니다.",
    "abilities": [
      {
        "trigger": "AFTER_MULLIGAN",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "DRAW",
            "values": {
              "amount": 1,
              "drawSourceFromDeck": true
            }
          }
        ]
      }
    ]
  },
  "d3f89d8b-cb48-4175-b11b-9f7cadfceacc": {
    "text": "등장:내 덱 맨위에 있는 카드를 파괴하고 비용/체력/공격이 1씩 깍인 무작위 카드를 대신 생성해서 덱 맨위에 놓습니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "DESTROY",
            "target": {
              "zone": "DECK",
              "owner": "SELF",
              "selection": "TOP",
              "count": 1
            }
          },
          {
            "type": "STRUCTURED",
            "action": "GENERATE",
            "target": {
              "zone": "DECK",
              "owner": "SELF",
              "selection": "RANDOM",
              "randomScope": "STANDARD",
              "count": 1
            },
            "values": {
              "destination": "DECK",
              "deckPosition": "TOP",
              "count": 1,
              "generatedModifiers": {
                "cost": -1,
                "attack": -1,
                "health": -1
              }
            }
          }
        ]
      }
    ]
  },
  "5f1fd584-7129-4f39-91a4-22f02ba677e5": {
    "text": "등장:손패에 '냥냥 펀치'를 추가합니다.\n턴 시작:지난 턴에 아군 선수 카드와 챔피언이 체력을 회복했다면 손패에 '냥냥 펀치'를 추가한다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "GENERATE",
            "values": {
              "definitionRef": {
                "id": "e584c34e-d640-4c41-a148-cfb70389f08a"
              },
              "destination": "HAND",
              "count": 1
            }
          }
        ]
      },
      {
        "trigger": "TURN_START",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "GENERATE",
            "values": {
              "definitionRef": {
                "id": "e584c34e-d640-4c41-a148-cfb70389f08a"
              },
              "destination": "HAND",
              "count": 1
            }
          }
        ],
        "condition": {
          "type": "PREVIOUS_OWN_TURN_BOTH_HEALED"
        }
      }
    ]
  },
  "latest-wrestler-15": {
    "text": "등장:필드에 있는 아군 선수 카드 1장에게 '기습'을 부여합니다. 이 효과를 받은 카드는 이번턴에 이미 공격을 했어도 상대 선수 카드들을 한정으로 한번 더 공격 할 수 있습니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "ADD_KEYWORD",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "PLAYER_CHOICE",
              "count": 1
            },
            "values": {
              "keyword": "SURPRISE"
            }
          },
          {
            "type": "STRUCTURED",
            "action": "BUFF",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "SAME_TARGET",
              "count": 1
            },
            "values": {
              "attack": 0,
              "health": 0,
              "additionalWrestlerAttack": 1
            }
          }
        ]
      }
    ]
  },
  "latest-wrestler-8": {
    "text": "등장:내 필드에 있는 선수 카드 1장을 덱으로 보냅니다. 그자리에 보낸 선수 카드보다 코스트가 낮은 무작위 선수 카드 1장을 소환합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "MOVE_TO_DECK",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "PLAYER_CHOICE",
              "count": 1
            },
            "values": {
              "replacementLowerCostSummon": true
            }
          }
        ]
      }
    ]
  },
  "5dfadce6-2d8b-40b0-8926-bf58ff27eece": {
    "text": "등장:내 덱 맨위에 있는 카드를 모두에게 공개합니다.",
    "abilities": [
      {
        "trigger": "ENTER_FIELD",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "REVEAL_CARD",
            "target": {
              "zone": "DECK",
              "owner": "SELF",
              "selection": "TOP",
              "count": 1
            }
          }
        ]
      }
    ]
  },
  "39dfe786-e95b-417b-94d1-edc2cdf3880e": {
    "text": "등장:무작위 선수 카드 1장을 내 손패에 추가합니다.\n선수 카드가 내 덱을 제외하고 다른 곳에서 내 손패로 보내지거나 새로 생성 될 때마다 공격력을 1 얻습니다.",
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
              "selection": "RANDOM",
              "randomScope": "STANDARD",
              "count": 1,
              "cardType": "WRESTLER"
            },
            "values": {
              "count": 1,
              "destination": "HAND"
            }
          }
        ]
      },
      {
        "trigger": "HAND_WRESTLER_ADDED",
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
              "health": 0
            }
          }
        ]
      }
    ]
  },
  "latest-wrestler-5": {
    "text": "회피. 이 카드가 필드에 있는 동안 '솔져' 태그가 있는 카드들이 등장 혹은 소환 될때 +1/+1을 받습니다.",
    "abilities": [
      {
        "trigger": "CARD_ENTERED",
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
                  "솔져"
                ]
              }
            },
            "values": {
              "attack": 1,
              "health": 1
            }
          }
        ]
      }
    ],
    "keywords": [
      "DODGE"
    ]
  },
  "a6b7689a-0468-48cd-a216-7e9fe22dec47": {
    "text": "이 카드가 상대 선수를 리타이어시킬 때마다 체력을 완전히 회복합니다.",
    "abilities": [
      {
        "trigger": "SOURCE_RETIRED_TARGET",
        "effects": [
          {
            "type": "STRUCTURED",
            "action": "HEAL",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "selection": "SELF",
              "count": 1
            },
            "values": {
              "healToFull": true
            }
          }
        ]
      }
    ]
  },
  "3fef0a3f-93c9-477c-a958-2f26af360104": {
    "text": "등장:필드에 있는 아군 선수를 하나 선택해서 .파괴의 전령.으로 지정합니다! 그 카드에게 다음과 같은 효과를 부여합니다.\n파괴의 전령:이 카드가 상대 선수 카드를 리타이어시킬때 리타이어시키지 않고 파괴시킵니다. 이 카드가 있을때 필드에서 선수 카드가 파괴 될때마다 이 카드는 +2/+2을 얻습니다.",
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
                "id": "reviewed-destruction-messenger-20261014",
                "name": "파괴의 전령",
                "cost": 0,
                "attack": 0,
                "health": 1,
                "rulesText": "이 카드가 상대 선수 카드를 리타이어시킬때 리타이어시키지 않고 파괴시킵니다. 이 카드가 있을때 필드에서 선수 카드가 파괴 될때마다 이 카드는 +2/+2을 얻습니다.",
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
                          "attack": 2,
                          "health": 2
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
  "80cf43ba-f27f-4c2b-b97b-f3fd0eda56f3": {
    "text": "내 필드에 있는 선수 카드 한장을 선택합니다. 선택한 카드의 공격력을 자신의 덱 맨위에 있는 선수카드의 공격력에 부여합니다.",
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
                  "type": "SELECT",
                  "id": "hero",
                  "target": {
                    "zone": "BOARD",
                    "owner": "SELF",
                    "cardType": "WRESTLER",
                    "selection": "PLAYER_CHOICE",
                    "count": 1
                  }
                },
                {
                  "type": "AGGREGATE",
                  "id": "power",
                  "selectionId": "hero",
                  "operation": "SUM",
                  "stat": "ATTACK"
                },
                {
                  "type": "EFFECT",
                  "effect": {
                    "action": "BUFF",
                    "target": {
                      "zone": "DECK",
                      "owner": "SELF",
                      "cardType": "WRESTLER",
                      "selection": "TOP",
                      "count": 1
                    },
                    "values": {
                      "attackExpression": {
                        "kind": "RESULT_VALUE",
                        "resultId": "power"
                      },
                      "health": 0,
                      "topCardOnly": true
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  }
};
export function reviewedCurrentAdminAbilities(card: PublishedCardRecord): CardAbility[] | null {
  const entry = bindings[card.id];
  return !card.effectId && entry && [entry.text, ...(entry.textAliases ?? [])].some(text => text.replace(/\s+/gu, '') === card.text.replace(/\s+/gu, ''))
    ? structuredClone(entry.abilities) : null;
}

export function reviewedCurrentAdminKeywords(card:PublishedCardRecord):CardKeyword[]|null {
 const entry=bindings[card.id];
 return reviewedCurrentAdminAbilities(card) && entry?.keywords ? [...new Set([...card.keywords,...entry.keywords])] : null;
}
