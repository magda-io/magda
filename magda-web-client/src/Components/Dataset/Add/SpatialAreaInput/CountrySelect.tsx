import React, { FunctionComponent } from "react";
import ReactSelect from "react-select/async";
import { ValueType } from "react-select/src";
import fetch from "isomorphic-fetch";
import { config } from "config";
import CountrySelectStyles from "./CountrySelectStyles";

import { Region } from "helpers/datasetSearch";
export type OptionType = Region;

const loadOptions = (props: PropsType) => async (inputValue) => {
    const queryStr = inputValue.trim();
    const res = await fetch(
        `${config.searchApiBaseUrl}regions?type=COUNTRY${
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
        data.regions.forEach((region) => {
            if (region.regionId === props.regionId) {
                typeof props.onChange === "function" &&
                    props.onChange(region, true);
            }
        });
    }
    return data.regions;
};

interface PropsType {
    value?: ValueType<Region>;
    regionId?: string;
    onChange?: (
        option: ValueType<Region>,
        notResetOtherRegions?: Boolean
    ) => void;
}

const CountrySelect: FunctionComponent<PropsType> = (props) => {
    return (
        <div className="country-select">
            <ReactSelect<OptionType>
                key={props.regionId ? props.regionId : ""}
                isClearable
                cacheOptions
                defaultOptions
                value={props.value}
                loadOptions={loadOptions(props)}
                getOptionLabel={(option) => option.regionName as string}
                getOptionValue={(option) => option.regionId as string}
                placeholder={"Please select a country..."}
                styles={CountrySelectStyles}
                onChange={(option) =>
                    typeof props.onChange === "function" &&
                    props.onChange(option)
                }
            />
        </div>
    );
};

export default CountrySelect;
