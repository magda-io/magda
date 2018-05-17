import React from "react";
import AUpageAlert from "@gov.au/page-alerts";

const Alert = props => {
    return (
        <main className="au-grid">
            <div className="container">
                <div className="row">
                    <div className="col-md-6">
                        <AUpageAlert as={props.type}>
                            <h5>{props.header}</h5>
                        </AUpageAlert>
                        <br />
                        <p className="success-page-message">{props.message}</p>
                    </div>
                </div>
            </div>
        </main>
    );
};

export default Alert;
