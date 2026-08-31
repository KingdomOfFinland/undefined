/* undefined — resolution + HUD scaling manager */
(() => {
  'use strict';

  const PRESETS = [
    ['20:9',1600,720],['20:9',2340,1080],['20:9',2400,1080],
    ['16:9',1280,720],['16:9',1600,900],['16:9',1920,1080],['16:9',2560,1440],['16:9',3840,2160],
    ['16:10',1280,800],['16:10',1440,900],['16:10',1920,1200],['16:10',2560,1600],
    ['4:3',800,600],['4:3',1024,768],['4:3',1280,960],['4:3',1600,1200],
    ['3:2',1440,960],['3:2',2160,1440],
    ['21:9',2560,1080],['21:9',3440,1440],
    ['32:9',3840,1080],['32:9',5120,1440]
  ];

  const KEY='uf_resolution_settings_v1';
  let settings={mode:'auto',width:1920,height:1080};

  function ratio(w,h){
    const r=w/h;
    const known=[[20/9,'20:9'],[16/9,'16:9'],[16/10,'16:10'],[4/3,'4:3'],[3/2,'3:2'],[21/9,'21:9'],[32/9,'32:9']];
    let best=known[0]; for(const x of known) if(Math.abs(r-x[0])<Math.abs(r-best[0]))best=x;
    return Math.abs(r-best[0])<.03?best[1]:r.toFixed(3)+':1';
  }
  function detected(){return {width:Math.max(1,window.innerWidth),height:Math.max(1,window.innerHeight),dpr:window.devicePixelRatio||1,aspect:ratio(window.innerWidth,window.innerHeight)}}
  function canvas(){return document.querySelector('canvas')}

  function apply(){
    const c=canvas(); if(!c)return;
    const d=detected();
    let w=settings.mode==='custom'?settings.width:d.width;
    let h=settings.mode==='custom'?settings.height:d.height;
    if(settings.mode!=='custom'){
      // Keep the logical game size untouched; CSS scales the canvas to the viewport.
      c.style.width=''; c.style.height='';
    }
    c.dataset.renderWidth=w; c.dataset.renderHeight=h;
    c.dataset.displayAspect=ratio(w,h);
    // HUD scale follows vertical display size, with sane bounds.
    const scale=Math.max(.75,Math.min(2.5,h/900));
    document.documentElement.style.setProperty('--hud-scale',scale.toFixed(3));
    document.documentElement.style.setProperty('--display-width',w+'px');
    document.documentElement.style.setProperty('--display-height',h+'px');
    document.documentElement.style.setProperty('--render-scale',(w/1920).toFixed(3));
    window.dispatchEvent(new CustomEvent('uf-resolutionchange',{detail:{...d,width:w,height:h,scale}}));
  }

  function load(){try{const x=JSON.parse(localStorage.getItem(KEY));if(x&&['auto','custom'].includes(x.mode))settings={...settings,...x}}catch(e){}}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(settings))}catch(e){}}

  function addUI(){
    if(document.getElementById('resolutionPanel'))return;
    const style=document.createElement('style');style.textContent=`
      #resolutionPanel{position:fixed;inset:0;z-index:100;background:rgba(0,5,10,.97);display:none;align-items:center;justify-content:center;font-family:'Courier New',monospace;color:#c9f7ff;padding:16px}
      #resolutionPanel.show{display:flex}.rpBox{width:min(620px,96vw);max-height:92vh;overflow:auto;background:#08151c;border:1px solid #0af;box-shadow:0 0 25px rgba(0,180,255,.2);padding:16px}
      .rpBox h2{text-align:center;color:#0ff;margin:0 0 4px;text-shadow:0 0 9px #0ff}.rpInfo{text-align:center;color:#789;font-size:10px;margin-bottom:12px}
      .rpGroup{border-top:1px solid #123;padding:10px 0}.rpGroup h3{font-size:11px;color:#8cf;margin:0 0 7px}.rpGrid{display:flex;flex-wrap:wrap;gap:6px}
      .rpBtn{background:#0a2a35;color:#8cf;border:1px solid #145;padding:6px 8px;font:10px 'Courier New',monospace;cursor:pointer}.rpBtn:hover{background:#12404d}.rpBtn.active{background:#0af;color:#001}
      .rpCustom{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.rpCustom input{width:95px;background:#001820;color:#0ff;border:1px solid #145;padding:6px;font:11px monospace}
      .rpBottom{text-align:center;padding-top:10px}.rpClose{background:#123;color:#8cf;border:1px solid #145;padding:7px 22px;font:11px monospace;cursor:pointer}
    `;document.head.appendChild(style);
    const p=document.createElement('div');p.id='resolutionPanel';p.innerHTML=`<div class="rpBox"><h2>DISPLAY / RESOLUTION</h2><div class="rpInfo" id="rpInfo"></div><div class="rpGroup"><h3>MODE</h3><div class="rpGrid"><button class="rpBtn" id="rpAuto">AUTO</button></div></div><div class="rpGroup"><h3>PRESETS</h3><div id="rpPresets"></div></div><div class="rpGroup"><h3>CUSTOM RESOLUTION</h3><div class="rpCustom"><input id="rpW" type="number" min="160" max="16384" placeholder="width"><span>×</span><input id="rpH" type="number" min="120" max="16384" placeholder="height"><button class="rpBtn" id="rpCustomApply">APPLY</button></div></div><div class="rpBottom"><button class="rpClose">CLOSE [R / ESC]</button></div></div>`;document.body.appendChild(p);
    const info=p.querySelector('#rpInfo'),pres=p.querySelector('#rpPresets');
    const refresh=()=>{const d=detected();info.textContent=`detected: ${d.width} × ${d.height} · aspect: ${d.aspect} · dpr: ${d.dpr}`;p.querySelector('#rpAuto').classList.toggle('active',settings.mode==='auto');pres.innerHTML='';const by={};PRESETS.forEach(x=>(by[x[0]]??=[]).push(x));for(const [r,list] of Object.entries(by)){const g=document.createElement('div');g.style.marginBottom='7px';const l=document.createElement('div');l.textContent=r;l.style.cssText='font-size:9px;color:#567;margin-bottom:4px';g.appendChild(l);const row=document.createElement('div');row.className='rpGrid';list.forEach(x=>{const b=document.createElement('button');b.className='rpBtn';b.textContent=`${x[1]} × ${x[2]}`;b.onclick=()=>{settings={mode:'custom',width:x[1],height:x[2]};save();apply();refresh()};row.appendChild(b)});g.appendChild(row);pres.appendChild(g)}};
    p.querySelector('#rpAuto').onclick=()=>{settings.mode='auto';save();apply();refresh()};p.querySelector('#rpCustomApply').onclick=()=>{const w=parseInt(p.querySelector('#rpW').value,10),h=parseInt(p.querySelector('#rpH').value,10);if(w>=160&&h>=120){settings={mode:'custom',width:w,height:h};save();apply();refresh()}};p.querySelector('.rpClose').onclick=()=>p.classList.remove('show');
    window.addEventListener('keydown',e=>{if(e.key==='Escape')p.classList.remove('show');if(e.key.toLowerCase()==='r'&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&document.activeElement?.tagName!=='INPUT'){p.classList.toggle('show');refresh()}});window.addEventListener('resize',()=>{apply();if(p.classList.contains('show'))refresh()});window.addEventListener('orientationchange',apply);
    window.__openResolutionPanel=()=>{refresh();p.classList.add('show')};
  }

  function starRefresh(){
    // Notify the game so a future starfield implementation can regenerate using current dimensions.
    window.dispatchEvent(new CustomEvent('uf-starfieldresize',{detail:detected()}));
  }
  window.addEventListener('uf-resolutionchange',starRefresh);
  load();
  const boot=()=>{addUI();apply();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
