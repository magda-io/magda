import React from "react";
import "./Notification.css";
import close from "../assets/close.svg";

function Notification(props) {
    return (
        <div className={`notification notification__${props.type}`}>
            <div className="notification__inner">
                <div
                    className={`notification__header ${
                        props.icon ? "with-icon" : ""
                    }`}
                >
                    {props.icon && (
                        <img
                            className="status-icon"
                            alt={props.type}
                            src={props.icon}
                        />
                    )}
                    <span>{props.content.title}</span>
                    <button
                        onClick={props.onDismiss}
                        className="au-btn close-btn"
                    >
                        <img alt="close" src={close} />
                    </button>
                </div>
                <div className="notification__body">{props.content.detail}</div>
            </div>
        </div>
    );
}

Notification.defaultProps = { content: { title: "", detail: "" }, type: "" };

export default Notification;
