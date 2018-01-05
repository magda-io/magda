import {
    SelectedFormats
} from "./formats"

export abstract class Measure {
    /**
     * Returns a list of SelectedFormats deduced by the algorithm
     */
    abstract getSelectedFormats: SelectedFormats;
}