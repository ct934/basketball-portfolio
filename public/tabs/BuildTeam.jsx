/* BuildTeam.jsx -- part of the Archetype Analysis Dashboard
   Loaded as a global (no import/export); depends on shared.jsx + data.js. */

// ---- BUILD A TEAM ----
function BuildTeam(){
  var stStatus=useStats();
  var d2Status=useD2Players();
  var htStatus=useTeamHeights();
  function vspVal(idx,key){ var r=verspRow(idx); return (r&&r[key]!=null)?r[key]:null; }
  var s1=useState([]),roster=s1[0],setRoster=s1[1];
  var s2=useState(""),q=s2[0],setQ=s2[1];
  var s3=useState("5"),seasF=s3[0],setSeasF=s3[1];
  var s4=useState(null),proj=s4[0],setProj=s4[1];
  var s5=useState(false),inclD2=s5[0],setInclD2=s5[1];

  var MIN=5, MAX=12;
  var scNum=parseInt(seasF);

  // Search pool: D1 players from selected season + (optionally) D2 prospects
  var pool=useMemo(function(){
    if(!q || q.length<2) return [];
    var ql=q.toLowerCase();
    var chosen={};
    roster.forEach(function(r){chosen[r.key]=true;});
    var out=[];
    var i;
    for(i=0;i<ALLP.length;i++){
      var p=ALLP[i];
      if(p[7]!==scNum) continue;
      if(p[0].toLowerCase().indexOf(ql)===-1 && p[1].toLowerCase().indexOf(ql)===-1) continue;
      var key=p[0]+"|"+p[1]+"|"+p[7];
      if(chosen[key]) continue;
      out.push({key:key,name:p[0],team:p[1],arch:DL[p[2]],archIdx:p[2],purity:p[4]>=0?p[4]:null,idx:i,d2:false,
                vers:versScore(p),secIdx:(p[6]>=0&&p[6]<DL.length)?p[6]:null});
      if(out.length>=10) break;
    }
    // D2 prospects (from the translation model)
    if(inclD2 && D2_STATUS==="ready" && D2P){
      for(i=0;i<D2P.length;i++){
        var dp=D2P[i];
        if(dp.n.toLowerCase().indexOf(ql)===-1 && dp.tm.toLowerCase().indexOf(ql)===-1) continue;
        var dkey="D2|"+dp.n+"|"+dp.tm;
        if(chosen[dkey]) continue;
        out.push({key:dkey,name:dp.n,team:dp.tm,arch:DL[dp.a],archIdx:dp.a,purity:null,idx:-1,
                  d2:true,ps:dp.ps,cats:dp.c,cl:dp.cl,tier:dp.g,d2s:dp.d2s});
        if(out.length>=16) break;
      }
    }
    return out;
  },[q,seasF,roster,inclD2,d2Status]);

  function addPlayer(pl){
    if(roster.length>=MAX) return;
    setRoster(roster.concat([pl]));
    setQ("");
    setProj(null);
  }
  function removePlayer(key){
    setRoster(roster.filter(function(r){return r.key!==key;}));
    setProj(null);
  }
  function clearAll(){ setRoster([]); setProj(null); }

  // Composition vector from current roster
  var comp=useMemo(function(){
    var counts=DL.map(function(){return 0;});
    roster.forEach(function(r){counts[r.archIdx]++;});
    var total=roster.length||1;
    return counts.map(function(c){return c/total*100;});
  },[roster]);

  function project(){
    if(roster.length<MIN) return;
    var compFrac=comp.map(function(v){return v/100.0;});

    // 1. NEAREST NEIGHBOR — cosine sim against all real team-seasons, blended
    //    with roster height where known. Two rosters with the same archetype
    //    mix at 6'8" vs 7'1" avg height play very differently on the glass and
    //    at the rim, so height narrows the match beyond archetype alone.
    var compVec=comp; // percentages
    var htVals=roster.map(function(r){ return r.d2?null:vspVal(r.idx,"ht"); }).filter(function(x){return x!=null;});
    var rosterHt = htVals.length ? htVals.reduce(function(a,b){return a+b;},0)/htVals.length : null;
    var HRANGE=8; // inches; scales how sharply height mismatch penalizes similarity
    var scored=TDATA.map(function(t){
      var archSim=cosine(compVec,t.v);
      var combined=archSim;
      if(rosterHt!=null && htStatus==="ready"){
        var th=teamHeight(t.t,t.s);
        if(th!=null){
          var htSim=Math.max(0,1-Math.abs(rosterHt-th)/HRANGE);
          combined = archSim*0.82 + htSim*0.18;
        }
      }
      return {t:t.t,s:t.s,em:t.em,oe:t.oe,de:t.de,tempo:t.tempo,rank:t.rank,sim:combined};
    });
    scored.sort(function(a,b){return b.sim-a.sim;});
    var topN=scored.slice(0,10);
    // Weighted average by similarity
    var wsum=0,nem=0,noe=0,nde=0,ntempo=0;
    topN.forEach(function(t){var w=t.sim;wsum+=w;nem+=t.em*w;noe+=t.oe*w;nde+=t.de*w;ntempo+=t.tempo*w;});
    var nn={em:nem/wsum,oe:noe/wsum,de:nde/wsum,tempo:ntempo/wsum};
    var avgSim=topN.reduce(function(a,t){return a+t.sim;},0)/topN.length;

    // Roster height profile vs the D1 team-season distribution
    var htProfile=null;
    if(rosterHt!=null && THEIGHT_STATUS==="ready" && THEIGHT){
      var allHt=[]; var hk; for(hk in THEIGHT){ if(THEIGHT[hk]!=null) allHt.push(THEIGHT[hk]); }
      allHt.sort(function(a,b){return a-b;});
      var below=0,hi; for(hi=0;hi<allHt.length;hi++){ if(allHt[hi]<rosterHt) below++; }
      htProfile={avg:rosterHt, pctile:Math.round(below/allHt.length*100), nMissing:roster.length-htVals.length};
    }

    // 2. REGRESSION cross-check
    function regPredict(outcome){
      var c=REGR[outcome];
      var val=c.intercept;
      var i;
      for(i=0;i<DL.length;i++){ val+=c.weights[i]*(compFrac[i]-c.mean_comp[i]); }
      return val;
    }
    var reg={em:regPredict("em"),oe:regPredict("oe"),de:regPredict("de"),tempo:regPredict("tempo")};

    // 3. COMBO COVERAGE — which graded combos appear in roster
    var present={};
    DL.forEach(function(a,i){ if(comp[i]>0) present[a]=true; });
    var covered=COMBOS.filter(function(c){return present[c.a]&&present[c.b];});
    covered.sort(function(a,b){return b.avgEM-a.avgEM;});

    // 4. TALENT aggregate — per-player D1-equivalent talent percentile.
    //    D1 players: from their 14-feature percentiles (player_data.json).
    //    D2 players: from the translation model's D1-translated category scores
    //    (this is where competition adjustment enters — D2 raw dominance is
    //    already compressed into a realistic D1-equivalent grade).
    var statsProj=null;
    var talentKeys=["PTS/40 %ile","TS% %ile","USG% %ile","AST/40 %ile","REB/40 %ile"];
    var perPlayer=[]; var rr;
    for(var ri=0;ri<roster.length;ri++){
      rr=roster[ri];
      if(rr.d2){
        perPlayer.push(d2TalentIndex(rr.cats)); // 0-1, competition-adjusted
      } else if(PSTATS_STATUS==="ready"){
        var fv=statFeats(rr.idx);
        if(fv){
          var ti=0,tc=0;
          talentKeys.forEach(function(kk){var pos=PSFEATS.indexOf(kk);if(pos>=0){ti+=fv[pos];tc++;}});
          perPlayer.push(tc?ti/tc:0.5);
        }
      }
    }
    if(perPlayer.length>=5){
      var s=0,pi; for(pi=0;pi<perPlayer.length;pi++){ s+=perPlayer[pi]; }
      var talentIdx=s/perPlayer.length;             // 0-1
      var emFromTalent=(talentIdx-0.5)*44;          // +/-22 at extremes
      statsProj={talent:talentIdx,em:emFromTalent,n:perPlayer.length};
    }

    // 5. D2 SUMMARY — projected-success grades for any D2 prospects on the roster
    var d2Summary=null;
    var d2ros=roster.filter(function(r){return r.d2;});
    if(d2ros.length>0){
      var psSum=0; d2ros.forEach(function(r){psSum+=r.ps;});
      d2Summary={
        count:d2ros.length,
        avgPs:psSum/d2ros.length,
        players:d2ros.slice().sort(function(a,b){return b.ps-a.ps;}),
        corrQual:(D2META?D2META.corrQual:null)
      };
    }

    // 6. ROSTER FLEXIBILITY — how many archetypes can this roster actually cover?
    //    Primary coverage counts each player's main role. Effective coverage also
    //    counts a player's SECOND role if their secondary fit is credible (>=0.75),
    //    i.e. roles they could genuinely slide into. The gap between the two is the
    //    portal value of versatile players: they solve more roster problems.
    var primCov={}, effCov={}, flexPlayers=[];
    for(var fi=0;fi<roster.length;fi++){
      var fr=roster[fi];
      primCov[fr.archIdx]=true;
      effCov[fr.archIdx]=true;
      if(!fr.d2 && fr.vers!==null && fr.vers!==undefined && fr.vers>=0.75 && fr.secIdx!==null && fr.secIdx!==undefined){
        effCov[fr.secIdx]=true;
        flexPlayers.push(fr);
      }
    }
    function cnt(o){var c=0,k; for(k in o){ if(o.hasOwnProperty(k)) c++; } return c;}
    var flex={
      primary:cnt(primCov),
      effective:cnt(effCov),
      players:flexPlayers.slice().sort(function(a,b){return b.vers-a.vers;})
    };

    setProj({nn:nn,reg:reg,topN:topN,avgSim:avgSim,combos:covered,stats:statsProj,d2:d2Summary,flex:flex,ht:htProfile});
  }

  var canProject=roster.length>=MIN;
  var compShown=DL.map(function(a,i){return {arch:a,val:comp[i]};}).filter(function(x){return x.val>0;}).sort(function(a,b){return b.val-a.val;});

  return(
    <div style={{maxWidth:940,margin:"0 auto",padding:"24px 16px"}}>
      <h2 style={{fontSize:22,fontWeight:800,color:"#111827",margin:"0 0 4px"}}>Build a Team</h2>
      <p style={{fontSize:13,color:"#6B7280",margin:"0 0 18px"}}>Pick 5 to 12 players to assemble a custom roster, then project its efficiency profile. Projections blend the most similar real team-seasons with a regression cross-check. Flip on <strong>D2 prospects</strong> to mix in Division II players &mdash; their production is competition-adjusted through the D2&rarr;D1 translation model.</p>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,alignItems:"start"}}>
        {/* LEFT: player search + roster */}
        <div>
          <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
            {["1","2","3","4","5"].map(function(code){return(<button key={code} onClick={function(){setSeasF(code);setQ("");}} style={{padding:"4px 9px",fontSize:11,fontWeight:700,borderRadius:6,cursor:"pointer",background:seasF===code?"#0F2044":"white",color:seasF===code?"white":"#374151",border:"1px solid "+(seasF===code?"#0F2044":"#D1D5DB")}}>{SMAP[code]}</button>);})}
            <div style={{flex:1}}/>
            <button onClick={function(){setInclD2(!inclD2);}} title="Mix Division II prospects into the search, competition-adjusted via the translation model" style={{padding:"4px 10px",fontSize:11,fontWeight:700,borderRadius:6,cursor:"pointer",background:inclD2?"#7C3AED":"white",color:inclD2?"white":"#6D28D9",border:"1.5px solid "+(inclD2?"#7C3AED":"#C4B5FD"),display:"flex",alignItems:"center",gap:5}}>
              <span style={{width:6,height:6,borderRadius:3,background:inclD2?"white":"#7C3AED"}}/>D2 prospects{inclD2&&d2Status==="ready"?" \u2713":""}
            </button>
          </div>
          <input value={q} onChange={function(e){setQ(e.target.value);}} placeholder={roster.length>=MAX?"Roster full (12 max)":"Search player or team..."} disabled={roster.length>=MAX} style={{width:"100%",padding:"8px 11px",borderRadius:8,fontSize:13,border:"1.5px solid #D1D5DB",outline:"none",boxSizing:"border-box",background:roster.length>=MAX?"#F3F4F6":"white"}}/>
          {pool.length>0 && (
            <div style={{border:"1px solid #E5E7EB",borderRadius:8,marginTop:4,overflow:"hidden",maxHeight:260,overflowY:"auto"}}>
              {pool.map(function(pl){return(<button key={pl.key} onClick={function(){addPlayer(pl);}} style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",padding:"7px 11px",fontSize:12,background:pl.d2?"#FBFAFF":"white",border:"none",borderBottom:"1px solid #F3F4F6",cursor:"pointer"}}>
                <div style={{width:7,height:7,borderRadius:4,background:cl(pl.arch),flexShrink:0}}/>
                <span style={{color:"#111827",fontWeight:500}}>{pl.name}</span>
                {pl.d2 && <span style={{background:"#EDE9FE",color:"#6D28D9",fontSize:9,fontWeight:800,padding:"1px 4px",borderRadius:4,letterSpacing:"0.5px"}}>D2</span>}
                <span style={{flex:1}}/>
                <span style={{color:"#9CA3AF",fontSize:10}}>{pl.team}</span>
                <span style={{color:"#6B7280",fontSize:10}}>{pl.arch}</span>
                {!pl.d2 && pl.vers!==null && pl.vers>=0.75 && <VersBadge v={pl.vers}/>}
                {pl.d2 && <span style={{color:"#7C3AED",fontSize:10,fontWeight:700,width:30,textAlign:"right"}}>{pl.ps.toFixed(0)}</span>}
              </button>);})}
            </div>
          )}

          <div style={{marginTop:14,background:"white",border:"1px solid #E5E7EB",borderRadius:11,overflow:"hidden"}}>
            <div style={{padding:"9px 13px",background:"#F9FAFB",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:11,fontWeight:700,color:"#6B7280",letterSpacing:"0.5px"}}>ROSTER {roster.length}/{MAX}</span>
              {roster.length>0 && <button onClick={clearAll} style={{fontSize:10,color:"#DC2626",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>Clear all</button>}
            </div>
            <div style={{minHeight:80}}>
              {roster.length===0?<div style={{padding:18,textAlign:"center",color:"#9CA3AF",fontSize:12}}>Add at least {MIN} players to project</div>:roster.map(function(r){return(<div key={r.key} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 13px",borderBottom:"1px solid #F9FAFB",fontSize:12,background:r.d2?"#FBFAFF":"white"}}>
                <div style={{width:7,height:7,borderRadius:4,background:cl(r.arch),flexShrink:0}}/>
                <span style={{color:"#111827",fontWeight:500}}>{r.name}</span>
                {r.d2 && <span style={{background:"#EDE9FE",color:"#6D28D9",fontSize:9,fontWeight:800,padding:"1px 4px",borderRadius:4,letterSpacing:"0.5px"}}>D2</span>}
                <span style={{flex:1}}/>
                {!r.d2 && r.vers!==null && r.vers>=0.75 && <VersBadge v={r.vers}/>}
                {!r.d2 && <span style={{color:"#9CA3AF",fontSize:10,fontVariantNumeric:"tabular-nums"}}>{fmtHeight(vspVal(r.idx,"ht"))}</span>}
                <span style={{color:"#9CA3AF",fontSize:10}}>{r.team}</span>
                <span style={{color:"#6B7280",fontSize:10}}>{r.arch}</span>
                <button onClick={function(){removePlayer(r.key);}} style={{background:"none",border:"none",cursor:"pointer",color:"#DC2626",fontSize:14,padding:0,lineHeight:1}}>x</button>
              </div>);})}
            </div>
          </div>

          <button onClick={project} disabled={!canProject} style={{marginTop:12,width:"100%",padding:"11px",background:canProject?"#0F2044":"#D1D5DB",color:"white",border:"none",borderRadius:9,cursor:canProject?"pointer":"not-allowed",fontWeight:700,fontSize:14}}>
            {canProject?"Project This Roster":"Need "+(MIN-roster.length)+" more player"+((MIN-roster.length)===1?"":"s")}
          </button>
        </div>

        {/* RIGHT: composition + projection */}
        <div>
          {roster.length>0 && (
            <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:11,padding:15,marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6B7280",letterSpacing:"0.5px",marginBottom:10}}>ROSTER COMPOSITION</div>
              {compShown.map(function(it){return(<div key={it.arch} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                <div style={{width:7,height:7,borderRadius:4,background:cl(it.arch),flexShrink:0}}/>
                <span style={{fontSize:12,flex:1,color:"#374151"}}>{it.arch}</span>
                <div style={{width:80,height:6,background:"#F3F4F6",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:cl(it.arch),width:it.val+"%"}}/></div>
                <span style={{fontSize:11,color:"#6B7280",width:32,textAlign:"right"}}>{Math.round(it.val)}%</span>
              </div>);})}
            </div>
          )}

          {proj && (
            <div>
              <div style={{background:"linear-gradient(135deg,#0F2044,#1A3A6B)",borderRadius:11,padding:18,color:"white",marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:"1px",opacity:0.7,marginBottom:10}}>PROJECTED EFFICIENCY</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div><div style={{fontSize:32,fontWeight:800,color:proj.nn.em>=0?"#4ADE80":"#F87171"}}>{proj.nn.em>=0?"+":""}{proj.nn.em.toFixed(1)}</div><div style={{fontSize:11,opacity:0.7}}>Projected Adj. EM</div></div>
                  <div style={{textAlign:"right",fontSize:11,opacity:0.7}}><div>Confidence</div><div style={{fontSize:18,fontWeight:700,opacity:1,color:proj.avgSim>0.9?"#4ADE80":proj.avgSim>0.8?"#FBBF24":"#F87171"}}>{(proj.avgSim*100).toFixed(0)}%</div></div>
                </div>
                <div style={{display:"flex",gap:18,flexWrap:"wrap"}}>
                  {[["OE",proj.nn.oe],["DE",proj.nn.de],["Tempo",proj.nn.tempo]].map(function(it){return(<div key={it[0]}><div style={{fontSize:15,fontWeight:700}}>{it[1].toFixed(1)}</div><div style={{fontSize:10,opacity:0.6}}>Adj. {it[0]}</div></div>);})}
                </div>
              </div>

              <div style={{background:"#FFFBEB",border:"1px solid #FBBF24",borderRadius:9,padding:"10px 13px",marginBottom:14,fontSize:11,color:"#92400E",lineHeight:1.5}}>
                <strong>How to read this:</strong> The headline number is the similarity-weighted average of the 10 most comparable real team-seasons. Composition explains only ~22% of efficiency variance, so treat this as a directional signal, not a guarantee. Talent level still dominates.
              </div>

              <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:11,padding:15,marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6B7280",letterSpacing:"0.5px",marginBottom:8}}>REGRESSION CROSS-CHECK</div>
                <div style={{fontSize:11,color:"#9CA3AF",marginBottom:10}}>Independent estimate from a linear model fit on all 1,646 team-seasons.</div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                  {[["EM",proj.reg.em,"+"],["OE",proj.reg.oe,""],["DE",proj.reg.de,""],["Tempo",proj.reg.tempo,""]].map(function(it){return(<div key={it[0]}><div style={{fontSize:15,fontWeight:700,color:"#111827"}}>{it[2]&&it[1]>=0?"+":""}{it[1].toFixed(1)}</div><div style={{fontSize:10,color:"#9CA3AF"}}>Adj. {it[0]}</div></div>);})}
                </div>
              </div>

              {proj.stats && (
                <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:11,padding:15,marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#6B7280",letterSpacing:"0.5px",marginBottom:8}}>TALENT-BASED CHECK{proj.d2?" (D1 + D2 blended)":""}</div>
                  <div style={{fontSize:11,color:"#9CA3AF",marginBottom:10}}>Built from actual player quality, not just archetype mix. D1 players use their scoring/usage/efficiency/playmaking/rebounding percentiles; {proj.d2?"D2 players use the translation model's D1-adjusted category grades, so their weaker competition is already discounted.":"add D2 prospects to blend in competition-adjusted grades."}</div>
                  <div style={{display:"flex",gap:18,alignItems:"center",flexWrap:"wrap"}}>
                    <div><div style={{fontSize:22,fontWeight:800,color:proj.stats.em>=0?"#059669":"#DC2626"}}>{proj.stats.em>=0?"+":""}{proj.stats.em.toFixed(1)}</div><div style={{fontSize:10,color:"#9CA3AF"}}>Talent-implied EM</div></div>
                    <div style={{flex:1,minWidth:140}}>
                      <div style={{fontSize:10,color:"#9CA3AF",marginBottom:3}}>Roster talent index: {(proj.stats.talent*100).toFixed(0)}th percentile</div>
                      <div style={{height:8,background:"#F3F4F6",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",borderRadius:4,background:"linear-gradient(90deg,#3B82F6,#10B981)",width:(proj.stats.talent*100)+"%"}}/></div>
                    </div>
                  </div>
                </div>
              )}

              {proj.ht && (
                <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:11,padding:15,marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#6B7280",letterSpacing:"0.5px",marginBottom:8}}>ROSTER HEIGHT PROFILE</div>
                  <div style={{fontSize:11,color:"#9CA3AF",marginBottom:11}}>Average height feeds the nearest-neighbor match above, so the comp teams share a similar size profile, not just archetype mix. On its own, height is a weaker predictor than it looks &mdash; most of its raw link to winning is really a talent confound, and its link to defense doesn't survive quality adjustment at all.</div>
                  <div style={{display:"flex",gap:18,alignItems:"center",flexWrap:"wrap"}}>
                    <div><div style={{fontSize:22,fontWeight:800,color:"#374151"}}>{fmtHeight(proj.ht.avg)}</div><div style={{fontSize:10,color:"#9CA3AF"}}>Avg roster height</div></div>
                    <div style={{flex:1,minWidth:140}}>
                      <div style={{fontSize:10,color:"#9CA3AF",marginBottom:3}}>{proj.ht.pctile}th percentile vs all D1 team-seasons</div>
                      <div style={{height:8,background:"#F3F4F6",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",borderRadius:4,background:"linear-gradient(90deg,#3B82F6,#10B981)",width:proj.ht.pctile+"%"}}/></div>
                    </div>
                  </div>
                  {proj.ht.nMissing>0 && <div style={{fontSize:10,color:"#D97706",marginTop:8}}>{proj.ht.nMissing} player{proj.ht.nMissing>1?"s":""} on the roster {proj.ht.nMissing>1?"have":"has"} no height on file (excluded from the average, e.g. D2 prospects).</div>}
                </div>
              )}

              {proj.flex && (
                <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:11,padding:15,marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#6B7280",letterSpacing:"0.5px",marginBottom:8}}>ROSTER FLEXIBILITY</div>
                  <div style={{fontSize:11,color:"#9CA3AF",marginBottom:11}}>Roles this roster can cover. "Effective" also counts second roles that players could credibly slide into (second-best archetype fit of 0.75+) &mdash; that's the portal value of versatile players.</div>
                  <div style={{display:"flex",gap:22,alignItems:"center",flexWrap:"wrap",marginBottom:proj.flex.players.length?12:0}}>
                    <div><div style={{fontSize:22,fontWeight:800,color:"#374151"}}>{proj.flex.primary}<span style={{fontSize:13,color:"#9CA3AF"}}>/8</span></div><div style={{fontSize:10,color:"#9CA3AF"}}>Primary roles</div></div>
                    <div><div style={{fontSize:22,fontWeight:800,color:proj.flex.effective>proj.flex.primary?"#2563EB":"#374151"}}>{proj.flex.effective}<span style={{fontSize:13,color:"#9CA3AF"}}>/8</span></div><div style={{fontSize:10,color:"#9CA3AF"}}>Effective roles</div></div>
                    {proj.flex.effective>proj.flex.primary && (
                      <div style={{background:"#DBEAFE",color:"#1E40AF",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600}}>
                        +{proj.flex.effective-proj.flex.primary} extra role{proj.flex.effective-proj.flex.primary>1?"s":""} unlocked by versatile players
                      </div>
                    )}
                  </div>
                  {proj.flex.players.map(function(p,i){return(<div key={i} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5,fontSize:11}}>
                    <span style={{color:"#374151",fontWeight:500}}>{p.name}</span>
                    <VersBadge v={p.vers} showVal={true}/>
                    <span style={{flex:1}}/>
                    <span style={{color:"#6B7280",fontSize:10}}>{p.arch}</span>
                    <span style={{color:"#9CA3AF",fontSize:10}}>&rarr;</span>
                    <span style={{color:cl(DL[p.secIdx]),fontSize:10,fontWeight:600}}>{DL[p.secIdx]}</span>
                  </div>);})}
                  {!proj.flex.players.length && <div style={{fontSize:11,color:"#9CA3AF"}}>No multi-role players on this roster &mdash; every player is a specialist. Add a Versatile or Dual-Threat player to cover more roles with the same bodies.</div>}
                </div>
              )}

              {proj.d2 && (
                <div style={{background:"white",border:"1.5px solid #DDD6FE",borderRadius:11,padding:15,marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
                    <span style={{background:"#EDE9FE",color:"#6D28D9",fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:4,letterSpacing:"0.5px"}}>D2</span>
                    <span style={{fontSize:11,fontWeight:700,color:"#6B7280",letterSpacing:"0.5px"}}>PROSPECT TRANSLATION ({proj.d2.count})</span>
                  </div>
                  <div style={{fontSize:11,color:"#9CA3AF",marginBottom:11}}>Each D2 player's projected-success grade from the D2&rarr;D1 translation model (built on {D2META?D2META.nTransfers:464} real transfers). Higher = the game translates up more cleanly.</div>
                  <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap",marginBottom:12}}>
                    <div><div style={{fontSize:22,fontWeight:800,color:"#7C3AED"}}>{proj.d2.avgPs.toFixed(0)}</div><div style={{fontSize:10,color:"#9CA3AF"}}>Avg projected success</div></div>
                    <div style={{fontSize:10,color:"#9CA3AF",flex:1,minWidth:150}}>Model quality&rarr;success correlation is {proj.d2.corrQual}, so treat D2 grades as a rough tilt, not a promise.</div>
                  </div>
                  {proj.d2.players.map(function(p,i){var col=p.ps>=60?"#059669":p.ps>=48?"#D97706":"#DC2626";return(<div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,fontSize:11}}>
                    <span style={{flex:1,color:"#374151",fontWeight:500}}>{p.name}</span>
                    <span style={{color:"#9CA3AF",fontSize:10}}>{p.cl}</span>
                    <span style={{color:"#6B7280",fontSize:10,width:96,textAlign:"right"}}>{p.arch}</span>
                    <div style={{width:70,height:6,background:"#F3F4F6",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:col,width:Math.min(p.ps,100)+"%"}}/></div>
                    <span style={{width:26,textAlign:"right",fontWeight:700,color:col}}>{p.ps.toFixed(0)}</span>
                  </div>);})}
                </div>
              )}

              {proj.combos.length>0 && (
                <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:11,padding:15,marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#6B7280",letterSpacing:"0.5px",marginBottom:10}}>ARCHETYPE COMBOS IN THIS ROSTER</div>
                  {proj.combos.slice(0,6).map(function(c,i){var gs=gradeStyle(c.grade);return(<div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,fontSize:11}}>
                    <span style={{background:gs.bg,color:gs.tx,padding:"1px 6px",borderRadius:5,fontWeight:800,fontSize:10}}>{c.grade}</span>
                    <span style={{flex:1,color:"#374151"}}>{c.a} + {c.b}</span>
                    <span style={{fontWeight:700,color:c.avgEM>0?"#059669":"#DC2626"}}>{c.avgEM>0?"+":""}{c.avgEM.toFixed(1)} EM</span>
                  </div>);})}
                </div>
              )}

              <div style={{background:"white",border:"1px solid #E5E7EB",borderRadius:11,padding:15}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6B7280",letterSpacing:"0.5px",marginBottom:10}}>MOST SIMILAR REAL TEAMS</div>
                {proj.topN.map(function(t,i){return(<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:"1px solid #F9FAFB",fontSize:11}}>
                  <span style={{color:"#9CA3AF",width:14,textAlign:"right"}}>{i+1}.</span>
                  <span style={{flex:1,fontWeight:500,color:"#111827"}}>{t.t}</span>
                  <span style={{color:"#6B7280",width:38}}>{SMAP[t.s]}</span>
                  <span style={{width:34,textAlign:"right",fontWeight:700,color:t.em>=0?"#059669":"#DC2626"}}>{t.em>=0?"+":""}{t.em.toFixed(1)}</span>
                  <span style={{width:42,textAlign:"right",fontWeight:700,color:t.sim>0.9?"#059669":t.sim>0.8?"#D97706":"#9CA3AF"}}>{(t.sim*100).toFixed(0)}%</span>
                </div>);})}
              </div>
            </div>
          )}

          {!proj && roster.length>=MIN && (
            <div style={{background:"#F9FAFB",borderRadius:11,padding:24,textAlign:"center",color:"#9CA3AF",fontSize:13}}>Click "Project This Roster" to see the efficiency projection</div>
          )}
        </div>
      </div>
    </div>
  );
}
