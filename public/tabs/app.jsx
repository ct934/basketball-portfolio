/* app.jsx -- tab registry, top-level App shell, and ReactDOM mount.
   Must load LAST (after all tab component files). */

var TABS = ["About","Archetypes Impact","Best Combos","Trends","Team Lookup","Players","Compare Teams","Build a Team","How It Works"];


function App(){
  var s=useState(0),tab=s[0],setTab=s[1];
  var sFs=useState(false),isFs=sFs[0],setIsFs=sFs[1];
  var rootRef=React.useRef(null);
  var comps=[Intro,BuildToWin,BestCombos,Trends,TeamLookup,Players,TeamComparison,BuildTeam,Methodology];
  var Comp=comps[tab];

  // Keep state in sync if the user exits fullscreen via Esc
  useEffect(function(){
    function onChange(){
      var fsEl=document.fullscreenElement||document.webkitFullscreenElement;
      setIsFs(!!fsEl);
    }
    document.addEventListener("fullscreenchange",onChange);
    document.addEventListener("webkitfullscreenchange",onChange);
    return function(){
      document.removeEventListener("fullscreenchange",onChange);
      document.removeEventListener("webkitfullscreenchange",onChange);
    };
  },[]);

  function toggleFullscreen(){
    var el=rootRef.current;
    if(!el) return;
    var fsEl=document.fullscreenElement||document.webkitFullscreenElement;
    if(!fsEl){
      if(el.requestFullscreen) el.requestFullscreen();
      else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } else {
      if(document.exitFullscreen) document.exitFullscreen();
      else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  }

  // Fullscreen icon (expand) vs compress icon
  var icon = isFs
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>;

  return(
    <div ref={rootRef} style={{fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",background:"#F8F9FB",minHeight:"100vh",position:"relative",overflowY:isFs?"auto":"visible",height:isFs?"100vh":"auto"}}>
      <div style={{background:"#0F2044",borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
        <div style={{maxWidth:980,margin:"0 auto",padding:"0 16px",display:"flex",alignItems:"center",height:50}}>
          <div style={{fontSize:15,fontWeight:800,color:"white"}}>Basketball Archetype Analysis</div>
          <div style={{flex:1}}/>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.45)"}}>D1 - 2021 to 2026</div>
        </div>
      </div>
      <div style={{background:"white",borderBottom:"1px solid #E5E7EB",position:"sticky",top:0,zIndex:10}}>
        <div style={{maxWidth:980,margin:"0 auto",padding:"0 16px",display:"flex",overflowX:"auto"}}>
          {TABS.map(function(t,i){return(<button key={t} onClick={function(){setTab(i);}} style={{padding:"11px 15px",background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:tab===i?700:400,color:tab===i?"#0F2044":"#6B7280",borderBottom:"2.5px solid "+(tab===i?"#0F2044":"transparent"),whiteSpace:"nowrap"}}>{t}</button>);})}
        </div>
      </div>
      <div style={{minHeight:"calc(100vh - 100px)"}}><Comp/></div>

      {/* Fullscreen toggle -- fixed to bottom-right */}
      <button onClick={toggleFullscreen}
        title={isFs?"Exit full screen":"View full screen"}
        style={{position:"fixed",bottom:20,right:20,zIndex:50,
          display:"flex",alignItems:"center",gap:7,
          background:"#0F2044",color:"white",border:"none",borderRadius:10,
          padding:"10px 14px",cursor:"pointer",fontSize:12,fontWeight:600,
          boxShadow:"0 4px 14px rgba(15,32,68,0.35)"}}>
        {icon}
        <span>{isFs?"Exit":"Full screen"}</span>
      </button>
    </div>
  );
}


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
