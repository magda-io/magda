import React, { FunctionComponent } from "react";
import { useAsync } from "react-async-hook";
import Select from "react-select";
import find from "lodash/find";
import partition from "lodash/partition";

import ReactSelectStyles from "Components/Common/react-select/ReactSelectStyles";

import {
    listOrgUnits,
    getOrgUnitById,
    OrgUnitWithRelationship
} from "api-clients/OrgUnitApis";
import { onInputFocusOut, useValidation } from "../../ValidationManager";

type Props = {
    orgUnitId?: string;
    custodianOrgUnitId?: string;
    onChange: (orgUnitId?: string) => void;
    validationFieldPath?: string;
    validationFieldLabel?: string;
    isClearable?: boolean;
};

const getOrgUnitName = async (id?: string) => {
    if (typeof id !== "string") {
        return undefined;
    }
    try {
        const orgUnit = await getOrgUnitById(id);
        return orgUnit?.name;
    } catch (e) {
        return undefined;
    }
};

const orgUnitsToOptionItems = (orgUnits: OrgUnitWithRelationship[]) =>
    orgUnits.map((option) => ({
        label: option.name,
        value: option.id
    }));

const OrgUnitDropdown: FunctionComponent<Props> = (props) => {
    const {
        orgUnitId,
        custodianOrgUnitId,
        onChange: onChangeCallback,
        validationFieldPath,
        validationFieldLabel,
        isClearable
    } = props;
    const [
        isValidationError,
        validationErrorMessage,
        validationCtlRef
    ] = useValidation<HTMLDivElement>(
        validationFieldPath,
        validationFieldLabel
    );
    const { loading, error, result, execute } = useAsync(async () => {
        const orgUnits = await listOrgUnits({
            leafNodesOnly: true,
            relationshipOrgUnitId: custodianOrgUnitId
        });
        const custodianName = await getOrgUnitName(custodianOrgUnitId);
        return { orgUnits, custodianName };
    }, [custodianOrgUnitId]);

    if (loading) {
        return <span>Loading...</span>;
    } else if (error || !result || result.orgUnits.length === 0) {
        return (
            <div className="au-body au-page-alerts au-page-alerts--error">
                <span style={{ verticalAlign: "-2px" }}>
                    Could not retrieve data custodians list. Please make sure
                    the organizational structure has been setup by system admin
                    and your account has been assigned to an organizational
                    unit.
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
            find(result.orgUnits, (option) => option.id === orgUnitId);

        // --- default to list options alphabetically
        const sortedResult = result.orgUnits.sort((b, a) =>
            a.name > b.name ? -1 : b.name > a.name ? 1 : 0
        );

        const options = (() => {
            if (custodianOrgUnitId) {
                // --- produce options in groups
                // --- teams in selected custodian will be shown on the top of the list
                const custodianOrgUnitLabel =
                    typeof result.custodianName === "undefined"
                        ? "Unknown Custodian"
                        : result.custodianName;
                const groups = partition(
                    sortedResult,
                    (item) => item.relationship !== "unrelated"
                ).map((items, key) => ({
                    label: `Teams ${
                        key ? "outside" : "in"
                    } ${custodianOrgUnitLabel}`,
                    options: orgUnitsToOptionItems(items)
                }));
                return groups;
            } else {
                // --- show options without groups
                return orgUnitsToOptionItems(sortedResult);
            }
        })();

        return (
            <div
                ref={validationCtlRef}
                className={`react-select-with-validation-container ${
                    isValidationError ? "invalid" : ""
                }`}
            >
                {isValidationError ? (
                    <div>
                        <span className="au-error-text">
                            {validationErrorMessage}
                        </span>
                    </div>
                ) : null}
                <Select
                    className="react-select"
                    isMulti={false}
                    isSearchable={true}
                    isClearable={
                        typeof isClearable === "boolean" ? isClearable : true
                    }
                    onChange={(rawValue, action) => {
                        const value = rawValue as
                            | { value: string }
                            | undefined
                            | null;
                        if (value) {
                            onChangeCallback(value.value);
                            onInputFocusOut(validationFieldPath);
                        } else if (value === null) {
                            onChangeCallback(undefined);
                            onInputFocusOut(validationFieldPath);
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
                    options={options as any}
                    placeholder="Select a team"
                />
            </div>
        );
    }
};

export default OrgUnitDropdown;
