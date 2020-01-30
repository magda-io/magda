import React from "react";
import { useAsync } from "react-async-hook";
import Select from "react-select";
import find from "lodash/find";
import partition from "lodash/partition";
import union from "lodash/union";

import ReactSelectStyles from "Components/Common/react-select/ReactSelectStyles";

import { listOrgUnits, OrgUnitWithRelationship } from "api-clients/OrgUnitApis";

type Props = {
    orgUnitId?: string;
    custodianOrgUnitId?: string;
    onChange: (orgUnitId: string) => void;
};

export default function OrgUnitDropdown({
    orgUnitId,
    custodianOrgUnitId,
    onChange: onChangeCallback
}: Props) {
    const { loading, error, result, execute } = useAsync(
        async () =>
            await listOrgUnits({
                orgUnitsOnly: true,
                relationshipOrgUnitId: custodianOrgUnitId
            }),
        [custodianOrgUnitId]
    );

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
                    onClick={() => execute(custodianOrgUnitId)}
                >
                    Try Again
                </button>
            </div>
        );
    } else {
        const selectedValue =
            typeof orgUnitId !== "undefined" &&
            find(result, option => option.id === orgUnitId);

        // --- default to list options alphabetically
        let sortedResult = result.sort((b, a) =>
            a.name > b.name ? -1 : b.name > a.name ? 1 : 0
        );
        // --- if custodian is selected, list selected custodian's teams in the dropdown options first.
        if (custodianOrgUnitId) {
            sortedResult = union.apply(
                null,
                partition(
                    sortedResult,
                    item => item.relationship !== "unrelated"
                )
            ) as OrgUnitWithRelationship[];
        }

        return (
            <Select
                className="react-select"
                isMulti={false}
                isSearchable={true}
                onChange={(rawValue, action) => {
                    const value = rawValue as
                        | { value: string }
                        | undefined
                        | null;
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
                options={sortedResult.map(option => ({
                    label: option.name,
                    value: option.id
                }))}
                placeholder="Select a team"
            />
        );
    }
}
