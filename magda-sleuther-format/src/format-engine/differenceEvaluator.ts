import MeasureEvalResult from "./MeasureEvalResult";
//import MeasureResult from "./measures/MeasureResult";
import { Formats } from "./formats";
import MeasureResult from "src/format-engine/measures/MeasureResult";
import { Path } from "../format-engine/pathCreator";
import * as shortestAlgo from "./dijkstra"

/**
 * Evaluates the best MeasureEvalResult by finding the format that is more generally mentioned in all the measures.
 */
export default function getBestMeasureResult(
    candidates: MeasureResult[],
    formatVec: any
): MeasureEvalResult {
    if (!candidates || candidates.length < 1) {
        return null;
    }
    

    // get the paths
    // get all of the available formats from the measures
    // figure out the distances from 1 format to all other formats
    // add up those distances. Set unreachablepaths to = 1000
    // pick the format with the smallest distance
    // if there's 2 or more measure results with the same distance, pick the one with the highest human inputted rating.
    let paths: Path[] = [];
    // the closer to zero the value at index i is, the more similar it is to every other thing on here.
    let similarCoeff = []; 


}

function populateGraph(graph: any, paths: Path[]): any {

}