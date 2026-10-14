// Paste this entire file into the console of your already authenticated admin page.
// Only GET requests are issued. No passwords, cookies, accounts or transactions are exported.
(async () => {
  if (!location.pathname.startsWith('/admin')) throw new Error('관리자로 로그인한 /admin 페이지에서 실행해 주세요.');
  const cardFields = ["id", "name", "cardType", "cost", "attack", "health", "text", "rarity", "isStarterGrant", "keywords", "tags", "isToken", "isChampionToken", "effectId", "effectConfig", "imageAssetId", "imageUrl", "imageDisplayMode", "imageScale", "imagePositionX", "imagePositionY", "entranceAudioAssetId", "entranceAudioUrl", "entranceAudioVolume", "entranceAudioEnabled", "summonLine", "retireLine", "destroyLine", "status", "version", "createdAt", "updatedAt"];
  const championFields = ["id", "name", "description", "imageAssetId", "imageUrl", "imageDisplayMode", "imageScale", "imagePositionX", "imagePositionY", "questCompletedPortraitEnabled", "questCompletedPortraitAssetId", "questCompletedPortraitUrl", "maxHealth", "abilityName", "abilityCost", "abilityText", "gameStartAbilityName", "gameStartAbilityText", "gameStartAbilityEffects", "abilityEffects", "hasQuest", "questName", "questText", "questCondition", "questProgressRequired", "questRewardText", "questRewardEffects", "upgradedAbilityName", "upgradedAbilityCost", "upgradedAbilityText", "upgradedAbilityEffects", "championTokenDefinitionId", "championTokenEffectText", "championTokenEffectEffects", "abilityAudioAssetId", "abilityAudioUrl", "abilityAudioVolume", "questCompleteAudioAssetId", "questCompleteAudioUrl", "questCompleteAudioVolume", "questCompleteAudioEnabled", "introLineOne", "introLineTwo", "presentationLines", "status", "isCraftable", "isStarterGrant", "version", "createdAt", "updatedAt"];
  const forbidden = /^(password|passwordHash|tokenHash|accessToken|refreshToken|secretKey|serviceRoleKey|apiKey|cookie|authorization)$/i;
  function check(value) {
    if (Array.isArray(value)) return value.forEach(check);
    if (value && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        if (forbidden.test(key)) throw new Error('콘텐츠에 민감정보 필드가 있어 내보내기를 중단했습니다.');
        check(nested);
      }
    }
  }
  function select(rows, fields) {
    if (!Array.isArray(rows)) throw new Error('관리자 콘텐츠 응답 형식이 올바르지 않습니다.');
    const ids = new Set();
    return rows.map(row => {
      if (!row.id || ids.has(row.id)) throw new Error('누락되거나 중복된 콘텐츠 ID가 있습니다.');
      ids.add(row.id);
      const clean = Object.fromEntries(fields.filter(key => Object.hasOwn(row,key)).map(key => [key,row[key]]));
      check(clean);
      return clean;
    }).sort((a,b) => a.id.localeCompare(b.id));
  }
  async function get(path) {
    const response = await fetch(path, { method:'GET', credentials:'include', cache:'no-store', signal:AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`읽기 실패: ${path} HTTP ${response.status}. 관리자 로그인 상태를 확인하세요.`);
    return response.json();
  }
  async function collect() {
    const [cardData, championData] = await Promise.all([get('/api/admin/cards'),get('/api/admin/champions')]);
    let tags = null;
    try {
      const data = await get('/api/admin/tags/');
      if (Array.isArray(data.tags) && data.tags.every(tag => typeof tag === 'string')) tags = [...data.tags].sort();
    } catch { /* Legacy admin sessions may not authorize the separate tag catalog. */ }
    return { cards:select(cardData.cards,cardFields), champions:select(championData.champions,championFields), tags };
  }
  async function hash(value) {
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
    return Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('');
  }
  const first = await collect();
  const second = await collect();
  const digest = await hash(first);
  if (digest !== await hash(second)) throw new Error('내보내는 동안 콘텐츠가 변경되었습니다. 잠시 후 다시 실행하세요.');
  const generatedAt = new Date().toISOString();
  const snapshot = {
    manifest:{ generatedAt, sourceOrigin:location.origin, sourcePaths:['/api/admin/cards','/api/admin/champions','/api/admin/tags/'],
      access:'existing admin session; GET only', cardCount:first.cards.length, championCount:first.champions.length,
      tokenCount:first.cards.filter(card => card.isToken || card.isChampionToken).length,
      sha256:digest, consecutiveReadsMatch:true, completeAdminCardsAndChampions:true,
      missing:first.tags===null?['Complete tag definitions unavailable; card tags remain included']:[] },
    ...first,
  };
  const blob = new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');link.href=url;link.download=`ko-admin-content-${generatedAt.replace(/[:.]/g,'-')}.json`;
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  console.info(`콘텐츠 JSON 다운로드 완료: 카드 ${first.cards.length}장, 챔피언 ${first.champions.length}종. 이 파일만 Codex에 보내 주세요.`);
})().catch(error => console.error(error.message));
