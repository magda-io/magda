import React, { FunctionComponent } from "react";
import ReactSelect from "react-select/async";
import { ValueType } from "react-select/src";
import fetch from "isomorphic-fetch";
import { config } from "config";
import RegionSelectStyles from "./RegionSelectStyles";

import { Region } from "helpers/datasetSearch";

const loadOptions = (props: PropsType) => async (inputValue) => {
    if (!props.steRegion) return [];
    const queryStr = inputValue.trim();
    const res = await fetch(
        `${config.searchApiBaseUrl}regions?type=SA4${
            props.steRegion && props.steRegion.regionId
                ? `&lv2Id=${encodeURIComponent(props.steRegion.regionId)}`
                : ""
        }${queryStr ? `&query=${encodeURIComponent(queryStr)}` : ""}`
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
    countryRegion?: ValueType<Region>;
    steRegion?: ValueType<Region>;
    value?: ValueType<Region>;
    regionId?: string;
    onChange?: (
        option: ValueType<Region>,
        notResetOtherRegions?: Boolean
    ) => void;
}

const RegionSelect: FunctionComponent<PropsType> = (props) => {
    const { countryRegion, steRegion } = props;

    let placeHolderText = "Please select region...";

    if (!countryRegion && !steRegion) {
        placeHolderText = "Please select country and state first.";
    } else if (!steRegion) {
        placeHolderText = "Please select state first.";
    }

    const isDisabled = countryRegion && steRegion ? false : true;

    return (
        <div className="region-select">
            <ReactSelect<Region>
                key={(() => {
                    const keyParts = [
                        props.regionId ? props.regionId : "",
                        countryRegion ? countryRegion.regionId : "",
                        steRegion ? steRegion.regionId : ""
                    ];
                    return keyParts.join("|");
                })()}
                isClearable
                cacheOptions
                defaultOptions
                value={props.value}
                loadOptions={loadOptions(props)}
                getOptionLabel={(option) => option.regionName as string}
                getOptionValue={(option) => option.regionId as string}
                styles={RegionSelectStyles}
                placeholder={placeHolderText}
                isDisabled={isDisabled}
                onChange={(option) =>
                    typeof props.onChange === "function" &&
                    props.onChange(option)
                }
            />
        </div>
    );
};

export default RegionSelect;
