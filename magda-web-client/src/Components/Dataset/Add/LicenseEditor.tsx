import React, { useState } from "react";
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
    return !Object.values(codelists.licenseLevel).includes(license);
}

export default function LicenseEditor({ value: license, onChange }: Props) {
    const [usingCustomLicense, setUsingCustomLicense] = useState(
        isCustom(license)
    );

    function onCodeListEditorChange(newLicense?: string): void {
        if (newLicense === codelists.licenseLevel.custom) {
            setUsingCustomLicense(true);
        } else {
            onChange(newLicense!);
            setUsingCustomLicense(false);
        }
    }

    return (
        <>
            <div className="row">
                <div className="col-sm-12">
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
                            license
                                ? {
                                      label: codelists.licenseLevel[license],
                                      value: license
                                  }
                                : null
                        }
                        onChange={item => onCodeListEditorChange(item.value)}
                    />
                </div>
            </div>
            {usingCustomLicense && (
                <div className="row">
                    <div className="col-sm-12">
                        <AlwaysEditor
                            value={license}
                            onChange={newLicense => onChange(newLicense!)}
                            editor={textEditorEx({
                                placeholder: "Please specify a license"
                            })}
                        />
                    </div>
                </div>
            )}
        </>
    );
}
