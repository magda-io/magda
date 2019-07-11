import React, { FunctionComponent } from "react";
import ReactSelect from "react-select/async";
import { ValueType } from "react-select/src";
import fetch from "isomorphic-fetch";
import { config } from "config";
import StateSelectStyles from "./StateSelectStyles";

import { Region } from "helpers/datasetSearch";
export type OptionType = Region;

const loadOptions = (props: PropsType) => async inputValue => {
    const queryStr = inputValue.trim();
    const res = await fetch(
        `${config.searchApiUrl}regions?type=STE${
            queryStr ? `&query=${encodeURIComponent(queryStr)}` : ""
        }`
    );
    if (res.status !== 200) {
        throw new Error("response.statusText");
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.regions)) {
        throw new Error("Invalid server response");
    }
    if (props.regionId && !props.value) {
        // --- set initial prepopulated value
        data.regions.forEach(region => {
            if (region.regionId === props.regionId) {
                typeof props.onChange === "function" && props.onChange(region);
            }
        });
    }
    return data.regions;
};

interface PropsType {
    value?: ValueType<Region>;
    regionId?: string;
    onChange?: (option: ValueType<Region>) => void;
}

const StateSelect: FunctionComponent<PropsType> = props => {
    return (
        <div className="state-select">
            <ReactSelect<OptionType>
                key={props.regionId ? props.regionId : ""}
                isClearable
                cacheOptions
                defaultOptions
                value={props.value}
                loadOptions={loadOptions(props)}
                getOptionLabel={option => option.regionName as string}
                getOptionValue={option => option.regionId as string}
                isOptionSelected={option =>
                    option &&
                    option.regionId &&
                    option.regionId === props.regionId
                        ? true
                        : false
                }
                placeholder={"Please select a state..."}
                styles={StateSelectStyles}
                onChange={option =>
                    typeof props.onChange === "function" &&
                    props.onChange(option)
                }
            />
        </div>
    );
};

export default StateSelect;
