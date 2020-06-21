import React, { FunctionComponent } from "react";
import Modal from "react-modal";

import "./OverlayBox.scss";
import { ReactComponent as DismissIcon } from "assets/dismiss.svg";

type PropsType = {
    isOpen: boolean;
    className?: string;
    title?: string;
    showCloseButton?: boolean;
    onClose?: () => void;
};

const DEFAULT_TITLE = "Untitled Overlay";
const customStyles = {
    overlay: {
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "background-color": null
    },
    content: {
        top: null,
        bottom: null,
        "border-radius": "8px",
        padding: null
    }
};

const OverlayBox: FunctionComponent<PropsType> = (props) => {
    const title = props.title ? props.title : DEFAULT_TITLE;

    return (
        <Modal style={customStyles} isOpen={props.isOpen} contentLabel={title}>
            <div
                className={`overlay-box-outter-container ${
                    props.className ? props.className : ""
                }`}
            >
                <div className="overlay-box-header">
                    {title}
                    <DismissIcon />
                </div>
                <div className="overlay-box-body">{props.children}</div>
            </div>
        </Modal>
    );
};

export default OverlayBox;
