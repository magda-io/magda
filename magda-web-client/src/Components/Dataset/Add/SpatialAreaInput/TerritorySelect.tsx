import React, { FunctionComponent } from "react";
import ReactSelect from "react-select/async";
import { ValueType } from "react-select/src";
import fetch from "cross-fetch";
import { config } from "config";
import TerritorySelectStyles from "./TerritorySelectStyles";

import { Region } from "helpers/datasetSearch";

const loadOptions = (props: PropsType) => async (inputValue) => {
    if (!props.countryRegion || props.countryRegion.regionId !== "2") return [];
    const queryStr = inputValue.trim();
    const res = await fetch(
        `${config.searchApiBaseUrl}regions?type=OFFSHORE_TERRITORIES${
            props.countryRegion && props.countryRegion.regionId
                ? `&lv1Id=${encodeURIComponent(props.countryRegion.regionId)}`
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
    value?: ValueType<Region>;
    regionId?: string;
    onChange?: (
        option: ValueType<Region>,
        notResetOtherRegions?: Boolean
    ) => void;
}

const TerritorySelect: FunctionComponent<PropsType> = (props) => {
    const { countryRegion } = props;

    const placeHolderText = countryRegion
        ? "Please select an Offshore Remote Territory..."
        : "Please select an Offshore Remote Territory first.";
    const isDisabled = countryRegion ? false : true;

    return (
        <div className="region-select">
            <ReactSelect<Region>
                key={(() => {
                    const keyParts = [
                        props.regionId ? props.regionId : "",
                        countryRegion ? countryRegion.regionId : ""
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
                styles={TerritorySelectStyles}
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

export default TerritorySelect;
