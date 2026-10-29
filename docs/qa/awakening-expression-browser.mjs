import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/awakening-expression";
await mkdir(out, { recursive: true });
const cards = JSON.parse(
  await readFile(
    "artifacts/ko-game/src/game/qa/fixtures/cards-2026-10-12-all.json",
    "utf8",
  ),
);
const champions = JSON.parse(
  await readFile(
    "artifacts/ko-game/src/game/qa/fixtures/champions-2026-10-12-all.json",
    "utf8",
  ),
);
const place = { scale: 1, x: 50, y: 40, crop: false, flip: false };
const config = {
  version: 1,
  frames: Object.fromEntries(
    ["default", "surprised", "awaken"].map((k) => [
      k,
      {
        url: "/api/storage/objects/uploads/cosmetics/size-" + k + ".png",
        self: { ...place },
        opponent: { ...place },
      },
    ]),
  ),
  reactions: {},
};
const saved = { config: structuredClone(config), revision: "qa-1" };
const b = await chromium.launch();
const results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    const ctx = await b.newContext({
      viewport: { width, height },
      hasTouch: width === 390,
      reducedMotion: "reduce",
    });
    const p = await ctx.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", async (r) => {
      const path = new URL(r.request().url()).pathname;
      const image = path.match(/size-(default|surprised|awaken)\.png/);
      if (image)
        return r.fulfill({
          body: await readFile(
            "qa-results/final-ten-sprites/fixtures/" + (image[1] === "awaken" ? "victory" : image[1]) + ".png",
          ),
          contentType: "image/png",
        });
      if (path.endsWith("/auth/me") || path.endsWith("/admin/session"))
        return r.fulfill({
          json: {
            authenticated: true,
            user: {
              id: "qa-size-admin",
              nickname: "QA",
              role: "ADMIN",
              email: "qa@size.invalid",
              currency: 0,
              currencyBalance: 0,
              prismBalance: 0,
              championPrismBalance: 0,
              isTestAccount: false,
            },
          },
        });
      if (path === "/api/server-status")
        return r.fulfill({
          json: { enabled: false, allowed: true, message: "" },
        });
      if (path.startsWith("/api/admin/battle-sprites")) {
        if (r.request().method() === "PATCH") {
          saved.config = r.request().postDataJSON().sprite;
          saved.revision = "qa-" + Date.now();
          return r.fulfill({ json: saved });
        }
        return r.fulfill({
          json: {
            targets: [
              {
                key: "default:qa-champion",
                kind: "default",
                id: "qa-champion",
                championId: "qa-champion",
                championName: "QA 크기 검증",
                name: "기본 외형",
                imageUrl: null,
                ...saved,
              },
            ],
          },
        });
      }
      if (path === "/api/minion-a/cards")
        return r.fulfill({ json: { definitions: [] } });
      if (path.includes("/champions"))
        return r.fulfill({ json: { champions } });
      if (path.includes("/cards")) return r.fulfill({ json: { cards } });
      return r.fulfill({
        json: {
          cards: [],
          champions: [],
          frames: [],
          items: [],
          notices: [],
          media: [],
        },
      });
    });
    await p.goto("http://127.0.0.1:5186/admin/battle-sprites");
    await p.getByLabel("스프라이트 표정", {exact:true}).waitFor();
    await p.getByLabel("스프라이트 표정", {exact:true}).selectOption("awaken");
    assert.equal(await p.locator('[aria-label="등록할 표정 11개"] button').count(),11);
    await p.getByLabel('스프라이트 크기 퍼센트',{exact:true}).fill(width === 390 ? '110' : '120');
    await p.getByLabel('스프라이트 크기 퍼센트',{exact:true}).blur();
    await p.getByRole('button',{name:'스프라이트 저장',exact:true}).click();
    await p.getByText('스프라이트 설정을 저장했습니다.',{exact:true}).waitFor();
    assert.ok(saved.config.frames.awaken);
    await p.reload();
    await p.getByLabel("스프라이트 표정", {exact:true}).selectOption("awaken");
    await p.screenshot({path:out+`/admin-${width}.png`});
    await p.goto('http://127.0.0.1:5186/qa/black-gold-board.html');
    await p.locator('.ko-game-shell').waitFor();
    await p.locator('[data-preview-tools]').evaluate(n=>n.style.display='none');
    const actor=p.locator('.ko-player-champion .ko-battle-actor');
    const art=()=>actor.locator('img').first();
    const expected=async(name)=>{await p.waitForFunction(name=>document.querySelector('.ko-player-champion .ko-battle-actor img')?.getAttribute('src')?.includes('size-'+name+'.png'),name);};
    async function load(mode, completed=false) {
      await p.evaluate(async ({mode,completed,config})=>{
        const {boardFixture}=await import('/qa/black-gold-fixture.ts');
        const state=boardFixture();state.gameId=crypto.randomUUID();state.events=[];state.status='IN_PROGRESS';
        const manifest=structuredClone(config);
        manifest.awakening=mode;
        manifest.awakened={version:1,frames:{default:config.frames.surprised},reactions:{}};
        const cosmetics={};
        for(const pl of state.players){pl.champion.questCompleted=completed;pl.health=20;
          cosmetics[pl.id]={cardBack:null,emotes:[],skins:{['champion:'+pl.champion.id]:{id:'qa-awake-'+pl.id,type:'CHAMPION_SKIN',targetId:pl.champion.id,name:'QA skin',isActive:true,sortOrder:0,imageAssets:{__battle:JSON.stringify(manifest)}}}};
        }
        window.__awakeCase={state,cosmetics};
        window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state,cosmetics,definitions:state.cardPool}}));
      },{mode,completed,config});
    }
    async function quest(){await p.evaluate(()=>{const c=window.__awakeCase;c.state=structuredClone(c.state);c.state.players[0].champion.questCompleted=true;c.state.events.push({type:'CHAMPION_QUEST_COMPLETED',playerId:c.state.players[0].id,id:crypto.randomUUID()});window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{...c,definitions:c.state.cardPool}}));});}
    await load('KEEP');await expected('default');
    await quest();await expected('awaken');await p.waitForTimeout(1750);await expected('awaken');
    await p.screenshot({path:out+`/keep-${width}.png`});
    await load('REPLACE');await expected('default');await quest();await expected('awaken');
    await p.waitForTimeout(600);assert.match(await art().getAttribute('src'),/size-awaken/);
    await p.screenshot({path:out+`/transition-${width}.png`});
    await expected('surprised');await p.waitForTimeout(150);assert.match(await art().getAttribute('src'),/size-surprised/);
    await p.screenshot({path:out+`/replacement-${width}.png`});
    await load('REPLACE',true);await expected('surprised');assert.notEqual(await actor.getAttribute('data-reaction'),'AWAKEN');
    await load('KEEP',true);await expected('awaken');assert.notEqual(await actor.getAttribute('data-reaction'),'AWAKEN');
    await load('KEEP');await expected('default');
    assert.deepEqual(errors,[]);
    results.push({width,height,adminSaveReload:'PASS (mock API)',keep:'PASS',replaceHoldAndSwap:'PASS',reconnect:'PASS',newMatch:'PASS',fixture:'diagnostic artwork, confirmed event snapshots; not live PvP'});
    await ctx.close();
  }
  await writeFile(out+'/results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
}finally{await b.close();}
