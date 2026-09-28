
const DATA=JSON.parse(document.getElementById('DATA').textContent);
const S=DATA.summary,P=DATA.players,PJ=DATA.projections,M=DATA.meta;
const ACOLOR={'Athletic Big':'#02685d','Athletic Finisher':'#037c6e','Pick-and-Roll Creator':'#0dbfa8','Shot-Making Guard':'#c0673f','Playmaker':'#2f5d8a','Pure Shooter':'#6f8bb3','Stretch Big':'#8a6fa0'};
const ac=a=>ACOLOR[a]||'#6E7B82';
const PCT=new Set(['FG%','2P%','3P%','FT%','eFG%','TS%','USG%']);
function fmt(v,d){return v==null||isNaN(v)?'—':Number(v).toFixed(d);}
function statval(key,v){ // handle decimal percent fields
  if(v==null||isNaN(v))return '—';
  if(PCT.has(key))return (v*100).toFixed(1);
  if(key==='GP'||key==='G'||key==='GS')return Math.round(v);
  return Number(v).toFixed(1);
}
function cmp(a,b,s){let x=a[s.k],y=b[s.k];if(x==null)x=-1e9;if(y==null)y=-1e9;if(typeof x==='string')return s.dir*x.localeCompare(y);return s.dir*(x-y);}

document.getElementById('statline').innerHTML=[[M.n_matched,'matched players'],[M.n_drafted,'drafted'],[M.n_undrafted,'undrafted, made NBA'],[S.length,'archetypes'],[M.n_proj.toLocaleString(),'current projections']].map(([b,s])=>`<div class="s"><b>${b}</b><span>${s}</span></div>`).join('');
var _fm=document.getElementById('foot-meta');if(_fm)_fm.textContent='college 2020-26 · NBA 2022-26 · draft classes 2022-2025';

const CATS=[{k:'rotation',res:'rotation_res',name:'Rotation %',fmt:v=>v.toFixed(0)+'%',d:'pct'},{k:'stuck',res:'stuck_res',name:'Stick %',fmt:v=>v.toFixed(0)+'%',d:'pct'},{k:'quality',res:'quality_res',name:'Quality %',fmt:v=>v.toFixed(0)+'%',d:'pct'},{k:'best_bpm',res:'best_bpm_res',name:'Best BPM',fmt:v=>v.toFixed(1),d:'num'},{k:'ws48',res:'ws48_res',name:'WS/48',fmt:v=>v.toFixed(3),d:'num'},{k:'career_min',res:'career_min_res',name:'Career Min',fmt:v=>Math.round(v).toLocaleString(),d:'num'}];
function colScale(vals){const s=[...vals].sort((a,b)=>a-b),mn=s[0],mx=s[s.length-1];return v=>{if(v==null||isNaN(v))return'transparent';const t=mx===mn?.5:(v-mn)/(mx-mn);const a=[238,241,246],b=[3,124,110];return`rgba(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)},${.22+.78*t})`;};}
function divScale(vals){const m=Math.max(...vals.map(v=>Math.abs(v||0)))||1;return v=>{if(v==null||isNaN(v))return'transparent';const t=Math.min(1,Math.abs(v)/m);return v>=0?`rgba(3,124,110,${.12+.62*t})`:`rgba(192,103,63,${.12+.62*t})`;};}
let boardMode='raw';
function renderBoard(){
  document.getElementById('board-mode-tag').textContent=boardMode==='raw'?'raw outcomes':'residualized on draft slot';
  const rk=boardMode==='raw'?'rotation':'rotation_res';
  document.getElementById('cardgrid').innerHTML=[...S].sort((a,b)=>b[rk]-a[rk]).map((d,i)=>{
    const res=d.rotation_res,rc=res>=0?'pos':'neg';
    return`<div class="acard" style="border-top-color:${ac(d.archetype)}"><div class="rank">#${i+1} · n=${d.n}</div><h3>${d.archetype}</h3><div class="big">${d.rotation.toFixed(0)}<small>%</small></div><div class="lab">reach NBA rotation</div><div class="ressplit"><span style="color:var(--muted)">vs draft slot</span><span class="res ${rc}">${(res>=0?'+':'')+res.toFixed(0)} pts</span></div></div>`;
  }).join('');
  renderMatrix();
}
function renderMatrix(){
  const useRes=boardMode==='res';
  const order=[...S].sort((a,b)=>useRes?b.rotation_res-a.rotation_res:b.rotation-a.rotation);
  const scales=CATS.map(c=>{const key=useRes?c.res:c.k;const vals=order.map(r=>r[key]);return useRes?divScale(vals):colScale(vals);});
  let h=`<thead><tr><th class="lbl">Archetype</th>${CATS.map(c=>`<th>${c.name}</th>`).join('')}</tr></thead><tbody>`;
  order.forEach(r=>{h+=`<tr><td class="acell"><div class="nm"><span class="sw" style="background:${ac(r.archetype)}"></span>${r.archetype}</div><div class="meta">n=${r.n}${useRes?` · pick ${r.draft_avg}`:''}</div></td>`;
    CATS.forEach((c,i)=>{const key=useRes?c.res:c.k,v=r[key];const disp=useRes?((v>=0?'+':'')+(c.d==='pct'?v.toFixed(0):(c.k==='career_min'?Math.round(v).toLocaleString():v.toFixed(c.k==='ws48'?3:1)))):c.fmt(v);h+=`<td style="background:${scales[i](v)}">${disp}</td>`;});h+=`</tr>`;});
  document.getElementById('matrix').innerHTML=h+'</tbody>';
  document.getElementById('legend').innerHTML=useRes?`<span>underperforms draft</span><div class="bar"><i style="background:rgba(192,103,63,.6)"></i><i style="background:rgba(192,103,63,.2)"></i><i style="background:rgba(3,124,110,.2)"></i><i style="background:rgba(3,124,110,.6)"></i></div><span>outperforms draft</span>`:`<span>lower</span><div class="bar"><i style="background:rgba(238,241,246,.8)"></i><i style="background:rgba(80,160,150,.55)"></i><i style="background:rgba(3,124,110,.92)"></i></div><span>higher</span>`;
}
document.getElementById('board-toggle').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;document.querySelectorAll('#board-toggle button').forEach(x=>x.classList.remove('on'));b.classList.add('on');boardMode=b.dataset.m;renderBoard();});

// DETAIL
const detSel=document.getElementById('det-select');
[...S].sort((a,b)=>b.rotation-a.rotation).forEach(d=>{const o=document.createElement('option');o.value=d.archetype;o.textContent=`${d.archetype} (n=${d.n})`;detSel.appendChild(o);});
let detSort={k:'nba_total_min',dir:-1};
function renderDetail(arch){
  const d=S.find(x=>x.archetype===arch);
  document.getElementById('det-head').innerHTML=`<span class="sw" style="background:${ac(arch)}"></span><h2>${arch}</h2><span class="chip">n=${d.n} · avg pick ${d.draft_avg} · ${d.n_qual} reached 500+ NBA min</span>`;
  document.getElementById('det-cats').innerHTML=CATS.map(c=>{const v=d[c.k],vals=S.map(r=>r[c.k]),mx=Math.max(...vals),mn=Math.min(...vals.filter(x=>!isNaN(x)));const t=mx===mn?.5:Math.max(0,(v-mn)/(mx-mn));return`<div class="catrow"><span class="cn">${c.name}</span><div class="track"><i style="width:${(t*100).toFixed(0)}%;background:${ac(arch)}"></i></div><span class="cv">${c.fmt(v)}</span></div>`;}).join('');
  const rank=[...S].sort((a,b)=>b.rotation-a.rotation).findIndex(x=>x.archetype===arch)+1,rr=[...S].sort((a,b)=>b.rotation_res-a.rotation_res).findIndex(x=>x.archetype===arch)+1;
  document.getElementById('det-note').textContent=`Bars scaled across the 7 archetypes. Raw rotation rank: #${rank} of ${S.length}. Draft-adjusted rank: #${rr}.`;
  const roster=P.filter(p=>p.archetype===arch),drafted=roster.filter(p=>p.drafted).length,hit=roster.filter(p=>p.nba_max_mpg>=20).length,qual=roster.filter(p=>p.nba_best_bpm_q!=null&&p.nba_best_bpm_q>=0).length;
  document.getElementById('det-split').innerHTML=splitRow('Drafted',drafted,roster.length)+splitRow('Undrafted, made NBA',roster.length-drafted,roster.length)+splitRow('Reached rotation (20+ MPG)',hit,roster.length)+splitRow('Reached league-avg value',qual,roster.length);
  document.getElementById('det-roster-tag').textContent=`${roster.length} players`;
  const cols=[{k:'nba_real_name',l:'Player',c:'l'},{k:'draft_pick',l:'Pick'},{k:'col_year',l:'Last NCAA'},{k:'nba_seasons',l:'NBA Yrs'},{k:'nba_max_mpg',l:'Peak MPG'},{k:'nba_best_bpm_q',l:'Best BPM'},{k:'nba_ws48_q',l:'WS/48'},{k:'nba_total_min',l:'Career Min'}];
  const data=[...roster].sort((a,b)=>cmp(a,b,detSort));
  document.getElementById('det-table').innerHTML=tableHTML(cols,data,detSort,p=>({nba_real_name:`<span class="pname">${p.nba_real_name}</span> <span class="pmeta">${p.teamMarket||''}${p.drafted?'':' · UDFA'}</span>`,draft_pick:p.drafted?p.draft_pick:'—',col_year:`'${String(p.col_year).slice(2)}`,nba_seasons:p.nba_seasons,nba_max_mpg:fmt(p.nba_max_mpg,1),nba_best_bpm_q:p.nba_best_bpm_q==null?'—':fmt(p.nba_best_bpm_q,1),nba_ws48_q:p.nba_ws48_q==null?'—':fmt(p.nba_ws48_q,3),nba_total_min:Math.round(p.nba_total_min).toLocaleString()}),false);
}
function splitRow(l,n,t){const p=t?Math.round(100*n/t):0;return`<div class="catrow" style="grid-template-columns:170px 1fr 64px"><span class="cn">${l}</span><div class="track"><i style="width:${p}%"></i></div><span class="cv">${n} · ${p}%</span></div>`;}
detSel.addEventListener('change',()=>renderDetail(detSel.value));
document.getElementById('det-table').addEventListener('click',e=>{const th=e.target.closest('th[data-k]');if(!th)return;const k=th.dataset.k;detSort.dir=detSort.k===k?-detSort.dir:-1;detSort.k=k;renderDetail(detSel.value);});

// generic table (with optional expandable rows)
function tableHTML(cols,data,sort,rowmap,expandable){
  let h=`<thead><tr>${cols.map(c=>`<th data-k="${c.k}" class="${c.c==='l'?'l':''}">${c.l}${sort.k===c.k?`<span class="ar">${sort.dir<0?'▾':'▴'}</span>`:''}</th>`).join('')}</tr></thead><tbody>`;
  h+=data.map((p,i)=>{const r=rowmap(p);const cls=expandable?'prow':'';const di=expandable?`data-i="${i}"`:'';return`<tr class="${cls}" ${di}>${cols.map(c=>`<td class="${c.c==='l'?'l':''}">${r[c.k]}</td>`).join('')}</tr>`;}).join('');
  return h+'</tbody>';
}
// stat-line mini table builder
function statTable(cols,rows){ // rows: [{label, vals:{}, cls}]
  let h='<table class="statline-tbl"><thead><tr><th class="l">'+cols.label+'</th>'+cols.keys.map(k=>`<th>${cols.head[k]||k}</th>`).join('')+'</tr></thead><tbody>';
  rows.forEach(r=>{h+=`<tr class="${r.cls||''}"><td class="l">${r.label}</td>`+cols.keys.map(k=>`<td>${statval(k,r.vals[k])}</td>`).join('')+'</tr>';});
  return h+'</tbody></table>';
}
const COLHEAD={'GP':'GP','MPG':'MPG','PTS/G':'PPG','REB/G':'REB','AST/G':'AST','STL/G':'STL','BLK/G':'BLK','TOV/G':'TOV','FG%':'FG%','2P%':'2P%','3P%':'3P%','FT%':'FT%','eFG%':'eFG%','FGA/G':'FGA','3PA/G':'3PA','FTA/G':'FTA','ORB/G':'ORB','DRB/G':'DRB','PF/G':'PF'};
const NBAHEAD={'G':'G','GS':'GS','MP_pg':'MPG','PTS':'PPG','TRB':'REB','AST':'AST','STL':'STL','BLK':'BLK','TOV':'TOV','FG%':'FG%','3P%':'3P%','FT%':'FT%','eFG%':'eFG%','FGA':'FGA','3PA':'3PA','BPM':'BPM'};
const COLKEYS=['GP','MPG','PTS/G','REB/G','AST/G','STL/G','BLK/G','TOV/G','FG%','2P%','3P%','FT%','eFG%','FGA/G','3PA/G','FTA/G','ORB/G','DRB/G','PF/G'];
const NBAKEYS=['G','GS','MP_pg','PTS','TRB','AST','STL','BLK','TOV','FG%','3P%','FT%','eFG%','FGA','3PA','BPM'];

function playerDetailHTML(p){
  const col=statTable({label:'College — final season',keys:COLKEYS,head:COLHEAD},[{label:`${p.teamMarket||''} ('${String(p.col_year).slice(2)})`,vals:p.col_trad}]);
  const seasonRows=p.nba_seasonlines.map(s=>({label:`${s.season} · ${s.team}`,vals:s}));
  const career={...p.nba_career}; // nba_career uses MP_pg etc; map keys present
  seasonRows.push({label:'Career avg',vals:career,cls:'career'});
  const nba=statTable({label:'NBA — season by season',keys:NBAKEYS,head:NBAHEAD},seasonRows);
  return`<div class="detail-inner"><div class="detail-block"><h5>College</h5>${col}</div><div class="detail-block"><h5>NBA</h5>${nba}</div></div>`;
}
function projDetailHTML(p){
  const col=statTable({label:'College — 2025-26',keys:COLKEYS,head:COLHEAD},[{label:`${p.teamMarket||''} · ${p['CLASS YR']||''}`,vals:p.col_trad}]);
  const pr=p.col_pred||{};
  const trk=p.team_rank!=null?`#${p.team_rank} of ~364`:'unmatched';
  const brk=`<div class="projbreak"><div class="pb"><b>${Math.round(p.comp_pct)}</b><span>production %ile</span></div><span class="eq">×.45 +</span><div class="pb"><b>${Math.round(p.team_pct)}</b><span>team %ile</span></div><span class="eq">×.25 +</span><div class="pb"><b>${Math.round(p.arch_base)}</b><span>archetype base</span></div><span class="eq">×.30 =</span><div class="pb"><b style="color:var(--teal-dk)">${Math.round(p.proj_score)}</b><span>projection</span></div><div class="pb" style="margin-left:8px"><b style="font-size:12.5px">team ${trk} (AdjEM ${fmt(p.team_adjem,1)}) · WARP/40 ${fmt(pr['WARP/40'],2)} · RAPM ${fmt(pr['RAPM'],1)} · WS/40 ${fmt(pr['WS/40'],2)}</b><span>inputs</span></div></div>`;
  return`<div class="detail-inner"><div class="detail-block"><h5>Projection breakdown</h5>${brk}</div><div class="detail-block"><h5>College stats</h5>${col}</div></div>`;
}
function wireExpand(tableId,dataRef,detailFn){
  document.getElementById(tableId).addEventListener('click',e=>{
    const tr=e.target.closest('tr.prow');if(!tr)return;
    const tb=tr.parentNode,i=tr.getAttribute('data-i');
    if(tr.classList.contains('open')){tr.classList.remove('open');if(tr.nextSibling&&tr.nextSibling.classList&&tr.nextSibling.classList.contains('detail'))tr.nextSibling.remove();return;}
    tb.querySelectorAll('tr.open').forEach(o=>{o.classList.remove('open');if(o.nextSibling&&o.nextSibling.classList&&o.nextSibling.classList.contains('detail'))o.nextSibling.remove();});
    tr.classList.add('open');
    const det=document.createElement('tr');det.className='detail';
    const td=document.createElement('td');td.colSpan=tr.children.length;td.innerHTML=detailFn(dataRef.current[i]);
    det.appendChild(td);tr.after(det);
  });
}

// PLAYER EXPLORER
const plArch=document.getElementById('pl-arch');
plArch.innerHTML='<option value="">All archetypes</option>'+[...S].sort((a,b)=>b.n-a.n).map(d=>`<option>${d.archetype}</option>`).join('');
document.getElementById('pl-year').innerHTML='<option value="">All draft years</option>'+M.draft_years.map(y=>`<option>${y}</option>`).join('')+'<option value="udfa">Undrafted</option>';
let plView='college',plSort={k:'nba_total_min',dir:-1},plRef={current:[]};
const PLSORTMAP={_GP:p=>p.col_trad?.['GP'],_MPG:p=>p.col_trad?.['MPG'],_PTS:p=>p.col_trad?.['PTS/G'],_REB:p=>p.col_trad?.['REB/G'],_AST:p=>p.col_trad?.['AST/G'],_STL:p=>p.col_trad?.['STL/G'],_BLK:p=>p.col_trad?.['BLK/G'],_FG:p=>p.col_trad?.['FG%'],_3P:p=>p.col_trad?.['3P%'],_FT:p=>p.col_trad?.['FT%'],_TS:p=>p.col_pred?.['TS%'],_USG:p=>p.col_pred?.['USG%'],_nMPG:p=>p.nba_career?.['MP_pg'],_nPTS:p=>p.nba_career?.['PTS'],_nREB:p=>p.nba_career?.['TRB'],_nAST:p=>p.nba_career?.['AST'],_nSTL:p=>p.nba_career?.['STL'],_nBLK:p=>p.nba_career?.['BLK'],_nFG:p=>p.nba_career?.['FG%'],_n3P:p=>p.nba_career?.['3P%']};
function plCmp(a,b){const f=PLSORTMAP[plSort.k];let x,y;if(f){x=f(a);y=f(b);}else{x=a[plSort.k];y=b[plSort.k];}if(x==null)x=-1e9;if(y==null)y=-1e9;if(typeof x==='string')return plSort.dir*x.localeCompare(y);return plSort.dir*(x-y);}
function renderPlayers(){
  const q=document.getElementById('pl-search').value.toLowerCase().trim(),af=plArch.value,df=document.getElementById('pl-draft').value,yr=document.getElementById('pl-year').value;
  let d=P.filter(p=>(!af||p.archetype===af)&&(!df||(df==='d'?p.drafted:!p.drafted))&&
    (!yr||(yr==='udfa'?!p.drafted:String(p.draft_year)===yr))&&
    (!q||(p.nba_real_name||'').toLowerCase().includes(q)||(p.teamMarket||'').toLowerCase().includes(q)));
  d.sort(plCmp);plRef.current=d;
  document.getElementById('pl-count').textContent=`${d.length} players`;
  let cols;
  if(plView==='college') cols=[{k:'nba_real_name',l:'Player',c:'l'},{k:'archetype',l:'Archetype',c:'l'},{k:'draft_pick',l:'Pick'},{k:'_GP',l:'NCAA GP'},{k:'_MPG',l:'MPG'},{k:'_PTS',l:'PPG'},{k:'_REB',l:'REB'},{k:'_AST',l:'AST'},{k:'_STL',l:'STL'},{k:'_BLK',l:'BLK'},{k:'_FG',l:'FG%'},{k:'_3P',l:'3P%'},{k:'_FT',l:'FT%'},{k:'_TS',l:'TS%'},{k:'_USG',l:'USG%'}];
  else cols=[{k:'nba_real_name',l:'Player',c:'l'},{k:'archetype',l:'Archetype',c:'l'},{k:'draft_pick',l:'Pick'},{k:'nba_seasons',l:'Yrs'},{k:'_nMPG',l:'MPG'},{k:'_nPTS',l:'PPG'},{k:'_nREB',l:'REB'},{k:'_nAST',l:'AST'},{k:'_nSTL',l:'STL'},{k:'_nBLK',l:'BLK'},{k:'_nFG',l:'FG%'},{k:'_n3P',l:'3P%'},{k:'nba_max_mpg',l:'Peak MPG'},{k:'nba_best_bpm_q',l:'Best BPM'},{k:'nba_total_min',l:'Career Min'}];
  document.getElementById('pl-table').innerHTML=tableHTML(cols,d,plSort,p=>{
    const ct=p.col_trad||{},nc=p.nba_career||{};
    const trk=p.team_rank!=null?` · #${p.team_rank}`:'';
    const base={nba_real_name:`<span class="pname"><span class="caret">▸</span> ${p.nba_real_name}</span> <span class="pmeta">${p.teamMarket||''}${trk}</span>`,archetype:`<span class="chip"><span class="sw" style="background:${ac(p.archetype)}"></span>${p.archetype}</span>`,draft_pick:p.drafted?`<span class="badge b-draft">#${p.draft_pick}</span>`:`<span class="badge b-undraft">UDFA</span>`};
    if(plView==='college')return{...base,_GP:statval('GP',ct['GP']),_MPG:fmt(ct['MPG'],1),_PTS:fmt(ct['PTS/G'],1),_REB:fmt(ct['REB/G'],1),_AST:fmt(ct['AST/G'],1),_STL:fmt(ct['STL/G'],1),_BLK:fmt(ct['BLK/G'],1),_FG:statval('FG%',ct['FG%']),_3P:statval('3P%',ct['3P%']),_FT:statval('FT%',ct['FT%']),_TS:statval('TS%',(p.col_pred||{})['TS%']),_USG:statval('USG%',(p.col_pred||{})['USG%'])};
    return{...base,nba_seasons:p.nba_seasons,_nMPG:fmt(nc['MP_pg'],1),_nPTS:fmt(nc['PTS'],1),_nREB:fmt(nc['TRB'],1),_nAST:fmt(nc['AST'],1),_nSTL:fmt(nc['STL'],1),_nBLK:fmt(nc['BLK'],1),_nFG:statval('FG%',nc['FG%']),_n3P:statval('3P%',nc['3P%']),nba_max_mpg:fmt(p.nba_max_mpg,1),nba_best_bpm_q:p.nba_best_bpm_q==null?'—':fmt(p.nba_best_bpm_q,1),nba_total_min:Math.round(p.nba_total_min).toLocaleString()};
  },true);
}
['pl-search','pl-arch','pl-draft','pl-year'].forEach(id=>document.getElementById(id).addEventListener('input',renderPlayers));
document.getElementById('pl-view').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;document.querySelectorAll('#pl-view button').forEach(x=>x.classList.remove('on'));b.classList.add('on');plView=b.dataset.v;renderPlayers();});
document.getElementById('pl-table').addEventListener('click',e=>{const th=e.target.closest('th[data-k]');if(!th)return;const k=th.dataset.k;plSort.dir=plSort.k===k?-plSort.dir:-1;plSort.k=k;renderPlayers();});
wireExpand('pl-table',plRef,playerDetailHTML);

// PROJECTIONS
const OUTLOOK={};
[...S].sort((a,b)=>b.rotation-a.rotation).forEach(d=>{let l,c;if(d.rotation>=50){l='Translates well';c='#037c6e';}else if(d.rotation>=40){l='Mixed';c='#0dbfa8';}else if(d.rotation>=25){l='Below average';c='#c79a3f';}else{l='Translates poorly';c='#c0673f';}OUTLOOK[d.archetype]={label:l,color:c,rate:d.rotation};});
const TIERC={'Elite translation':'#02685d','Strong':'#037c6e','Solid':'#0dbfa8','Fringe rotation':'#c79a3f','Long shot':'#c0673f'};
const pjArch=document.getElementById('pj-arch');
pjArch.innerHTML='<option value="">All archetypes</option>'+[...S].sort((a,b)=>b.n-a.n).map(d=>`<option>${d.archetype}</option>`).join('');
let pjSort={k:'proj_score',dir:-1},pjRef={current:[]};
function pjFilter(){
  const q=document.getElementById('pj-search').value.toLowerCase().trim(),af=pjArch.value,tf=document.getElementById('pj-tier').value,of=document.getElementById('pj-outlook').value,cf=document.getElementById('pj-class').value;
  return PJ.filter(p=>(!af||p.archetype===af)&&(!tf||p.proj_tier===tf)&&(!of||(OUTLOOK[p.archetype]||{}).label===of)&&(!cf||p['CLASS YR']===cf)&&(!q||(p.fullName||'').toLowerCase().includes(q)||(p.teamMarket||'').toLowerCase().includes(q)));
}
const PJSORTMAP={_MPG:p=>p.col_trad?.['MPG'],_PTS:p=>p.col_trad?.['PTS/G'],_REB:p=>p.col_trad?.['REB/G'],_AST:p=>p.col_trad?.['AST/G'],_3P:p=>p.col_trad?.['3P%'],_TS:p=>p.col_pred?.['TS%'],_WARP:p=>p.col_pred?.['WARP/40'],team_rank:p=>p.team_rank==null?9999:p.team_rank};
function pjCmp(a,b){const f=PJSORTMAP[pjSort.k];let x,y;if(f){x=f(a);y=f(b);}else{x=a[pjSort.k];y=b[pjSort.k];}if(x==null)x=-1e9;if(y==null)y=-1e9;if(typeof x==='string')return pjSort.dir*x.localeCompare(y);return pjSort.dir*(x-y);}
function renderProj(){
  let d=pjFilter();d.sort(pjCmp);
  const shown=d.slice(0,500);pjRef.current=shown;
  document.getElementById('pj-count').textContent=d.length>500?`showing top 500 of ${d.length.toLocaleString()}`:`${d.length.toLocaleString()} players`;
  const cols=[{k:'fullName',l:'Player',c:'l'},{k:'archetype',l:'Archetype',c:'l'},{k:'CLASS YR',l:'Class',c:'l'},{k:'proj_score',l:'Projection',c:'l'},{k:'comp_pct',l:'Prod %ile'},{k:'team_rank',l:'Team rk'},{k:'_MPG',l:'MPG'},{k:'_PTS',l:'PPG'},{k:'_REB',l:'REB'},{k:'_AST',l:'AST'},{k:'_3P',l:'3P%'},{k:'_WARP',l:'WARP/40'},{k:'_out',l:'Archetype outlook',c:'l'}];
  document.getElementById('pj-table').innerHTML=tableHTML(cols,shown,pjSort,p=>{
    const ct=p.col_trad||{},pr=p.col_pred||{},o=OUTLOOK[p.archetype]||{label:'—',color:'#999'},tc=TIERC[p.proj_tier]||'#999';
    return{fullName:`<span class="pname"><span class="caret">▸</span> ${p.fullName}</span> <span class="pmeta">${p.teamMarket||''}</span>`,archetype:`<span class="chip"><span class="sw" style="background:${ac(p.archetype)}"></span>${p.archetype}</span>`,'CLASS YR':p['CLASS YR']||'—',proj_score:`<span class="ptier" style="background:${tc}22;color:${tc}">${Math.round(p.proj_score)} · ${p.proj_tier}</span>`,comp_pct:Math.round(p.comp_pct),team_rank:p.team_rank!=null?`#${p.team_rank}`:'—',_MPG:fmt(ct['MPG'],1),_PTS:fmt(ct['PTS/G'],1),_REB:fmt(ct['REB/G'],1),_AST:fmt(ct['AST/G'],1),_3P:statval('3P%',ct['3P%']),_WARP:fmt(pr['WARP/40'],2),_out:`<span class="outlook" style="background:${o.color}22;color:${o.color}">${o.label} · ${Math.round(o.rate)}%</span>`};
  },true);
}
['pj-search','pj-arch','pj-tier','pj-outlook','pj-class'].forEach(id=>document.getElementById(id).addEventListener('input',renderProj));
document.getElementById('pj-table').addEventListener('click',e=>{const th=e.target.closest('th[data-k]');if(!th)return;const k=th.dataset.k;pjSort.dir=pjSort.k===k?-pjSort.dir:-1;pjSort.k=k;renderProj();});
wireExpand('pj-table',pjRef,projDetailHTML);

// fullscreen toggle
(function(){
  const fsBtn=document.getElementById('fs-btn');if(!fsBtn)return;
  const isFs=()=>document.fullscreenElement||document.webkitFullscreenElement;
  fsBtn.addEventListener('click',()=>{
    try{
      if(!isFs()){const el=document.documentElement;(el.requestFullscreen||el.webkitRequestFullscreen||el.mozRequestFullScreen||el.msRequestFullscreen).call(el);}
      else{(document.exitFullscreen||document.webkitExitFullscreen||document.mozCancelFullScreen||document.msExitFullscreen).call(document);}
    }catch(e){}
  });
  const sync=()=>{const on=!!isFs();const l=fsBtn.querySelector('.fs-label');if(l)l.textContent=on?'Exit full screen':'Full screen';};
  ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange'].forEach(ev=>document.addEventListener(ev,sync));
  document.addEventListener('keydown',e=>{if(e.key==='f'&&!/input|select|textarea/i.test((e.target.tagName||''))){fsBtn.click();}});
})();

// tabs
document.getElementById('tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!b.dataset.p)return;document.querySelectorAll('#tabs button').forEach(x=>x.classList.remove('on'));b.classList.add('on');document.querySelectorAll('.view').forEach(p=>p.classList.remove('on'));document.getElementById('p-'+b.dataset.p).classList.add('on');});

renderBoard();renderDetail(detSel.value);renderPlayers();renderProj();
