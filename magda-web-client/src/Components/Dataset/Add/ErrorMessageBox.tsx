import React, { FunctionComponent } from "react";
import { connect } from "react-redux";
import ServerError from "./Errors/ServerError";

type Props = {
    error?: Error | null;
};

const ErrorMessageBox: FunctionComponent<Props> = props => {
    const { error } = props;
    if (!error) return null;
    if (error instanceof ServerError) {
        switch (error.statusCode) {
            case 500:
                return (
                    <div className="au-body au-page-alerts au-page-alerts--error">
                        <div>
                            <span>
                                Magda has encountered an error when submitting
                                your dataset.
                            </span>
                        </div>
                        <div>
                            <span>
                                Everything is still saved locally - please try
                                again in 5 minutes.
                            </span>
                        </div>
                    </div>
                );
            case 400:
                return (
                    <div className="au-body au-page-alerts au-page-alerts--error">
                        <div>
                            <span>
                                Magda has encountered the following error:
                                {error.message ? error.message : "" + error}.
                            </span>
                        </div>
                        <div>
                            <span>
                                We've logged this internally, please contact $
                                [emailAddress] for help.
                            </span>
                        </div>
                    </div>
                );
            case 403:
                return (
                    <div className="au-body au-page-alerts au-page-alerts--error">
                        <span>
                            You've been logged out - please Sign In again to
                            submit the dataset - everything has been saved
                            locally.
                        </span>
                    </div>
                );
            default:
                // --- any other errors that we don't have specific error message
                // --- could be the following: 404 (Not Found), 401 (Not Authorisied)
                return (
                    <div className="au-body au-page-alerts au-page-alerts--error">
                        <div>
                            <span>
                                Magda has encountered an error (statusCode:{" "}
                                {error.statusCode}) when submitting your
                                dataset.
                            </span>
                        </div>
                        <div>
                            <span>
                                Everything is still saved locally - please try
                                again in 5 minutes.
                            </span>
                        </div>
                    </div>
                );
        }
    }
    // --- any other unknown error. Usually a front-end logic bug.
    return (
        <div className="au-body au-page-alerts au-page-alerts--error">
            <div>
                <span>
                    Magda has encountered the following error:
                    {error.message ? error.message : "" + error}.
                </span>
            </div>
            <div>
                <span>Please contact $ [emailAddress] for help.</span>
            </div>
        </div>
    );
};

export default connect(state => ({
    error:
        state.record && state.record.newDataset
            ? state.record.newDataset.error
            : null
}))(ErrorMessageBox);
