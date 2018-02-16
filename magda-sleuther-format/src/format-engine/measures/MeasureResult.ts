import { Formats } from "../formats";

export default interface MeasureResult {
    formats: Formats[];
    distribution: any;
    measureRating: number
}