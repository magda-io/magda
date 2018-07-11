export default function deleteCache(url: string, no: number) {
    
    if(url) delete require.cache[url];
    else {
        switch(no) {
            case 0:
                console.log("deleting onRecordFound");
                return delete require.cache["/home/tris/m/magda/magda/magda-sleuther-format/src/onRecordFound.ts"];
            case 1: 
                console.log("deleting st");
                return delete require.cache["/home/tris/m/magda/magda/magda-sleuther-format/src/inf/st.ts"];
        }
    }
}