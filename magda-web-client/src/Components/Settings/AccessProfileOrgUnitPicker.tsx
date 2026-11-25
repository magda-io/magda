import React, { FunctionComponent, useMemo } from "react";
import { useAsync } from "react-async-hook";
import SelectPicker from "rsuite/SelectPicker";
import Button from "rsuite/Button";
import { getOrgUnitById, listOrgUnits, OrgUnit } from "api-clients/OrgUnitApis";

export const NO_ORG_UNIT = "none";
export const NO_ORG_UNIT_LABEL = "No org unit";
export const NO_VISIBLE_ORG_UNITS =
    "No org units are visible to you, so you can only choose No org unit. Choosing an org unit needs permission to read org units; ask your administrator.";

/**
 * An org unit's name, or its ID when the viewer can't read it (profile
 * managers need no Auth API permissions, AUTH-11).
 */
export const OrgUnitName: FunctionComponent<{ id: string }> = ({ id }) => {
    const { result, loading } = useAsync(
        async (id: string) => {
            try {
                return await getOrgUnitById(id);
            } catch (_) {
                return undefined;
            }
        },
        [id]
    );
    if (loading) {
        return <>...</>;
    }
    return result?.name ? (
        <>{result.name}</>
    ) : (
        <span title="You can't read this org unit's name">Org unit {id}</span>
    );
};

export type OrgUnitOption = { label: string; value: string };

/**
 * Org units as options labelled with their full path ("Corporate › Finance ›
 * Payroll"), in tree order, using the nested set `left` / `right` values.
 * The path makes the audience rule (a unit and the units below it) visible
 * while searching.
 */
export function orgUnitOptions(units: OrgUnit[]): OrgUnitOption[] {
    const sorted = units
        .filter(
            (unit) =>
                typeof unit?.left === "number" &&
                typeof unit?.right === "number"
        )
        .sort((a, b) => (a.left as number) - (b.left as number));
    const ancestors: OrgUnit[] = [];
    return sorted.map((unit) => {
        while (
            ancestors.length &&
            (ancestors[ancestors.length - 1].right as number) <
                (unit.left as number)
        ) {
            ancestors.pop();
        }
        const label = [...ancestors.map((item) => item.name), unit.name].join(
            " › "
        );
        ancestors.push(unit);
        return { label, value: unit.id };
    });
}

type PropsType = {
    id: string;
    /** `null` means no org unit. */
    value: string | null;
    disabled?: boolean;
    onChange: (orgUnitId: string | null) => void;
};

/** A searchable org unit picker with a **No org unit** option. */
const AccessProfileOrgUnitPicker: FunctionComponent<PropsType> = ({
    id,
    value,
    disabled,
    onChange
}) => {
    const { result: units, loading, error, execute } = useAsync(
        async () => listOrgUnits({}),
        []
    );

    const data = useMemo(() => {
        const options: OrgUnitOption[] = [
            { label: NO_ORG_UNIT_LABEL, value: NO_ORG_UNIT },
            ...orgUnitOptions(units || [])
        ];
        if (value && !options.some((option) => option.value === value)) {
            // keep the current value visible even when it can't be listed
            options.push({ label: `Org unit ${value}`, value });
        }
        return options;
    }, [units, value]);

    return (
        <>
            <SelectPicker
                id={id}
                aria-label="Org unit"
                data={data}
                block={true}
                cleanable={false}
                searchable={true}
                loading={loading}
                disabled={disabled}
                value={value || NO_ORG_UNIT}
                onChange={(selected) =>
                    onChange(
                        !selected || selected === NO_ORG_UNIT
                            ? null
                            : (selected as string)
                    )
                }
            />
            {!loading && !error && units && !units.length ? (
                <p className="access-profile-help" role="status">
                    {NO_VISIBLE_ORG_UNITS}
                </p>
            ) : null}
            {error ? (
                <p className="access-profile-field-error" role="alert">
                    Unable to load org units: {`${error.message || error}`}{" "}
                    <Button appearance="link" onClick={() => execute()}>
                        Retry
                    </Button>
                </p>
            ) : null}
        </>
    );
};

export default AccessProfileOrgUnitPicker;
