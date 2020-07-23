import React, { FunctionComponent, useCallback } from "react";
import OverlayBox from "Components/Common/OverlayBox";
import AsyncButton from "Components/Common/AsyncButton";
import { Distribution } from "Components/Dataset/Add/DatasetAddCommon";
import DistributionItem from "Components/Dataset/Add/DistributionItem";

import "./ConfirmUnselectedExistingDists.scss";

type PropsType = {
    distributions: Distribution[];
    isOpen: boolean;
    setIsOpen: (boolean) => void;
    afterConfirm?: () => void;
};

/**
 *  This modal is for comfirming if the user don't want to replace all existing files.
 *  Unselected existing files will remain as existing files
 */
const ConfirmUnselectedExistingDists: FunctionComponent<PropsType> = (
    props
) => {
    const { setIsOpen, afterConfirm } = props;

    const onConfirm = useCallback(() => {
        setIsOpen(false);
        if (typeof afterConfirm === "function") {
            afterConfirm();
        }
    }, [setIsOpen, afterConfirm]);

    const onClose = useCallback(() => setIsOpen(false), [setIsOpen]);

    const renderDistList = (dists: Distribution[]) => {
        return (
            <div className="col-xs-12">
                <div className="row">
                    {dists.map((file: Distribution, i) => {
                        let isLastRow;
                        if (dists.length % 2) {
                            isLastRow = i >= dists.length - 1;
                        } else {
                            isLastRow = i >= dists.length - 2;
                        }
                        return (
                            <div
                                key={i}
                                className={`col-xs-6 dataset-add-files-fileListItem ${
                                    isLastRow ? "last-row" : ""
                                }`}
                            >
                                <DistributionItem distribution={file} />
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <OverlayBox
            className="confirm-unselected-existing-dists-modal"
            isOpen={props.isOpen}
            title="Don’t replace this existing content?"
            onClose={onClose}
        >
            <div className="content-area">
                <div className="inner-content-area">
                    <div className="heading">
                        Are you sure you don’t want to replace this content? It
                        will remain in your dataset as a current file/API and
                        will be removed from this replacement table.
                    </div>
                </div>

                <div className="row files-area">
                    {renderDistList(props.distributions)}
                </div>

                <div className="bottom-button-area">
                    <div>
                        <AsyncButton onClick={onConfirm}>
                            Yes, don’t replace it
                        </AsyncButton>{" "}
                        &nbsp;&nbsp;&nbsp;
                        <AsyncButton isSecondary={true} onClick={onClose}>
                            No, cancel
                        </AsyncButton>
                    </div>
                </div>
            </div>
        </OverlayBox>
    );
};

export default ConfirmUnselectedExistingDists;
