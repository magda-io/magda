import React, { FunctionComponent, useState } from "react";

import "./DistSupercedeSection.scss";
import {
    State,
    DatasetStateUpdaterType,
    DistributionSource,
    Distribution
} from "Components/Dataset/Add/DatasetAddCommon";
import ToolTip from "Components/Dataset/Add/ToolTip";
import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { codelistRadioEditor } from "Components/Editing/Editors/codelistEditor";
import SupercedeSelectionBox from "./SupercedeSelectionBox";
import AsyncButton from "Components/Common/AsyncButton";
import ConfirmMetadataModal from "./ConfirmMetadataModal";

type PropsType = {
    stateData: State;
    datasetStateUpdater: DatasetStateUpdaterType;
    deleteDistributionHandler: (dist: string) => () => Promise<void>;
    editDistributionHandler: (
        distId: string
    ) => (updater: (distribution: Distribution) => Distribution) => void;
};

const DistSupercedeSection: FunctionComponent<PropsType> = (props) => {
    const { stateData: state } = props;

    const [shouldReplace, setShouldReplace] = useState<boolean>(false);
    const [showMetadataConfirmModal, setShowMetadataConfirmModal] = useState<
        boolean
    >(false);
    const [error, setError] = useState<Error | null>(null);

    const existingDistributions = state.distributions.filter(
        (item) =>
            item.isReplacementComfired !== false &&
            item.isAddConfirmed !== false
    );

    const newDistributions = state.distributions.filter(
        (item) => item.isAddConfirmed === true
    );

    const fileDists = newDistributions.filter(
        (item) => item.creationSource === DistributionSource.File
    );
    const urlDists = newDistributions.filter(
        (item) =>
            item.creationSource === DistributionSource.Api ||
            item.creationSource === DistributionSource.DatasetUrl
    );

    return (
        <div className="distribution-supercede-section">
            <ToolTip>
                You’ve added {fileDists.length} additional file(s) and{" "}
                {urlDists.length} additional API(s) to this data set. Please
                select if this new content should replace and supercede the
                existing content. Replaced content will always be saved as
                superceded versions, available from the dataset page.
            </ToolTip>
            <div className="dataset-contents-sub-heading replace-option-heading">
                Should any of the new contents replace the existing contents in
                the data set?
            </div>
            <AlwaysEditor
                value={shouldReplace ? "true" : "false"}
                onChange={(value) => {
                    setShouldReplace(value === "true" ? true : false);
                }}
                editor={codelistRadioEditor(
                    "distribution-supercede-section-distribution-supercede-selection",
                    {
                        false: "No, keep all the contents as current",
                        true: "Yes, replace and supercede the existing content"
                    }
                )}
            />
            {shouldReplace ? (
                <>
                    <div className="dataset-contents-sub-heading supercede-selection-heading">
                        Which content would you like you replace and supercede?
                    </div>
                    <ToolTip>
                        Drag and drop your new content against the existing
                        content you’d like to replace. If you don’t want to
                        replace some of your existing content, press the ‘x’ to
                        remove it from your list. This content will remain in
                        your current list of content in the data set.
                    </ToolTip>
                    <SupercedeSelectionBox
                        existingDistributions={existingDistributions}
                        newDistributions={newDistributions}
                        editDistributionHandler={props.editDistributionHandler}
                        deleteDistributionHandler={
                            props.deleteDistributionHandler
                        }
                    />
                </>
            ) : null}

            {showMetadataConfirmModal ? (
                <ConfirmMetadataModal isOpen={true} />
            ) : null}

            {error ? (
                <div className="au-body au-page-alerts au-page-alerts--error">
                    <div>
                        <span>
                            Error: {error?.message ? error.message : "" + error}
                        </span>
                    </div>
                </div>
            ) : null}

            <div className="button-area">
                <AsyncButton
                    onClick={() => {
                        setError(null);
                        if (shouldReplace) {
                            if (
                                !props.stateData.distributions.filter(
                                    (item) => item.replaceDistId
                                ).length
                            ) {
                                setError(
                                    new Error(
                                        "At least one distribution item will be assigned to supercede existing content."
                                    )
                                );
                                return;
                            }
                            setShowMetadataConfirmModal(true);
                        } else {
                            // --- if not require replacement, set all pending distribution as current.
                            props.datasetStateUpdater((state) => ({
                                ...state,
                                distributions: state.distributions.map((dist) =>
                                    dist.isReplacementComfired === false
                                        ? {
                                              ...dist,
                                              isReplacementComfired: true
                                          }
                                        : dist
                                )
                            }));
                        }
                    }}
                >
                    Confirm
                </AsyncButton>
                &nbsp;&nbsp;&nbsp;
                <AsyncButton
                    isSecondary={true}
                    onClick={() => {
                        setError(null);
                        // --- let use start from the begin by removing all newly added distribution
                        props.datasetStateUpdater((state) => ({
                            ...state,
                            distributions: state.distributions.filter(
                                (dist) => dist.isReplacementComfired !== false
                            )
                        }));
                    }}
                >
                    Cancel
                </AsyncButton>
            </div>
        </div>
    );
};

export default DistSupercedeSection;
