import React from "react";
import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { textEditorEx } from "Components/Editing/Editors/textEditor";
import * as codelists from "constants/DatasetConstants";
import ReactSelect from "react-select";
import ReactSelectStyles from "../../Common/react-select/ReactSelectStyles";

type Props = {
    value: string;
    onChange: (newLicense: string) => void;
};

function isCustom(license: string) {
    return (
        license === "custom" ||
        Object.keys(codelists.licenseLevel).indexOf(license) === -1
    );
}

/**
 * Figure out custom license text box status from props.value
 * avoid using derived state to avoid inconsistent state
 */
export default function LicenseEditor({ value: license, onChange }: Props) {
    const usingCustomLicense = isCustom(license);

    return (
        <>
            <ReactSelect
                className="license-apply-type-select"
                styles={ReactSelectStyles}
                isSearchable={false}
                menuPortalTarget={document.body}
                options={
                    Object.keys(codelists.licenseLevel).map(key => ({
                        label: codelists.licenseLevel[key],
                        value: key
                    })) as any
                }
                value={
                    license && codelists.licenseLevel[license]
                        ? {
                              label: codelists.licenseLevel[license],
                              value: license
                          }
                        : {
                              label: codelists.licenseLevel["custom"],
                              value: "custom"
                          }
                }
                onChange={(item: any) => {
                    onChange(item.value === "custom" ? "" : item.value);
                }}
            />
            {usingCustomLicense && (
                <div>
                    <AlwaysEditor
                        value={license}
                        onChange={newLicense => onChange(newLicense!)}
                        editor={textEditorEx({
                            placeholder: "Please specify a license"
                        })}
                    />
                </div>
            )}
        </>
    );
}
