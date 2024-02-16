import React, { FunctionComponent } from "react";
import ReactSelect from "react-select/async";
import { OnChangeValue } from "react-select";
import fetch from "cross-fetch";
import { config } from "config";
import StateSelectStyles from "./StateSelectStyles";

import { Region } from "helpers/datasetSearch";
export type OptionType = Region;

const loadOptions = (props: PropsType) => async (inputValue) => {
    if (!props.countryRegion || props.countryRegion.regionId !== "1") return [];
    const queryStr = inputValue.trim();
    const res = await fetch(
        `${config.searchApiBaseUrl}regions?type=STE${
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
    countryRegion?: OnChangeValue<Region, false>;
    value?: OnChangeValue<Region, false>;
    regionId?: string;
    onChange?: (
        option: OnChangeValue<Region, false>,
        notResetOtherRegions?: boolean
    ) => void;
}

const StateSelect: FunctionComponent<PropsType> = (props) => {
    const { countryRegion } = props;

    const placeHolderText = countryRegion
        ? "Please select state or a territory..."
        : "Please select a state/territory option first.";
    const isDisabled = countryRegion ? false : true;

    return (
        <div className="state-select">
            <ReactSelect<OptionType>
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
                placeholder={placeHolderText}
                isDisabled={isDisabled}
                styles={StateSelectStyles}
                onChange={(option) =>
                    typeof props.onChange === "function" &&
                    props.onChange(option)
                }
            />
        </div>
    );
};

export default StateSelect;
