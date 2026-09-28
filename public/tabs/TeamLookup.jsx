/* TeamLookup.jsx -- part of the Archetype Analysis Dashboard
   Loaded as a global (no import/export); depends on shared.jsx + data.js. */

// ---- TEAM LOOKUP (derives roster from ALLP) ----
function TeamLookup(){
  var stStatus=useStats();
  var sExpT=useState(-1),expT=sExpT[0],setExpT=sExpT[1];
  var s1=useState(""),search=s1[0],setSearch=s1[1];
  var s2=useState("5"),sc=s2[0],setSc=s2[1];
  var s3=useState(null),selTeam=s3[0],setSelTeam=s3[1];
  var selSeason=SMAP[sc];
  var scNum=parseInt(sc);

  var teamNames=useMemo(function(){
    var seen={};TDATA.forEach(function(t){if(t.s===sc)seen[t.t]=true;});return Object.keys(seen).sort();
  },[sc]);
  var filtered=useMemo(function(){var q=search.toLowerCase();return teamNames.filter(function(t){return t.toLowerCase().indexOf(q)!==-1;});},[teamNames,search]);
  var teamStats=useMemo(function(){if(!selTeam)return null;var i;for(i=0;i<TDATA.length;i++){if(TDATA[i].t===selTeam&&TDATA[i].s===sc)return TDATA[i];}return null;},[selTeam,sc]);
  var roster=useMemo(function(){
    if(!selTeam)return [];
    var out=[];
    var i;
    for(i=0;i<ALLP.length;i++){var p=ALLP[i];if(p[1]===selTeam&&p[7]===scNum){out.push({name:p[0],arch:DL[p[2]],purity:p[4]>=0?p[4]:null,idx:i,vers:versScore(p),secIdx:(p[6]>=0&&p[6]<DL.length)?p[6]:null});}}
    return out.sort(function(a,b){return (b.purity||0)-(a.purity||0);});
  },[selTeam,scNum]);

  return(
    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 16px"}}>
      <h2 style={{fontSize:22,fontWeight:800,color:"#111827",margin:"0 0 4px"}}>Team Lookup</h2>
      <p style={{fontSize:13,color:"#6B7280",margin:"0 0 18px"}}>Search any D1 program across all 5 seasons.</p>
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:5}}>
          {["1","2","3","4","5"].map(function(code){return(<button key={code} onClick={function(){setSc(code);setSelTeam(null);}} style={{padding:"5px 11px",borderRadius:7,cursor:"pointer",fontSize:11,fontWeight:700,border:"1.5px solid "+(sc===code?"#0F2044":"#D1D5DB"),background:sc===code?"#0F2044":"white",color:sc===code?"white":"#374151"}}>{SMAP[code]}</button>);})}
        </div>
        <input value={search} onChange={function(e){setSearch(e.target.value);setSelTeam(null);}} placeholder="Search team..." style={{flex:1,minWidth:150,padding:"6px 11px",borderRadius:7,fontSize:13,border:"1.5px solid #D1D5DB",outline:"none"}}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:14,alignItems:"start"}}>
        <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:11,maxHeight:500,overflowY:"auto"}}>
          {filtered.length===0?<div style={{padding:20,color:"#9CA3AF",fontSize:13,textAlign:"center"}}>No teams found</div>:filtered.map(function(t){return(<button key={t} onClick={function(){setSelTeam(t);}} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 13px",background:selTeam===t?"#EFF6FF":"transparent",color:selTeam===t?"#1D4ED8":"#374151",border:"none",borderBottom:"1px solid #F3F4F6",cursor:"pointer",fontSize:13,fontWeight:selTeam===t?700:400}}>{t}</button>);})}
        </div>
        <div>
          {!selTeam?<div style={{background:"#F9FAFB",borderRadius:11,padding:28,textAlign:"center",color:"#9CA3AF",fontSize:14}}>Select a team to view their breakdown and roster</div>:(
            <div>
              {teamStats && (
                <div style={{background:"linear-gradient(135deg,#0F2044,#1A3A6B)",borderRadius:11,padding:18,color:"white",marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:8}}>
                    <div><h3 style={{margin:"0 0 3px",fontSize:17,fontWeight:800}}>{selTeam}</h3><div style={{fontSize:12,opacity:0.65}}>{selSeason}</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontSize:22,fontWeight:800,color:teamStats.em>=0?"#4ADE80":"#F87171"}}>{teamStats.em>=0?"+":""}{teamStats.em.toFixed(1)}</div><div style={{fontSize:11,opacity:0.65}}>Adj. EM - Rank #{teamStats.rank}</div></div>
                  </div>
                  <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                    {[["OE",teamStats.oe],["DE",teamStats.de],["Tempo",teamStats.tempo]].map(function(it){return(<div key={it[0]}><div style={{fontSize:15,fontWeight:700}}>{it[1]!=null?it[1].toFixed(1):"--"}</div><div style={{fontSize:10,opacity:0.6}}>Adj. {it[0]}</div></div>);})}
                  </div>
                </div>
              )}
              {teamStats && (
                <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:11,padding:15,marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#6B7280",letterSpacing:"1px",marginBottom:10}}>ROSTER COMPOSITION</div>
                  {DL.map(function(a,i){var pct=teamStats.v[i];if(!pct||pct<0.5)return null;return(<div key={a} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}><div style={{width:7,height:7,borderRadius:4,background:cl(a),flexShrink:0}}/><span style={{fontSize:12,flex:1,color:"#374151"}}>{a}</span><div style={{width:80,height:6,background:"#F3F4F6",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:cl(a),width:pct+"%"}}/></div><span style={{fontSize:11,color:"#6B7280",width:32,textAlign:"right"}}>{Math.round(pct)}%</span></div>);})}
                </div>
              )}
              {teamStats && (
                <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:11,padding:15,marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#6B7280",letterSpacing:"1px",marginBottom:10}}>PLAYSTYLE (percentile vs all D1)</div>
                  <TeamPlaystyle team={selTeam} scode={sc}/>
                </div>
              )}
              <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:11,overflow:"hidden"}}>
                <div style={{padding:"10px 14px",background:"#F9FAFB",borderBottom:"1px solid #E5E7EB",fontSize:11,fontWeight:700,color:"#6B7280"}}>FULL ROSTER - sorted by purity</div>
                <div style={{maxHeight:320,overflowY:"auto"}}>
                  {roster.length===0?<div style={{padding:14,color:"#9CA3AF",fontSize:13}}>No player data found</div>:roster.map(function(p,i){var isE=expT===p.idx;return(<div key={i}>
                    <div onClick={function(){setExpT(isE?-1:p.idx);}} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 14px",borderBottom:"1px solid #F9FAFB",background:isE?"#EFF6FF":(i%2===0?"white":"#FAFAFA"),cursor:"pointer"}}><div style={{width:7,height:7,borderRadius:4,background:cl(p.arch),flexShrink:0}}/><span style={{fontSize:13,color:"#111827",fontWeight:500}}>{p.name}</span>{p.vers!==null&&p.vers>=0.75&&<VersBadge v={p.vers}/>}<span style={{flex:1}}/><span style={{fontSize:11,color:"#6B7280",flex:"0 0 175px"}}>{p.arch}</span><span style={{fontSize:11,color:"#9CA3AF",width:55,textAlign:"right"}}>{p.purity!=null?"Purity "+p.purity.toFixed(2):"--"}</span></div>
                    {isE && <StatProfile idx={p.idx}/>}
                  </div>);})}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
