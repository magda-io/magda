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
import ConfirmUnselectedExistingDists from "./ConfirmUnselectedExistingDists";
import ConfirmUnselectedNewDists from "./ConfirmUnselectedNewDists";

type PropsType = {
    stateData: State;
    datasetId: string;
    datasetStateUpdater: DatasetStateUpdaterType;
    deleteDistributionHandler: (dist: string) => () => Promise<void>;
    editDistributionHandler: (
        distId: string
    ) => (updater: (distribution: Distribution) => Distribution) => void;
};

const DistSupercedeSection: FunctionComponent<PropsType> = (props) => {
    const { stateData: state } = props;

    const [shouldReplace, setShouldReplace] = useState<boolean>(false);

    const [
        isMetadataConfirmModalOpen,
        setIsMetadataConfirmModalOpen
    ] = useState<boolean>(false);

    const [error, setError] = useState<Error | null>(null);

    const [
        isConfirmUnselectedExistingDistsModalOpen,
        setIsConfirmUnselectedExistingDistsModalOpen
    ] = useState<boolean>(false);

    const [
        isConfirmUnselectedNewDistsModalOpen,
        setIsConfirmUnselectedNewDistsModalOpen
    ] = useState<boolean>(false);

    const [isSelectionConfirmed, setIsSelectedConfirmed] = useState<boolean>(
        false
    );

    const existingDistributions = state.distributions.filter(
        (item) =>
            item.isReplacementComfired !== false &&
            item.isAddConfirmed !== false
    );

    const newDistributions = state.distributions.filter(
        (item) =>
            item.isAddConfirmed === true && item.isReplacementComfired === false
    );

    const fileDists = newDistributions.filter(
        (item) => item.creationSource === DistributionSource.File
    );
    const urlDists = newDistributions.filter(
        (item) =>
            item.creationSource === DistributionSource.Api ||
            item.creationSource === DistributionSource.DatasetUrl
    );

    // --- selected new dists for replacement
    const replaceDists = props.stateData.distributions.filter(
        (item) => item.replaceDistId
    );

    const unselectedExistingDists = props.stateData.distributions.filter(
        (dist) =>
            dist.isReplacementComfired !== false &&
            !replaceDists.find(
                (replaceItem) => replaceItem.replaceDistId === dist.id
            )
    );

    const unselectedNewDists = props.stateData.distributions.filter(
        (dist) => dist.isReplacementComfired === false && !dist.replaceDistId
    );

    return (
        <div className="distribution-supercede-section">
            <ConfirmUnselectedExistingDists
                distributions={unselectedExistingDists}
                isOpen={isConfirmUnselectedExistingDistsModalOpen}
                setIsOpen={setIsConfirmUnselectedExistingDistsModalOpen}
                afterConfirm={() => {
                    if (unselectedNewDists.length) {
                        setIsConfirmUnselectedNewDistsModalOpen(true);
                    } else {
                        setIsSelectedConfirmed(true);
                        setIsMetadataConfirmModalOpen(true);
                    }
                }}
            />

            <ConfirmUnselectedNewDists
                distributions={unselectedNewDists}
                isOpen={isConfirmUnselectedNewDistsModalOpen}
                setIsOpen={setIsConfirmUnselectedNewDistsModalOpen}
                afterConfirm={() => {
                    setIsSelectedConfirmed(true);
                    setIsMetadataConfirmModalOpen(true);
                }}
            />

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

            <ConfirmMetadataModal
                datasetId={props.datasetId}
                isOpen={isMetadataConfirmModalOpen}
                setIsOpen={setIsMetadataConfirmModalOpen}
                stateData={props.stateData}
                datasetStateUpdater={props.datasetStateUpdater}
                setIsSelectedConfirmed={setIsSelectedConfirmed}
            />

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

                            if (!isSelectionConfirmed) {
                                if (unselectedExistingDists.length) {
                                    setIsConfirmUnselectedExistingDistsModalOpen(
                                        true
                                    );
                                    return;
                                } else if (unselectedNewDists.length) {
                                    setIsConfirmUnselectedNewDistsModalOpen(
                                        true
                                    );
                                    return;
                                }
                            }

                            setIsMetadataConfirmModalOpen(true);
                        } else {
                            // --- if not require replacement, show metadata confirm screen rigth away
                            setIsMetadataConfirmModalOpen(true);
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
