import type { PublishedCardRecord } from './published-cards';

/** Additive catalog, installed as drafts for admin testing before publication. */
export const EPIC_TECHNIQUES: PublishedCardRecord[] = [
  {
    "id": "epic-spell-execution",
    "name": "처형",
    "cardType": "TECHNIQUE",
    "rarity": "EPIC",
    "cost": 5,
    "attack": 0,
    "health": 0,
    "text": "상대 선수 1장을 선택하여 DESTROY합니다.",
    "keywords": [],
    "tags": [],
    "isToken": false,
    "isChampionToken": false,
    "effectId": "SCRIPT_V1",
    "effectConfig": {
      "scripts": [
        {
          "version": "SCRIPT_V1",
          "trigger": "ACTIVE",
          "steps": [
            {
              "type": "SELECT",
              "id": "chosen",
              "target": {
                "zone": "BOARD",
                "owner": "ENEMY",
                "cardType": "WRESTLER",
                "selection": "PLAYER_CHOICE",
                "count": 1
              }
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "DESTROY",
                "target": {
                  "zone": "BOARD",
                  "owner": "ENEMY",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "resultId": "chosen"
                }
              }
            }
          ]
        }
      ]
    },
    "status": "DRAFT",
    "version": 1,
    "createdAt": "2026-10-03T00:00:00.000Z",
    "updatedAt": "2026-10-03T00:00:00.000Z",
    "imageAssetId": null,
    "imageUrl": null
  },
  {
    "id": "epic-spell-feast",
    "name": "만찬",
    "cardType": "TECHNIQUE",
    "rarity": "EPIC",
    "cost": 4,
    "attack": 0,
    "health": 0,
    "text": "모든 아군 선수와 아군 챔피언의 현재 및 최대 HP를 3 증가시킵니다.",
    "keywords": [],
    "tags": [],
    "isToken": false,
    "isChampionToken": false,
    "effectId": "SCRIPT_V1",
    "effectConfig": {
      "scripts": [
        {
          "version": "SCRIPT_V1",
          "trigger": "ACTIVE",
          "steps": [
            {
              "type": "EFFECT",
              "effect": {
                "action": "BUFF",
                "target": {
                  "zone": "BOARD",
                  "owner": "SELF",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1
                },
                "values": {
                  "health": 3
                }
              }
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "BUFF",
                "target": {
                  "zone": "PLAYER",
                  "owner": "SELF",
                  "selection": "SELF",
                  "count": 1
                },
                "values": {
                  "health": 3
                }
              }
            }
          ]
        }
      ]
    },
    "status": "DRAFT",
    "version": 1,
    "createdAt": "2026-10-03T00:00:00.000Z",
    "updatedAt": "2026-10-03T00:00:00.000Z",
    "imageAssetId": null,
    "imageUrl": null
  },
  {
    "id": "epic-spell-veil-of-silence",
    "name": "침묵의 장막",
    "cardType": "TECHNIQUE",
    "rarity": "EPIC",
    "cost": 5,
    "attack": 0,
    "health": 0,
    "text": "모든 상대 선수를 침묵시킵니다.",
    "keywords": [],
    "tags": [],
    "isToken": false,
    "isChampionToken": false,
    "effectId": "SCRIPT_V1",
    "effectConfig": {
      "scripts": [
        {
          "version": "SCRIPT_V1",
          "trigger": "ACTIVE",
          "steps": [
            {
              "type": "EFFECT",
              "effect": {
                "action": "SILENCE",
                "target": {
                  "zone": "BOARD",
                  "owner": "ENEMY",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1
                }
              }
            }
          ]
        }
      ]
    },
    "status": "DRAFT",
    "version": 1,
    "createdAt": "2026-10-03T00:00:00.000Z",
    "updatedAt": "2026-10-03T00:00:00.000Z",
    "imageAssetId": null,
    "imageUrl": null
  },
  {
    "id": "epic-spell-return",
    "name": "복귀",
    "cardType": "TECHNIQUE",
    "rarity": "EPIC",
    "cost": 3,
    "attack": 0,
    "health": 0,
    "text": "내 무덤의 선수 중 무작위로 최대 3장을 선발합니다. 그중 1장을 선택하여 원래 상태로 내 덱에 넣습니다.",
    "keywords": [],
    "tags": [],
    "isToken": false,
    "isChampionToken": false,
    "effectId": "SCRIPT_V1",
    "effectConfig": {
      "scripts": [
        {
          "version": "SCRIPT_V1",
          "trigger": "ACTIVE",
          "steps": [
            {
              "type": "SELECT",
              "id": "candidates",
              "target": {
                "zone": "GRAVEYARD",
                "owner": "SELF",
                "cardType": "WRESTLER",
                "selection": "RANDOM",
                "count": 3,
                "randomScope": "FULL"
              }
            },
            {
              "type": "SELECT",
              "id": "chosen",
              "target": {
                "zone": "GRAVEYARD",
                "owner": "SELF",
                "cardType": "WRESTLER",
                "selection": "PLAYER_CHOICE",
                "count": 1,
                "resultId": "candidates"
              }
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "MOVE_TO_DECK",
                "target": {
                  "zone": "GRAVEYARD",
                  "owner": "SELF",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "resultId": "chosen"
                }
              }
            }
          ]
        }
      ]
    },
    "status": "DRAFT",
    "version": 1,
    "createdAt": "2026-10-03T00:00:00.000Z",
    "updatedAt": "2026-10-03T00:00:00.000Z",
    "imageAssetId": null,
    "imageUrl": null
  },
  {
    "id": "epic-spell-forbidden-contract",
    "name": "금지된 계약",
    "cardType": "TECHNIQUE",
    "rarity": "EPIC",
    "cost": 4,
    "attack": 0,
    "health": 0,
    "text": "내 챔피언에게 5 피해를 줍니다. 이번 턴 다음에 사용하는 선수 카드 1장의 비용을 0으로 만듭니다.",
    "keywords": [],
    "tags": [],
    "isToken": false,
    "isChampionToken": false,
    "effectId": "SCRIPT_V1",
    "effectConfig": {
      "scripts": [
        {
          "version": "SCRIPT_V1",
          "trigger": "ACTIVE",
          "steps": [
            {
              "type": "EFFECT",
              "effect": {
                "action": "DAMAGE",
                "target": {
                  "zone": "PLAYER",
                  "owner": "SELF",
                  "selection": "ALL",
                  "count": 1
                },
                "values": {
                  "amount": 5
                }
              }
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "QUEUE_EFFECT",
                "values": {
                  "duration": "THIS_TURN",
                  "queuedTrigger": "NEXT_ALLY_WRESTLER_PLAYED",
                  "queuedEffect": {
                    "action": "SET_STAT",
                    "target": {
                      "zone": "HAND",
                      "owner": "SELF",
                      "cardType": "WRESTLER",
                      "selection": "SELF",
                      "count": 1
                    },
                    "values": {
                      "stat": "COST",
                      "amount": 0
                    }
                  }
                }
              }
            }
          ]
        }
      ]
    },
    "status": "DRAFT",
    "version": 1,
    "createdAt": "2026-10-03T00:00:00.000Z",
    "updatedAt": "2026-10-03T00:00:00.000Z",
    "imageAssetId": null,
    "imageUrl": null
  },
  {
    "id": "epic-spell-life-exchange",
    "name": "생명의 교환",
    "cardType": "TECHNIQUE",
    "rarity": "EPIC",
    "cost": 4,
    "attack": 0,
    "health": 0,
    "text": "아군 선수 1장과 상대 선수 1장을 선택하여 현재 HP를 서로 교환합니다. 기존 최대 HP 상한을 적용하며, 두 선수 모두 기절합니다.",
    "keywords": [],
    "tags": [],
    "isToken": false,
    "isChampionToken": false,
    "effectId": "SCRIPT_V1",
    "effectConfig": {
      "scripts": [
        {
          "version": "SCRIPT_V1",
          "trigger": "ACTIVE",
          "steps": [
            {
              "type": "SELECT",
              "id": "ally",
              "target": {
                "zone": "BOARD",
                "owner": "SELF",
                "cardType": "WRESTLER",
                "selection": "PLAYER_CHOICE",
                "count": 1
              }
            },
            {
              "type": "SELECT",
              "id": "enemy",
              "target": {
                "zone": "BOARD",
                "owner": "ENEMY",
                "cardType": "WRESTLER",
                "selection": "PLAYER_CHOICE",
                "count": 1
              }
            },
            {
              "type": "AGGREGATE",
              "id": "allyStat",
              "selectionId": "ally",
              "operation": "SUM",
              "stat": "HEALTH"
            },
            {
              "type": "AGGREGATE",
              "id": "enemyStat",
              "selectionId": "enemy",
              "operation": "SUM",
              "stat": "HEALTH"
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "SET_STAT",
                "target": {
                  "zone": "BOARD",
                  "owner": "SELF",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "resultId": "ally"
                },
                "values": {
                  "stat": "HEALTH",
                  "amountExpression": {
                    "kind": "RESULT_VALUE",
                    "resultId": "enemyStat"
                  },
                  "currentHealthOnly": true
                }
              }
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "SET_STAT",
                "target": {
                  "zone": "BOARD",
                  "owner": "ENEMY",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "resultId": "enemy"
                },
                "values": {
                  "stat": "HEALTH",
                  "amountExpression": {
                    "kind": "RESULT_VALUE",
                    "resultId": "allyStat"
                  },
                  "currentHealthOnly": true
                }
              }
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "STUN",
                "target": {
                  "zone": "BOARD",
                  "owner": "SELF",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "resultId": "ally"
                }
              }
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "STUN",
                "target": {
                  "zone": "BOARD",
                  "owner": "ENEMY",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "resultId": "enemy"
                }
              }
            }
          ]
        }
      ]
    },
    "status": "DRAFT",
    "version": 1,
    "createdAt": "2026-10-03T00:00:00.000Z",
    "updatedAt": "2026-10-03T00:00:00.000Z",
    "imageAssetId": null,
    "imageUrl": null
  },
  {
    "id": "epic-spell-annihilation",
    "name": "절멸",
    "cardType": "TECHNIQUE",
    "rarity": "EPIC",
    "cost": 6,
    "attack": 0,
    "health": 0,
    "text": "현재 공격력이 3 이하인 모든 선수를 DESTROY합니다.",
    "keywords": [],
    "tags": [],
    "isToken": false,
    "isChampionToken": false,
    "effectId": "SCRIPT_V1",
    "effectConfig": {
      "scripts": [
        {
          "version": "SCRIPT_V1",
          "trigger": "ACTIVE",
          "steps": [
            {
              "type": "EFFECT",
              "effect": {
                "action": "DESTROY",
                "target": {
                  "zone": "BOARD",
                  "owner": "ALL",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "filter": {
                    "attack": {
                      "compare": "LTE",
                      "value": 3
                    }
                  }
                }
              }
            }
          ]
        }
      ]
    },
    "status": "DRAFT",
    "version": 1,
    "createdAt": "2026-10-03T00:00:00.000Z",
    "updatedAt": "2026-10-03T00:00:00.000Z",
    "imageAssetId": null,
    "imageUrl": null
  },
  {
    "id": "epic-spell-forced-exchange",
    "name": "강제 교환",
    "cardType": "TECHNIQUE",
    "rarity": "EPIC",
    "cost": 4,
    "attack": 0,
    "health": 0,
    "text": "아군 선수 1장과 상대 선수 1장을 선택하여 현재 공격력을 서로 교환합니다. 두 선수 모두 기절합니다.",
    "keywords": [],
    "tags": [],
    "isToken": false,
    "isChampionToken": false,
    "effectId": "SCRIPT_V1",
    "effectConfig": {
      "scripts": [
        {
          "version": "SCRIPT_V1",
          "trigger": "ACTIVE",
          "steps": [
            {
              "type": "SELECT",
              "id": "ally",
              "target": {
                "zone": "BOARD",
                "owner": "SELF",
                "cardType": "WRESTLER",
                "selection": "PLAYER_CHOICE",
                "count": 1
              }
            },
            {
              "type": "SELECT",
              "id": "enemy",
              "target": {
                "zone": "BOARD",
                "owner": "ENEMY",
                "cardType": "WRESTLER",
                "selection": "PLAYER_CHOICE",
                "count": 1
              }
            },
            {
              "type": "AGGREGATE",
              "id": "allyStat",
              "selectionId": "ally",
              "operation": "SUM",
              "stat": "ATTACK"
            },
            {
              "type": "AGGREGATE",
              "id": "enemyStat",
              "selectionId": "enemy",
              "operation": "SUM",
              "stat": "ATTACK"
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "SET_STAT",
                "target": {
                  "zone": "BOARD",
                  "owner": "SELF",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "resultId": "ally"
                },
                "values": {
                  "stat": "ATTACK",
                  "amountExpression": {
                    "kind": "RESULT_VALUE",
                    "resultId": "enemyStat"
                  }
                }
              }
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "SET_STAT",
                "target": {
                  "zone": "BOARD",
                  "owner": "ENEMY",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "resultId": "enemy"
                },
                "values": {
                  "stat": "ATTACK",
                  "amountExpression": {
                    "kind": "RESULT_VALUE",
                    "resultId": "allyStat"
                  }
                }
              }
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "STUN",
                "target": {
                  "zone": "BOARD",
                  "owner": "SELF",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "resultId": "ally"
                }
              }
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "STUN",
                "target": {
                  "zone": "BOARD",
                  "owner": "ENEMY",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "resultId": "enemy"
                }
              }
            }
          ]
        }
      ]
    },
    "status": "DRAFT",
    "version": 1,
    "createdAt": "2026-10-03T00:00:00.000Z",
    "updatedAt": "2026-10-03T00:00:00.000Z",
    "imageAssetId": null,
    "imageUrl": null
  },
  {
    "id": "epic-spell-escape",
    "name": "탈출",
    "cardType": "TECHNIQUE",
    "rarity": "EPIC",
    "cost": 3,
    "attack": 0,
    "health": 0,
    "text": "아군 선수 1장을 선택하여 원래 카드 상태로 내 손으로 되돌립니다.",
    "keywords": [],
    "tags": [],
    "isToken": false,
    "isChampionToken": false,
    "effectId": "SCRIPT_V1",
    "effectConfig": {
      "scripts": [
        {
          "version": "SCRIPT_V1",
          "trigger": "ACTIVE",
          "steps": [
            {
              "type": "SELECT",
              "id": "chosen",
              "target": {
                "zone": "BOARD",
                "owner": "SELF",
                "cardType": "WRESTLER",
                "selection": "PLAYER_CHOICE",
                "count": 1
              }
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "MOVE_TO_HAND",
                "target": {
                  "zone": "BOARD",
                  "owner": "SELF",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "resultId": "chosen"
                }
              }
            }
          ]
        }
      ]
    },
    "status": "DRAFT",
    "version": 1,
    "createdAt": "2026-10-03T00:00:00.000Z",
    "updatedAt": "2026-10-03T00:00:00.000Z",
    "imageAssetId": null,
    "imageUrl": null
  },
  {
    "id": "epic-spell-forced-silence",
    "name": "강제 침묵",
    "cardType": "TECHNIQUE",
    "rarity": "EPIC",
    "cost": 3,
    "attack": 0,
    "health": 0,
    "text": "상대 선수 1장을 선택하여 침묵시킵니다.",
    "keywords": [],
    "tags": [],
    "isToken": false,
    "isChampionToken": false,
    "effectId": "SCRIPT_V1",
    "effectConfig": {
      "scripts": [
        {
          "version": "SCRIPT_V1",
          "trigger": "ACTIVE",
          "steps": [
            {
              "type": "SELECT",
              "id": "chosen",
              "target": {
                "zone": "BOARD",
                "owner": "ENEMY",
                "cardType": "WRESTLER",
                "selection": "PLAYER_CHOICE",
                "count": 1
              }
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "SILENCE",
                "target": {
                  "zone": "BOARD",
                  "owner": "ENEMY",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "resultId": "chosen"
                }
              }
            }
          ]
        }
      ]
    },
    "status": "DRAFT",
    "version": 1,
    "createdAt": "2026-10-03T00:00:00.000Z",
    "updatedAt": "2026-10-03T00:00:00.000Z",
    "imageAssetId": null,
    "imageUrl": null
  },
  {
    "id": "epic-spell-push",
    "name": "밀쳐내기",
    "cardType": "TECHNIQUE",
    "rarity": "EPIC",
    "cost": 1,
    "attack": 0,
    "health": 0,
    "text": "상대 선수 1장을 선택하여 기절을 부여합니다.",
    "keywords": [],
    "tags": [],
    "isToken": false,
    "isChampionToken": false,
    "effectId": "SCRIPT_V1",
    "effectConfig": {
      "scripts": [
        {
          "version": "SCRIPT_V1",
          "trigger": "ACTIVE",
          "steps": [
            {
              "type": "SELECT",
              "id": "chosen",
              "target": {
                "zone": "BOARD",
                "owner": "ENEMY",
                "cardType": "WRESTLER",
                "selection": "PLAYER_CHOICE",
                "count": 1
              }
            },
            {
              "type": "EFFECT",
              "effect": {
                "action": "STUN",
                "target": {
                  "zone": "BOARD",
                  "owner": "ENEMY",
                  "cardType": "WRESTLER",
                  "selection": "ALL",
                  "count": 1,
                  "resultId": "chosen"
                }
              }
            }
          ]
        }
      ]
    },
    "status": "DRAFT",
    "version": 1,
    "createdAt": "2026-10-03T00:00:00.000Z",
    "updatedAt": "2026-10-03T00:00:00.000Z",
    "imageAssetId": null,
    "imageUrl": null
  }
];
