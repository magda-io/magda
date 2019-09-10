import React, { useEffect } from "react";
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
    const { loading, error, result, execute } = useAsync(listOrgUnitsAtLevel, [
        config.custodianOrgLevel,
        teamOrgUnitId
    ]);

    // If there's no org unit already set, when we know what org units exist, set it to the one
    // above the current user in the org tree
    useEffect(() => {
        if (!orgUnitId && result && teamOrgUnitId) {
            const relatedOrgUnit = find(
                result,
                option =>
                    option.relationship && option.relationship !== "unrelated"
            ) as OrgUnitWithRelationship | undefined;

            if (relatedOrgUnit) {
                onChangeCallback(relatedOrgUnit.id);
            }
        }
    }, [result]);

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
        const selectedValue =
            typeof orgUnitId !== "undefined" &&
            find(result, option => option.id === orgUnitId);

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
                        onChangeCallback(value.value);
                    }
                }}
                styles={ReactSelectStyles}
                value={
                    selectedValue
                        ? {
                              label: selectedValue.name,
                              value: selectedValue.id
                          }
                        : undefined
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
