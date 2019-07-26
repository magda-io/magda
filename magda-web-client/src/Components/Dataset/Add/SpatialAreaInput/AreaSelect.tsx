import React, { FunctionComponent } from "react";
import ReactSelect from "react-select/async";
import { ValueType } from "react-select/src";
import fetch from "isomorphic-fetch";
import { config } from "config";
import AreaSelectStyles from "./AreaSelectStyles";

import { Region } from "helpers/datasetSearch";

const loadOptions = (props: PropsType) => async inputValue => {
    if (!props.steRegion || !props.sa4Region) return [];
    const queryStr = inputValue.trim();
    const res = await fetch(
        `${config.searchApiUrl}regions?type=SA3${
            props.steRegion
                ? `&lv2Id=${encodeURIComponent(props.steRegion.regionId)}`
                : ""
        }${
            props.sa4Region
                ? `&lv3Id=${encodeURIComponent(props.sa4Region.regionId)}`
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
        data.regions.forEach(region => {
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
    sa4Region?: ValueType<Region>;
    value?: ValueType<Region>;
    regionId?: string;
    onChange?: (
        option: ValueType<Region>,
        notResetOtherRegions?: Boolean
    ) => void;
}

const AreaSelect: FunctionComponent<PropsType> = props => {
    const { countryRegion, steRegion, sa4Region } = props;

    const isDisabled = countryRegion && steRegion && sa4Region ? false : true;
    let placeHolderText = "Please select area...";

    if (!countryRegion && !steRegion && !sa4Region) {
        placeHolderText = "Please select country, state and region first.";
    } else if (!steRegion && !sa4Region) {
        placeHolderText = "Please select state and region first.";
    } else if (!sa4Region) {
        placeHolderText = "Please select region first.";
    }

    return (
        <div className="state-select">
            <ReactSelect<Region>
                key={(() => {
                    // --- we need to reset internel state at correct timing
                    // --- otherwise, the ajax option loading function won't be updated internally
                    // --- there is no good way in React do that unless an inter-component messaging solution :-)
                    const keyItems = [
                        props.regionId ? props.regionId : "",
                        countryRegion ? countryRegion.regionId : "",
                        steRegion ? steRegion.regionId : "",
                        sa4Region ? sa4Region.regionId : ""
                    ];
                    return keyItems.join("|");
                })()}
                isClearable
                cacheOptions
                defaultOptions
                value={props.value}
                loadOptions={loadOptions(props)}
                getOptionLabel={option => option.regionName as string}
                getOptionValue={option => option.regionId as string}
                styles={AreaSelectStyles}
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

export default AreaSelect;
