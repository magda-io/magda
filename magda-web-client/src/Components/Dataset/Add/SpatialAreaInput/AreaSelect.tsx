import React, { FunctionComponent } from "react";
import ReactSelect from "react-select/async";
import { ValueType } from "react-select/src";
import fetch from "isomorphic-fetch";
import { config } from "config";
import AreaSelectStyles from "./AreaSelectStyles";

import { Region } from "helpers/datasetSearch";

const loadOptions = (
    steRegion: ValueType<Region>,
    sa4Region: ValueType<Region>
) => async inputValue => {
    if (!steRegion || !sa4Region) return [];
    const queryStr = inputValue.trim();
    const res = await fetch(
        `${config.searchApiUrl}regions?type=SA3${
            steRegion ? `&steId=${encodeURIComponent(steRegion.regionId)}` : ""
        }${
            sa4Region ? `&sa4Id=${encodeURIComponent(sa4Region.regionId)}` : ""
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
    sa4Region?: ValueType<Region>;
    value?: ValueType<Region>;
    onChange?: (option: ValueType<Region>) => void;
}

const AreaSelect: FunctionComponent<PropsType> = props => {
    const { steRegion, sa4Region } = props;

    const isDisabled = steRegion && sa4Region ? false : true;
    let placeHolderText = "Please select area...";

    if (!steRegion && !sa4Region) {
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
                        steRegion ? steRegion.regionId : "",
                        sa4Region ? sa4Region.regionId : ""
                    ];
                    return keyItems.join("|");
                })()}
                cacheOptions={false}
                defaultOptions
                value={props.value}
                loadOptions={loadOptions(steRegion, sa4Region)}
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
