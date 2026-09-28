/* shared.jsx -- runtime stats store, constants, helpers, and shared
   components used across tabs. Loads after data.js, before tabs. */

var { useState, useMemo, useEffect } = React;
var { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = Recharts;

// ---- EXTERNAL PLAYER STATS (fetched at runtime) ----
var PSTATS = null;      // positional array matching ALLP index
var PSTRAD = ["MPG","GP","PTS/G","AST/G","REB/G","STL/G","BLK/G","TOV/G","FG%","3P%","FT%"];
var PSFEATS = null;     // 14 similarity feature names
var PSTATS_STATUS = "idle";  // idle | loading | ready | error

function loadPlayerStats(cb){
  if(PSTATS_STATUS==="ready"){ cb&&cb(); return; }
  if(PSTATS_STATUS==="loading"){ return; }
  PSTATS_STATUS="loading";
  console.log("[stats] fetching player_data.json ...");
  fetch("./player_data.json?v=2").then(function(r){
    console.log("[stats] response status:", r.status);
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }).then(function(d){
    PSTATS=d.stats; PSFEATS=d.feats; if(d.trad)PSTRAD=d.trad;
    PSTATS_STATUS="ready";
    console.log("[stats] loaded OK -", PSTATS?PSTATS.length:0, "players");
    cb&&cb();
  }).catch(function(e){
    PSTATS_STATUS="error";
    console.error("[stats] FAILED to load player_data.json:", e.message);
    cb&&cb();
  });
}

// Player stat helpers --------------------------------------------------------
// Row layout: [MPG,GP,PTS,AST,REB,STL,BLK,TOV,FG%,3P%,FT%, feat0..feat13]
function statRow(idx){ return (PSTATS&&PSTATS[idx])?PSTATS[idx]:null; }
function statFeats(idx){ var r=statRow(idx); return r?r.slice(11):null; }

function playerEuclid(a,b){ // distance over the 14 feats (lower=more similar)
  if(!a||!b) return 999;
  var d=0,i; for(i=0;i<a.length;i++){ var x=a[i]-b[i]; d+=x*x; } return Math.sqrt(d);
}

// Hook to trigger load + re-render
function useStats(){
  var s=useState(PSTATS_STATUS); var status=s[0]; var setStatus=s[1];
  useEffect(function(){
    if(PSTATS_STATUS==="ready"){ setStatus("ready"); return; }
    loadPlayerStats(function(){ setStatus(PSTATS_STATUS); });
  },[]);
  return status;
}

// ---- VERSPI CATEGORY SCORES (fetched at runtime) ----
// Positional array matching ALLP index, same convention as PSTATS.
// Each entry: {cls, v, e, r, s, p, i} -- 0-100 scores, or null if unmatched.
// V=Volume, E=Efficiency, R=Rebounding, S=Security, P=Playmaking, I=Impact.
var VERSP = null;
var VERSP_STATUS = "idle";

function loadVersp(cb){
  if(VERSP_STATUS==="ready"){ cb&&cb(); return; }
  if(VERSP_STATUS==="loading"){ return; }
  VERSP_STATUS="loading";
  fetch("./versp.json?v=20260927-v2").then(function(r){
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }).then(function(d){
    VERSP=d.versp;
    VERSP_STATUS="ready";
    console.log("[versp] loaded OK -", VERSP?VERSP.length:0, "player-seasons");
    cb&&cb();
  }).catch(function(e){
    VERSP_STATUS="error";
    console.error("[versp] FAILED to load versp.json:", e.message);
    cb&&cb();
  });
}

function verspRow(idx){ return (VERSP&&VERSP[idx])?VERSP[idx]:null; }

function useVersp(){
  var s=useState(VERSP_STATUS); var status=s[0]; var setStatus=s[1];
  useEffect(function(){
    if(VERSP_STATUS==="ready"){ setStatus("ready"); return; }
    loadVersp(function(){ setStatus(VERSP_STATUS); });
  },[]);
  return status;
}

var VERSPI_LABELS = {v:"Volume", e:"Efficiency", r:"Rebounding", s:"Security", p:"Playmaking", i:"Impact", d:"Defense"};
var VERSPI_COLORS = {v:"#D97706", e:"#2563EB", r:"#059669", s:"#0D9488", p:"#7C3AED", i:"#DC2626", d:"#4338CA"};

// ---- TEAM CONFERENCE TIER (fetched at runtime) ----
// team name -> "High Major" | "High Major-" | "Mid-Major" | "Mid-Major-" | "Low Major"
var TTIERS = null;
var TTIERS_STATUS = "idle";
var TIER_ORDER = ["High Major","High Major-","Mid-Major","Mid-Major-","Low Major"];
var TIER_COLORS = {"High Major":"#059669","High Major-":"#0D9488","Mid-Major":"#D97706","Mid-Major-":"#EA580C","Low Major":"#9CA3AF"};

function loadTeamTiers(cb){
  if(TTIERS_STATUS==="ready"){ cb&&cb(); return; }
  if(TTIERS_STATUS==="loading"){ return; }
  TTIERS_STATUS="loading";
  fetch("./team_tiers.json?v=1").then(function(r){
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }).then(function(d){
    TTIERS=d;
    TTIERS_STATUS="ready";
    console.log("[tiers] loaded OK -", Object.keys(TTIERS).length, "teams");
    cb&&cb();
  }).catch(function(e){
    TTIERS_STATUS="error";
    console.error("[tiers] FAILED to load team_tiers.json:", e.message);
    cb&&cb();
  });
}
function teamTier(team){ return (TTIERS && TTIERS[team]) ? TTIERS[team] : null; }
function useTeamTiers(){
  var s=useState(TTIERS_STATUS); var status=s[0]; var setStatus=s[1];
  useEffect(function(){
    if(TTIERS_STATUS==="ready"){ setStatus("ready"); return; }
    loadTeamTiers(function(){ setStatus(TTIERS_STATUS); });
  },[]);
  return status;
}

// ---- TEAM AVG HEIGHT (fetched at runtime) ----
// "Team|seasonCode" -> minutes-weighted average roster height, in inches.
// Used to (a) show a roster's height profile in Build-a-Team and (b) bring height
// into the nearest-neighbor team-season match, since two rosters with the same
// archetype mix at 6'8" vs 7'1" avg height play very differently on the glass/rim.
var THEIGHT = null;
var THEIGHT_STATUS = "idle";
function loadTeamHeights(cb){
  if(THEIGHT_STATUS==="ready"){ cb&&cb(); return; }
  if(THEIGHT_STATUS==="loading"){ return; }
  THEIGHT_STATUS="loading";
  fetch("./team_heights.json?v=1").then(function(r){
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }).then(function(d){
    THEIGHT=d;
    THEIGHT_STATUS="ready";
    console.log("[heights] loaded OK -", Object.keys(THEIGHT).length, "team-seasons");
    cb&&cb();
  }).catch(function(e){
    THEIGHT_STATUS="error";
    console.error("[heights] FAILED to load team_heights.json:", e.message);
    cb&&cb();
  });
}
function teamHeight(team,scode){ var k=team+"|"+scode; return (THEIGHT && THEIGHT[k]!=null) ? THEIGHT[k] : null; }
function useTeamHeights(){
  var s=useState(THEIGHT_STATUS); var status=s[0]; var setStatus=s[1];
  useEffect(function(){
    if(THEIGHT_STATUS==="ready"){ setStatus("ready"); return; }
    loadTeamHeights(function(){ setStatus(THEIGHT_STATUS); });
  },[]);
  return status;
}
// "79.4" -> "6'7""
function fmtHeight(inches){
  if(inches==null) return "--";
  var ft=Math.floor(inches/12), inr=Math.round(inches-ft*12);
  if(inr===12){ ft+=1; inr=0; }
  return ft+"'"+inr+'"';
}

// ---- EXTERNAL TEAM PLAYSTYLE STATS (fetched at runtime) ----
var TSTATS = null;          // array of {t,s,st:[[rawVal,pctile],...]}
var TSTATS_INDEX = null;    // "team|season" -> entry (built on load)
var TSDEFS = null;          // [[key,label,side,desc],...]
var TSCORR = null;          // [{arch,stat,label,side,raw,partial},...]
var TSTATS_STATUS = "idle";

function loadTeamStats(cb){
  if(TSTATS_STATUS==="ready"){ cb&&cb(); return; }
  if(TSTATS_STATUS==="loading"){ return; }
  TSTATS_STATUS="loading";
  fetch("./team_stats.json?v=2").then(function(r){
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }).then(function(d){
    TSTATS=d.teams; TSDEFS=d.defs; TSCORR=d.corr;
    TSTATS_INDEX={};
    var i; for(i=0;i<TSTATS.length;i++){ TSTATS_INDEX[TSTATS[i].t+"|"+TSTATS[i].s]=TSTATS[i]; }
    TSTATS_STATUS="ready";
    console.log("[teamstats] loaded OK -", TSTATS.length, "team-seasons");
    cb&&cb();
  }).catch(function(e){
    TSTATS_STATUS="error";
    console.error("[teamstats] FAILED to load team_stats.json:", e.message);
    cb&&cb();
  });
}

function teamStatRec(team, scode){
  return TSTATS_INDEX ? (TSTATS_INDEX[team+"|"+scode]||null) : null;
}

function useTeamStats(){
  var s=useState(TSTATS_STATUS); var status=s[0]; var setStatus=s[1];
  useEffect(function(){
    if(TSTATS_STATUS==="ready"){ setStatus("ready"); return; }
    loadTeamStats(function(){ setStatus(TSTATS_STATUS); });
  },[]);
  return status;
}

// Render a team's playstyle stats as percentile bars (shared component)
// props: team, scode, compact (optional bool)
function TeamPlaystyle(props){
  var status = useTeamStats();
  if(status==="loading"||status==="idle") return <div style={{fontSize:11,color:"#9CA3AF",padding:"8px 0"}}>Loading playstyle...</div>;
  if(status==="error") return <div style={{fontSize:11,color:"#DC2626",padding:"8px 0"}}>Could not load team_stats.json.</div>;
  var rec = teamStatRec(props.team, props.scode);
  if(!rec) return <div style={{fontSize:11,color:"#9CA3AF",padding:"8px 0"}}>No playstyle data for this team.</div>;

  // defs = [key,label,side,desc,group,dir]  dir: 1=higher better, -1=lower better, 0=descriptive
  // For dir=0 (e.g. "% Pts from 3") there is no good/bad -- it's a style choice, so
  // we render it neutral blue rather than implying a high value is an achievement.
  function pctColor(pc, dir){
    if(dir===0) return "#6366F1";              // descriptive / stylistic
    var v = (dir<0) ? 100-pc : pc;             // flip so green always = good
    if(v>=70) return "#059669";
    if(v>=40) return "#D97706";
    return "#9CA3AF";
  }
  function row(defIdx){
    var def = TSDEFS[defIdx];
    var pair = rec.st[defIdx];
    if(!pair || pair[1]===null || pair[1]===undefined) return null;
    var raw=pair[0], pc=pair[1];
    var dir = (def.length>5) ? def[5] : 1;
    var isPct = def[1].indexOf("%")!==-1 && def[1].indexOf("Rate")===-1;
    return (
      <div key={defIdx} style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
        <span style={{fontSize:11,flex:"0 0 116px",color:"#374151"}}>{def[1]}</span>
        <span style={{fontSize:11,width:44,textAlign:"right",color:"#111827",fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{raw}{isPct?"%":""}</span>
        <div style={{flex:1,height:6,background:"#F3F4F6",borderRadius:3,overflow:"hidden",minWidth:44}}>
          <div style={{height:"100%",borderRadius:3,background:pctColor(pc,dir),width:pc+"%"}}/>
        </div>
        <span style={{fontSize:10,color:"#9CA3AF",width:34,textAlign:"right"}}>{pc}%ile</span>
      </div>
    );
  }

  // Build ordered group list preserving the order groups first appear in TSDEFS
  var groups=[], gseen={}, i;
  for(i=0;i<TSDEFS.length;i++){
    var g = (TSDEFS[i].length>4) ? TSDEFS[i][4] : "Playstyle";
    if(!gseen[g]){ gseen[g]=true; groups.push(g); }
  }
  function section(g){
    var offIdx=[], defIdx=[];
    var j;
    for(j=0;j<TSDEFS.length;j++){
      var gg = (TSDEFS[j].length>4) ? TSDEFS[j][4] : "Playstyle";
      if(gg!==g) continue;
      (TSDEFS[j][2]==="off"?offIdx:defIdx).push(j);
    }
    return (
      <div key={g} style={{marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.8px",color:"#111827",marginBottom:7,paddingBottom:4,borderBottom:"1px solid #F3F4F6"}}>{g.toUpperCase()}</div>
        <div style={{display:"grid",gridTemplateColumns:props.compact?"1fr":"1fr 1fr",gap:props.compact?0:18}}>
          <div>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.5px",color:"#9CA3AF",marginBottom:5}}>OFFENSE</div>
            {offIdx.map(row)}
          </div>
          <div style={props.compact?{marginTop:8}:{}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.5px",color:"#9CA3AF",marginBottom:5}}>DEFENSE (allowed)</div>
            {defIdx.map(row)}
          </div>
        </div>
      </div>
    );
  }
  return <div>{groups.map(section)}</div>;
}

// ---- D2 PROSPECT POOL (fetched at runtime; from the D2->D1 translation model) ----
var D2P = null;          // array of {n,tm,a,g,cl,m,ps,c:[6],d2s:[11]}
var D2META = null;       // {nCurrent,nTransfers,corrQual,avgSuccess}
var D2CATS = null;       // category labels
var D2RANK = null;       // archetype-index -> {n,avgSuccess,edge,pctStick,pctStar}
var D2_STATUS = "idle";

function loadD2Players(cb){
  if(D2_STATUS==="ready"){ cb&&cb(); return; }
  if(D2_STATUS==="loading"){ return; }
  D2_STATUS="loading";
  fetch("./d2_players.json?v=1").then(function(r){
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }).then(function(d){
    D2P=d.players; D2META=d.meta; D2CATS=d.cats; D2RANK=d.rank||{};
    D2_STATUS="ready";
    console.log("[d2] loaded OK -", D2P.length, "D2 prospects");
    cb&&cb();
  }).catch(function(e){
    D2_STATUS="error";
    console.error("[d2] FAILED to load d2_players.json:", e.message);
    cb&&cb();
  });
}

function useD2Players(){
  var s=useState(D2_STATUS); var status=s[0]; var setStatus=s[1];
  useEffect(function(){
    if(D2_STATUS==="ready"){ setStatus("ready"); return; }
    loadD2Players(function(){ setStatus(D2_STATUS); });
  },[]);
  return status;
}

// ---- ROLE VERSATILITY -------------------------------------------------------
// Purity = (Primary - Secondary) / 0.30, capped at 1.0  =>  Secondary = P - 0.30*purity
// Versatility IS the secondary-archetype fit score. Using (1 - purity) alone would be
// wrong: a player scoring 0.00 on BOTH archetypes has purity 0 (tiny gap) but is not
// versatile -- they simply fit nothing. Requiring a strong SECOND fit screens those out.
function versScore(p){
  var P=p[5], u=p[4];
  if(P===null||P===undefined||u===null||u===undefined||P<0||u<0) return null;
  var s = P - 0.30*u;
  if(s<0) s=0; if(s>1) s=1;
  return s;
}
// Tiers keyed to the league distribution (median .64, 75th .73, 90th .80, 99th .90)
function versTier(v){
  if(v===null) return null;
  if(v>=0.85) return {label:"Dual-Threat", color:"#7C3AED", bg:"#EDE9FE"};
  if(v>=0.75) return {label:"Versatile",   color:"#2563EB", bg:"#DBEAFE"};
  if(v>=0.62) return {label:"Some Flex",   color:"#6B7280", bg:"#F3F4F6"};
  return {label:"Specialist", color:"#9CA3AF", bg:"#F9FAFB"};
}
// "Playmaker + Shot-Making Guard"
function archPair(p){
  var a=p[2], s=p[6];
  if(s===null||s===undefined||s<0||s>=DL.length) return DL[a];
  return DL[a]+" + "+DL[s];
}
function VersBadge(props){
  var v=props.v;
  if(v===null||v===undefined) return null;
  var t=versTier(v);
  if(!t) return null;
  if(props.minTier && v<0.75) return null;   // only show the notable ones
  return (
    <span title={"Second-best archetype fit: "+v.toFixed(2)} style={{background:t.bg,color:t.color,fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:4,letterSpacing:"0.3px",whiteSpace:"nowrap"}}>
      {t.label}{props.showVal?" "+v.toFixed(2):""}
    </span>
  );
}

// ---- IMPACT SCORE: how well a player actually performed, from real box stats ----
// Distinct from archetype "purity"/"pscore" (which measure fit to a role, not quality).
// Built from the 14 percentile features already loaded via player_data.json, with
// tier-aware weights (Guards/Wings vs Bigs value different things). Returns 0-100,
// or null if stats aren't loaded / player has no stat row.
var IMPACT_WEIGHTS_GW = {
  "PTS/40 %ile":0.20, "TS% %ile":0.20, "AST/40 %ile":0.14, "AST/TOV %ile":0.09,
  "STL% %ile":0.09, "USG% %ile":0.09, "REB/40 %ile":0.07, "BLK% %ile":0.05, "%PITP %ile":0.07
};
var IMPACT_WEIGHTS_BIG = {
  "REB/40 %ile":0.20, "BLK% %ile":0.18, "TS% %ile":0.18, "PTS/40 %ile":0.14,
  "ORB% %ile":0.10, "USG% %ile":0.08, "FTA Rate %ile":0.06, "AST/40 %ile":0.06
};
function impactScore(p, idx){
  if(PSTATS_STATUS!=="ready") return null;
  var fv = statFeats(idx);
  if(!fv) return null;
  var weights = (p[3]===1) ? IMPACT_WEIGHTS_BIG : IMPACT_WEIGHTS_GW;
  var sum=0, wsum=0, k;
  for(k in weights){
    if(!weights.hasOwnProperty(k)) continue;
    var pos = PSFEATS.indexOf(k);
    if(pos<0) continue;
    sum += fv[pos]*weights[k]; wsum += weights[k];
  }
  return wsum ? Math.round((sum/wsum)*100) : null;
}

// Competition-adjusted talent percentile (0-1) for a D2 player, from the
// translation model's D1-translated category scores. Mirrors the D1 talent
// index (scoring/efficiency/usage/playmaking/rebounding) using the model's
// Volume/Efficiency/Playmaking/Rebounding/Impact categories.
function d2TalentIndex(cats){
  // cats = [Volume, Efficiency, Playmaking, Rebounding, Security, Impact]
  var use=[cats[0],cats[1],cats[2],cats[3],cats[5]]; // V,E,P,RB,Impact
  var sum=0,i; for(i=0;i<use.length;i++){ sum+=use[i]; }
  return (sum/use.length)/100.0;
}

// Shared stat-profile card (traditional box stats) ---------------------------
function StatProfile(props){
  var idx=props.idx;            // ALLP index
  var row=statRow(idx);
  if(PSTATS_STATUS==="loading"||PSTATS_STATUS==="idle"){
    return <div style={{padding:"10px 14px",fontSize:11,color:"#9CA3AF"}}>Loading stats...</div>;
  }
  if(PSTATS_STATUS==="error"){
    return <div style={{padding:"10px 14px",fontSize:11,color:"#DC2626"}}>Could not load player_data.json (see console).</div>;
  }
  if(!row){
    return <div style={{padding:"10px 14px",fontSize:11,color:"#9CA3AF"}}>No box stats available for this player.</div>;
  }
  // Traditional per-game line + shooting splits
  var perGame=[["PTS",row[2]],["AST",row[3]],["REB",row[4]],["STL",row[5]],["BLK",row[6]],["TOV",row[7]]];
  var shooting=[["FG%",row[8]],["3P%",row[9]],["FT%",row[10]]];
  return(
    <div style={{padding:"12px 14px",background:"#F9FAFB",borderTop:"1px solid #EEF0F4"}}>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.5px",color:"#9CA3AF",marginBottom:8}}>
        {row[0]>=0?row[0].toFixed(1)+" MPG":""}{row[1]>=0?"  -  "+row[1]+" GP":""}
      </div>
      <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:10}}>
        {perGame.map(function(it){return(<div key={it[0]} style={{textAlign:"center",minWidth:42}}>
          <div style={{fontSize:16,fontWeight:800,color:"#111827"}}>{it[1]>=0?it[1].toFixed(1):"--"}</div>
          <div style={{fontSize:9,color:"#9CA3AF",letterSpacing:"0.5px"}}>{it[0]}/G</div>
        </div>);})}
      </div>
      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
        {shooting.map(function(it){return(<div key={it[0]} style={{textAlign:"center",minWidth:42}}>
          <div style={{fontSize:14,fontWeight:700,color:"#374151"}}>{it[1]>=0?(it[1]*100).toFixed(1)+"%":"--"}</div>
          <div style={{fontSize:9,color:"#9CA3AF",letterSpacing:"0.5px"}}>{it[0]}</div>
        </div>);})}
      </div>
    </div>
  );
}


var DL = ["Pure Shooter","Shot-Making Guard","Playmaker","Athletic Finisher",
  "Pick-and-Roll Creator","Stretch Big","Athletic Big","Traditional Big"];
var SEASONS = ["2021-22","2022-23","2023-24","2024-25","2025-26"];
var SMAP = {"1":"2021-22","2":"2022-23","3":"2023-24","4":"2024-25","5":"2025-26"};
var TABS = ["About","Archetypes Impact","Best Combos","Trends","Team Lookup","Players","Compare Teams","Build a Team","How It Works"];

var COLORS = {
  "Pure Shooter":"#3B82F6","Shot-Making Guard":"#8B5CF6","Playmaker":"#06B6D4",
  "Athletic Finisher":"#F59E0B","Pick-and-Roll Creator":"#EF4444",
  "Stretch Big":"#14B8A6","Athletic Big":"#10B981","Traditional Big":"#059669"
};
var TIER = {
  "Pure Shooter":"Guard/Wing","Shot-Making Guard":"Guard/Wing","Playmaker":"Guard/Wing",
  "Athletic Finisher":"Guard/Wing","Pick-and-Roll Creator":"Guard/Wing",
  "Stretch Big":"Big Man","Athletic Big":"Big Man","Traditional Big":"Big Man"
};
var DESC = {
  "Pure Shooter":"Spot-up and off-movement catch-and-shoot specialist. Lives on the perimeter, does not initiate offense. Identified by 3-point volume and shot location.",
  "Shot-Making Guard":"High-usage guard who scores at all three levels AND creates for teammates. The classic dual-threat guard -- elite scorer who also facilitates.",
  "Playmaker":"Pure ball-distributor. Creates quality looks for teammates out of PnR and the open court. Lower individual scoring usage, elite assist volume.",
  "Athletic Finisher":"Wing or guard who scores by attacking the basket, drawing fouls, and finishing at the rim. High rebounding for their position, low 3PT volume.",
  "Pick-and-Roll Creator":"High-usage guard who initiates PnR and pull-up offense. Creates shots off the dribble and from mid-range. Above-the-break 3 is a primary weapon.",
  "Stretch Big":"Floor-spacing forward or center who threatens from 3. Creates driving lanes for guards. Little to no post presence.",
  "Athletic Big":"Explosive rim-running big. Dominates in lob finishes, PnR rolls, offensive rebounding, and transition dunks. Athleticism over skill set.",
  "Traditional Big":"Interior-focused big who scores in the paint, dominates the glass, and protects the rim. Little perimeter shooting. Old-school post presence."
};

function cl(a){ return COLORS[a] || "#6B7280"; }
function cosine(a,b){ var d=0,ma=0,mb=0,i; for(i=0;i<a.length;i++){d+=a[i]*b[i];ma+=a[i]*a[i];mb+=b[i]*b[i];} return (ma&&mb)?d/Math.sqrt(ma*mb):0; }
function gradeStyle(g){
  if(g==="A+")return{bg:"#DCFCE7",tx:"#166534"};
  if(g==="A")return{bg:"#D1FAE5",tx:"#065F46"};
  if(g==="B")return{bg:"#FEF3C7",tx:"#92400E"};
  if(g==="C")return{bg:"#FEE2E2",tx:"#991B1B"};
  return{bg:"#F3F4F6",tx:"#6B7280"};
}
function Stars(props){
  var r=props.r,max=5,filled=Math.min(Math.round(Math.abs(r)*max/0.30),max),pos=r>=0,stars=[],i;
  for(i=0;i<max;i++){stars.push(React.createElement("span",{key:i,style:{color:i<filled?(pos?"#10B981":"#EF4444"):"#D1D5DB",fontSize:"14px"}},"*"));}
  return React.createElement("span",{style:{letterSpacing:"3px"}},stars);
}
function Badge(props){
  return React.createElement("span",{style:{background:props.bg||"#E5E7EB",color:props.tx||"#374151",padding:"2px 8px",borderRadius:"12px",fontSize:"11px",fontWeight:700}},props.children);
}


// ---- SIMILAR PLAYERS FINDER ----
function SimilarPlayers(props){
  var idx=props.idx;
  var result=useMemo(function(){
    if(PSTATS_STATUS!=="ready") return null;
    var target=statFeats(idx);
    if(!target) return null;
    var scored=[];
    var i;
    for(i=0;i<ALLP.length;i++){
      if(i===idx) continue;
      var f=statFeats(i);
      if(!f) continue;
      scored.push({i:i,d:playerEuclid(target,f)});
    }
    scored.sort(function(a,b){return a.d-b.d;});
    return scored.slice(0,6);
  },[idx,PSTATS_STATUS]);

  if(PSTATS_STATUS==="loading"||PSTATS_STATUS==="idle") return <div style={{fontSize:11,color:"#9CA3AF"}}>Loading...</div>;
  if(!result) return <div style={{fontSize:11,color:"#9CA3AF"}}>No comparable players found.</div>;

  // max distance for normalizing a 0-100 "match" score
  var maxD=2.0;
  return(
    <div>
      {result.map(function(r,k){
        var p=ALLP[r.i];
        var arch=DL[p[2]];
        var match=Math.max(0,Math.round((1-r.d/maxD)*100));
        return(<div key={k} style={{display:"flex",alignItems:"center",gap:7,padding:"4px 0",borderBottom:"1px solid #F3F4F6",fontSize:11}}>
          <div style={{width:6,height:6,borderRadius:3,background:cl(arch),flexShrink:0}}/>
          <span style={{flex:1,fontWeight:500,color:"#111827"}}>{p[0]}</span>
          <span style={{color:"#9CA3AF",fontSize:10,width:90,textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p[1]}</span>
          <span style={{color:"#6B7280",fontSize:10,width:48}}>{SMAP[String(p[7])]}</span>
          <span style={{fontWeight:700,color:match>75?"#059669":match>55?"#D97706":"#9CA3AF",width:38,textAlign:"right"}}>{match}%</span>
        </div>);
      })}
    </div>
  );
}
