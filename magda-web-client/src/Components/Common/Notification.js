import React from "react";
import "./Notification.scss";
import close from "assets/close.svg";
import AUpageAlert from "pancake/react/page-alerts";

function Notification(props) {
    let type = props.type;
    if (!type) type = "info";

    let content = props.conent;
    if (!content) content = {};

    if (content instanceof Error) {
        type = "error";
        content = {
            title: "Error:",
            detail: content.message
        };
    }

    let { title, detail } = props.content;
    if (!title) title = "";
    if (!detail) detail = "";
    if (!detail && title) detail = title;

    return (
        <div className="notification-box">
            <AUpageAlert as={type} className="notification__inner">
                {props.onDismiss && (
                    <button
                        onClick={props.onDismiss}
                        className="au-btn close-btn au-btn--secondary"
                    >
                        <img alt="close" src={close} />
                    </button>
                )}
                {title ? <h3>{title}</h3> : null}
                <p>{detail}</p>
            </AUpageAlert>
        </div>
    );
}

Notification.defaultProps = { content: { title: "", detail: "" }, type: "" };

export default Notification;
