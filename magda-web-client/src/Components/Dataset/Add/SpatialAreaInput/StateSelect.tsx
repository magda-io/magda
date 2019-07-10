import React from "react";
import ReactSelect from "react-select/async";
import fetch from "isomorphic-fetch";
import { config } from "config";
import StateSelectStyles from "./StateSelectStyles";

const loadOptions = async inputValue => {
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
    return data.regions.map((item: any) => ({
        label: item.regionName,
        value: item
    }));
};

const StateSelect = props => {
    return (
        <div className="state-select">
            <ReactSelect
                cacheOptions
                defaultOptions
                loadOptions={loadOptions}
                styles={StateSelectStyles}
            />
        </div>
    );
};

export default StateSelect;
