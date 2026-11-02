import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
await import("./checkpoints/20261006/qa-loader.mjs");
const { chromium } = await import("./black-gold-playwright.mjs");
const {
  createInitialGameState,
  startGame,
  cardRecordToDefinition,
  championRecordToDefinition,
} = await import("../../lib/game-engine/src/index.ts");
const data = JSON.parse(
  await readFile("artifacts/ko-game/qa/art-direction-data.json", "utf8"),
);
const cards = data.cards.cards.map((c) => ({
    ...c,
    status: "PUBLISHED",
    quantity: 99,
  })),
  champions = data.champions.champions.map((c) => ({
    ...c,
    status: "PUBLISHED",
  }));
const selected = cards
    .filter((c) => c.rarity === "NORMAL" && !c.isToken && !c.isChampionToken)
    .flatMap((c) => [c, c, c])
    .slice(0, 25),
  champion = champions[0];
assert.equal(selected.length, 25);
const makeDeck = (id, name, isSelected) => ({
  id,
  name,
  isSelected,
  championDefinitionId: champion.id,
  cardDefinitionIds: selected.map((c) => c.id),
  champion,
  cards: selected,
  isValid: true,
  invalidReasons: [],
  validationReasons: [],
  missingCardDefinitionIds: [],
  createdAt: "2026-11-01",
  updatedAt: "2026-11-01",
});
const art =
    "/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
  skin = {
    id: "qa-skin",
    type: "CHAMPION_SKIN",
    name: "검증 스킨",
    targetId: champion.id,
    imageAssets: { art },
    isActive: true,
    sortOrder: 0,
  };
const liveContent = process.env.KO_QA_HOME_MAIN_CONTENT
  ? JSON.parse(await readFile(process.env.KO_QA_HOME_MAIN_CONTENT, "utf8"))
  : null;
const qaOrigin=process.env.KO_QA_ORIGIN??"http://127.0.0.1:5186";
assert.ok(["http://127.0.0.1:5186","https://ko-card-game-vr69.onrender.com"].includes(qaOrigin));
const b = await chromium.launch(),
  out = process.env.KO_QA_OUT??"qa-results/launch-deck-action",
  results = [];
await mkdir(out, { recursive: true });
async function setup(p, { missing = false, invalid = false } = {}) {
  let decks = [
      makeDeck("other", "첫 번째 덱", false),
      makeDeck("selected", "출전 검증 덱", !missing),
    ],
    writes = [],
    starts = [],
    messages = [];
  if (invalid) {
    decks[1].isValid = false;
    decks[1].invalidReasons = ["카드 수가 부족합니다."];
  }
  const ai = {
    ...decks[1],
    id: "ai",
    enabled: true,
    difficulty: "NORMAL",
    isValid: true,
  };
  await p.addInitScript(() => {
    localStorage.setItem("ko-match-coach-v1", "done");
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = () => {};
  });
  await p.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname,
      q = r.request();
    if (
      liveContent &&
      process.env.KO_QA_HOME_BACKGROUND &&
      path === liveContent.background?.assetUrl
    ) {
      return r.fulfill({
        contentType: "image/png",
        body: await readFile(process.env.KO_QA_HOME_BACKGROUND),
      });
    }
    let json = {};
    if (path.endsWith("/auth/me"))
      json = {
        authenticated: true,
        user: {
          id: "launch-user",
          nickname: "출전 테스트",
          role: "USER",
          currencyBalance: 100,
          prismBalance: 20,
          championPrismBalance: 0,
        },
      };
    else if (path.endsWith("/server-status"))
      json = { enabled: false, allowed: true };
    else if(path.endsWith("/online-matches/active"))json={match:null};
    else if (path.endsWith("/ws-ticket")) json = { ticket: "qa" };
    else if (path.endsWith("/availability")) json = { enabled: true };
    else if (path.endsWith("/minion-a/cards")) json = { definitions: [] };
    else if (path.endsWith("/cards")) json = { cards };
    else if (path.endsWith("/champions")) json = { champions };
    else if (path.endsWith("/cosmetics"))
      json = {
        owned: [{ item: skin }],
        loadout: {
          version: 1,
          skins: { ["champion:" + champion.id]: skin },
          cardBack: null,
          emotes: [],
        },
      };
    else if (path.endsWith("/card-frames")) json = data["card-frames"];
    else if (path.endsWith("/decks/options"))
      json = { cards, champions, isTestAccount: true };
    else if(path.endsWith("/decks/selected"))json={decks:decks.filter(d=>d.isSelected)};
    else if (path.endsWith("/decks")) json = { decks };
    else if (path.endsWith("/select")) {
      writes.push(path);
      const id = decodeURIComponent(path.split("/").at(-2));
      decks = decks.map((d) => ({ ...d, isSelected: d.id === id }));
      json = { deck: decks.find((d) => d.id === id) };
    } else if (path.startsWith("/api/decks/") && q.method() === "PATCH") {
      writes.push(q.postDataJSON());
      const id = decodeURIComponent(path.split("/").at(-1));
      decks = decks.map((d) =>
        d.id === id ? { ...d, ...q.postDataJSON() } : d,
      );
      json = { deck: decks.find((d) => d.id === id) };
    } else if (path.endsWith("/ai-decks"))
      json = { decks: [ai], extraCards: [], extraChampions: [] };
    else if (path.endsWith("/game-media")) json = { backgrounds: [], bgms: [] };
    else if (path.endsWith("/main-content"))
      json = liveContent ?? data["main-content"];
    else if (path.endsWith("/ai-match-start")) {
      const body = q.postDataJSON();
      starts.push(body);
      const state = startGame(
        createInitialGameState(
          [champion.id, champion.id],
          cards.map(cardRecordToDefinition),
          champions.map(championRecordToDefinition),
          [
            decks.find((d) => d.id === body.deckId).cardDefinitionIds,
            ai.cardDefinitionIds,
          ],
          { gameId: body.matchId, randomSeed: 19 },
        ),
        () => 0.5,
      );
      state.players.forEach((p) => (p.mulliganUsed = true));
      json = { state, difficulty: "NORMAL" };
    }
    return r.fulfill({ json });
  });
  await p.routeWebSocket("**/api/online-matches/ws**", (ws) =>
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      messages.push(m);
      if (m.type === "PING") ws.send(JSON.stringify({ type: "PONG" }));
      if (m.type === "JOIN_QUICK_QUEUE")
        ws.send(
          JSON.stringify({
            type: "QUICK_QUEUE_JOINED",
            deck: {
              deckId: m.deckId,
              deckName: decks.find((d) => d.id === m.deckId)?.name,
              championName: champion.name,
            },
          }),
        );
    }),
  );
  return {
    get decks() {
      return decks;
    },
    writes,
    starts,
    messages,
  };
}
try {
 for(const [width,height] of [[360,640],[390,844],[412,915],[844,390],[1440,900]]){
  for(const path of ['/','/online']){
   const p=await b.newPage({viewport:{width,height},ignoreHTTPSErrors:qaOrigin.startsWith('https:')});const errors=[];p.on('pageerror',e=>errors.push(e.message));const x=await setup(p);
   await p.goto(qaOrigin+path);
   const banner=p.getByTestId('launch-deck-banner');await banner.getByText('출전 검증 덱',{exact:true}).waitFor();
   const button=banner.getByRole('button',{name:'덱 변경',exact:true});await button.waitFor();
   await button.click({trial:true});
   const geometry=await button.evaluate(n=>{const r=n.getBoundingClientRect(),a=n.closest('aside').getBoundingClientRect();return {width:r.width,height:r.height,inside:r.top>=a.top&&r.bottom<=a.bottom&&r.left>=a.left&&r.right<=a.right,hit:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
   assert.ok(geometry.inside&&geometry.hit,JSON.stringify({width,height,path,geometry}));assert.ok(geometry.width>=44&&geometry.height>=44);
   await p.screenshot({path:`${out}/${path==='/'?'home':'battle'}-${width}.png`});await button.click();const picker=p.getByRole('dialog',{name:'출전 덱 선택'});await picker.waitFor();await picker.locator('article').filter({hasText:'첫 번째 덱'}).getByRole('button',{name:'이 덱 사용',exact:true}).click();await picker.waitFor({state:'hidden'});await banner.getByText('첫 번째 덱',{exact:true}).waitFor();assert.equal(x.writes.length,1);assert.equal(x.decks.find(d=>d.isSelected).id,'other');
   assert.deepEqual(errors,[]);results.push({viewport:{width,height},ignoreHTTPSErrors:qaOrigin.startsWith('https:'),path,button:geometry,dialogOpened:true,selectionChangedOnce:true});await p.close();
  }
 }

 for(const variant of ['missing','invalid'])for(const path of ['/','/online']){
  const p=await b.newPage({viewport:{width:360,height:640},ignoreHTTPSErrors:qaOrigin.startsWith('https:')});await setup(p,{[variant]:true});await p.goto(qaOrigin+path);const banner=p.getByTestId('launch-deck-banner');await banner.locator('button').first().waitFor();await p.waitForTimeout(300);
  for(const button of await banner.locator('button').all()){const g=await button.evaluate(n=>{const r=n.getBoundingClientRect(),a=n.closest('aside').getBoundingClientRect();return {inside:r.top>=a.top&&r.bottom<=a.bottom,hit:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});assert.ok(g.inside&&g.hit,JSON.stringify({variant,path,text:await button.textContent(),g}));}
  results.push({variant,path,allActionsVisible:true});await p.close();
 }

 for(const height of [320,390]){
  const p=await b.newPage({viewport:{width:844,height},ignoreHTTPSErrors:qaOrigin.startsWith('https:')});await setup(p);await p.route('**/qa/retro-font/assets/champion-*',r=>r.abort());await p.goto(qaOrigin);const banner=p.getByTestId('launch-deck-banner');await banner.getByText('그림을 불러오지 못했어요.',{exact:false}).waitFor();const action=banner.getByRole('button',{name:'덱 변경',exact:true});const inside=await action.evaluate(n=>{const r=n.getBoundingClientRect(),a=n.closest('aside').getBoundingClientRect();return r.top>=a.top&&r.bottom<=a.bottom&&r.bottom<=innerHeight&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert.ok(inside);await action.click();await p.getByRole('dialog',{name:'출전 덱 선택'}).waitFor();results.push({viewport:{width:844,height},artFailed:true,actionVisibleAndOperable:true});await p.close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await b.close();}
