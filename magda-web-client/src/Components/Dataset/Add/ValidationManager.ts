import { config } from "config";
import { State } from "./DatasetAddCommon";
import * as JsonPath from "jsonpath";
import { RefObject } from "react";

/**
 * A global module to manage / coordinate validation workflow.
 * The overall workflow:
 * - every input (no matter it's type) should attempt to register itself to participant the validation
 */

/**
 * A list of field json path (query against [add dataset page state](https://github.com/magda-io/magda/blob/5d9adef14f8aeea5bf3039ecad7c362601393307/magda-web-client/src/Components/Dataset/Add/DatasetAddCommon.ts#L133) that should be validated / Mandatory.
 * We currently don't use json path here to query any json data.
 * Use json path as a standard way to name the mandatory field only.
 * e.g. ["$.dataset.title", "$.files[1].license", "$.dataset.defaultLicense"]
 */
export type ValidationFieldList = string[];

export type ElementType =
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | HTMLDivElement
    | HTMLSpanElement;

export interface ValidationItem {
    /**
     * the json path will be used:
     * - as the id of the ValidationItem
     * - to query input value from [add dataset page state](https://github.com/magda-io/magda/blob/5d9adef14f8aeea5bf3039ecad7c362601393307/magda-web-client/src/Components/Dataset/Add/DatasetAddCommon.ts#L133)
     *
     * @type {string}
     * @memberof ValidationItem
     */
    jsonPath: string;

    /**
     * Field label / name
     */
    label: string;

    /**
     * ValidationManager will call this function to turn on the `Invalid` style of the input ctrl
     * that is belong to this `ValidationItem` when necessary
     */
    setError: (errorMesssage: string) => void;

    /**
     * ValidationManager will call this function to turn off the `Invalid` style of the input ctrl
     * that is belong to this `ValidationItem` when necessary
     */
    clearError: () => void;

    /**
     * A react reference of a DOM element that belongs to this `ValidationItem`.
     * ValidationManager will try move this Dom element into viewport when necessary
     */
    elRef: RefObject<ElementType>;
}

const validationFieldList: ValidationFieldList = config.mandatoryFields;
let validationItems: ValidationItem[] = [];
let stateDataGetter: () => State;

export const setStateDataGetter = (getter: () => State) => {
    stateDataGetter = getter;
};

function getStateData() {
    if (typeof stateDataGetter === "undefined") {
        throw new Error("State data getter function is not set yet!");
    }
    return stateDataGetter();
}

function shouldValidate(jsonPath: string) {
    if (typeof stateDataGetter === "undefined") {
        // --- if stateDataGetter is not set, Validation function should be turned off
        return false;
    }
    if (validationFieldList.indexOf(jsonPath) !== -1) {
        return true;
    }
    const stateData = getStateData();
    const idx = validationFieldList.findIndex(fieldPath => {
        if (
            JsonPath.paths(stateData, fieldPath)
                .map(item => JsonPath.stringify(item))
                .indexOf(jsonPath) !== -1
        ) {
            return true;
        } else {
            return false;
        }
    });
    if (idx !== -1) {
        return true;
    } else {
        return false;
    }
}

export const registerValidationItem = (vItem: ValidationItem) => {
    if (!shouldValidate(vItem.jsonPath)) return;
    if (
        validationItems.findIndex(item => item.jsonPath === vItem.jsonPath) !==
        -1
    ) {
        return;
    }
    validationItems.push(vItem);
};

export const deregisterValidationItem = (jsonPath: string) => {
    validationItems = validationItems.filter(
        item => item.jsonPath !== jsonPath
    );
};

function isEmptyValue(jsonPath: string) {
    const stateData = getStateData();
    const value = JsonPath.query(stateData, jsonPath)[0];
    if (typeof value === "undefined" || value === null) {
        return true;
    }
    if (typeof value === "string" && value.trim() === "") {
        return true;
    }
    return false;
}

function getItemFromJsonPath(jsonPath: string) {
    return validationItems.find(item => item.jsonPath === jsonPath);
}

/**
 * Input should call this function when focus is removed from it
 *
 * @param {string} jsonPath
 * @returns {boolean} True = the field is valid; False = the field is invalid;
 */
export const onInputFocusOut = (jsonPath: string) => {
    const item = getItemFromJsonPath(jsonPath);
    if (typeof item === "undefined") {
        return false;
    }
    if (isEmptyValue(jsonPath)) {
        item.setError(`\`${item.label}\` is a mandatory field.`);
        return false;
    } else {
        item.clearError();
        return true;
    }
};

/**
 * Validate all registered iputs.
 * This function should be called when user requests to move to next page.
 * This function will:
 * - Re-validate all inputs
 * - Set/unset invalid status of the inputs
 * - Move first invalid input (if any) into the viewport
 *
 * @returns {boolean} True = all fields are valid; False = there is at least one field is invalid;
 */
export const validateAll = () => {
    let offsetY: number;
    let elRef: RefObject<HTMLElement> | undefined;

    validationItems.forEach(item => {
        if (!onInputFocusOut(item.jsonPath)) {
            if (!item.elRef.current) {
                // --- if element ref is not ready
                // --- skip moving viewport
                return true;
            }
            const offset = getOffset(item.elRef);
            if (typeof offsetY === "undefined") {
                elRef = item.elRef;
                if (offset) {
                    offsetY = offset.top;
                }
            } else if (offset && offset.top < offsetY) {
                elRef = item.elRef;
                offsetY = offset.top;
            }
            return true;
        } else {
            return false;
        }
    });

    if (typeof elRef !== "undefined" && elRef.current) {
        // --- there is an invalid input
        // --- try to move into viewport
        // --- please note: we use [Scroll behavior polyfill](https://github.com/iamdustan/smoothscroll)
        elRef.current.scrollIntoView({ behavior: "smooth" });
        if (typeof elRef.current.focus === "function") {
            elRef.current.focus();
        }
    }

    if (typeof elRef === "undefined") {
        return true;
    } else {
        return false;
    }
};

export const getOffset = (el: RefObject<HTMLElement>) => {
    if (!el.current) {
        return null;
    }
    const rect = el.current.getBoundingClientRect();
    return {
        top: rect.top + document.body.scrollTop,
        left: rect.left + document.body.scrollLeft
    };
};

export const deregisterAllValidationItem = () => {
    validationItems = [];
};
