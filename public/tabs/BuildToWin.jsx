/* BuildToWin.jsx -- part of the Archetype Analysis Dashboard
   Loaded as a global (no import/export); depends on shared.jsx + data.js. */

// ---- Archetypes Impact ----
function BuildToWin(){
  var s0=useState("winning"),view=s0[0],setView=s0[1];
  var s1=useState(false),showPartial=s1[0],setShowPartial=s1[1];
  var s2=useState("AdjEM"),selOut=s2[0],setSelOut=s2[1];
  var sArch=useState("Pure Shooter"),selArch=sArch[0],setSelArch=sArch[1];
  var tsStatus=useTeamStats();
  var outLabels={AdjEM:"Adj. Efficiency Margin",AdjOE:"Adj. Offensive Efficiency",AdjDE:"Adj. Defensive Efficiency",AdjTempo:"Adj. Tempo"};
  var outcomes=["AdjEM","AdjOE","AdjDE","AdjTempo"];

  var rows=useMemo(function(){
    if(showPartial){
      return PARTIAL.map(function(r){return {arch:r.arch,val:r[selOut+"_partial"]};});
    }
    return CORR.map(function(r){return {arch:r.arch,val:r[selOut]};});
  },[showPartial,selOut]);
  var sorted=rows.slice().sort(function(a,b){return (b.val||0)-(a.val||0);});

  // ---- Playstyle view: archetype -> team-stat correlations ----
  function PlaystyleView(){
    if(tsStatus==="loading"||tsStatus==="idle") return <div style={{padding:24,color:"#9CA3AF",fontSize:13}}>Loading playstyle correlations...</div>;
    if(tsStatus==="error"||!TSCORR) return <div style={{padding:24,color:"#DC2626",fontSize:13}}>Could not load team_stats.json.</div>;
    var forArch=TSCORR.filter(function(c){return c.arch===selArch;});
    forArch=forArch.slice().sort(function(a,b){return Math.abs(showPartial?b.partial:b.raw)-Math.abs(showPartial?a.partial:a.raw);});
    return (
      <div>
        <div style={{fontSize:13,color:"#6B7280",marginBottom:12}}>
          How strongly does having more <strong style={{color:cl(selArch)}}>{selArch}</strong> players correlate with each team playstyle stat?
          {showPartial?" (controlling for team quality)":""}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:16}}>
          {DL.map(function(a){return(<button key={a} onClick={function(){setSelArch(a);}} style={{fontSize:11,padding:"4px 10px",borderRadius:6,cursor:"pointer",background:selArch===a?cl(a):"white",color:selArch===a?"white":"#6B7280",border:"1.5px solid "+(selArch===a?cl(a):"#D1D5DB"),fontWeight:selArch===a?700:400}}>{a}</button>);})}
        </div>
        <div style={{fontSize:11,color:"#9CA3AF",marginBottom:8}}>All {forArch.length} team stats, sorted by strength of relationship. Strongest signals first.</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {forArch.map(function(c,i){
            var val=showPartial?c.partial:c.raw;
            var isPos=val>=0;
            var barW=Math.min(Math.abs(val)*200,100);
            var strong=Math.abs(val)>=0.20;
            return(<div key={i} style={{background:"white",border:"1px solid "+(strong?"#D1D5DB":"#EEF0F4"),borderRadius:10,padding:"9px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",opacity:strong?1:0.72}}>
              <div style={{flex:"0 0 158px",minWidth:130}}>
                <div style={{fontWeight:600,fontSize:12,color:"#111827"}}>{c.label}</div>
                <div style={{fontSize:10,display:"flex",gap:5,alignItems:"center"}}>
                  <span style={{color:c.side==="off"?"#2563EB":"#DC2626"}}>{c.side==="off"?"Offense":"Defense"}</span>
                  {c.grp && <span style={{color:"#9CA3AF"}}>&middot; {c.grp}</span>}
                </div>
              </div>
              <div style={{flex:"0 0 55px",textAlign:"right",fontWeight:700,fontSize:13,color:isPos?"#059669":"#DC2626"}}>{val>=0?"+":""}{val.toFixed(3)}</div>
              <div style={{flex:1,minWidth:100}}><div style={{height:6,background:"#F3F4F6",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:isPos?"#10B981":"#EF4444",width:barW+"%",float:isPos?"left":"right"}}/></div></div>
            </div>);
          })}
        </div>
        <div style={{marginTop:16,background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:10,padding:"13px 16px",fontSize:13,color:"#1E40AF"}}>
          <strong>Why this matters:</strong> Unlike the winning correlations (which mostly collapse under quality adjustment), these playstyle links stay strong even after controlling for talent. Archetypes predict <em>how a team plays</em> far more reliably than <em>whether it wins</em>.
        </div>
      </div>
    );
  }

  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:800,color:"#111827",margin:"0 0 4px"}}>Archetypes Impact</h2>
          <p style={{fontSize:13,color:"#6B7280",margin:0}}>How each archetype relates to winning and to playstyle, across 1,646 team-seasons.</p>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:18}}>
        <button onClick={function(){setView("winning");}} style={{padding:"7px 16px",fontSize:13,fontWeight:700,borderRadius:8,cursor:"pointer",background:view==="winning"?"#0F2044":"white",color:view==="winning"?"white":"#374151",border:"1.5px solid "+(view==="winning"?"#0F2044":"#D1D5DB")}}>Impact on Winning</button>
        <button onClick={function(){setView("playstyle");}} style={{padding:"7px 16px",fontSize:13,fontWeight:700,borderRadius:8,cursor:"pointer",background:view==="playstyle"?"#0F2044":"white",color:view==="playstyle"?"white":"#374151",border:"1.5px solid "+(view==="playstyle"?"#0F2044":"#D1D5DB")}}>Impact on Playstyle</button>
        <div style={{flex:1}}/>
        <button onClick={function(){setShowPartial(!showPartial);}} style={{padding:"6px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700,background:showPartial?"#FEF3C7":"#F3F4F6",border:"2px solid "+(showPartial?"#F59E0B":"#D1D5DB"),color:showPartial?"#92400E":"#374151"}}>{showPartial?"Quality-Adjusted":"Raw"}</button>
      </div>

      {view==="playstyle" ? <PlaystyleView/> : (
      <div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:14}}>
          <div style={{display:"flex",gap:5}}>
            {outcomes.map(function(o){return(<button key={o} onClick={function(){setSelOut(o);}} style={{padding:"5px 10px",fontSize:11,fontWeight:700,borderRadius:7,cursor:"pointer",background:selOut===o?"#0F2044":"white",color:selOut===o?"white":"#374151",border:"1.5px solid "+(selOut===o?"#0F2044":"#D1D5DB")}}>{o}</button>);})}
          </div>
      </div>
      {showPartial && (
        <div style={{background:"#FFFBEB",border:"1.5px solid #F59E0B",borderRadius:10,padding:"12px 16px",marginBottom:18,fontSize:13,color:"#92400E"}}>
          <strong>Quality-adjusted:</strong> Partial correlations controlling for team quality rank, now shown for all four metrics. Most raw correlations shrink sharply -- the signal is largely driven by where you recruit, not what archetypes you recruit.
        </div>
      )}
      <div style={{fontSize:12,color:"#6B7280",marginBottom:14}}>Sorted by: <strong style={{color:"#111827"}}>{outLabels[selOut]}</strong> -- {showPartial?"partial":"Pearson"} r -- Stars = effect strength{selOut==="AdjDE"?" (note: for defense, negative r = helps)":""}</div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {sorted.map(function(row){
          var val=row.val; if(val===null||val===undefined)return null;
          var isPos=val>=0,pxEx=PX[row.arch]||[],barW=Math.min(Math.abs(val)*333,100);
          return(<div key={row.arch} style={{background:"white",border:"1px solid #E5E7EB",borderRadius:11,padding:"12px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{width:11,height:11,borderRadius:6,flexShrink:0,background:cl(row.arch)}}/>
            <div style={{flex:"0 0 195px",minWidth:130}}><div style={{fontWeight:700,fontSize:13,color:"#111827"}}>{row.arch}</div><div style={{fontSize:10,color:"#9CA3AF"}}>{TIER[row.arch]}</div></div>
            <div style={{flex:"0 0 90px",textAlign:"center"}}><Stars r={val}/></div>
            <div style={{flex:"0 0 55px",textAlign:"right",fontWeight:700,fontSize:14,color:isPos?"#059669":"#DC2626"}}>{val>=0?"+":""}{val.toFixed(3)}</div>
            <div style={{flex:1,minWidth:100}}><div style={{height:5,background:"#F3F4F6",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:isPos?"#10B981":"#EF4444",width:barW+"%",float:isPos?"left":"right"}}/></div></div>
            {pxEx.length>0 && <div style={{fontSize:11,color:"#9CA3AF",maxWidth:180}}>Ex: {pxEx.slice(0,2).map(function(p){return p.p.split(" ").slice(-1)[0];}).join(", ")}</div>}
          </div>);
        })}
      </div>
      {!showPartial && (
        <div style={{marginTop:20,background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:10,padding:"13px 16px",fontSize:13,color:"#1E40AF"}}>
          <strong>Heads up:</strong> Raw correlations reflect both archetype patterns and team quality. Toggle to Quality-Adjusted to see what remains after controlling for recruiting talent level -- now across all four metrics.
        </div>
      )}
      </div>
      )}
    </div>
  );
}
