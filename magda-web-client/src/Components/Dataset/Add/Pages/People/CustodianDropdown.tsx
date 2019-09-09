import React, { useState } from "react";
import { useAsync } from "react-async-hook";
import Select from "react-select";
import { config } from "config";
import find from "lodash/find";

import ReactSelectStyles from "Components/Common/react-select/ReactSelectStyles";

import {
    listOrgUnitsAtLevel,
    OrgUnitWithRelationship
} from "api-clients/OrgUnitApis";

type Props = {
    orgUnitId?: string;
    teamOrgUnitId?: string;
    onChange: (orgUnitId: string) => void;
};

export default function CustodianDropdown({
    orgUnitId,
    teamOrgUnitId,
    onChange: onChangeCallback
}: Props) {
    // --- use hasUserSelected to tell whether user has selected a value or not
    const [hasUserSelected, setHasUserSelected] = useState(false);
    const { loading, error, result, execute } = useAsync(listOrgUnitsAtLevel, [
        config.custodianOrgLevel,
        teamOrgUnitId
    ]);

    if (loading) {
        return <span>Loading...</span>;
    } else if (error || !result || result.length === 0) {
        return (
            <div className="au-body au-page-alerts au-page-alerts--error">
                <span style={{ verticalAlign: "-2px" }}>
                    Could not retrieve data custodian list, or there are no data
                    custodians in the system.
                </span>
                <button
                    className="au-btn au-btn--tertiary"
                    onClick={() =>
                        execute(config.custodianOrgLevel, teamOrgUnitId)
                    }
                >
                    Try Again
                </button>
            </div>
        );
    } else {
        const selectedValue = orgUnitId && find(result, option => option.id === orgUnitId);

        if ((!selectedValue || !hasUserSelected) && teamOrgUnitId) {
            const relatedOrgUnit = find(
                result,
                option =>
                    option.relationship && option.relationship !== "unrelated"
            );
            if (
                relatedOrgUnit &&
                (relatedOrgUnit as OrgUnitWithRelationship).id !== orgUnitId
            ) {
                // --- we do need to send out onChangeCallback to update upper level state to make sure it's consistent with the screen value
                // --- only update when we find a different value here otherwise we will trigger a infinite loop
                onChangeCallback(
                    (relatedOrgUnit as OrgUnitWithRelationship).id
                );
            }
        }

        return (
            <Select
                className="react-select"
                isMulti={false}
                isSearchable={true}
                onChange={(rawValue, action) => {
                    const value = rawValue as (
                        | { value: string }
                        | undefined
                        | null);
                    if (value) {
                        if (!hasUserSelected) setHasUserSelected(true);
                        onChangeCallback(value.value);
                    }
                }}
                styles={ReactSelectStyles}
                value={
                    selectedValue && {
                        label: selectedValue.name,
                        value: selectedValue.id
                    }
                }
                options={result.map(option => ({
                    label: option.name,
                    value: option.id
                }))}
                placeholder="Select a data custodian"
            />
        );
    }
}
