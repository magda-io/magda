import React from "react";
import "./Alert.scss";

const Alert = (props) => {
    return (
        <div>
            <div
                className={`au-page-alerts au-page-alerts--${props.type} correspondence-alert`}
            >
                {props.header ? <h4>{props.header}</h4> : null}
                {props.header && props.message ? <br /> : null}
                {props.message && (
                    <React.Fragment>
                        <p className="correspondence-success-message">
                            {props.message.split(".")[0]}.
                        </p>
                        <p className="correspondence-success-message">
                            {props.message.split(".")[1]}
                        </p>
                    </React.Fragment>
                )}
            </div>
        </div>
    );
};

export default Alert;
