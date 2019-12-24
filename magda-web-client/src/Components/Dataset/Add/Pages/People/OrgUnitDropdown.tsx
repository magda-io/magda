import React from "react";
import { useAsyncCallback } from "react-async-hook";
import Select from "react-select";
import { config } from "config";

import ReactSelectStyles from "Components/Common/react-select/ReactSelectStyles";

import { listOrgUnitsAtLevel } from "api-clients/OrgUnitApis";

type Props = {
    orgUnitId?: string;
    businessAreaId?: string;
    onChange: (orgUnitId: string) => void;
};

// const getOrgUnits: () => Promise<OrgUnit[]> = async () => {
//     try {
//         return await listOrgUnits({ orgUnitsOnly: true });
//     } catch (e) {
//         console.error(e);
//         throw e;
//     }
// };

export default function OrgUnitDropdown({
    orgUnitId,
    businessAreaId,
    onChange: onChangeCallback
}: Props) {
    // const { loading, error, result, execute } = useAsync(getOrgUnits, []);

    const { loading, error, result, execute } = useAsyncCallback(() =>
        listOrgUnitsAtLevel(config.custodianOrgLevel, businessAreaId)
    );
    console.log("OrgUnitDropdown Header");
    console.log("orgUnitId: ", orgUnitId);

    if (loading) {
        return <span>Loading...</span>;
    } else if (error || !result || result.length === 0) {
        return (
            <div className="au-body au-page-alerts au-page-alerts--error">
                <span style={{ verticalAlign: "-2px" }}>
                    Could not retrieve teams, or there are no teams in the
                    system.
                </span>
                <button className="au-btn au-btn--tertiary" onClick={execute}>
                    Try Again
                </button>
            </div>
        );
    } else {
        console.log("OrgUnitDropdown: Result: ", result);
        const value = result.find(option => option.id === orgUnitId);

        return (
            <Select
                className="react-select"
                isMulti={false}
                isSearchable={false}
                onChange={(rawValue, _action) => {
                    const value = rawValue as (
                        | { value: string }
                        | undefined
                        | null);
                    if (value) {
                        onChangeCallback(value.value);
                    }
                }}
                styles={ReactSelectStyles}
                value={value && { label: value.name, value: value.id }}
                options={result.map(option => ({
                    label: option.name,
                    value: option.id
                }))}
                placeholder="Select a business area"
            />
        );
    }
}
