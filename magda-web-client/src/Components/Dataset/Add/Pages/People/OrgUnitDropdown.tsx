import React from "react";
import { useAsync } from "react-async-hook";

import { OrgUnit, listOrgUnits } from "api-clients/OrgUnitApis";

type Props = {
    orgUnitId?: string;
    onChange: (orgUnitId: string) => void;
};

const getOrgUnits: () => Promise<OrgUnit[]> = async () => {
    try {
        return await listOrgUnits({ orgUnitsOnly: true });
    } catch (e) {
        console.error(e);
        throw e;
    }
};

export default function OrgUnitDropdown({
    orgUnitId,
    onChange: onChangeCallback
}: Props) {
    const { loading, error, result, execute } = useAsync(getOrgUnits, []);

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
        const onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
            const value = event.target.value;
            onChangeCallback(value);
        };

        return (
            <select
                className="au-select"
                defaultValue={orgUnitId}
                onChange={onChange}
            >
                <option value="" disabled>
                    Select a team
                </option>

                {result.map(val => {
                    return (
                        <option key={val.id} value={val.id}>
                            {val.name}
                        </option>
                    );
                })}
            </select>
        );
    }
}
