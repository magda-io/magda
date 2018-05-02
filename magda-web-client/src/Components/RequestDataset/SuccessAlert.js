import React from "react";
import AUpageAlert from "@gov.au/page-alerts";
import "./SuccessPage.css";

const SuccessAlert = () => {
    return (
        <main className="au-grid">
            <div className="container">
                <div className="row">
                    <div className="col-md-6">
                        <AUpageAlert as="success">
                            <h5>Your request has been sent!</h5>
                        </AUpageAlert>
                        <br />
                        <p className="success-page-message">
                            Someone from the Australian Digital Transformation
                            Agency or the organisation that handles the relevant
                            data will get in touch soon. Please note that the
                            time taken to action your request may vary depending
                            on the nature of the request.
                        </p>
                    </div>
                </div>
            </div>
        </main>
    );
};

export default SuccessAlert;
