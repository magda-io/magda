import React, { FunctionComponent, useRef, useEffect } from "react";
import { connect } from "react-redux";
import { config } from "config";
import FileDeletionError from "helpers/FileDeletionError";
import ServerError from "@magda/typescript-common/dist/ServerError";
import TooltipWrapper from "Components/Common/TooltipWrapper";
import helpIcon from "assets/help.svg";
import "./ErrorMessageBox.scss";

type PropsType = {
    /**
     * redux global state data
     * use to access error that shared via redux state
     * available via `react-redux`. Should not passing via component props
     *
     * @type {*}
     */
    state?: any;

    /**
     * use for get error object from redux state
     *
     * @type {((state: any) => Error | null)}
     */
    stateErrorGetter?: (state: any) => Error | null;

    /**
     * error object that should be passed via component props
     * Only of `error` or `stateErrorGetter` should be specified
     * if both present, `error` has higher priority
     *
     * @type {(Error | null | string)}
     */
    error?: Error | null | string;

    /**
     * optional; auto move viewport to this error message box; default to false
     *
     * @type {boolean}
     */
    scrollIntoView?: boolean;
};

const ErrorMessageBox: FunctionComponent<PropsType> = (props) => {
    let { error } = props;

    if (typeof error === "undefined") {
        if (typeof props.stateErrorGetter === "function") {
            error = props.stateErrorGetter(props.state);
        } else {
            throw new Error(
                "ErrorMessageBox: either `error` or `stateErrorGetter` property must have valid value!"
            );
        }
    }

    const scrollIntoView =
        typeof props.scrollIntoView === "boolean"
            ? props.scrollIntoView
            : false;
    const errorContainerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => () => {
        if (errorContainerRef.current && scrollIntoView) {
            errorContainerRef.current.scrollIntoView();
        }
    });

    if (!error) {
        if (errorContainerRef) {
            errorContainerRef.current = null;
        }
        return null;
    }

    if (!error) return null;
    if (typeof error === "string") {
        return (
            <div className="error-message-box au-body au-page-alerts au-page-alerts--error">
                <span>{error}</span>
            </div>
        );
    } else if (error instanceof FileDeletionError) {
        return (
            <div className="error-message-box au-body au-page-alerts au-page-alerts--error file-deletion-error">
                {error.getErrorContent()}
            </div>
        );
    } else if (error instanceof ServerError) {
        switch (error.statusCode) {
            case 500:
                return (
                    <div className="error-message-box au-body au-page-alerts au-page-alerts--error server-error">
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
                    <div className="error-message-box au-body au-page-alerts au-page-alerts--error server-error">
                        <div>
                            <span>
                                Magda has encountered the following error:&nbsp;
                                {error.message ? error.message : "" + error}
                            </span>
                        </div>
                        <div>
                            <span>
                                We've logged this internally, please contact{" "}
                                <a
                                    href={`mailto:${config.defaultContactEmail}`}
                                >
                                    {config.defaultContactEmail}
                                </a>{" "}
                                for help.
                            </span>
                        </div>
                    </div>
                );
            case 401: //--- 401 reuse the same error message for 403
            case 403:
                const message = error.message;
                return (
                    <div className="error-message-box au-body au-page-alerts au-page-alerts--error server-error">
                        <div>
                            <span>
                                The operation failed due to insufficient
                                permissions
                            </span>
                            {message ? (
                                <span className="tooltip-container">
                                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                                    <TooltipWrapper
                                        className="tooltip no-print"
                                        launcher={() => (
                                            <div className="tooltip-launcher-icon help-icon">
                                                <img
                                                    src={helpIcon}
                                                    alt="More information on this error, click for more information"
                                                />
                                            </div>
                                        )}
                                        innerElementClassName="inner"
                                    >
                                        {() => message}
                                    </TooltipWrapper>
                                </span>
                            ) : null}
                            <span>
                                - please check your account permissions and try
                                again.
                            </span>
                        </div>
                    </div>
                );
            default:
                // --- any other errors that we don't have specific error message
                // --- could be the following: 404 (Not Found), 401 (Not Authorisied)
                return (
                    <div className="error-message-box au-body au-page-alerts au-page-alerts--error server-error">
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
    } else {
        // --- any other unknown error. Usually a front-end logic bug.
        return (
            <div className="error-message-box au-body au-page-alerts au-page-alerts--error">
                <div>
                    <span>
                        Magda has encountered the following error:&nbsp;
                        {error?.message ? error.message : "" + error}
                    </span>
                </div>
            </div>
        );
    }
};

export default connect((state: any) => ({
    state
}))(ErrorMessageBox);
