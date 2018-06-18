import React from "react";
import AUpageAlert from "../../pancake/react/page-alerts";
import "./Alert.css";

const Alert = props => {
    return (
        <div>
            <AUpageAlert as={props.type} className="correspondence-alert">
                <h5>{props.header}</h5>
            </AUpageAlert>
            <br />
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
    );
};

export default Alert;
