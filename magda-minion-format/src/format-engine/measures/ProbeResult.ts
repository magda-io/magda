/**
 * A device that allows you to figure out what position of code a measure function got into, and or what variables a measure function had when returning a certain result
 */
export default interface ProbeResult {
    id: string;
}

/**
 * an enum of probes that all Measures should implement
 */
export enum CommonProbes {
    CANT_DEDUCE_FORMAT = "cantDeduceFormat"
}
