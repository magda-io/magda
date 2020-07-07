import React, { FunctionComponent, useCallback } from "react";
import OverlayBox from "Components/Common/OverlayBox";
import AsyncButton from "Components/Common/AsyncButton";
import { Distribution } from "Components/Dataset/Add/DatasetAddCommon";
import DistributionItem from "Components/Dataset/Add/DistributionItem";

import "./ConfirmUnselectedNewDists.scss";

type PropsType = {
    distributions: Distribution[];
    isOpen: boolean;
    setIsOpen: (boolean) => void;
    afterConfirm?: () => void;
};

/**
 *  This modal is for comfirming if the user don't want to use all new files to replace existing files.
 *  Unselected new files will be added as existing files.
 */
const ConfirmUnselectedNewDists: FunctionComponent<PropsType> = (props) => {
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
            className="confirm-unselected-new-dists-modal"
            isOpen={props.isOpen}
            title="Don’t use new content for replacement?"
            onClose={onClose}
        >
            <div className="content-area">
                <div className="inner-content-area">
                    <div className="heading">
                        Are you sure the following content will not be used to
                        replace any existing content? It will be added to your
                        dataset as a current file/API and will be removed from
                        this replacement table.
                    </div>
                </div>

                <div className="row files-area">
                    {renderDistList(props.distributions)}
                </div>

                <div className="bottom-button-area">
                    <div>
                        <AsyncButton onClick={onConfirm}>
                            Yes, add to existing content
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

export default ConfirmUnselectedNewDists;
