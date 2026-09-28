/* TeamComparison.jsx -- part of the Archetype Analysis Dashboard
   Loaded as a global (no import/export); depends on shared.jsx + data.js. */

// ---- COMPARE TEAMS ----
function TeamComparison(){
  var s1=useState(""),teamA=s1[0],setTeamA=s1[1];
  var s2=useState(""),teamB=s2[0],setTeamB=s2[1];
  var s3=useState("5"),scA=s3[0],setScA=s3[1];
  var s4=useState("5"),scB=s4[0],setScB=s4[1];
  var s5=useState(null),result=s5[0],setResult=s5[1];
  var allTeams=useMemo(function(){var seen={};TDATA.forEach(function(t){seen[t.t]=true;});return Object.keys(seen).sort();},[]);
  function findEntry(team,sc){var i;for(i=0;i<TDATA.length;i++){if(TDATA[i].t===team&&TDATA[i].s===sc)return TDATA[i];}return null;}
  function doCompare(){var a=findEntry(teamA,scA),b=findEntry(teamB,scB);if(!a||!b)return;setResult({a:a,b:b,sim:cosine(a.v,b.v)});}
  var topSim=useMemo(function(){if(!teamA||!scA)return [];var base=findEntry(teamA,scA);if(!base)return [];var sc=TDATA.filter(function(t){return !(t.t===teamA&&t.s===scA);}).map(function(t){return {t:t.t,s:SMAP[t.s],em:t.em,rank:t.rank,sim:cosine(base.v,t.v)};});sc.sort(function(a,b){return b.sim-a.sim;});return sc.slice(0,10);},[teamA,scA]);
  function Picker(props){
    var ps=useState(""),q=ps[0],setQ=ps[1];
    var opts=allTeams.filter(function(t){return t.toLowerCase().indexOf(q.toLowerCase())!==-1;}).slice(0,8);
    return(<div style={{flex:1,minWidth:195}}>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:"1px",color:"#6B7280",marginBottom:5}}>{props.label}</div>
      <div style={{display:"flex",gap:3,marginBottom:5,flexWrap:"wrap"}}>{["1","2","3","4","5"].map(function(code){return(<button key={code} onClick={function(){props.setScode(code);}} style={{padding:"2px 6px",fontSize:10,fontWeight:700,borderRadius:5,cursor:"pointer",background:props.scode===code?"#0F2044":"white",color:props.scode===code?"white":"#374151",border:"1px solid "+(props.scode===code?"#0F2044":"#D1D5DB")}}>{SMAP[code]}</button>);})}</div>
      <input value={q} onChange={function(e){setQ(e.target.value);}} placeholder="Search team..." style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:13,border:"1.5px solid #D1D5DB",outline:"none",boxSizing:"border-box"}}/>
      {q && (<div style={{border:"1px solid #E5E7EB",borderRadius:7,marginTop:3,overflow:"hidden"}}>{opts.map(function(t){return(<button key={t} onClick={function(){props.setTeam(t);setQ("");}} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 11px",fontSize:13,background:"white",border:"none",borderBottom:"1px solid #F3F4F6",cursor:"pointer",color:"#374151"}}>{t}</button>);})}{opts.length===0&&<div style={{padding:"7px 11px",color:"#9CA3AF",fontSize:12}}>No match</div>}</div>)}
      {props.team && <div style={{marginTop:5,fontSize:13,fontWeight:700,color:"#0F2044"}}>{props.team} ({SMAP[props.scode]})</div>}
    </div>);
  }
  return(
    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 16px"}}>
      <h2 style={{fontSize:22,fontWeight:800,color:"#111827",margin:"0 0 4px"}}>Compare Teams</h2>
      <p style={{fontSize:13,color:"#6B7280",margin:"0 0 18px"}}>Compare any two programs by archetype composition. Similarity = cosine similarity (0-1, where 1.0 = identical roster DNA).</p>
      <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:12,padding:18,marginBottom:18}}>
        <div style={{display:"flex",gap:18,flexWrap:"wrap",marginBottom:14}}>
          <Picker label="TEAM A" team={teamA} setTeam={setTeamA} scode={scA} setScode={setScA}/>
          <div style={{display:"flex",alignItems:"center",paddingTop:24,fontSize:20,color:"#D1D5DB"}}>vs</div>
          <Picker label="TEAM B" team={teamB} setTeam={setTeamB} scode={scB} setScode={setScB}/>
        </div>
        <button onClick={doCompare} disabled={!teamA||!teamB} style={{padding:"9px 22px",background:(teamA&&teamB)?"#0F2044":"#D1D5DB",color:"white",border:"none",borderRadius:9,cursor:(teamA&&teamB)?"pointer":"not-allowed",fontWeight:700,fontSize:14}}>Compare</button>
      </div>
      {result && (
        <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:12,padding:18,marginBottom:18}}>
          <div style={{textAlign:"center",marginBottom:18,padding:"14px 0",borderBottom:"1px solid #E5E7EB"}}>
            <div style={{fontSize:12,color:"#6B7280",marginBottom:3}}>Roster DNA Similarity</div>
            <div style={{fontSize:38,fontWeight:800,color:result.sim>0.85?"#059669":result.sim>0.70?"#D97706":"#DC2626"}}>{(result.sim*100).toFixed(1)}%</div>
            <div style={{fontSize:12,color:"#9CA3AF"}}>{result.sim>0.90?"Nearly identical roster construction":result.sim>0.80?"Very similar archetype profiles":result.sim>0.70?"Moderately similar":result.sim>0.55?"Different roster philosophies":"Very different roster builds"}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {[{entry:result.a,label:teamA,scode:scA},{entry:result.b,label:teamB,scode:scB}].map(function(side,idx){
              var av=DL.map(function(a,i){return {arch:a,val:side.entry.v[i]};}).filter(function(x){return x.val>0.5;});av.sort(function(a,b){return b.val-a.val;});
              var scNum=parseInt(side.scode);
              var rosterPlayers=ALLP.filter(function(p){return p[1]===side.label&&p[7]===scNum;}).map(function(p){return {name:p[0],arch:DL[p[2]],purity:p[4]>=0?p[4]:null};}).sort(function(a,b){return (b.purity||0)-(a.purity||0);});
              return(<div key={idx}><div style={{fontWeight:700,fontSize:14,color:"#111827",marginBottom:3}}>{side.label}</div><div style={{fontSize:12,color:"#6B7280",marginBottom:10}}>{SMAP[side.scode]} - EM {side.entry.em>=0?"+":""}{side.entry.em.toFixed(1)} - Rank #{side.entry.rank}</div>{av.slice(0,6).map(function(it){return(<div key={it.arch} style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}><div style={{width:6,height:6,borderRadius:3,background:cl(it.arch),flexShrink:0}}/><span style={{fontSize:11,flex:1,color:"#374151"}}>{it.arch}</span><div style={{width:55,height:5,background:"#F3F4F6",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",background:cl(it.arch),borderRadius:3,width:it.val+"%"}}/></div><span style={{fontSize:10,color:"#9CA3AF",width:26,textAlign:"right"}}>{Math.round(it.val)}%</span></div>);})}
                  <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F3F4F6"}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.5px",color:"#9CA3AF",marginBottom:6}}>ROSTER ({rosterPlayers.length})</div>
                    <div style={{maxHeight:200,overflowY:"auto"}}>
                      {rosterPlayers.map(function(pl,pi){return(<div key={pi} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,fontSize:11}}><div style={{width:6,height:6,borderRadius:3,background:cl(pl.arch),flexShrink:0}}/><span style={{flex:1,color:"#374151"}}>{pl.name}</span><span style={{color:"#9CA3AF",fontSize:10}}>{pl.arch}</span></div>);})}
                    </div>
                  </div>
                  <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F3F4F6"}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.5px",color:"#9CA3AF",marginBottom:6}}>PLAYSTYLE</div>
                    <TeamPlaystyle team={side.label} scode={side.scode} compact={true}/>
                  </div>
                </div>);
            })}
          </div>
        </div>
      )}
      {teamA && (
        <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:12,padding:18}}>
          <div style={{fontSize:11,fontWeight:700,color:"#6B7280",letterSpacing:"1px",marginBottom:10}}>MOST SIMILAR PROGRAMS TO {teamA.toUpperCase()} ({SMAP[scA]})</div>
          {topSim.map(function(t,i){return(<div key={i} style={{display:"flex",alignItems:"center",gap:9,padding:"5px 0",borderBottom:"1px solid #F9FAFB",fontSize:12}}><span style={{color:"#9CA3AF",width:14,textAlign:"right"}}>{i+1}.</span><span style={{flex:1,fontWeight:500,color:"#111827"}}>{t.t}</span><span style={{color:"#6B7280",width:38}}>{t.s}</span><span style={{width:34,textAlign:"right",fontWeight:700,color:t.em>=0?"#059669":"#DC2626"}}>{t.em>=0?"+":""}{t.em.toFixed(1)}</span><span style={{width:48,textAlign:"right",fontWeight:700,color:t.sim>0.85?"#059669":t.sim>0.70?"#D97706":"#6B7280"}}>{(t.sim*100).toFixed(1)}%</span></div>);})}
        </div>
      )}
    </div>
  );
}
