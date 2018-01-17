//require("util.promisify/shim")();
//import { promisify } from "util";
import * as SummaryTool from "node-summary"

export function getSummaryFromURL(url: string) {
    //let summarize = promisify(SummaryTool.summarizeFromUrl);
    /*summarize(url).then(summary => {
        console.l
    })
    .catch(err => {
        console.log(err);
    });*/
    let info = {
        err: true,
        summary: ""
    }
    SummaryTool.summarizeFromUrl(url, function(err: any, summary: string) {
         info = {err: err, summary: summary}
    });
    return info;
    
}
