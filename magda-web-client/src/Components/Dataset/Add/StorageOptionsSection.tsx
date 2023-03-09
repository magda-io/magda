import React from "react";
import "./StorageOptionsSection.scss";
import { Distribution } from "./DatasetAddCommon";
import { config } from "config";
import ToolTip from "./ToolTip";
import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { codelistRadioEditor } from "Components/Editing/Editors/codelistEditor";
import AccessLocationAutoComplete from "./Pages/DatasetAddAccessAndUsePage/AccessLocationAutoComplete";
import MagdaNamespacesConsumer from "Components/i18n/MagdaNamespacesConsumer";

type Props = {
    shouldUploadToStorageApi: boolean;
    setShouldUploadToStorageApi: (uploadToStorageApi: boolean) => void;
    dataAccessLocation: string;
    setDataAccessLocation: (location: string) => void;
    files: Distribution[];
};

const StorageOptionsSection = (props: Props) => {
    const shouldDisableInput = props.files.length > 0 ? true : false;
    const useStorageApi =
        typeof config?.featureFlags?.["useStorageApi"] === "boolean"
            ? config.featureFlags["useStorageApi"]
            : true;

    return (
        <MagdaNamespacesConsumer ns={["global"]}>
            {(translate) => {
                const appName = translate(["appName", ""]);
                return (
                    <div
                        className={`row storage-options-section ${
                            useStorageApi ? "storage-api-on" : "storage-api-off"
                        }`}
                    >
                        <div className="col-sm-12">
                            <h3>Storage and location</h3>
                            {useStorageApi ? (
                                <>
                                    <div className="storage-option-heading">
                                        Would you like a copy of the files in
                                        this dataset to be stored by {appName}?
                                    </div>
                                    <ToolTip>
                                        Select yes if you would like to store a
                                        copy of this file on {appName}’s
                                        servers. This will allow your users to
                                        download the file directly from{" "}
                                        {appName} without having to locate the
                                        file on your internal storage system or
                                        shared drive .{" "}
                                    </ToolTip>

                                    <div className="storage-option-input-area">
                                        {shouldDisableInput ? (
                                            <div className="tooltip-container">
                                                <div className="triangle">
                                                    &nbsp;
                                                </div>
                                                <div>
                                                    In order to change this
                                                    selection, please remove the
                                                    files you have already
                                                    uploaded, change this
                                                    selection and re-upload
                                                    them.
                                                </div>
                                            </div>
                                        ) : null}
                                        <AlwaysEditor
                                            value={
                                                props.shouldUploadToStorageApi
                                                    ? "true"
                                                    : "false"
                                            }
                                            onChange={(value) =>
                                                props.setShouldUploadToStorageApi(
                                                    value === "true"
                                                        ? true
                                                        : false
                                                )
                                            }
                                            editor={codelistRadioEditor(
                                                "file-storage-option-selection",
                                                {
                                                    true: `Yes, store a copy of this file on "${appName}"`,
                                                    false:
                                                        "No, I want to use my existing shared drive or storage systems"
                                                },
                                                false,
                                                shouldDisableInput
                                            )}
                                        />
                                    </div>
                                </>
                            ) : null}

                            {props.shouldUploadToStorageApi ? null : (
                                <div className="access-location-area">
                                    <div className="access-location-heading">
                                        What internal storage location can
                                        internal users access the dataset files
                                        from?
                                    </div>
                                    <ToolTip>
                                        Select the best location for this file
                                        based on its contents and your
                                        organisation file structure. You can
                                        choose from a number of pre-defined file
                                        storage locations. If these are
                                        inaccurate, please contact your system
                                        administrator
                                    </ToolTip>

                                    <AccessLocationAutoComplete
                                        placeholder="Start typing a file location name..."
                                        defaultValue={props.dataAccessLocation}
                                        onChange={props.setDataAccessLocation}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                );
            }}
        </MagdaNamespacesConsumer>
    );
};

export default StorageOptionsSection;
