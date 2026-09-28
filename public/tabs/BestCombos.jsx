/* BestCombos.jsx -- part of the Archetype Analysis Dashboard
   Loaded as a global (no import/export); depends on shared.jsx + data.js. */

// ---- BEST COMBOS ----
function BestCombos(){
  var s=useState("all"),filter=s[0],setFilter=s[1];
  var grades=["A+","A","B","C","D"];
  var filtered=filter==="all"?COMBOS:COMBOS.filter(function(c){return c.grade===filter;});
  var topAplus=COMBOS.filter(function(c){return c.grade==="A+";}).slice(0,6);
  return(
    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 16px"}}>
      <h2 style={{fontSize:22,fontWeight:800,color:"#111827",margin:"0 0 4px"}}>Best Archetype Combos</h2>
      <p style={{fontSize:13,color:"#6B7280",margin:"0 0 14px"}}>Two-archetype pairings by average Adj. Efficiency Margin. Min 8 team-seasons. Grades by EM percentile.</p>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
        {["all"].concat(grades).map(function(g){var gs=gradeStyle(g),active=filter===g;return(<button key={g} onClick={function(){setFilter(g);}} style={{padding:"5px 13px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700,border:"1.5px solid #D1D5DB",background:active?(g==="all"?"#0F2044":gs.bg):"white",color:active?(g==="all"?"white":gs.tx):"#374151"}}>{g==="all"?"All":"Grade "+g}</button>);})}
      </div>
      {filter==="all" && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(255px,1fr))",gap:12,marginBottom:22}}>
          {topAplus.map(function(c){var gs=gradeStyle(c.grade);return(<div key={c.a+c.b} style={{background:"white",border:"1px solid #E5E7EB",borderRadius:12,padding:15}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><span style={{background:gs.bg,color:gs.tx,padding:"2px 8px",borderRadius:7,fontWeight:800,fontSize:13}}>{c.grade}</span><span style={{fontSize:11,color:"#9CA3AF"}}>n={c.n}</span></div>
            <div style={{marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}><div style={{width:7,height:7,borderRadius:4,background:cl(c.a)}}/><span style={{fontSize:12,fontWeight:600,color:"#374151"}}>{c.a}</span></div>
              <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:4,background:cl(c.b)}}/><span style={{fontSize:12,fontWeight:600,color:"#374151"}}>{c.b}</span></div>
            </div>
            <div style={{fontWeight:800,fontSize:18,color:"#059669"}}>+{c.avgEM.toFixed(1)} EM</div>
            <div style={{fontSize:11,color:"#9CA3AF"}}>avg adj. efficiency margin</div>
          </div>);})}
        </div>
      )}
      <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:12,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:"#F9FAFB",borderBottom:"1px solid #E5E7EB"}}>
              {["Grade","Archetype A","Archetype B","Avg EM","Avg OE","Avg DE","N"].map(function(h){return <th key={h} style={{padding:"9px 13px",textAlign:(h==="Grade"||h==="N"||h.indexOf("Avg")===0)?"center":"left",fontWeight:700,color:"#6B7280"}}>{h}</th>;})}
            </tr></thead>
            <tbody>
              {filtered.map(function(c,i){var gs=gradeStyle(c.grade);return(<tr key={i} style={{borderBottom:"1px solid #F3F4F6",background:i%2===0?"white":"#FAFAFA"}}>
                <td style={{padding:"7px 13px",textAlign:"center"}}><span style={{background:gs.bg,color:gs.tx,padding:"2px 6px",borderRadius:5,fontWeight:800,fontSize:11}}>{c.grade}</span></td>
                <td style={{padding:"7px 13px"}}><div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:6,height:6,borderRadius:3,background:cl(c.a)}}/>{c.a}</div></td>
                <td style={{padding:"7px 13px"}}><div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:6,height:6,borderRadius:3,background:cl(c.b)}}/>{c.b}</div></td>
                <td style={{padding:"7px 13px",textAlign:"center",fontWeight:700,color:c.avgEM>0?"#059669":"#DC2626"}}>{c.avgEM>0?"+":""}{c.avgEM.toFixed(1)}</td>
                <td style={{padding:"7px 13px",textAlign:"center",color:"#374151"}}>{c.avgOE!=null?c.avgOE.toFixed(1):"--"}</td>
                <td style={{padding:"7px 13px",textAlign:"center",color:"#374151"}}>{c.avgDE!=null?c.avgDE.toFixed(1):"--"}</td>
                <td style={{padding:"7px 13px",textAlign:"center",color:"#9CA3AF"}}>{c.n}</td>
              </tr>);})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
