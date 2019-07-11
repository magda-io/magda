import React, { FunctionComponent } from "react";
import ReactSelect from "react-select/async";
import { ValueType } from "react-select/src";
import fetch from "isomorphic-fetch";
import { config } from "config";
import RegionSelectStyles from "./RegionSelectStyles";

import { Region } from "helpers/datasetSearch";

const loadOptions = (region: ValueType<Region>) => async inputValue => {
    if (!region) return [];
    const queryStr = inputValue.trim();
    const res = await fetch(
        `${config.searchApiUrl}regions?type=SA4${
            region ? `&steId=${encodeURIComponent(region.regionId)}` : ""
        }${queryStr ? `&query=${encodeURIComponent(queryStr)}` : ""}`
    );
    if (res.status !== 200) {
        throw new Error("response.statusText");
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.regions)) {
        throw new Error("Invalid server response");
    }
    return data.regions;
};

interface PropsType {
    steRegion?: ValueType<Region>;
    value?: ValueType<Region>;
    onChange?: (option: ValueType<Region>) => void;
}

const RegionSelect: FunctionComponent<PropsType> = props => {
    const { steRegion } = props;

    const placeHolderText = steRegion
        ? "Please select region..."
        : "Please select a state first.";
    const isDisabled = steRegion ? false : true;

    return (
        <div className="region-select">
            <ReactSelect<Region>
                key={steRegion ? steRegion.regionId : ""}
                isClearable
                cacheOptions
                defaultOptions
                value={props.value}
                loadOptions={loadOptions(steRegion)}
                getOptionLabel={option => option.regionName as string}
                getOptionValue={option => option.regionId as string}
                styles={RegionSelectStyles}
                placeholder={placeHolderText}
                isDisabled={isDisabled}
                onChange={option =>
                    typeof props.onChange === "function" &&
                    props.onChange(option)
                }
            />
        </div>
    );
};

export default RegionSelect;
