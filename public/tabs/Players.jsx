/* Players.jsx -- part of the Archetype Analysis Dashboard
   Loaded as a global (no import/export); depends on shared.jsx + data.js. */

// ---- PLAYERS (all players, searchable/filterable) ----

// Small helper: colored value + mini bar for a VERSPI category cell.
function VCell(props){
  var val=props.val, color=props.color;
  if(val===null||val===undefined) return <span style={{color:"#D1D5DB",fontSize:11}}>--</span>;
  return(<div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"flex-end"}}>
    <span style={{fontWeight:700,color:color,fontVariantNumeric:"tabular-nums"}}>{Math.round(val)}</span>
    <div style={{width:30,height:5,background:"#F3F4F6",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:color,width:Math.max(0,Math.min(100,val))+"%"}}/></div>
  </div>);
}

function BoxCell(props){
  var row=statRow(props.idx);
  var val=row?row[props.pos]:null;
  if(PSTATS_STATUS==="loading"||PSTATS_STATUS==="idle") return <span style={{color:"#D1D5DB",fontSize:11}}>...</span>;
  if(val===null||val===undefined||val<0) return <span style={{color:"#D1D5DB",fontSize:11}}>--</span>;
  var text=props.pct?((Math.abs(val)<=1?val*100:val).toFixed(1)+"%"):val.toFixed(1);
  return <span style={{fontVariantNumeric:"tabular-nums",fontWeight:600,color:"#374151"}}>{text}</span>;
}

function Players(){
  var stStatus=useStats();
  var vsStatus=useVersp();
  var tierStatus=useTeamTiers();
  var sExp=useState(-1),expRow=sExp[0],setExpRow=sExp[1];
  var s1=useState(""),search=s1[0],setSearch=s1[1];
  var s2=useState("all"),archF=s2[0],setArchF=s2[1];
  var s3=useState("all"),seasF=s3[0],setSeasF=s3[1];
  var s4=useState("purity"),sortBy=s4[0],setSortBy=s4[1];
  var s5=useState(100),limit=s5[0],setLimit=s5[1];
  var s6=useState(false),multiOnly=s6[0],setMultiOnly=s6[1];
  var s7=useState("all"),classF=s7[0],setClassF=s7[1];
  // Tier box filter: which conference tiers to include (all checked by default)
  var s8=useState({"High Major":true,"High Major-":true,"Mid-Major":true,"Mid-Major-":true,"Low Major":true}),tierSel=s8[0],setTierSel=s8[1];
  // Min/max range filters for all 7 VERSPI+Defense categories, 0-100, null=no bound
  var VKEYS=["v","e","r","s","p","i","d"];
  var s9=useState({}),ranges=s9[0],setRanges=s9[1]; // {v:{min,max}, ...}
  var s10=useState(false),showRanges=s10[0],setShowRanges=s10[1];

  function setRange(key,which,val){
    setRanges(function(prev){
      var next={}; var k; for(k in prev){next[k]=prev[k];}
      var cur=next[key]?{min:next[key].min,max:next[key].max}:{min:null,max:null};
      cur[which] = (val===""?null:Math.max(0,Math.min(100,Number(val))));
      next[key]=cur;
      return next;
    });
  }
  function clearRanges(){ setRanges({}); }
  function activeRangeCount(){ var c=0,k; for(k in ranges){ if(ranges[k]&&(ranges[k].min!=null||ranges[k].max!=null)) c++; } return c; }
  function tierCount(){ var c=0,k; for(k in tierSel){ if(tierSel[k]) c++; } return c; }

  // Height range filter, in inches (separate scale from the 0-100 VERSPI ranges above)
  var s11=useState({min:null,max:null}),htRange=s11[0],setHtRange=s11[1];
  function setHtBound(which,val){
    setHtRange(function(prev){
      var next={min:prev.min,max:prev.max};
      next[which] = (val===""?null:Math.max(60,Math.min(96,Number(val))));
      return next;
    });
  }
  function htActive(){ return htRange.min!=null || htRange.max!=null; }

  // VERSPI category lookup by ALLP index; null-safe.
  function vsp(idx){ return verspRow(idx); }
  function vspVal(idx,key){ var r=vsp(idx); return (r&&r[key]!=null)?r[key]:null; }

  var classOptions=useMemo(function(){
    var seen={}, out=[], i;
    for(i=0;i<ALLP.length;i++){
      var r=vsp(i);
      var cls=(r&&r.cls)?r.cls:"--";
      if(!seen[cls]){ seen[cls]=true; out.push(cls); }
    }
    out.sort(function(a,b){
      if(a==="--") return 1;
      if(b==="--") return -1;
      return a<b?-1:(a>b?1:0);
    });
    return out;
  },[vsStatus]);

  var rows=useMemo(function(){
    var q=search.toLowerCase();
    var out=[];
    var i;
    for(i=0;i<ALLP.length;i++){
      var p=ALLP[i];
      // p = [name, team, archIdx, tier, purity, pscore, secIdx, seasonCode]
      if(archF!=="all" && DL[p[2]]!==archF) continue;
      if(seasF!=="all" && p[7]!==parseInt(seasF)) continue;
      if(classF!=="all"){
        var classLabel=(vsp(i)&&vsp(i).cls)?vsp(i).cls:"--";
        if(classLabel!==classF) continue;
      }
      // Conference tier box filter
      var pt=teamTier(p[1]);
      var tierKey=pt||"Low Major"; // unclassified falls under Low Major bucket rather than vanishing
      if(!tierSel[tierKey]) continue;
      if(q && p[0].toLowerCase().indexOf(q)===-1 && p[1].toLowerCase().indexOf(q)===-1) continue;
      if(multiOnly){
        var vv=versScore(p);
        if(vv===null || vv<0.75) continue;   // Versatile / Dual-Threat only
      }
      // Min/max range filters across all 7 categories
      var passRange=true;
      var rk;
      for(rk in ranges){
        var rg=ranges[rk];
        if(!rg || (rg.min==null && rg.max==null)) continue;
        var cv=vspVal(i,rk);
        if(cv===null){ passRange=false; break; }
        if(rg.min!=null && cv<rg.min){ passRange=false; break; }
        if(rg.max!=null && cv>rg.max){ passRange=false; break; }
      }
      if(!passRange) continue;
      // Height range filter (inches). Missing height excludes the player,
      // same convention as the VERSPI range filters above.
      if(htActive()){
        var hv=vspVal(i,"ht");
        if(hv===null) continue;
        if(htRange.min!=null && hv<htRange.min) continue;
        if(htRange.max!=null && hv>htRange.max) continue;
      }
      out.push(p.concat([i]));
    }
    out.sort(function(a,b){
      if(sortBy==="vers")   return (versScore(b)||0)-(versScore(a)||0);
      if(sortBy==="purity") return (b[4]||0)-(a[4]||0);
      if(sortBy==="score")  return (b[5]||0)-(a[5]||0);
      if(sortBy==="vol")    return (vspVal(b[8],"v")||0)-(vspVal(a[8],"v")||0);
      if(sortBy==="eff")    return (vspVal(b[8],"e")||0)-(vspVal(a[8],"e")||0);
      if(sortBy==="reb")    return (vspVal(b[8],"r")||0)-(vspVal(a[8],"r")||0);
      if(sortBy==="sec")    return (vspVal(b[8],"s")||0)-(vspVal(a[8],"s")||0);
      if(sortBy==="ply")    return (vspVal(b[8],"p")||0)-(vspVal(a[8],"p")||0);
      if(sortBy==="imp")    return (vspVal(b[8],"i")||0)-(vspVal(a[8],"i")||0);
      if(sortBy==="def")    return (vspVal(b[8],"d")||0)-(vspVal(a[8],"d")||0);
      if(sortBy==="ht")     return (vspVal(b[8],"ht")||0)-(vspVal(a[8],"ht")||0);
      if(sortBy==="name")   return a[0]<b[0]?-1:1;
      if(sortBy==="team")   return a[1]<b[1]?-1:1;
      return 0;
    });
    return out;
  },[search,archF,seasF,classF,sortBy,multiOnly,vsStatus,tierSel,ranges,tierStatus,htRange]);

  var shown=rows.slice(0,limit);
  var COLSPAN=30;

  return(
    <div style={{maxWidth:1240,margin:"0 auto",padding:"24px 16px"}}>
      <h2 style={{fontSize:22,fontWeight:800,color:"#111827",margin:"0 0 4px"}}>All Players</h2>
      <p style={{fontSize:13,color:"#6B7280",margin:"0 0 18px"}}>Every classified player across all 5 seasons. Search, filter by archetype, season, or class, and sort. VERSPI+D = Volume, Efficiency, Rebounding, Security, Playmaking, Impact, Defense -- each a 0-100 percentile score within the same season and division. Filter by conference tier, or set min/max ranges on any category -- or height -- below.</p>

      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
        <input value={search} onChange={function(e){setSearch(e.target.value);setLimit(100);}} placeholder="Search player or team..." style={{flex:1,minWidth:180,padding:"7px 12px",borderRadius:7,fontSize:13,border:"1.5px solid #D1D5DB",outline:"none"}}/>
        <select value={archF} onChange={function(e){setArchF(e.target.value);setLimit(100);}} style={{padding:"7px 10px",borderRadius:7,fontSize:13,border:"1.5px solid #D1D5DB",background:"white",cursor:"pointer"}}>
          <option value="all">All Archetypes</option>
          {DL.map(function(a){return <option key={a} value={a}>{a}</option>;})}
        </select>
        <select value={seasF} onChange={function(e){setSeasF(e.target.value);setLimit(100);}} style={{padding:"7px 10px",borderRadius:7,fontSize:13,border:"1.5px solid #D1D5DB",background:"white",cursor:"pointer"}}>
          <option value="all">All Seasons</option>
          {["1","2","3","4","5"].map(function(c){return <option key={c} value={c}>{SMAP[c]}</option>;})}
        </select>
        <select value={classF} onChange={function(e){setClassF(e.target.value);setLimit(100);}} style={{padding:"7px 10px",borderRadius:7,fontSize:13,border:"1.5px solid #D1D5DB",background:"white",cursor:"pointer"}}>
          <option value="all">All Classes</option>
          {classOptions.map(function(c){return <option key={c} value={c}>{c==="--"?"Unknown Class":c}</option>;})}
        </select>
      </div>

      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,alignItems:"center"}}>
        <span style={{fontSize:11,fontWeight:700,color:"#6B7280"}}>Conference tier:</span>
        {TIER_ORDER.map(function(t){
          var on=tierSel[t];
          return(<button key={t} onClick={function(){setTierSel(function(prev){var n={};var k;for(k in prev){n[k]=prev[k];}n[t]=!n[t];return n;});setLimit(100);}} style={{padding:"3px 10px",fontSize:11,fontWeight:700,borderRadius:6,cursor:"pointer",background:on?TIER_COLORS[t]:"white",color:on?"white":TIER_COLORS[t],border:"1.5px solid "+TIER_COLORS[t]}}>{t}</button>);
        })}
        {tierCount()<5 && <button onClick={function(){setTierSel({"High Major":true,"High Major-":true,"Mid-Major":true,"Mid-Major-":true,"Low Major":true});}} style={{fontSize:11,color:"#6B7280",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>reset</button>}
      </div>

      <div style={{marginBottom:14}}>
        <button onClick={function(){setShowRanges(!showRanges);}} style={{padding:"5px 12px",fontSize:11,fontWeight:700,borderRadius:7,cursor:"pointer",background:(activeRangeCount()>0||htActive())?"#4338CA":"white",color:(activeRangeCount()>0||htActive())?"white":"#4338CA",border:"1.5px solid #4338CA"}}>
          {showRanges?"Hide":"Show"} VERSPI+D+Height range filters{(activeRangeCount()+ (htActive()?1:0))>0?" ("+(activeRangeCount()+(htActive()?1:0))+" active)":""}
        </button>
        {showRanges && (
          <div style={{marginTop:9,background:"white",border:"1px solid #E5E7EB",borderRadius:10,padding:13,display:"flex",flexWrap:"wrap",gap:14}}>
            {VKEYS.map(function(k){
              var rg=ranges[k]||{min:null,max:null};
              return(<div key={k} style={{display:"flex",flexDirection:"column",gap:3}}>
                <span style={{fontSize:10,fontWeight:700,color:VERSPI_COLORS[k]}}>{VERSPI_LABELS[k]}</span>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <input type="number" min="0" max="100" placeholder="min" value={rg.min===null?"":rg.min} onChange={function(e){setRange(k,"min",e.target.value);setLimit(100);}} style={{width:52,padding:"3px 6px",fontSize:11,borderRadius:5,border:"1px solid #D1D5DB"}}/>
                  <span style={{fontSize:10,color:"#9CA3AF"}}>-</span>
                  <input type="number" min="0" max="100" placeholder="max" value={rg.max===null?"":rg.max} onChange={function(e){setRange(k,"max",e.target.value);setLimit(100);}} style={{width:52,padding:"3px 6px",fontSize:11,borderRadius:5,border:"1px solid #D1D5DB"}}/>
                </div>
              </div>);
            })}
            <div style={{display:"flex",flexDirection:"column",gap:3,borderLeft:"1px solid #F3F4F6",paddingLeft:14}}>
              <span style={{fontSize:10,fontWeight:700,color:"#374151"}}>Height (in)</span>
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                <input type="number" min="60" max="96" placeholder="min" value={htRange.min===null?"":htRange.min} onChange={function(e){setHtBound("min",e.target.value);setLimit(100);}} style={{width:52,padding:"3px 6px",fontSize:11,borderRadius:5,border:"1px solid #D1D5DB"}}/>
                <span style={{fontSize:10,color:"#9CA3AF"}}>-</span>
                <input type="number" min="60" max="96" placeholder="max" value={htRange.max===null?"":htRange.max} onChange={function(e){setHtBound("max",e.target.value);setLimit(100);}} style={{width:52,padding:"3px 6px",fontSize:11,borderRadius:5,border:"1px solid #D1D5DB"}}/>
              </div>
              {htActive() && <span style={{fontSize:9,color:"#9CA3AF"}}>{htRange.min!=null?fmtHeight(htRange.min):"any"} &ndash; {htRange.max!=null?fmtHeight(htRange.max):"any"}</span>}
            </div>
            {(activeRangeCount()>0||htActive()) && <button onClick={function(){clearRanges();setHtRange({min:null,max:null});setLimit(100);}} style={{alignSelf:"flex-end",fontSize:11,color:"#DC2626",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>clear all</button>}
          </div>
        )}
      </div>

      <div style={{fontSize:12,color:"#6B7280",marginBottom:10,display:"flex",alignItems:"center",flexWrap:"wrap",gap:4}}>
        <span>Showing {shown.length} of {rows.length.toLocaleString()} players (click a row for stats)</span>
        <span style={{marginLeft:8}}>Sort:</span>
        {[["purity","Purity"],["vers","Versatility"],["score","Primary Score"],["vol","Volume"],["eff","Efficiency"],["reb","Rebounding"],["sec","Security"],["ply","Playmaking"],["imp","Impact"],["def","Defense"],["ht","Height"],["name","Name"],["team","Team"]].map(function(o){return(<button key={o[0]} onClick={function(){setSortBy(o[0]);}} style={{marginLeft:4,marginTop:4,padding:"2px 9px",fontSize:11,fontWeight:600,borderRadius:6,cursor:"pointer",background:sortBy===o[0]?"#0F2044":"white",color:sortBy===o[0]?"white":"#374151",border:"1px solid "+(sortBy===o[0]?"#0F2044":"#D1D5DB")}}>{o[1]}</button>);})}
        <span style={{flex:1}}/>
        <button onClick={function(){setMultiOnly(!multiOnly);setLimit(100);}} title="Only players whose second-best archetype fit is 0.75+ -- they can credibly fill two roles" style={{padding:"3px 10px",fontSize:11,fontWeight:700,borderRadius:6,cursor:"pointer",background:multiOnly?"#2563EB":"white",color:multiOnly?"white":"#2563EB",border:"1.5px solid "+(multiOnly?"#2563EB":"#BFDBFE")}}>Multi-role only</button>
      </div>

      <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:11,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:"#F9FAFB",borderBottom:"1px solid #E5E7EB"}}>
              {["Player","Team","Tier","Class","Season","Archetype","2nd Role","Pos Tier","Ht","GP","MPG","PTS","REB","AST","STL","BLK","TOV","FG%","3P%","FT%","Vol","Eff","Reb","Sec","Ply","Imp","Def","Primary","Purity","Versatility"].map(function(h){
                var rightAlign=["Ht","GP","MPG","PTS","REB","AST","STL","BLK","TOV","FG%","3P%","FT%","Vol","Eff","Reb","Sec","Ply","Imp","Def","Primary","Purity","Versatility"].indexOf(h)!==-1;
                var vKey={Ht:"ht",Vol:"v",Eff:"e",Reb:"r",Sec:"s",Ply:"p",Imp:"i",Def:"d"}[h];
                var title=(h==="Ht")?"Height":(vKey?VERSPI_LABELS[vKey]:null);
                return <th key={h} title={title} style={{padding:"9px 10px",textAlign:rightAlign?"right":"left",fontWeight:700,color:"#6B7280",whiteSpace:"nowrap"}}>{h}</th>;
              })}
            </tr></thead>
            <tbody>
              {shown.map(function(p,i){
                var arch=DL[p[2]];
                var realIdx=p[8];
                var isExp=expRow===realIdx;
                var v=versScore(p);
                var vt=versTier(v);
                var sec=(p[6]>=0&&p[6]<DL.length)?DL[p[6]]:null;
                var vs=vsp(realIdx);
                var ptier=teamTier(p[1])||"Low Major";
                return(<React.Fragment key={i}>
                <tr onClick={function(){setExpRow(isExp?-1:realIdx);}} style={{borderBottom:"1px solid #F3F4F6",background:isExp?"#EFF6FF":(i%2===0?"white":"#FAFAFA"),cursor:"pointer"}}>
                  <td style={{padding:"7px 10px",fontWeight:500,color:"#111827",whiteSpace:"nowrap"}}>{p[0]}</td>
                  <td style={{padding:"7px 10px",color:"#374151",whiteSpace:"nowrap"}}>{p[1]}</td>
                  <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}><span style={{fontSize:10,fontWeight:700,color:TIER_COLORS[ptier]}}>{ptier}</span></td>
                  <td style={{padding:"7px 10px",color:"#6B7280",whiteSpace:"nowrap"}}>{vs&&vs.cls?vs.cls:"--"}</td>
                  <td style={{padding:"7px 10px",color:"#6B7280"}}>{SMAP[String(p[7])]}</td>
                  <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}><div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:4,background:cl(arch),flexShrink:0}}/>{arch}</div></td>
                  <td style={{padding:"7px 10px",whiteSpace:"nowrap",color:"#6B7280"}}>{sec?(<div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:6,height:6,borderRadius:3,background:cl(sec),flexShrink:0,opacity:0.6}}/>{sec}</div>):"--"}</td>
                  <td style={{padding:"7px 10px",color:"#9CA3AF"}}>{p[3]===0?"G/W":"Big"}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",color:"#374151",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{fmtHeight(vs?vs.ht:null)}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><BoxCell idx={realIdx} pos={1}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><BoxCell idx={realIdx} pos={0}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><BoxCell idx={realIdx} pos={2}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><BoxCell idx={realIdx} pos={4}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><BoxCell idx={realIdx} pos={3}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><BoxCell idx={realIdx} pos={5}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><BoxCell idx={realIdx} pos={6}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><BoxCell idx={realIdx} pos={7}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><BoxCell idx={realIdx} pos={8} pct={true}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><BoxCell idx={realIdx} pos={9} pct={true}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><BoxCell idx={realIdx} pos={10} pct={true}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><VCell val={vs?vs.v:null} color={VERSPI_COLORS.v}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><VCell val={vs?vs.e:null} color={VERSPI_COLORS.e}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><VCell val={vs?vs.r:null} color={VERSPI_COLORS.r}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><VCell val={vs?vs.s:null} color={VERSPI_COLORS.s}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><VCell val={vs?vs.p:null} color={VERSPI_COLORS.p}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><VCell val={vs?vs.i:null} color={VERSPI_COLORS.i}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}><VCell val={vs?vs.d:null} color={VERSPI_COLORS.d}/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",color:"#374151",fontVariantNumeric:"tabular-nums"}}>{p[5]>=0?p[5].toFixed(2):"--"}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600,color:cl(arch),fontVariantNumeric:"tabular-nums"}}>{p[4]>=0?p[4].toFixed(2):"--"}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",whiteSpace:"nowrap"}}>
                    {v!==null?(<div style={{display:"flex",alignItems:"center",gap:5,justifyContent:"flex-end"}}>
                      <span style={{fontWeight:700,color:vt.color,fontVariantNumeric:"tabular-nums"}}>{v.toFixed(2)}</span>
                      {v>=0.75 && <VersBadge v={v}/>}
                    </div>):"--"}
                  </td>
                </tr>
                {isExp && (<tr><td colSpan={COLSPAN} style={{padding:0,background:"#F9FAFB"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
                    <div><StatProfile idx={realIdx}/></div>
                    <div style={{padding:"12px 14px",borderTop:"1px solid #EEF0F4",borderLeft:"1px solid #EEF0F4"}}>
                      <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.5px",color:"#9CA3AF",marginBottom:8}}>MOST SIMILAR PLAYERS (all seasons)</div>
                      <SimilarPlayers idx={realIdx}/>
                    </div>
                  </div>
                </td></tr>)}
                </React.Fragment>);
              })}
            </tbody>
          </table>
        </div>
        {rows.length>limit && (
          <div style={{padding:14,textAlign:"center",borderTop:"1px solid #F3F4F6"}}>
            <button onClick={function(){setLimit(limit+200);}} style={{padding:"7px 20px",background:"#0F2044",color:"white",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600}}>Load more ({(rows.length-limit).toLocaleString()} remaining)</button>
          </div>
        )}
      </div>
    </div>
  );
}
