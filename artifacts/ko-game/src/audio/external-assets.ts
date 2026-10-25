/** Only project-owned fallback SFX are redirected. Admin-uploaded audio keeps its URL. */
const sounds:Record<string,string>={
 'combat-movement.wav':'rpg/knife_slice.ogg',
 'combat-hit-1-2.wav':'../impact-mixes/contact-light.wav',
 'combat-hit-3-5.wav':'impact/impact_punch_medium_000.ogg',
 'combat-hit-6-9.wav':'../impact-mixes/contact-heavy.wav',
 'combat-hit-10-plus.wav':'../impact-mixes/contact-massive.wav',
 'combat-finisher.wav':'../impact-mixes/contact-massive.wav',
 'impact-light.wav':'impact/impact_generic_light_000.ogg',
 'impact-normal.wav':'impact/impact_punch_medium_001.ogg',
 'impact-heavy.wav':'impact/impact_wood_heavy_000.ogg',
 'impact-very-heavy.wav':'../impact-mixes/contact-heavy.wav',
 'impact-finisher.wav':'../impact-mixes/contact-massive.wav',
 'summon-bass-heavy.wav':'scifi/low_frequency_explosion_000.ogg',
 'summon-bass-massive.wav':'scifi/explosion_crunch_000.ogg',
 'champion-glass-shatter.wav':'impact/impact_glass_heavy_000.ogg',
};
export function externalSound(url:string) {
 const i=url.indexOf('/sfx/');if(i<0)return url;
 const name=url.slice(i+5).split('?')[0];
 return sounds[name]?url.slice(0,i)+'/vendor/kenney/'+sounds[name]:url;
}
