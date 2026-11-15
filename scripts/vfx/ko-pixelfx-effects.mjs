/** Original KO CARD GAME effects, rendered with patch-gg/pixelfx (MIT).
 * The game ships transparent atlases, not the procedural simulation runtime.
 */
export function makeKoEffects({fit, Rng, TAU, sparkle, ease}) {
  const gold=['#251521','#783c2c','#bb713a','#eda94f','#ffdb86','#fff0cb','#fffcef'];
  const mint=['#102b2c','#205b51','#369477','#70cca0','#acedd0','#e0ffee','#ffffff'];
  const guard=['#152439','#284a66','#4286a2','#72c2cf','#b3e9ec','#e4f9ff','#ffffff'];
  const meta=(name,duration,palette)=>({name,desc:'Hand-authored KO CARD GAME contact VFX with a transparent centre, sharp release and seeded trailing sparks.',tags:['ko-card-game','one-shot'],size:[128,128],origin:[64,64],fps:30,duration,loop:false,bg:'dark',options:{palette,seed:19}});
  function hit(variant=0,critical=false) {
    const m=meta(critical?'KO critical contact':`KO contact ${variant}`,critical?.7:.56,gold);
    return {meta:m,draw(p,t,o) {
      if(t<=0||t>=m.duration-1e-6)return;
      const C=fit(o.palette,7),u=t/m.duration,R=new Rng(o.seed);
      const peak=Math.min(1,t/.022)*Math.pow(Math.max(0,1-Math.max(0,t-.06)/.16),.8),reach=(critical?39:29)*ease.outQuart(Math.min(1,t/.105));
      p.glow(0,0,critical?43:30,C[3],.27*peak);
      if(t<.25) {
        const rays=variant===1?10:variant===2?6:8;
        for(let i=0;i<rays;i++) {
          const a=i/rays*TAU+(variant===2?-.45:0),length=reach*(i%2?.5:1)*(variant===1?R.range(.72,1.12):1),end=length*peak;
          const x=Math.cos(a),y=Math.sin(a);
          p.tri(x*end,y*end,-y*2*peak,x*2*peak,y*2*peak,-x*2*peak,C[4],peak);
          p.line(0,0,x*end*.78,y*end*.78,C[6],peak);
        }
        sparkle(p,0,0,(critical?10:7)*peak,C[6],C[4],.7*peak);
      }
      const ring=(critical?40:29)*ease.outQuart(Math.min(1,t/.3));
      if(t<.36) for(let i=0;i<8;i++) {
        const a=i*TAU/8+.08;
        p.arc(0,0,ring,1,a,a+.25,C[3],Math.pow(1-t/.36,2)*.7);
      }
      for(let i=0;i<(critical?24:14);i++) {
        const a=R.range(0,TAU),speed=R.range(30,critical?92:66),life=R.range(.27,m.duration),age=t/life;
        if(age>=1)continue;
        const d=speed*(1-Math.exp(-t*6))/6,x=Math.cos(a)*d*3,y=Math.sin(a)*d*3+22*t*t;
        const alpha=Math.pow(1-age,1.7),tail=2+4*(1-age);
        p.line(x,y,x-Math.cos(a)*tail,y-Math.sin(a)*tail,C[4],alpha);
        p.dot(x,y,C[6],alpha);p.glow(x,y,3,C[3],.16*alpha);
      }
    }};
  }
  const blockMeta=meta('KO prism guard',.64,guard);
  const block={meta:blockMeta,draw(p,t,o) {
    if(t<=0||t>=blockMeta.duration-1e-6)return;
    const C=fit(o.palette,7),u=t/blockMeta.duration,a=Math.min(1,t/.035)*Math.pow(1-u,1.3),scale=.7+.3*ease.outQuart(Math.min(1,t/.1));
    const pts=[[-19,-19],[0,-25],[19,-19],[16,9],[0,24],[-16,9]].map(([x,y])=>[x*scale,y*scale]);
    const line=t<.24?1:a;
    p.polyline([...pts,pts[0]],C[4],line);p.polyline(pts.slice(0,4),C[6],line);
    p.line(0,-22*scale,0,19*scale,C[3],a*.6);p.line(-16*scale,-12*scale,16*scale,-12*scale,C[4],a*.8);
    p.glow(0,-3,30,C[3],a*.14);
    for(let i=0;i<4;i++) {
      const theta=i*TAU/4-.75,d=26+13*u,x=Math.cos(theta)*d,y=Math.sin(theta)*d;
      sparkle(p,x,y,2.6*(1-u),C[6],C[3],a*.65);
    }
    if(t<.22)p.arc(0,-2,25+16*u,1,3.7,5.7,C[5],a*.7);
  }};
  const healMeta=meta('KO verdant renewal',.9,mint);
  const heal={meta:healMeta,draw(p,t,o) {
    if(t<=0||t>=healMeta.duration-1e-6)return;
    const C=fit(o.palette,7),u=t/healMeta.duration,R=new Rng(o.seed),a=Math.sin(Math.PI*u);
    p.glow(0,10,34,C[3],a*.17);
    const r=8+20*ease.outQuart(Math.min(1,t/.5));
    const ring=Array.from({length:33},(_,i)=>[Math.cos(i/32*TAU)*r,21+Math.sin(i/32*TAU)*r*.24]);
    p.polyline(ring,C[3],u>.15&&u<.65?1:a);
    p.glow(0,21,24,C[3],a*.12);
    for(let i=0;i<9;i++) {
      const phase=(u-i*.045)/.65,x=R.range(-23,23),start=R.range(15,27),sway=R.range(0,TAU);
      if(phase<=0||phase>=1)continue;
      const alpha=Math.sin(phase*Math.PI),y=start-phase*57,xx=x+Math.sin(phase*4+sway)*3;
      if(i%3===0) {
        p.line(xx-3,y,xx+3,y,C[4],alpha);p.line(xx,y-3,xx,y+3,C[4],alpha);p.px(xx,y,C[6]);
      } else sparkle(p,xx,y,1.8*alpha,C[6],C[3],alpha*.8);
      p.glow(xx,y,4,C[3],.16*alpha);
    }
  }};
  return {impact:hit(2),critical:hit(1,true),guard:block,heal,
    'draft-radial':hit(0),'draft-burst':hit(1),'draft-cross':hit(2)};
}
