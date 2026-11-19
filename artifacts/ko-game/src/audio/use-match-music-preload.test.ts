import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../game/engine/create-initial-game-state";
import { generateCardInstance } from "../game/cards/generation";
import { matchMusicUrls } from "./use-match-music-preload";
import { emptyGameMediaCatalog, type GameMediaItem } from "../game/media";

test("prepare only selected match music, visible hand entrances, champion and result music; never hidden decks", () => {
  const s = createInitialGameState();
  s.status = "IN_PROGRESS";
  s.bgmId = "selected";
  const card = generateCardInstance({
    id: "music-test",
    name: "test",
    cardType: "WRESTLER",
    cost: 1,
    attack: 1,
    health: 1,
    rarity: "NORMAL",
    keywords: [],
    abilities: [],
    isToken: false,
    isChampionToken: false,
  }, {instanceId:"audio-preload-test"});
  s.players[0].hand = [
    { ...card, entranceAudioEnabled: true, entranceAudioUrl: "/hand.mp3" },
  ];
  s.players[0].deck = [
    {
      ...card,
      entranceAudioEnabled: true,
      entranceAudioUrl: "/secret-deck.mp3",
    },
  ];
  s.players[1].hand = {
    hidden: true,
    count: 5,
  } as unknown as (typeof s.players)[1]["hand"];
  s.players[0].champion!.questCompleteAudioEnabled = true;
  s.players[0].champion!.questCompleteAudioUrl = "/quest.mp3";
  const track = (id: string, assetUrl: string): GameMediaItem => ({
    id,
    assetUrl,
    mediaType: "BGM",
    name: id,
    width: null,
    height: null,
    volume: 80,
  });
  const urls = matchMusicUrls(s, {
    ...emptyGameMediaCatalog,
    bgms: [track("selected", "/battle.mp3"), track("other", "/unused.mp3")],
    resultMusic: {
      VICTORY_BGM: { ...track("win", "/win.mp3"), mediaType: "VICTORY_BGM" },
    },
  });
  for (const url of ["/hand.mp3", "/quest.mp3", "/battle.mp3", "/win.mp3"])
    assert.ok(urls.includes(url));
  assert.ok(!urls.includes("/secret-deck.mp3"));
  assert.ok(!urls.includes("/unused.mp3"));
  assert.equal(urls.length, new Set(urls).size);
  s.status = "FINISHED";
  assert.deepEqual(matchMusicUrls(s, emptyGameMediaCatalog), []);
});
