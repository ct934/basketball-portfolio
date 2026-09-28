/* Trends.jsx -- part of the Archetype Analysis Dashboard
   Loaded as a global (no import/export); depends on shared.jsx + data.js. */

// ---- TRENDS ----
function Trends(){
  var s=useState(function(){var o={};DL.forEach(function(a){o[a]=true;});return o;}),vis=s[0],setVis=s[1];
  function toggle(a){setVis(function(p){var n=Object.assign({},p);n[a]=!n[a];return n;});}
  var f=TREND[0],l=TREND[TREND.length-1];
  var ch=DL.map(function(a){return{arch:a,delta:l[a]-f[a]};});ch.sort(function(a,b){return b.delta-a.delta;});
  var grow=ch.slice(0,3),decl=ch.slice(-3).reverse();
  return(
    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 16px"}}>
      <h2 style={{fontSize:22,fontWeight:800,color:"#111827",margin:"0 0 4px"}}>Archetype Trends</h2>
      <p style={{fontSize:13,color:"#6B7280",margin:"0 0 18px"}}>Share of D1 players per archetype, 2021-22 through 2025-26.</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:18}}>
        <div style={{background:"#DCFCE7",borderRadius:10,padding:14}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1px",color:"#166534",marginBottom:8}}>GROWING</div>
          {grow.map(function(c){return(<div key={c.arch} style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#166534",marginBottom:4}}><span style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:6,height:6,borderRadius:3,background:cl(c.arch),flexShrink:0}}/>{c.arch}</span><span style={{fontWeight:700}}>+{c.delta.toFixed(1)}pp</span></div>);})}
        </div>
        <div style={{background:"#FEE2E2",borderRadius:10,padding:14}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1px",color:"#991B1B",marginBottom:8}}>DECLINING</div>
          {decl.map(function(c){return(<div key={c.arch} style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#991B1B",marginBottom:4}}><span style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:6,height:6,borderRadius:3,background:cl(c.arch),flexShrink:0}}/>{c.arch}</span><span style={{fontWeight:700}}>{c.delta.toFixed(1)}pp</span></div>);})}
        </div>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}}>
        <button onClick={function(){var n={};DL.forEach(function(a){n[a]=true;});setVis(n);}} style={{fontSize:11,padding:"3px 9px",borderRadius:6,cursor:"pointer",background:"#0F2044",color:"white",border:"none",fontWeight:600}}>All</button>
        <button onClick={function(){var n={};DL.forEach(function(a){n[a]=false;});setVis(n);}} style={{fontSize:11,padding:"3px 9px",borderRadius:6,cursor:"pointer",background:"white",color:"#374151",border:"1px solid #D1D5DB",fontWeight:600}}>Clear</button>
        {DL.map(function(a){return(<button key={a} onClick={function(){toggle(a);}} style={{fontSize:11,padding:"3px 9px",borderRadius:6,cursor:"pointer",background:vis[a]?cl(a):"white",color:vis[a]?"white":"#6B7280",border:"1.5px solid "+(vis[a]?cl(a):"#D1D5DB")}}>{a}</button>);})}
      </div>
      <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:12,padding:16,height:360}}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={TREND} margin={{top:10,right:20,bottom:10,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
            <XAxis dataKey="season" tick={{fontSize:11}}/>
            <YAxis tick={{fontSize:10}} tickFormatter={function(v){return v.toFixed(0)+"%";}} width={40}/>
            <Tooltip formatter={function(v,n){return [v.toFixed(2)+"%",n];}}/>
            {DL.filter(function(a){return vis[a];}).map(function(a){return <Line key={a} type="monotone" dataKey={a} stroke={cl(a)} strokeWidth={2} dot={{r:2}}/>;})}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
