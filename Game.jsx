import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & DATA
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_COLOR = {
  strike:"#e05555", block:"#5580e0", dodge:"#55c080",
  hybrid_sb:"#c8952a", hybrid_ds:"#c8952a", hybrid_bd:"#c8952a",
};
const TYPE_LABEL = {
  strike:"Strike", block:"Block", dodge:"Dodge",
  hybrid_sb:"Secret", hybrid_ds:"Secret", hybrid_bd:"Secret",
};

function resolveTypes(a, d) {
  if (a === d) return "tie";
  const H = {
    hybrid_sb:{beats:"dodge",ties:"block",loses:"strike"},
    hybrid_ds:{beats:"block",ties:"strike",loses:"dodge"},
    hybrid_bd:{beats:"strike",ties:"dodge",loses:"block"},
  };
  if (H[a] && H[d]) return "tie";
  if (H[a]) { const h=H[a]; return d===h.beats?"win":d===h.ties?"tie":"lose"; }
  if (H[d]) { const h=H[d]; return a===h.loses?"win":a===h.ties?"tie":"lose"; }
  const beats = {strike:"dodge",block:"strike",dodge:"block"};
  return beats[d]===a ? "win" : "lose";
}

const BRUCE_POSES = [
  {id:"b1",name:"Dragon Fist",type:"strike"},
  {id:"b2",name:"Flying Kick",type:"strike"},
  {id:"b3",name:"Crescent Sweep",type:"strike"},
  {id:"b4",name:"Iron Guard",type:"block"},
  {id:"b5",name:"Tiger Block",type:"block"},
  {id:"b6",name:"Mountain Stance",type:"block"},
  {id:"b7",name:"Shadow Step",type:"dodge"},
  {id:"b8",name:"Cat Retreat",type:"dodge"},
  {id:"b9",name:"Low Slip",type:"dodge"},
];
const NINJA_POSES = [
  {id:"n1",name:"Blade Edge",type:"strike"},
  {id:"n2",name:"Death Kick",type:"strike"},
  {id:"n3",name:"Spinning Fist",type:"strike"},
  {id:"n4",name:"Turtle Shell",type:"block"},
  {id:"n5",name:"Stone Wall",type:"block"},
  {id:"n6",name:"Shield Cross",type:"block"},
  {id:"n7",name:"Phantom Drift",type:"dodge"},
  {id:"n8",name:"Snake Coil",type:"dodge"},
  {id:"n9",name:"Wind Escape",type:"dodge"},
];
const EXTRA_BRUCE = [
  {id:"be1",name:"Thunder Dragon",type:"hybrid_sb",special:true},
  {id:"be2",name:"Ghost Walk",type:"hybrid_ds",special:true},
  {id:"be3",name:"Steel Lotus",type:"hybrid_bd",special:true},
];
const EXTRA_NINJA = [
  {id:"ne1",name:"Demon Claw",type:"hybrid_sb",special:true},
  {id:"ne2",name:"Void Step",type:"hybrid_ds",special:true},
  {id:"ne3",name:"Iron Shroud",type:"hybrid_bd",special:true},
];
const SORCERIES = {
  magic_powder:{name:"Magic Powder",icon:"⚗",desc:"Negates fire attacks for one battle"},
  ancient_key: {name:"Ancient Key", icon:"⌂",desc:"Skip one fight tile entirely"},
  shadow_scroll:{name:"Shadow Scroll",icon:"◈",desc:"Peek at enemy pose before choosing"},
  iron_bell:   {name:"Iron Bell",   icon:"◉",desc:"Convert one round loss into a tie"},
  dragon_rope: {name:"Dragon Rope", icon:"⊕",desc:"Jump 1–4 extra tiles immediately"},
};
const NINJA_TYPES = {
  black: {name:"Black Ninja", color:"#aaa",    bg:"#1a1a24",desc:"Balanced. Reads you.",             weights:{s:33,b:33,d:34},setback:2},
  fire:  {name:"Fire Ninja",  color:"#ff5500", bg:"#2a0800",desc:"Relentless. Punishes hesitation.",  weights:{s:60,b:20,d:20},setback:3},
  shadow:{name:"Shadow Ninja",color:"#8888ff", bg:"#080828",desc:"Evasive. Impossible to predict.",   weights:{s:20,b:20,d:60},setback:3},
  demon: {name:"Demon Ninja", color:"#cc44ff", bg:"#1a0028",desc:"Chaos incarnate. Breaks the rules.",weights:{s:34,b:33,d:33},setback:5,chaos:true},
  master:{name:"Master Ninja",color:"#ffd700", bg:"#0a0818",desc:"The final trial. All techniques.",  weights:{s:34,b:33,d:33},setback:0,boss:true},
};

// ─────────────────────────────────────────────────────────────────────────────
// STICK FIGURE JOINT DATA  (all in 70×90 coordinate space)
// head:[cx,cy,r], neck:[x,y], hips:[x,y],
// rS/rE/rW: right shoulder/elbow/wrist, lS/lE/lW: left
// rK/rF: right knee/foot, lK/lF: left
// ─────────────────────────────────────────────────────────────────────────────

const J = {
  b1:{head:[32,9,7],neck:[32,16],hips:[30,46],rS:[38,22],rE:[52,22],rW:[64,22],lS:[26,22],lE:[18,28],lW:[14,34],rK:[38,60],rF:[44,76],lK:[22,60],lF:[16,76]},
  b2:{head:[20,12,7],neck:[22,19],hips:[32,46],rS:[28,26],rE:[18,20],rW:[12,16],lS:[36,26],lE:[46,20],lW:[54,16],rK:[52,38],rF:[64,28],lK:[30,60],lF:[26,74]},
  b3:{head:[40,10,7],neck:[38,17],hips:[34,46],rS:[28,24],rE:[16,20],rW:[8,16],lS:[40,24],lE:[50,18],lW:[58,14],rK:[40,62],rF:[46,78],lK:[14,54],lF:[6,68]},
  b4:{head:[30,9,7],neck:[30,16],hips:[30,46],rS:[36,22],rE:[22,14],rW:[14,8],lS:[24,22],lE:[38,14],lW:[46,8],rK:[38,62],rF:[44,78],lK:[22,62],lF:[16,78]},
  b5:{head:[30,9,7],neck:[30,16],hips:[30,48],rS:[38,24],rE:[50,14],rW:[58,6],lS:[22,24],lE:[10,14],lW:[4,6],rK:[38,64],rF:[44,80],lK:[22,64],lF:[16,80]},
  b6:{head:[30,8,7],neck:[30,15],hips:[30,42],rS:[40,22],rE:[54,28],rW:[64,34],lS:[20,22],lE:[8,28],lW:[2,34],rK:[46,58],rF:[56,76],lK:[14,58],lF:[4,76]},
  b7:{head:[18,12,7],neck:[20,19],hips:[24,46],rS:[28,26],rE:[40,24],rW:[50,22],lS:[16,26],lE:[8,30],lW:[4,34],rK:[30,60],rF:[38,76],lK:[14,60],lF:[8,76]},
  b8:{head:[28,9,7],neck:[28,16],hips:[34,48],rS:[40,26],rE:[52,22],rW:[60,20],lS:[26,26],lE:[18,22],lW:[12,18],rK:[48,62],rF:[54,74],lK:[22,60],lF:[16,76]},
  b9:{head:[44,30,7],neck:[40,37],hips:[30,56],rS:[36,44],rE:[50,36],rW:[60,28],lS:[24,44],lE:[12,38],lW:[4,32],rK:[42,70],rF:[52,84],lK:[18,70],lF:[10,84]},
  be1:{head:[34,8,7],neck:[34,15],hips:[32,44],rS:[40,20],rE:[54,14],rW:[64,8],lS:[28,20],lE:[20,14],lW:[14,10],rK:[40,60],rF:[50,78],lK:[24,62],lF:[14,80]},
  be2:{head:[24,10,7],neck:[26,17],hips:[30,44],rS:[34,24],rE:[46,18],rW:[56,14],lS:[22,24],lE:[12,18],lW:[6,14],rK:[36,58],rF:[44,74],lK:[20,62],lF:[12,80]},
  be3:{head:[30,9,7],neck:[30,16],hips:[30,46],rS:[38,22],rE:[44,12],rW:[50,4],lS:[22,22],lE:[16,12],lW:[10,4],rK:[36,62],rF:[42,78],lK:[24,62],lF:[18,78]},
  n1:{head:[32,9,7],neck:[32,16],hips:[30,46],rS:[38,22],rE:[50,14],rW:[58,8],lS:[24,22],lE:[16,28],lW:[12,34],rK:[38,62],rF:[46,78],lK:[22,62],lF:[16,78]},
  n2:{head:[26,9,7],neck:[28,16],hips:[30,46],rS:[24,24],rE:[12,18],rW:[4,14],lS:[36,24],lE:[46,18],lW:[54,14],rK:[50,32],rF:[64,20],lK:[26,62],lF:[22,78]},
  n3:{head:[44,12,7],neck:[40,19],hips:[32,48],rS:[36,28],rE:[48,20],rW:[58,14],lS:[28,28],lE:[16,24],lW:[8,20],rK:[40,64],rF:[48,80],lK:[24,64],lF:[18,80]},
  n4:{head:[30,12,7],neck:[30,19],hips:[30,48],rS:[36,26],rE:[46,36],rW:[52,44],lS:[24,26],lE:[16,36],lW:[10,44],rK:[38,64],rF:[44,78],lK:[22,64],lF:[16,78]},
  n5:{head:[30,9,7],neck:[30,16],hips:[30,48],rS:[36,26],rE:[50,26],rW:[62,26],lS:[24,26],lE:[10,26],lW:[2,26],rK:[44,64],rF:[54,80],lK:[16,64],lF:[6,80]},
  n6:{head:[30,9,7],neck:[30,16],hips:[30,48],rS:[36,24],rE:[24,14],rW:[16,6],lS:[24,24],lE:[36,14],lW:[44,6],rK:[38,64],rF:[44,80],lK:[22,64],lF:[16,80]},
  n7:{head:[50,10,7],neck:[46,17],hips:[38,46],rS:[44,24],rE:[56,20],rW:[64,18],lS:[32,24],lE:[22,20],lW:[14,18],rK:[50,60],rF:[58,76],lK:[26,60],lF:[20,76]},
  n8:{head:[38,22,7],neck:[36,29],hips:[28,52],rS:[34,38],rE:[48,30],rW:[58,24],lS:[22,38],lE:[12,32],lW:[4,28],rK:[40,68],rF:[50,82],lK:[16,68],lF:[8,82]},
  n9:{head:[20,14,7],neck:[22,21],hips:[28,50],rS:[32,30],rE:[44,26],rW:[54,24],lS:[20,30],lE:[10,24],lW:[4,20],rK:[36,64],rF:[44,80],lK:[22,66],lF:[16,82]},
  ne1:{head:[32,9,7],neck:[32,16],hips:[30,46],rS:[38,22],rE:[52,18],rW:[62,12],lS:[24,22],lE:[14,18],lW:[8,14],rK:[38,60],rF:[46,76],lK:[22,60],lF:[16,76]},
  ne2:{head:[20,14,7],neck:[22,21],hips:[28,48],rS:[30,28],rE:[42,24],rW:[52,22],lS:[20,28],lE:[10,22],lW:[4,18],rK:[34,62],rF:[42,78],lK:[20,64],lF:[12,80]},
  ne3:{head:[30,10,7],neck:[30,17],hips:[30,46],rS:[38,24],rE:[44,14],rW:[50,6],lS:[22,24],lE:[16,14],lW:[10,6],rK:[36,62],rF:[42,78],lK:[24,62],lF:[18,78]},
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const d6 = () => Math.floor(Math.random()*6)+1;
function doRoll(adv) {
  if (adv==="win") return Math.max(d6(),d6());
  if (adv==="lose") return Math.min(d6(),d6());
  return d6();
}

function pickNinjaMove(type, basePoses) {
  const nt = NINJA_TYPES[type]||NINJA_TYPES.black;
  if (nt.chaos && Math.random()<0.15) return EXTRA_NINJA[Math.floor(Math.random()*3)];
  const {s,b,d} = nt.weights, total=s+b+d, r=Math.random()*total;
  const t = r<s?"strike":r<s+b?"block":"dodge";
  const pool = nt.boss ? [...basePoses,...EXTRA_NINJA] : basePoses;
  const typed = pool.filter(p=>p.type===t);
  return (typed.length ? typed : pool)[Math.floor(Math.random()*(typed.length||pool.length))];
}

function generateBoard() {
  const tiles = Array.from({length:48},(_,i)=>({id:i+1,type:"normal",data:null}));
  [[5,17],[18,30],[36,45]].forEach(([f,t])=>{ tiles[f-1]={id:f,type:"ladder",data:t}; });
  [[12,3],[27,21],[42,34]].forEach(([f,t])=>{ tiles[f-1]={id:f,type:"trap",data:t}; });
  [7,11,16,20,23,29,33,38,43,47].forEach(pos=>{
    const r=Math.random();
    tiles[pos-1]={id:pos,type:"fight",data:r>.95?"demon":r>.75?"shadow":r>.5?"fire":"black"};
  });
  [4,9,14,22,26,31,37,41,46].forEach(pos=>{
    const r=Math.random();
    let item=null;
    if(r>.30){
      const opts = r<.42 ? ["extra_pose"] : Object.keys(SORCERIES);
      item=opts[Math.floor(Math.random()*opts.length)];
    }
    tiles[pos-1]={id:pos,type:"item",data:item};
  });
  tiles[47]={id:48,type:"boss",data:"master"};
  return tiles;
}

function tileGridPos(id) {
  const idx=id-1, row=Math.floor(idx/8), p=idx%8;
  return {gr:5-row, gc:row%2===0?p:7-p};
}

const FALLBACKS=[
  "A clash of spirit and steel — the outcome hangs by a thread.",
  "The master reads your move before you make it.",
  "Speed meets precision. Only one can walk away.",
  "The air crackles. Both fighters breathe. One strikes.",
  "Fortune smiles, but which fighter is she smiling at?",
  "A feint, a counter — then the decisive blow falls.",
  "The stance says everything. The roll says the rest.",
  "Perfect timing or terrible timing — only the sticks know.",
  "You have been tested. The board does not care about glory.",
  "The ninja expected that. Or maybe they did not.",
];

async function fetchNarration(apiKey, playerPose, enemyPose, pRoll, eRoll, outcome, ninjaType) {
  if (!apiKey) return FALLBACKS[Math.floor(Math.random()*FALLBACKS.length)];
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({
        model:"claude-sonnet-4-20250514", max_tokens:80,
        messages:[{role:"user",content:`Write one short dramatic sentence (max 18 words) narrating this kung fu board game exchange: Fighter used ${playerPose.name} (${playerPose.type}), ${ninjaType} ninja used ${enemyPose.name} (${enemyPose.type}), rolls ${pRoll} vs ${eRoll}, result: ${outcome}. Be vivid and cinematic.`}]
      })
    });
    const data=await res.json();
    return data.content?.[0]?.text?.trim()||FALLBACKS[0];
  } catch { return FALLBACKS[Math.floor(Math.random()*FALLBACKS.length)]; }
}

// ─────────────────────────────────────────────────────────────────────────────
// POSE FIGURE
// ─────────────────────────────────────────────────────────────────────────────

function PoseFigure({id, color="#c8952a", size=64}) {
  const j=J[id]; if(!j) return <div style={{width:size,height:size*90/70}}/>;
  const sw=size<50?2:2.5;
  const L=([x1,y1],[x2,y2])=><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={sw} strokeLinecap="round"/>;
  return (
    <svg viewBox="0 0 70 90" width={size} height={size*90/70} style={{overflow:"visible",display:"block"}}>
      <circle cx={j.head[0]} cy={j.head[1]} r={j.head[2]} fill="none" stroke={color} strokeWidth={sw}/>
      {L(j.neck,j.hips)}
      {L(j.neck,j.rS)}{L(j.neck,j.lS)}
      {L(j.rS,j.rE)}{L(j.rE,j.rW)}
      {L(j.lS,j.lE)}{L(j.lE,j.lW)}
      {L(j.hips,j.rK)}{L(j.rK,j.rF)}
      {L(j.hips,j.lK)}{L(j.lK,j.lF)}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POSE CARD
// ─────────────────────────────────────────────────────────────────────────────

function PoseCard({pose, selected, onClick, disabled, faceDown=false, size="normal"}) {
  const color = faceDown ? "#222" : (TYPE_COLOR[pose.type]||"#888");
  const w = size==="small" ? 72 : 84;
  return (
    <div onClick={!disabled&&!faceDown?onClick:undefined}
      style={{
        cursor:disabled||faceDown?"default":"pointer",
        border:`1.5px solid ${selected?color:faceDown?"#1e1e1e":"#1e1210"}`,
        borderRadius:7, padding:"7px 4px 5px",
        background:selected?`${color}15`:faceDown?"#111":"#0d0908",
        display:"flex",flexDirection:"column",alignItems:"center",gap:4,
        transition:"all 0.15s", opacity:disabled?0.4:1,
        boxShadow:selected?`0 0 10px ${color}44`:"none",
        width:w, minHeight:w*1.4, justifyContent:"center", flexShrink:0,
      }}>
      {faceDown
        ? <div style={{fontSize:24,color:"#1a1a1a"}}>?</div>
        : <>
            <PoseFigure id={pose.id} color={color} size={size==="small"?48:58}/>
            <div style={{fontSize:9,fontWeight:700,color,textAlign:"center",textTransform:"uppercase",letterSpacing:"0.3px",lineHeight:1.2,padding:"0 2px"}}>{pose.name}</div>
            <div style={{fontSize:8,color:"#444",textTransform:"uppercase",letterSpacing:"0.6px"}}>{TYPE_LABEL[pose.type]}</div>
            {pose.special&&<div style={{fontSize:8,color:"#c8952a"}}>★ Secret</div>}
          </>
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BOARD GRID
// ─────────────────────────────────────────────────────────────────────────────

const TCFG = {
  normal:{bg:"#100c07",border:"#1c1508",mark:"",mc:"#333"},
  fight: {bg:"#1e0707",border:"#581010",mark:"⚔",mc:"#993333"},
  item:  {bg:"#071407",border:"#0f5010",mark:"◈",mc:"#337733"},
  ladder:{bg:"#070728",border:"#102080",mark:"↑",mc:"#3355cc"},
  trap:  {bg:"#1e0f07",border:"#7a4010",mark:"↓",mc:"#aa6633"},
  boss:  {bg:"#130726",border:"#820082",mark:"☠",mc:"#cc44cc"},
};

function BoardGrid({board, positions, highlightTile}) {
  const grid=Array(6).fill(null).map(()=>Array(8).fill(null));
  board.forEach(t=>{const {gr,gc}=tileGridPos(t.id);grid[gr][gc]=t;});
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gridTemplateRows:"repeat(6,1fr)",gap:2,width:"100%"}}>
      {grid.flat().map((tile,i)=>{
        if(!tile) return <div key={i} style={{aspectRatio:"1.2"}}/>;
        const c=TCFG[tile.type]||TCFG.normal;
        const here=positions.filter(p=>p.pos===tile.id);
        const hi=highlightTile===tile.id;
        return (
          <div key={tile.id} style={{
            background:c.bg,border:`1px solid ${hi?"#ffd700":c.border}`,borderRadius:3,
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            padding:1,position:"relative",aspectRatio:"1.2",
            boxShadow:hi?"0 0 7px #ffd70077":"none",transition:"box-shadow 0.3s",
          }}>
            <div style={{fontSize:6,color:"#2a2218",lineHeight:1}}>{tile.id}</div>
            {c.mark&&<div style={{fontSize:10,color:c.mc,lineHeight:1}}>{c.mark}</div>}
            <div style={{position:"absolute",top:1,right:1,display:"flex",flexDirection:"column",gap:0}}>
              {here.map(p=><div key={p.char} style={{fontSize:9,lineHeight:1}}>{p.char==="bruce"?"🥋":"🥷"}</div>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FORTUNE STICKS
// ─────────────────────────────────────────────────────────────────────────────

const CNUM=["一","二","三","四","五","六"];

function FortuneSticks({value, rolling, onRoll, disabled}) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
      <div style={{
        width:52,height:68,borderRadius:"26px 26px 3px 3px",
        background:"#7a3a10",border:"2px solid #6b3418",
        display:"flex",alignItems:"flex-end",justifyContent:"center",
        gap:3,padding:"0 6px 3px",position:"relative",overflow:"hidden",
      }}>
        {[0,1,2,3,4].map(i=>(
          <div key={i} style={{
            width:5,borderRadius:"2px 2px 0 0",
            background:i===2&&value?"#ffd700":"#c09050",
            height:`${58+(rolling?Math.sin(Date.now()*0.01+i)*8:0)}%`,
            transition:"height 0.08s",
            animation:rolling?`shake ${0.08+i*0.03}s ease-in-out infinite alternate`:"none",
          }}/>
        ))}
      </div>
      <div style={{fontSize:28,color:value?"#ffd700":"#222",fontWeight:700,lineHeight:1,minHeight:34,display:"flex",alignItems:"center"}}>
        {value?CNUM[value-1]:"·"}
      </div>
      <button onClick={onRoll} disabled={disabled||rolling||!!value}
        style={{
          background:(disabled||rolling||value)?"#151010":"#8b0000",
          color:(disabled||rolling||value)?"#333":"#ffd700",
          border:"1px solid #4a1010",borderRadius:3,
          padding:"5px 12px",fontSize:10,fontWeight:700,
          cursor:(disabled||rolling||value)?"default":"pointer",
          textTransform:"uppercase",letterSpacing:"1px",
        }}>
        {rolling?"...":value?CNUM[value-1]:"Shake"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAYER PANEL
// ─────────────────────────────────────────────────────────────────────────────

function PlayerPanel({player, label, isActive}) {
  const color = player.char==="bruce"?"#c41e1e":"#888888";
  return (
    <div style={{
      background:"#0c0908",border:`1px solid ${isActive?color:"#191210"}`,
      borderRadius:6,padding:"8px 10px",
      boxShadow:isActive?`0 0 10px ${color}25`:"none",
    }}>
      <div style={{fontSize:10,color:isActive?color:"#444",textTransform:"uppercase",letterSpacing:"1px",marginBottom:6,display:"flex",alignItems:"center",gap:5}}>
        {player.char==="bruce"?"🥋":"🥷"} {label} {isActive&&<span style={{color}}>▶</span>}
      </div>
      <div style={{fontSize:11,color:"#555"}}>
        Tile: <span style={{color:"#d0c0a0"}}>{player.pos===0?"Start":player.pos===48?"Boss!":player.pos}</span>
      </div>
      {player.extraPoses.length>0&&(
        <div style={{marginTop:5}}>
          {player.extraPoses.map(p=><div key={p.id} style={{fontSize:9,color:"#8a6a1a"}}>★ {p.name}</div>)}
        </div>
      )}
      {player.sorceries.length>0&&(
        <div style={{marginTop:5,display:"flex",flexWrap:"wrap",gap:3}}>
          {player.sorceries.map((s,i)=>{
            const sc=SORCERIES[s]; return sc?(
              <div key={i} title={sc.desc} style={{fontSize:10,color:"#336633",background:"#0a1a0a",border:"1px solid #1a3a1a",borderRadius:3,padding:"1px 5px"}}>{sc.icon} {sc.name}</div>
            ):null;
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEM POPUP
// ─────────────────────────────────────────────────────────────────────────────

function ItemPopup({item, extraPoseName, onClose}) {
  const sc=item&&item!=="extra_pose"?SORCERIES[item]:null;
  return (
    <div style={{position:"fixed",inset:0,background:"#000000bb",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div style={{background:"#0a0808",border:"1px solid #2a1808",borderRadius:10,padding:"28px 32px",maxWidth:300,textAlign:"center"}}>
        {!item&&<>
          <div style={{fontSize:28,color:"#222",marginBottom:14}}>◌</div>
          <div style={{fontSize:15,color:"#666",marginBottom:6}}>Nothing here</div>
          <div style={{fontSize:11,color:"#444"}}>The path continues undisturbed.</div>
        </>}
        {item==="extra_pose"&&<>
          <div style={{fontSize:28,color:"#c8952a",marginBottom:14}}>★</div>
          <div style={{fontSize:11,color:"#c8952a",letterSpacing:"2px",marginBottom:8}}>SECRET TECHNIQUE</div>
          <div style={{fontSize:17,fontWeight:700,color:"#f0d0a0",marginBottom:8}}>{extraPoseName}</div>
          <div style={{fontSize:11,color:"#666"}}>A rare move has been added to your arsenal.</div>
        </>}
        {sc&&<>
          <div style={{fontSize:28,color:"#338833",marginBottom:14}}>{sc.icon}</div>
          <div style={{fontSize:11,color:"#338833",letterSpacing:"2px",marginBottom:8}}>SORCERY FOUND</div>
          <div style={{fontSize:17,fontWeight:700,color:"#f0d0a0",marginBottom:8}}>{sc.name}</div>
          <div style={{fontSize:11,color:"#666"}}>{sc.desc}</div>
        </>}
        <button onClick={onClose} style={{marginTop:20,background:"#1a1010",color:"#c41e1e",border:"1px solid #4a1010",borderRadius:3,padding:"7px 22px",fontSize:11,cursor:"pointer",letterSpacing:"1px",textTransform:"uppercase"}}>
          Continue
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BATTLE SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function BattleScreen({ninjaType, playerChar, playerPoses, sorceries, playerScore, enemyScore,
  selectedPose, enemyPose, revealed, playerRoll, enemyRoll, roundResult,
  narration, narLoading, battleDone, playerWon, isBoss, peeked,
  onSelect, onReveal, onRoll, onNext, onSorcery}) {
  const nt=NINJA_TYPES[ninjaType]||NINJA_TYPES.black;
  const pColor=playerChar==="bruce"?"#c41e1e":"#888";
  const eColor=nt.color;
  const adv=selectedPose&&enemyPose?resolveTypes(selectedPose.type,enemyPose.type):null;
  const hasPowder=sorceries.includes("magic_powder");
  const hasScroll=sorceries.includes("shadow_scroll");
  const hasBell=sorceries.includes("iron_bell");

  return (
    <div style={{position:"fixed",inset:0,background:"#000000ee",zIndex:50,display:"flex",flexDirection:"column",alignItems:"center",overflowY:"auto",padding:"12px 8px"}}>
      <div style={{width:"100%",maxWidth:660}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{padding:"5px 12px",borderRadius:20,background:nt.bg,border:`1px solid ${eColor}44`}}>
            <span style={{color:eColor,fontWeight:700,fontSize:13}}>{nt.name}</span>
            <span style={{color:"#444",fontSize:11,marginLeft:8}}>{nt.desc}</span>
          </div>
          <div style={{fontSize:12,color:"#666",display:"flex",gap:8,alignItems:"center"}}>
            <span style={{color:pColor,fontWeight:700,fontSize:16}}>{playerScore}</span>
            <span style={{color:"#333"}}>—</span>
            <span style={{color:eColor,fontWeight:700,fontSize:16}}>{enemyScore}</span>
          </div>
        </div>

        {/* Score pips */}
        <div style={{textAlign:"center",marginBottom:12}}>
          <div style={{fontSize:9,color:"#333",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>First to 2 rounds wins</div>
          <div style={{display:"flex",gap:6,justifyContent:"center",alignItems:"center"}}>
            {[0,1].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:i<playerScore?pColor:"#1a1a1a",border:`1px solid ${i<playerScore?pColor:"#2a2a2a"}`}}/>)}
            <span style={{color:"#222",fontSize:10,margin:"0 4px"}}>vs</span>
            {[0,1].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:i<enemyScore?eColor:"#1a1a1a",border:`1px solid ${i<enemyScore?eColor:"#2a2a2a"}`}}/>)}
          </div>
        </div>

        {/* Sorcery quick-use */}
        {!revealed&&(
          <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:10,flexWrap:"wrap"}}>
            {hasPowder&&ninjaType==="fire"&&(
              <button onClick={()=>onSorcery("magic_powder")} style={{background:"#0a180a",border:"1px solid #2a5a2a",borderRadius:3,color:"#55aa55",fontSize:10,padding:"4px 10px",cursor:"pointer"}}>
                ⚗ Magic Powder — negate fire
              </button>
            )}
            {hasScroll&&!peeked&&(
              <button onClick={()=>onSorcery("shadow_scroll")} style={{background:"#0a0a18",border:"1px solid #2a2a5a",borderRadius:3,color:"#5555aa",fontSize:10,padding:"4px 10px",cursor:"pointer"}}>
                ◈ Shadow Scroll — peek
              </button>
            )}
          </div>
        )}

        {peeked&&!revealed&&enemyPose&&(
          <div style={{textAlign:"center",marginBottom:8,fontSize:11,color:"#4488aa"}}>
            Shadow Scroll reveals: enemy will use <strong style={{color:"#66aacc"}}>{enemyPose.name}</strong>
          </div>
        )}

        {/* Main battle area */}
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:10,alignItems:"start",marginBottom:14}}>

          {/* Player side */}
          <div>
            <div style={{fontSize:10,color:pColor,textTransform:"uppercase",letterSpacing:"1px",marginBottom:8,textAlign:"center"}}>
              {playerChar==="bruce"?"🥋 Bruce Lee":"🥷 Ninja"}
            </div>
            {revealed&&selectedPose ? (
              <div style={{display:"flex",justifyContent:"center"}}>
                <PoseCard pose={selectedPose} selected/>
              </div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:3}}>
                {playerPoses.map(p=>(
                  <PoseCard key={p.id} pose={p} size="small"
                    selected={selectedPose?.id===p.id}
                    disabled={!!selectedPose&&selectedPose.id!==p.id&&!revealed}
                    onClick={()=>!revealed&&onSelect(p)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Center */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,paddingTop:20}}>
            {!revealed ? (
              <>
                <div style={{fontSize:16,color:"#222",fontWeight:700}}>VS</div>
                <button onClick={onReveal} disabled={!selectedPose} style={{
                  background:selectedPose?"#8b0000":"#151010",
                  color:selectedPose?"#ffd700":"#2a2a2a",
                  border:`1px solid ${selectedPose?"#6a1010":"#1a1010"}`,
                  borderRadius:3,padding:"7px 10px",fontSize:10,
                  cursor:selectedPose?"pointer":"default",
                  textTransform:"uppercase",letterSpacing:"1px",fontWeight:700,
                }}>Reveal!</button>
              </>
            ) : (
              <>
                {adv&&<div style={{fontSize:9,color:adv==="win"?"#55aa55":adv==="lose"?"#aa5555":"#666",textTransform:"uppercase",letterSpacing:"0.5px",textAlign:"center"}}>
                  {adv==="win"?"Advantage ▲":adv==="lose"?"Disadvantage ▼":"Even odds"}
                </div>}
                <FortuneSticks value={playerRoll} rolling={false} onRoll={onRoll} disabled={!!playerRoll}/>
              </>
            )}
          </div>

          {/* Enemy side */}
          <div>
            <div style={{fontSize:10,color:eColor,textTransform:"uppercase",letterSpacing:"1px",marginBottom:8,textAlign:"center"}}>{nt.name}</div>
            <div style={{display:"flex",justifyContent:"center"}}>
              {revealed&&enemyPose ? <PoseCard pose={enemyPose}/> : <PoseCard pose={NINJA_POSES[0]} faceDown/>}
            </div>
          </div>
        </div>

        {/* Enemy roll status */}
        {revealed&&playerRoll&&!enemyRoll&&(
          <div style={{textAlign:"center",marginBottom:10,fontSize:11,color:"#444",fontStyle:"italic"}}>
            The ninja consults fate...
          </div>
        )}

        {/* Dice results */}
        {playerRoll&&enemyRoll&&(
          <div style={{textAlign:"center",fontSize:11,color:"#555",marginBottom:8}}>
            Your roll: <span style={{color:"#d0c0a0"}}>{playerRoll}</span>
            <span style={{margin:"0 8px",color:"#333"}}>vs</span>
            Enemy: <span style={{color:"#d0c0a0"}}>{enemyRoll}</span>
          </div>
        )}

        {/* Round result */}
        {roundResult&&(
          <div style={{textAlign:"center",marginBottom:12,padding:"10px",background:"#080808",borderRadius:6,border:"1px solid #181818"}}>
            <div style={{fontSize:13,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",
              color:roundResult==="player_wins"?"#55cc55":roundResult==="enemy_wins"?"#cc5555":"#888"}}>
              {roundResult==="player_wins"?"You win this round!":roundResult==="enemy_wins"?"Enemy wins this round":"A tie — no ground gained"}
            </div>
            {hasBell&&roundResult==="enemy_wins"&&!battleDone&&(
              <button onClick={()=>onSorcery("iron_bell")} style={{marginTop:8,background:"#18180a",border:"1px solid #7a7a22",borderRadius:3,color:"#aaaa44",fontSize:10,padding:"4px 12px",cursor:"pointer"}}>
                ◉ Use Iron Bell — convert to tie
              </button>
            )}
          </div>
        )}

        {/* Narration */}
        {(narration||narLoading)&&(
          <div style={{marginBottom:12,padding:"10px 14px",background:"#060608",borderRadius:6,border:"1px solid #181020",textAlign:"center"}}>
            {narLoading
              ? <span style={{color:"#333",fontSize:11,fontStyle:"italic"}}>The narrator stirs...</span>
              : <span style={{color:"#b89878",fontSize:12,fontStyle:"italic",lineHeight:1.5}}>"{narration}"</span>
            }
          </div>
        )}

        {/* Battle outcome */}
        {battleDone&&(
          <div style={{textAlign:"center",padding:"14px",background:playerWon?"#091409":"#170909",border:`1px solid ${playerWon?"#2a6a2a":"#6a1a1a"}`,borderRadius:8,marginBottom:12}}>
            <div style={{fontSize:20,fontWeight:700,color:playerWon?"#55cc55":"#cc4444",marginBottom:10,letterSpacing:"2px"}}>
              {playerWon?"Victory!":"Defeated!"}
            </div>
            <button onClick={onNext} style={{
              background:playerWon?"#0a2a0a":"#150a0a",
              color:playerWon?"#55cc55":"#cc4444",
              border:`1px solid ${playerWon?"#2a5a2a":"#5a1a1a"}`,
              borderRadius:4,padding:"8px 22px",fontSize:12,cursor:"pointer",
              letterSpacing:"1px",textTransform:"uppercase",
            }}>{playerWon?"Continue →":"Accept defeat →"}</button>
          </div>
        )}

        {/* Next round button */}
        {roundResult&&!battleDone&&(
          <div style={{textAlign:"center",marginBottom:8}}>
            <button onClick={onNext} style={{background:"#181010",color:"#666",border:"1px solid #2a2020",borderRadius:3,padding:"7px 18px",fontSize:11,cursor:"pointer",letterSpacing:"1px",textTransform:"uppercase"}}>
              Next Round →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TITLE SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function TitleScreen({onStart, apiKey, setApiKey}) {
  const [showKey,setShowKey]=useState(false);
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#060406",position:"relative",overflow:"hidden"}}>
      {[180,280,380].map((s,i)=>(
        <div key={i} style={{position:"absolute",width:s,height:s,borderRadius:"50%",border:`1px solid #${["440000","2a0000","1a0000"][i]}`,pointerEvents:"none"}}/>
      ))}
      <div style={{zIndex:1,textAlign:"center",padding:"0 24px"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:20}}>
          <svg viewBox="0 0 100 140" width={90} height={126}>
            <g stroke="#c41e1e" strokeWidth="3.5" strokeLinecap="round" fill="none">
              <circle cx="32" cy="18" r="12"/>
              <line x1="32" y1="30" x2="44" y2="72"/>
              <line x1="38" y1="44" x2="16" y2="36"/>
              <line x1="38" y1="44" x2="55" y2="34"/>
              <line x1="44" y1="72" x2="90" y2="58"/>
              <line x1="90" y1="58" x2="108" y2="46"/>
              <line x1="44" y1="72" x2="38" y2="108"/>
              <line x1="38" y1="108" x2="32" y2="132"/>
            </g>
          </svg>
        </div>
        <div style={{fontSize:38,fontWeight:900,color:"#c41e1e",letterSpacing:"5px",fontFamily:"Georgia,serif",textShadow:"0 0 24px #c41e1e66",marginBottom:2}}>BRUCE LEE</div>
        <div style={{fontSize:14,color:"#555",letterSpacing:"7px",textTransform:"uppercase",marginBottom:4}}>vs the</div>
        <div style={{fontSize:22,fontWeight:700,color:"#666",letterSpacing:"4px",fontFamily:"Georgia,serif",marginBottom:44}}>SHADOW CLAN</div>
        <button onClick={onStart} style={{background:"#c41e1e",color:"#ffd700",border:"none",borderRadius:4,padding:"13px 44px",fontSize:15,fontWeight:700,cursor:"pointer",letterSpacing:"2px",textTransform:"uppercase"}}>
          Begin
        </button>
        <div style={{marginTop:28}}>
          <button onClick={()=>setShowKey(!showKey)} style={{background:"transparent",color:"#333",border:"1px solid #1e1e1e",borderRadius:3,padding:"5px 14px",fontSize:10,cursor:"pointer",letterSpacing:"1px"}}>
            {showKey?"▲ Hide":"AI Narration (optional)"}
          </button>
          {showKey&&(
            <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:5,alignItems:"center"}}>
              <div style={{fontSize:10,color:"#444"}}>Anthropic API key for AI battle narration. Free tier plays fine without it.</div>
              <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-ant-..." style={{background:"#0a0808",border:"1px solid #2a2020",borderRadius:3,padding:"5px 10px",color:"#888",fontSize:12,width:240}}/>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function SetupScreen({onSetup, onBack}) {
  const opts=[
    {mode:"team_bruce",label:"Play as Bruce Lee",sub:"Cooperate against the Shadow Clan",e:"🥋"},
    {mode:"team_ninja",label:"Play as a Ninja",sub:"Defeat Bruce Lee and his allies",e:"🥷"},
    {mode:"versus",label:"Challenge a Friend",sub:"One is Bruce Lee, one is Ninja",e:"⚔"},
  ];
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#060406",padding:24,gap:20}}>
      <div style={{fontSize:11,color:"#444",letterSpacing:"5px",textTransform:"uppercase"}}>Choose your path</div>
      {opts.map(o=>(
        <div key={o.mode} onClick={()=>onSetup(o.mode)}
          onMouseEnter={e=>e.currentTarget.style.borderColor="#c41e1e"}
          onMouseLeave={e=>e.currentTarget.style.borderColor="#221810"}
          style={{background:"#0d0908",border:"1px solid #221810",borderRadius:8,padding:"18px 28px",cursor:"pointer",width:270,textAlign:"center",transition:"border-color 0.15s"}}>
          <div style={{fontSize:26,marginBottom:7}}>{o.e}</div>
          <div style={{fontSize:14,fontWeight:700,color:"#e0d0b0",marginBottom:4}}>{o.label}</div>
          <div style={{fontSize:11,color:"#555"}}>{o.sub}</div>
        </div>
      ))}
      <button onClick={onBack} style={{background:"transparent",color:"#333",border:"none",cursor:"pointer",fontSize:12,marginTop:8}}>← Back</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LOG
// ─────────────────────────────────────────────────────────────────────────────

function Log({lines}) {
  const ref=useRef();
  useEffect(()=>{ if(ref.current) ref.current.scrollTop=ref.current.scrollHeight; },[lines]);
  return (
    <div ref={ref} style={{height:72,overflowY:"auto",background:"#060606",border:"1px solid #181018",borderRadius:4,padding:"5px 9px",fontSize:11,color:"#444",lineHeight:1.6}}>
      {lines.map((l,i)=><div key={i} style={{color:i===lines.length-1?"#8a7860":"#3a3028"}}>{l}</div>)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VICTORY SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function Victory({won, char, isBoss, onRestart}) {
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#060406",padding:24,gap:20,textAlign:"center"}}>
      <div style={{fontSize:56}}>{won?(char==="bruce"?"🥋":"🥷"):"💀"}</div>
      <div style={{fontSize:30,fontWeight:900,fontFamily:"Georgia,serif",color:won?"#ffd700":"#4a2a2a",letterSpacing:"3px",textTransform:"uppercase",textShadow:won?"0 0 18px #ffd70077":"none"}}>
        {won?"Victory":"Defeated"}
      </div>
      <div style={{fontSize:13,color:"#555",maxWidth:260,lineHeight:1.7}}>
        {won?(isBoss?"The Master Ninja falls. Peace returns to the mountain.":"You have walked the path and found its end."):"The spirit endures. Rise and try again."}
      </div>
      <button onClick={onRestart} style={{background:"#c41e1e",color:"#ffd700",border:"none",borderRadius:4,padding:"11px 32px",fontSize:14,fontWeight:700,cursor:"pointer",letterSpacing:"2px",textTransform:"uppercase",marginTop:8}}>
        Play Again
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────

const mkPlayer = (char) => ({char, pos:0, basePoses:char==="bruce"?[...BRUCE_POSES]:[...NINJA_POSES], extraPoses:[], sorceries:[]});
const getPoses = (p) => [...p.basePoses, ...p.extraPoses];

export default function App() {
  const [screen, setScreen] = useState("title");
  const [gameMode, setGameMode] = useState(null);
  const [apiKey, setApiKey] = useState("");

  const [board, setBoard] = useState(null);
  const [players, setPlayers] = useState(null);
  const [turnIdx, setTurnIdx] = useState(0);
  const [phase, setPhase] = useState("rolling");
  const [diceVal, setDiceVal] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [log, setLog] = useState([]);
  const [itemPopup, setItemPopup] = useState(null);
  const [victory, setVictory] = useState(null);
  const [battle, setBattle] = useState(null);

  const addLog = (m) => setLog(p=>[...p.slice(-40), m]);

  // ── Start game ──
  const startGame = (mode) => {
    setGameMode(mode);
    const b = generateBoard();
    setBoard(b);
    const ps = mode==="versus"
      ? [mkPlayer("bruce"), mkPlayer("ninja")]
      : [mkPlayer(mode==="team_bruce"?"bruce":"ninja")];
    setPlayers(ps);
    setTurnIdx(0); setPhase("rolling"); setDiceVal(null); setRolling(false);
    setHighlight(null); setLog(["The Shadow Clan stirs. The path begins."]); 
    setItemPopup(null); setVictory(null); setBattle(null);
    setScreen("game");
  };

  // ── Board dice ──
  const handleBoardRoll = () => {
    if (phase!=="rolling"||diceVal||rolling) return;
    setRolling(true);
    setTimeout(()=>{
      const val=d6();
      setRolling(false); setDiceVal(val);
      const cur=players[turnIdx];
      const newPos=Math.min(cur.pos+val, 48);
      addLog(`Rolled ${CNUM[val-1]} (${val}). Moving to tile ${newPos}.`);
      setHighlight(newPos);
      setPlayers(p=>{ const u=[...p]; u[turnIdx]={...u[turnIdx],pos:newPos}; return u; });
      setTimeout(()=>resolveTile(newPos, players, board), 700);
    }, 900);
  };

  // ── Tile resolution ──
  const resolveTile = (pos, currentPlayers, currentBoard) => {
    const tile=currentBoard[pos-1];
    if (!tile) { nextTurn(); return; }
    const cur = currentPlayers[turnIdx];

    if (tile.type==="normal") {
      addLog("Safe ground. The path continues.");
      nextTurn(); return;
    }
    if (tile.type==="ladder") {
      addLog(`A rope hangs from above — climb to tile ${tile.data}!`);
      setPlayers(p=>{ const u=[...p]; u[turnIdx]={...u[turnIdx],pos:tile.data}; return u; });
      setHighlight(tile.data);
      setTimeout(nextTurn, 1100); return;
    }
    if (tile.type==="trap") {
      addLog(`The floor gives way — fall back to tile ${tile.data}.`);
      setPlayers(p=>{ const u=[...p]; u[turnIdx]={...u[turnIdx],pos:tile.data}; return u; });
      setHighlight(tile.data);
      setTimeout(nextTurn, 1100); return;
    }
    if (tile.type==="item") {
      const item=tile.data;
      if (!item) {
        addLog("You search carefully... nothing here.");
        setItemPopup({item:null}); setPhase("item"); return;
      }
      if (item==="extra_pose") {
        const pool=cur.char==="bruce"?EXTRA_BRUCE:EXTRA_NINJA;
        const already=cur.extraPoses.map(p=>p.id);
        const avail=pool.filter(p=>!already.includes(p.id));
        if (avail.length>0) {
          const got=avail[Math.floor(Math.random()*avail.length)];
          addLog(`Secret technique found: ${got.name}!`);
          setPlayers(p=>{ const u=[...p]; u[turnIdx]={...u[turnIdx],extraPoses:[...u[turnIdx].extraPoses,got]}; return u; });
          setItemPopup({item:"extra_pose",extraPoseName:got.name});
        } else {
          addLog("A technique scroll, but you already know this one.");
          setItemPopup({item:null});
        }
        setPhase("item"); return;
      }
      addLog(`Found: ${SORCERIES[item]?.name||item}.`);
      setPlayers(p=>{ const u=[...p]; u[turnIdx]={...u[turnIdx],sorceries:[...u[turnIdx].sorceries,item]}; return u; });
      setItemPopup({item}); setPhase("item"); return;
    }
    if (tile.type==="fight"||tile.type==="boss") {
      const ninjaType=tile.type==="boss"?"master":tile.data;
      const nt=NINJA_TYPES[ninjaType]||NINJA_TYPES.black;
      // Ancient key skip
      if (cur.sorceries.includes("ancient_key") && tile.type!=="boss") {
        addLog("You use the Ancient Key — the door swings open. No battle today.");
        setPlayers(p=>{ const u=[...p]; u[turnIdx]={...u[turnIdx],sorceries:u[turnIdx].sorceries.filter(s=>s!=="ancient_key")}; return u; });
        nextTurn(); return;
      }
      addLog(`${nt.name} blocks the path! ${nt.desc}`);
      setBattle({
        ninjaType, isBoss:tile.type==="boss",
        phase:"choosing",
        playerScore:0, enemyScore:0,
        selectedPose:null, enemyPose:null,
        revealed:false, peeked:false,
        playerRoll:null, enemyRoll:null,
        roundResult:null, battleDone:false, playerWon:false,
        narration:null, narLoading:false,
      });
      setPhase("battle"); return;
    }
    nextTurn();
  };

  // ── Next turn ──
  const nextTurn = () => {
    setDiceVal(null); setHighlight(null);
    if (gameMode==="versus") {
      const next=(turnIdx+1)%2;
      setTurnIdx(next);
      addLog(`${players[next].char==="bruce"?"🥋 Bruce Lee's":"🥷 Ninja's"} turn.`);
    }
    setPhase("rolling");
  };

  // ── Battle actions ──
  const handleSelectPose = (pose) => {
    if (!battle||battle.revealed) return;
    setBattle(p=>({...p,selectedPose:pose}));
  };

  const handleReveal = () => {
    if (!battle?.selectedPose) return;
    const ePose = battle.peeked && battle.enemyPose
      ? battle.enemyPose
      : pickNinjaMove(battle.ninjaType, NINJA_POSES);
    setBattle(p=>({...p,revealed:true,enemyPose:ePose}));
  };

  const handleRoll = async () => {
    if (!battle?.revealed||battle.playerRoll) return;
    const pp=battle.selectedPose, ep=battle.enemyPose;
    let adv=resolveTypes(pp.type,ep.type);
    const curSorceries=players[turnIdx].sorceries;
    if (battle.ninjaType==="fire"&&curSorceries.includes("magic_powder")) adv="win";
    const pRoll=doRoll(adv);
    const eAdv=adv==="win"?"lose":adv==="lose"?"win":"tie";
    const eRoll=doRoll(eAdv);
    const rr=pRoll>eRoll?"player_wins":eRoll>pRoll?"enemy_wins":"tie";
    const newPS=battle.playerScore+(rr==="player_wins"?1:0);
    const newES=battle.enemyScore+(rr==="enemy_wins"?1:0);
    const done=newPS>=2||newES>=2;
    const won=newPS>=2;
    setBattle(p=>({...p,playerRoll:pRoll,enemyRoll:eRoll,roundResult:rr,playerScore:newPS,enemyScore:newES,battleDone:done,playerWon:won,narLoading:true}));
    const outcome=rr==="player_wins"?"fighter wins":rr==="enemy_wins"?"enemy wins":"tie";
    const narr=await fetchNarration(apiKey,pp,ep,pRoll,eRoll,outcome,battle.ninjaType);
    setBattle(p=>({...p,narration:narr,narLoading:false}));
    if (done&&won&&battle.isBoss) {
      // handled on "Continue" click
    }
  };

  const handleBattleNext = () => {
    if (!battle) return;
    if (battle.battleDone) {
      if (battle.playerWon) {
        if (battle.isBoss) {
          setVictory({won:true,char:players[turnIdx].char,isBoss:true});
          setScreen("victory"); return;
        }
        addLog("The ninja falls. You press forward.");
        setBattle(null); nextTurn();
      } else {
        if (battle.isBoss) {
          const setPos=40;
          addLog(`The Master Ninja repels you. Fall back to tile ${setPos}.`);
          setPlayers(p=>{ const u=[...p]; u[turnIdx]={...u[turnIdx],pos:setPos}; return u; });
        } else {
          const nt=NINJA_TYPES[battle.ninjaType]||NINJA_TYPES.black;
          const sb=nt.setback||2;
          const np=Math.max(1,players[turnIdx].pos-sb);
          addLog(`Defeated. Set back ${sb} tiles to ${np}.`);
          setPlayers(p=>{ const u=[...p]; u[turnIdx]={...u[turnIdx],pos:np}; return u; });
        }
        setBattle(null); nextTurn();
      }
    } else {
      // Next round
      setBattle(p=>({...p,selectedPose:null,enemyPose:null,revealed:false,peeked:false,playerRoll:null,enemyRoll:null,roundResult:null,narration:null,narLoading:false}));
    }
  };

  const handleSorcery = (id) => {
    if (!battle) return;
    if (id==="magic_powder") {
      addLog("Magic Powder! Fire attacks negated.");
      setPlayers(p=>{ const u=[...p]; u[turnIdx]={...u[turnIdx],sorceries:u[turnIdx].sorceries.filter(s=>s!==id)}; return u; });
    } else if (id==="shadow_scroll") {
      const peek=pickNinjaMove(battle.ninjaType,NINJA_POSES);
      addLog(`Shadow Scroll: the enemy plans to use ${peek.name}!`);
      setPlayers(p=>{ const u=[...p]; u[turnIdx]={...u[turnIdx],sorceries:u[turnIdx].sorceries.filter(s=>s!==id)}; return u; });
      setBattle(p=>({...p,peeked:true,enemyPose:peek}));
    } else if (id==="iron_bell") {
      addLog("Iron Bell resonates — loss converted to tie.");
      setPlayers(p=>{ const u=[...p]; u[turnIdx]={...u[turnIdx],sorceries:u[turnIdx].sorceries.filter(s=>s!==id)}; return u; });
      setBattle(p=>({...p,roundResult:"tie",enemyScore:Math.max(0,p.enemyScore-1),battleDone:false,playerWon:false}));
    }
  };

  const handleDragonRope = () => {
    const cur=players[turnIdx];
    if (!cur.sorceries.includes("dragon_rope")||phase!=="rolling"||diceVal) return;
    const jump=Math.ceil(Math.random()*4);
    const np=Math.min(cur.pos+jump,48);
    addLog(`Dragon Rope — leap ${jump} tiles forward to ${np}!`);
    setPlayers(p=>{ const u=[...p]; u[turnIdx]={...u[turnIdx],pos:np,sorceries:u[turnIdx].sorceries.filter(s=>s!=="dragon_rope")}; return u; });
    setHighlight(np);
    setTimeout(()=>resolveTile(np, players, board), 700);
  };

  // ── Screens ──
  if (screen==="title") return <TitleScreen onStart={()=>setScreen("setup")} apiKey={apiKey} setApiKey={setApiKey}/>;
  if (screen==="setup") return <SetupScreen onSetup={startGame} onBack={()=>setScreen("title")}/>;
  if (screen==="victory") return <Victory {...victory} onRestart={()=>setScreen("title")}/>;
  if (!players||!board) return null;

  const cur=players[turnIdx];
  const positions=players.map(p=>({pos:p.pos,char:p.char}));

  return (
    <div style={{minHeight:"100vh",background:"#060406",color:"#e0d0b0",fontFamily:"Georgia,serif",display:"flex",flexDirection:"column",alignItems:"center",padding:"10px 8px"}}>
      <style>{`@keyframes shake{from{transform:translateX(-1px) rotate(-2deg)}to{transform:translateX(1px) rotate(2deg)}}*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#080606}::-webkit-scrollbar-thumb{background:#221810}`}</style>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",maxWidth:660,marginBottom:10}}>
        <div style={{fontSize:14,fontWeight:700,color:"#c41e1e",letterSpacing:"2px"}}>BRUCE LEE</div>
        <div style={{fontSize:10,color:"#333",letterSpacing:"2px"}}>{gameMode==="team_bruce"?"🥋 vs Shadow Clan":gameMode==="team_ninja"?"🥷 vs Bruce Lee":"⚔ Player vs Player"}</div>
        <button onClick={()=>setScreen("title")} style={{background:"transparent",color:"#333",border:"none",cursor:"pointer",fontSize:11}}>✕ quit</button>
      </div>

      <div style={{width:"100%",maxWidth:660,display:"flex",flexDirection:"column",gap:10}}>

        {/* Players */}
        <div style={{display:"grid",gridTemplateColumns:players.length===2?"1fr 1fr":"1fr",gap:8}}>
          {players.map((p,i)=><PlayerPanel key={i} player={p} label={players.length===2?(i===0?"Player 1":"Player 2"):"Your fighter"} isActive={turnIdx===i}/>)}
        </div>

        {/* Board */}
        <div style={{background:"#080606",border:"1px solid #181010",borderRadius:7,padding:8}}>
          <div style={{fontSize:8,color:"#2a2018",letterSpacing:"2px",textTransform:"uppercase",marginBottom:5,textAlign:"center"}}>
            The Path to the Master — 48 tiles
          </div>
          <BoardGrid board={board} positions={positions} highlightTile={highlight}/>
          <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:7,flexWrap:"wrap"}}>
            {[["#581010","⚔ Fight"],["#0f5010","◈ Item"],["#102080","↑ Ladder"],["#7a4010","↓ Trap"],["#820082","☠ Boss"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",gap:3,alignItems:"center"}}>
                <div style={{width:7,height:7,borderRadius:1,border:`1px solid ${c}`,background:c+"44"}}/>
                <span style={{fontSize:8,color:"#333"}}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action area */}
        <div style={{background:"#080606",border:"1px solid #181010",borderRadius:7,padding:10,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:"#555",marginBottom:3}}>
              {gameMode==="versus"?`${cur.char==="bruce"?"🥋 Bruce Lee's":"🥷 Ninja's"} turn`:"Your turn"}
            </div>
            <div style={{fontSize:10,color:"#333"}}>
              {diceVal?`Moved ${diceVal} — resolve your tile.`:"Shake the fortune sticks to move."}
            </div>
          </div>
          {cur.sorceries.includes("dragon_rope")&&phase==="rolling"&&!diceVal&&(
            <button onClick={handleDragonRope} style={{background:"#12120a",border:"1px solid #5a5a22",borderRadius:3,color:"#aaaa44",fontSize:10,padding:"5px 10px",cursor:"pointer"}}>
              ⊕ Dragon Rope
            </button>
          )}
          <FortuneSticks value={diceVal} rolling={rolling} onRoll={handleBoardRoll} disabled={phase!=="rolling"}/>
        </div>

        {/* Log */}
        <Log lines={log}/>
      </div>

      {/* Battle overlay */}
      {phase==="battle"&&battle&&(
        <BattleScreen
          ninjaType={battle.ninjaType} playerChar={cur.char} playerPoses={getPoses(cur)}
          sorceries={cur.sorceries} playerScore={battle.playerScore} enemyScore={battle.enemyScore}
          selectedPose={battle.selectedPose} enemyPose={battle.enemyPose}
          revealed={battle.revealed} peeked={battle.peeked}
          playerRoll={battle.playerRoll} enemyRoll={battle.enemyRoll}
          roundResult={battle.roundResult} narration={battle.narration} narLoading={battle.narLoading}
          battleDone={battle.battleDone} playerWon={battle.playerWon} isBoss={battle.isBoss}
          onSelect={handleSelectPose} onReveal={handleReveal} onRoll={handleRoll}
          onNext={handleBattleNext} onSorcery={handleSorcery}
        />
      )}

      {/* Item popup */}
      {itemPopup&&<ItemPopup {...itemPopup} onClose={()=>{setItemPopup(null);nextTurn();}}/>}
    </div>
  );
}
