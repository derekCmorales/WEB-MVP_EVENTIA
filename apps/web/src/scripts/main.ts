// @ts-nocheck

const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('.kin').forEach(h=>{const walk=n=>{[...n.childNodes].forEach(c=>{if(c.nodeType===3){const f=document.createDocumentFragment();c.textContent.split(/(\s+)/).forEach((w,i)=>{if(/^\s+$/.test(w)||!w){f.append(w);return}const s=document.createElement('span');s.className='w';s.textContent=w;f.append(s)});c.replaceWith(f)}else if(c.nodeType===1&&c.tagName!=='BR')walk(c)})};walk(h);h.querySelectorAll('.w').forEach((w,i)=>w.style.setProperty('--i',i))});
document.querySelectorAll('section').forEach(s=>{const items=s.querySelectorAll('.rv');items.forEach((el,i)=>el.style.setProperty('--d',(i%6)*0.08+'s'))});
document.querySelectorAll('section .card, section .flow, .dash, .grow').forEach(e=>{if(!e.classList.contains('rv'))e.classList.add('obs')});
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);
 e.target.querySelectorAll?.('[data-count]').forEach(cnt);if(e.target.matches('.num,[data-count]'))cnt(e.target)}}),{threshold:.2});
document.querySelectorAll('.rv,.kin,.obs,.num,.flow,.duo').forEach(e=>io.observe(e));
function cnt(el){if(el.dataset.done)return;el.dataset.done=1;const raw=el.dataset.count||el.textContent;const target=parseFloat(raw.replace(/\./g,'').replace(',','.'));const dec=raw.includes(',')?1:0;const suf=raw.replace(/[\d.,\s]/g,'');const t0=performance.now();
 const f=n=>{const k=RM?1:Math.min(1,(n-t0)/1600),e=1-Math.pow(1-k,4);let v=target*e;el.textContent=(dec?v.toFixed(1).replace('.',','):Math.round(v).toLocaleString('es-GT').replace(/,/g,'.'))+(suf?' '+suf:'');if(k<1)requestAnimationFrame(f)};requestAnimationFrame(f)}
// live countdown
if(!RM)setInterval(()=>{const ps=[...document.querySelectorAll('.pass')];const p=ps[Math.floor(Math.random()*ps.length)];const b=p.querySelector('.left');let n=parseInt(b.textContent.replace(/\./g,''));if(n>1){n--;b.textContent=n.toLocaleString('es-GT').replace(/,/g,'.');b.animate([{transform:'translateY(-4px)',opacity:.4},{transform:'none',opacity:1}],{duration:400,easing:'cubic-bezier(.22,1,.36,1)'})}},1400);
// parallax
const pxs=[...document.querySelectorAll('.duo img,.px,.ci')];let pxOn=true;
function par(){if(RM)return;const vh=innerHeight;pxs.forEach(i=>{const r=i.parentElement.getBoundingClientRect();if(r.bottom<0||r.top>vh)return;const p=(r.top+r.height/2-vh/2)/vh;i.style.transform=`translateY(${p*-40}px) scale(1.12)`});}addEventListener('scroll',()=>requestAnimationFrame(par),{passive:true});par();
// magnetic buttons
document.querySelectorAll('.btn').forEach(b=>{b.classList.add('mag');b.addEventListener('pointermove',e=>{if(RM)return;const r=b.getBoundingClientRect();b.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.15}px,${(e.clientY-r.top-r.height/2)*.25}px)`});b.addEventListener('pointerleave',()=>b.style.transform='')});

// Canvas "Made by Sound": solo animan cuando están en pantalla
function sound(el:HTMLCanvasElement,draw:(x:CanvasRenderingContext2D,t:number)=>void){const x=el.getContext('2d')!;const dpr=Math.min(2,devicePixelRatio||1);
 const size=()=>{const r=el.getBoundingClientRect();el.width=r.width*dpr;el.height=r.height*dpr;x.setTransform(dpr,0,0,dpr,0,0)};size();addEventListener('resize',size,{passive:true});
 let on=false,raf=0;const loop=(n:number)=>{draw(x,RM?0:n/1000);if(on&&!RM)raf=requestAnimationFrame(loop)};
 new IntersectionObserver(([e])=>{on=e.isIntersecting;cancelAnimationFrame(raf);if(on)raf=requestAnimationFrame(loop)}).observe(el);requestAnimationFrame(loop)}
const rp=document.getElementById('rp') as HTMLCanvasElement|null;
if(rp)sound(rp,(x,t)=>{const W=rp.clientWidth,H=rp.clientHeight,cx=W*.75,cy=H*.53;x.clearRect(0,0,W,H);for(let k=0;k<26;k++){x.beginPath();for(let a=0;a<=6.3;a+=.04){const amp=Math.sin(a*6+t*2+k*.5)*(3+k*.35)*(.6+.4*Math.sin(t*3.2));const r=40+k*18+amp;const px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r*.78;a?x.lineTo(px,py):x.moveTo(px,py)}x.closePath();x.strokeStyle=k==9?'rgba(47,75,255,.9)':`rgba(28,25,23,${.5-k*.017})`;x.lineWidth=k==9?1.4:.7;x.stroke()}});
const rp2=document.getElementById('rp2') as HTMLCanvasElement|null;
if(rp2)sound(rp2,(x,t)=>{const W=rp2.clientWidth,H=rp2.clientHeight;x.clearRect(0,0,W,H);for(let k=0;k<18;k++){x.beginPath();for(let a=0;a<=6.3;a+=.05){const r=60+k*30+Math.sin(a*5+t*1.6+k*.4)*(2+k*.4);const px=W/2+Math.cos(a)*r*1.6,py=H/2+Math.sin(a)*r*.7;a?x.lineTo(px,py):x.moveTo(px,py)}x.closePath();x.strokeStyle=`rgba(28,25,23,${.3-k*.014})`;x.lineWidth=.7;x.stroke()}});
