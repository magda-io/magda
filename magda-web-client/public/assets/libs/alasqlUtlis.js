(function initialization(){
    alasql.setXLSX(XLSX);
    const urlInfo = URL.parse(location.href);
    const refToken = urlInfo.searchParams.get("refToken");
    if(!refToken) {
        throw new Error("Failed to initialise AlaSQL: cannot location refToken" );
    }
    const source = async(...args)=>{
        await window.parent[`alasqlSourceFunc${refToken}`].apply(null, args);
    }; 
    alasql.from.source = source;
    alasql.from.SOURCE = source;
    window.parent[`onAlaSQLIframeLoaded${refToken}`]();
})();
