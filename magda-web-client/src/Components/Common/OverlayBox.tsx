import React, { FunctionComponent } from "react";
import Modal from "react-modal";

import "./OverlayBox.scss";
import { ReactComponent as DismissIcon } from "assets/dismiss.svg";

Modal.setAppElement("#root");

type OverlayBoxOwnProps = {
    isOpen: boolean;
    className?: string;
    title?: string;
    showCloseButton?: boolean;
    onClose?: () => void;
};

type PropsType = OverlayBoxOwnProps &
    Partial<Exclude<Modal.Props, OverlayBoxOwnProps>>;

const DEFAULT_TITLE = "Untitled Overlay";
const customStyles = {
    overlay: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "none"
    },
    content: {
        top: undefined,
        bottom: undefined,
        borderRadius: "8px",
        padding: undefined,
        left: 30,
        right: 30,
        "max-height": "98vh"
    }
};

const OverlayBox: FunctionComponent<PropsType> = (props) => {
    const {
        title,
        isOpen: defaultIsOpen,
        className,
        showCloseButton,
        ...restProps
    } = props;

    const runtimeTitle = title ? title : DEFAULT_TITLE;

    return (
        <Modal
            style={customStyles}
            isOpen={props.isOpen}
            contentLabel={runtimeTitle}
            {...restProps}
        >
            <div
                className={`overlay-box-outer-container ${
                    props.className ? props.className : ""
                }`}
            >
                <div className="overlay-box-header">
                    {runtimeTitle}
                    {typeof showCloseButton !== "boolean" || showCloseButton ? (
                        <DismissIcon onClick={props.onClose} />
                    ) : null}
                </div>
                <div className="overlay-box-body au-grid container">
                    {props.children}
                </div>
            </div>
        </Modal>
    );
};

export default OverlayBox;
