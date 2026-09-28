/* Intro.jsx -- part of the Archetype Analysis Dashboard
   Loaded as a global (no import/export); depends on shared.jsx + data.js. */

// ---- INTRO ----
function Intro(){
  var st=useState(null),selArch=st[0],setSelArch=st[1];
  var statCards=[["15,870","Players Classified"],["1,646","Team-Seasons"],["8","Archetypes"],["5","Seasons (21-26)"]];
  var infoCards=[
    {title:"The Core Question",body:"Do teams built with certain player archetypes outperform others? We assign every D1 player a primary archetype, compute each team's roster composition, and correlate those compositions with KenPom efficiency metrics."},
    {title:"The Honest Finding",body:"Most raw archetype correlations collapse when controlling for overall team quality. Athletic Big shows the strongest raw link to winning, but most of that signal reflects which programs recruit those players -- not the archetype itself."},
    {title:"What You Can Use",body:"Even controlling for quality, some archetype combinations show real structural advantages. The Best Combos and Trends tabs highlight patterns worth attention -- and Compare Teams lets you see where any program sits relative to others."},
    {title:"The Method",body:"Players are classified into 8 archetypes using a weighted scoring system built from percentile-ranked box score and play-by-play stats. See the 'How It Works' tab for the full formula reference."}
  ];
  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 16px"}}>
      <div style={{background:"linear-gradient(135deg,#0F2044 0%,#1A3A6B 100%)",borderRadius:16,padding:"32px 36px",color:"white",marginBottom:28}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:"2px",opacity:0.6,marginBottom:8}}>BASKETBALL ARCHETYPE ANALYSIS</div>
        <h1 style={{fontSize:28,fontWeight:800,margin:"0 0 12px",lineHeight:1.25}}>How Winning Programs Are Built</h1>
        <p style={{fontSize:15,opacity:0.85,maxWidth:560,lineHeight:1.6,margin:"0 0 24px"}}>Five seasons of D1 college basketball -- 15,870 players, 1,646 team-seasons -- analyzed through the lens of 8 player archetypes. Which roster compositions correlate with team success, and why the answer is more nuanced than it looks.</p>
        <div style={{display:"flex",gap:28,flexWrap:"wrap"}}>
          {statCards.map(function(it){return(<div key={it[1]} style={{textAlign:"center"}}><div style={{fontSize:26,fontWeight:800,color:"#F8C842"}}>{it[0]}</div><div style={{fontSize:10,opacity:0.65,letterSpacing:"0.5px"}}>{it[1]}</div></div>);})}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:28}}>
        {infoCards.map(function(c){return(<div key={c.title} style={{background:"white",border:"1px solid #E5E7EB",borderRadius:12,padding:18}}><div style={{fontWeight:800,fontSize:14,color:"#111827",marginBottom:8}}>{c.title}</div><div style={{fontSize:13,color:"#6B7280",lineHeight:1.6}}>{c.body}</div></div>);})}
      </div>
      <h2 style={{fontSize:18,fontWeight:700,color:"#111827",margin:"0 0 6px"}}>The 8 Archetypes</h2>
      <p style={{fontSize:13,color:"#6B7280",margin:"0 0 14px"}}>Click any archetype to see examples and a description.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:8,marginBottom:20}}>
        {DL.map(function(arch){var active=selArch===arch;return(
          <button key={arch} onClick={function(){setSelArch(active?null:arch);}} style={{background:active?cl(arch):"white",color:active?"white":"#374151",border:"2px solid "+cl(arch),borderRadius:10,padding:"9px 11px",cursor:"pointer",textAlign:"left",fontSize:12,fontWeight:active?700:400}}>
            <div style={{width:8,height:8,borderRadius:4,background:active?"rgba(255,255,255,0.7)":cl(arch),display:"inline-block",marginRight:6}}/>
            {arch}<div style={{fontSize:10,opacity:0.65,marginTop:2}}>{TIER[arch]}</div>
          </button>);})}
      </div>
      {selArch && (
        <div style={{background:"white",border:"2px solid "+cl(selArch),borderRadius:12,padding:20,marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:12,height:12,borderRadius:6,background:cl(selArch)}}/>
            <span style={{fontWeight:700,fontSize:16,color:"#111827"}}>{selArch}</span>
            <Badge bg="#F3F4F6" tx="#374151">{TIER[selArch]}</Badge>
          </div>
          <p style={{fontSize:13,color:"#4B5563",lineHeight:1.6,margin:"0 0 14px"}}>{DESC[selArch]}</p>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1px",color:"#9CA3AF",marginBottom:8}}>TOP EXAMPLES BY PURITY</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {(PX[selArch]||[]).map(function(ex,i){return(<div key={i} style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,padding:"8px 12px",fontSize:12}}><div style={{fontWeight:600,color:"#111827"}}>{ex.p}</div><div style={{color:"#6B7280"}}>{ex.t} - {ex.s}</div><div style={{color:cl(selArch),fontWeight:700,marginTop:2}}>Purity {ex.u.toFixed(2)}</div></div>);})}
          </div>
        </div>
      )}
    </div>
  );
}
