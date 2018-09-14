import MeasureEvalResult from "../../format-engine/MeasureEvalResult";
import MeasureEvaluationSet from "../../format-engine/measures/MeasureEvaluationSet";

import {} from "mocha";
import { expect } from "chai";
// import chai
// import sinon

//import MeasureResult from "../../format-engine/measures/MeasureResult";
//import ProbeResult from "../../format-engine/measures/ProbeResult";
//import MeasureAspect from "../../format-engine/measures/aspects/MeasureAspect";

import getDcatProcessedData from "../../format-engine/measures/processed-functions/dcatProcessedFns";
import getDownloadProcessedData from "../../format-engine/measures/processed-functions/downloadProcessedFns";
import getExtensionProcessedData from "../../format-engine/measures/processed-functions/extensionProcessedFns";
import getBestMeasureResult from "../../format-engine/measureEvaluatorByHierarchy";

describe("Measure Eval", function(this: Mocha.ISuiteCallbackContext) {
    /**
     * The hierarchy evaluation module returns the downloadMeasure's result if it isn't null, else extension measure's result, if not null,
     * or else the dcatMeasure's result. If all of them are null then the evaluator should return no value (null)
     */
    it("test whether it returns a correct Format (not MeasureResult) based off the hierarchy function only", function() {
        // 0th index = dcat, 1st index = extension, 2nd index = download
        // 0 = measureResult is null, 1 = measureResult returned a value
        const combinationTable = [
            [0, 0, 0],
            [1, 1, 1],
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
            [1, 1, 0],
            [0, 1, 1],
            [1, 0, 1]
        ];

        // turn table data into actual results to test
        combinationTable.forEach(function(combination) {
            // figure out actual result [ expect(actualResult) ]
            let dcatSet: MeasureEvaluationSet = {
                measureResult: {
                    formats: [
                        {
                            format: "DOCX",
                            correctConfidenceLevel: 0
                        }
                    ],
                    state: null,
                    distribution: null
                },
                getProcessedData: getDcatProcessedData
            };

            let extensionSet: MeasureEvaluationSet = {
                measureResult: {
                    formats: [
                        {
                            format: "XLSX",
                            correctConfidenceLevel: 0
                        }
                    ],
                    state: null,
                    distribution: null
                },
                getProcessedData: getExtensionProcessedData
            };

            let downloadSet: MeasureEvaluationSet = {
                measureResult: {
                    formats: [
                        {
                            format: "PDF",
                            correctConfidenceLevel: 0
                        }
                    ],
                    state: null,
                    distribution: null
                },
                getProcessedData: getDownloadProcessedData
            };

            if (combination[0] <= 0) {
                dcatSet.measureResult = null;
            }

            if (combination[1] <= 0) {
                extensionSet.measureResult = null;
            }

            if (combination[2] <= 0) {
                downloadSet.measureResult = null;
            }

            let actualResult = getBestMeasureResult([
                dcatSet,
                extensionSet,
                downloadSet
            ]);

            // figure out expected result [ .to.be.eql(expectedResult) ]:
            let expectedResult: MeasureEvalResult = {
                format: {
                    format: "OTHER",
                    correctConfidenceLevel: 0
                },
                absConfidenceLevel: null,
                distribution: null
            };

            if (combination[2] >= 1) {
                expectedResult.format.format = "PDF";
                expectedResult.absConfidenceLevel = 90;
            } else if (combination[1] >= 1) {
                expectedResult.format.format = "XLSX";
                expectedResult.absConfidenceLevel = 70;
            } else if (combination[0] >= 1) {
                expectedResult.format.format = "DOCX";
                expectedResult.absConfidenceLevel = 33;
            } else {
                expectedResult = null;
            }

            console.log("doing test: " + combination.toString());
            expect(actualResult).to.eql(expectedResult);
        });
    });

    it("should return null when the input is null", function() {
        expect(getBestMeasureResult(null)).to.eql(null);
    });

    it("should return null when input is empty", function() {
        expect(getBestMeasureResult([])).to.eql(null);
    });
});
