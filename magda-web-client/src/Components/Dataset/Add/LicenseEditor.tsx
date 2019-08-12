import React, { useState } from "react";
import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { codelistEditor } from "Components/Editing/Editors/codelistEditor";
import { textEditorEx } from "Components/Editing/Editors/textEditor";
import * as codelists from "constants/DatasetConstants";

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
        <div>
            <p>
                <AlwaysEditor
                    value={license}
                    onChange={onCodeListEditorChange}
                    editor={codelistEditor(codelists.licenseLevel)}
                />
            </p>
            {usingCustomLicense && (
                <p>
                    <AlwaysEditor
                        value={license}
                        onChange={newLicense => onChange(newLicense!)}
                        editor={textEditorEx({
                            placeholder: "Please specify a license"
                        })}
                    />
                </p>
            )}
        </div>
    );
}
