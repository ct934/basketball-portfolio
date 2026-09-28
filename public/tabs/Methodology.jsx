/* Methodology.jsx -- part of the Archetype Analysis Dashboard
   Loaded as a global (no import/export); depends on shared.jsx + data.js. */

// ---- METHODOLOGY ----
function Methodology(){
  var steps=[
    {n:"01",title:"Player Data",body:"Box score and play-by-play stats for all scholarship D1 players across five seasons (2021-22 through 2025-26), converted to per-40 and percentile-ranked within tier."},
    {n:"02",title:"Tier Classification",body:"Each player assigned to Guard/Wing (Pos=G) or Big Man (Pos=F) tier. Guards are scored on 5 archetypes; Bigs on 3."},
    {n:"03",title:"Archetype Scoring",body:"Within each tier, every player scored 0-1.00 on each archetype using a weighted sum of percentile-ranked stats. Weights were derived from K-means cluster analysis of 15,870 player-seasons. Highest score = Primary Archetype."},
    {n:"04",title:"Purity Score",body:"Purity = (Primary Score - Secondary Score) / 0.30, capped at 1.0. A purity of 1.0 means the player's top score is 0.30+ above their second-best -- a clear specialist."},
    {n:"05",title:"Role Versatility",body:"Versatility = the player's SECOND-best archetype fit (Primary Score - 0.30 x Purity). It is deliberately NOT '1 - purity': a player scoring 0.00 on both their top two archetypes has a tiny gap (purity 0) but fits nothing at all. Requiring a strong SECOND fit screens those out, so a high score means the player is good at their main role AND nearly as good at another. 0.85+ = Dual-Threat, 0.75+ = Versatile. Note: the model scores Guard/Wing players only against the 5 G/W archetypes and Bigs only against the 3 Big archetypes, so a secondary role is always within the same tier. This measures role flexibility within a position group, not guard-to-big positional flex."},
    {n:"06",title:"8-Archetype System",body:"This version uses 8 archetypes built from a new weight system (rather than consolidating dual labels). 5 Guard/Wing: Pure Shooter, Shot-Making Guard, Playmaker, Athletic Finisher, Pick-and-Roll Creator. 3 Big Man: Stretch Big, Athletic Big, Traditional Big."},
    {n:"06",title:"Team Compositions",body:"For each team-season, we compute the percentage of roster players in each of the 8 archetypes. These vectors form the basis for all correlation and cosine similarity analyses."},
    {n:"07",title:"Performance Metrics",body:"Team performance uses KenPom-style adjusted efficiency metrics: Adj. Efficiency Margin (AdjEM = AdjOE - AdjDE), Adj. Offensive Efficiency, Adj. Defensive Efficiency, and Adj. Tempo. All adjusted for opponent strength."},
    {n:"08",title:"Correlation Analysis",body:"Pearson correlations are computed between each archetype's roster % and each performance metric across all 1,646 matched team-seasons. These are the raw correlations in Archetypes Impact."},
    {n:"09",title:"Quality Confound (CRITICAL)",body:"Raw correlations are heavily inflated by recruiting quality. Partial correlations controlling for KenPom quality rank -- now computed for all four metrics (EM, OE, DE, Tempo) -- show most of the raw signal disappears. Athletic Big's raw +0.318 EM correlation drops to +0.079 once quality is controlled."},
    {n:"10",title:"Cosine Similarity",body:"Team Comparison uses cosine similarity on the 8-dimensional archetype composition vectors. Teams with identical roster DNA score 1.0; completely non-overlapping archetypes approach 0.0. Computed on-demand in the browser."}
  ];

  var formulas=[
    {arch:"Pure Shooter",tier:"Guard/Wing",f:"0.300 x 3PAr + 0.250 x CNR3 FGA/G + 0.200 x ATB3 FGA/G + 0.150 x %3PTS + 0.100 x eFG%"},
    {arch:"Playmaker",tier:"Guard/Wing",f:"0.256 x AST/40 + 0.252 x AST% + 0.222 x AST Rim+Paint/40 + 0.208 x CRTD/G + 0.200 x AST/TOV + 0.064 x STL%"},
    {arch:"Athletic Finisher",tier:"Guard/Wing",f:"0.220 x REB/40 + 0.200 x PITP PTS/40 + 0.200 x %PITP + 0.180 x FTA Rate + 0.120 x Rim FGA/G + 0.080 x And1/G"},
    {arch:"Pick-and-Roll Creator",tier:"Guard/Wing",f:"0.280 x ATB3 FGA/G + 0.200 x 3PAr + 0.180 x MR FGA/G + 0.160 x USG% + 0.120 x AST Rim+3s/40 + 0.060 x SCP PTS/40"},
    {arch:"Shot-Making Guard",tier:"Guard/Wing",f:"0.220 x PTS/40 + 0.220 x AST/40 + 0.180 x USG% + 0.150 x Rim FGA/G + 0.130 x %PITP + 0.100 x PITP PTS/40"},
    {arch:"Stretch Big",tier:"Big Man",f:"0.280 x CNR3 FGA/G + 0.250 x 3PAr + 0.220 x ATB3 FGA/G + 0.210 x %3PTS + 0.040 x eFG%"},
    {arch:"Athletic Big",tier:"Big Man",f:"0.280 x Rim FGA/G + 0.220 x DUNK aFGM/G %ile + 0.200 x REB/40 + 0.150 x ORB% + 0.100 x FTA Rate + 0.050 x BLK/40"},
    {arch:"Traditional Big",tier:"Big Man",f:"0.280 x %PITP + 0.220 x ORB% + 0.200 x BLK% + 0.170 x FTA Rate + 0.080 x PITP PTS/40 + 0.050 x And1/G"}
  ];

  return(
    <div style={{maxWidth:860,margin:"0 auto",padding:"24px 16px"}}>
      <h2 style={{fontSize:22,fontWeight:800,color:"#111827",margin:"0 0 4px"}}>How It Works</h2>
      <p style={{fontSize:13,color:"#6B7280",margin:"0 0 22px"}}>Full methodology, formula reference, and statistical caveats.</p>
      {steps.map(function(step){return(<div key={step.n} style={{display:"flex",gap:14,marginBottom:16,background:"white",border:"1px solid #E5E7EB",borderRadius:11,padding:16}}><div style={{flex:"0 0 30px",height:30,borderRadius:7,background:"#0F2044",color:"white",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{step.n}</div><div><div style={{fontWeight:700,fontSize:14,color:"#111827",marginBottom:4}}>{step.title}</div><div style={{fontSize:13,color:"#6B7280",lineHeight:1.6}}>{step.body}</div></div></div>);})}

      <h3 style={{fontSize:16,fontWeight:700,color:"#111827",margin:"24px 0 6px"}}>Archetype Scoring Formulas</h3>
      <p style={{fontSize:12,color:"#6B7280",margin:"0 0 14px"}}>Each archetype score is a weighted sum of percentile-ranked stats (0-1 each). Weights sum to ~1.0.</p>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {formulas.map(function(fm){return(<div key={fm.arch} style={{background:"white",border:"1px solid #E5E7EB",borderLeft:"4px solid "+cl(fm.arch),borderRadius:9,padding:"12px 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><div style={{width:9,height:9,borderRadius:5,background:cl(fm.arch)}}/><span style={{fontWeight:700,fontSize:13,color:"#111827"}}>{fm.arch}</span><Badge bg="#F3F4F6" tx="#6B7280">{fm.tier}</Badge></div>
          <div style={{fontFamily:"ui-monospace,Menlo,monospace",fontSize:12,color:"#374151",lineHeight:1.5,background:"#F9FAFB",padding:"8px 10px",borderRadius:6}}>{fm.f}</div>
        </div>);})}
      </div>
    </div>
  );
}

// ---- MAIN APP ----
