import React from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import {
    fetchFeedback,
    resetFeedback,
    hideFeedbackForm,
    showFeedbackForm
} from "actions/feedbackActions";
import close from "assets/close.svg";
import success from "assets/success.svg";
import Notification from "Components/Common/Notification";
import CommonLink from "Components/Common/CommonLink";

import "./FeedbackForm.scss";

class FeedbackForm extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            name: "",
            email: "",
            feedback: "",
            validationErrorMessage: this.checkRequiredFields(this.state)
        };

        this.onCancel = this.onCancel.bind(this);
        this.changeValue = this.changeValue.bind(this);
        this.onSubmit = this.onSubmit.bind(this);
        this.onDismissNotification = this.onDismissNotification.bind(this);
    }

    /**
     * Make sure different wording will be used depends on no. of the field items
     */
    createFieldListString(fields) {
        if (!fields || !fields.length) return null;
        if (fields.length === 1) return `${fields[0]} field is`;
        const lastField = fields.pop();
        return fields.join(", ") + ` & ${lastField} fields are`;
    }

    checkRequiredFields(state) {
        const requiredFields = [];
        if (!state || !state.email || state.email.trim() === "")
            requiredFields.push(`Email`);
        if (!state || !state.feedback || state.feedback.trim() === "")
            requiredFields.push(`Feedback`);
        if (requiredFields.length)
            return this.createFieldListString(requiredFields) + " mandatory.";
        return null;
    }

    onSubmit() {
        /**
         * It seems once the button is disabled, mouse related events won't trigger anymore --- this will break the tooltip.
         * Instead of having button disabled, we will check here to make sure feedback is only sent when no validation error.
         */
        if (this.state.validationErrorMessage) return;
        this.props.fetchFeedback(
            JSON.stringify({
                name: this.state.name,
                email: this.state.email,
                comment: this.state.feedback
            })
        );
    }

    onCancel() {
        this.props.hideFeedbackForm();
        this.setState({
            name: "",
            email: "",
            feedback: "",
            validationErrorMessage: this.checkRequiredFields()
        });
    }

    changeValue(key, event) {
        let curState = {
            ...this.state,
            [key]: event.target.value
        };

        this.setState({
            [key]: event.target.value,
            validationErrorMessage: this.checkRequiredFields(curState)
        });
    }

    onDismissNotification() {
        this.props.resetFeedback();
        this.props.hideFeedbackForm();
        this.setState({
            name: "",
            email: "",
            feedback: "",
            validationErrorMessage: this.checkRequiredFields()
        });
    }

    onDismissErrorNotification() {
        this.setState({
            errorMessage: null
        });
    }

    renderByState() {
        if (this.props.sendFeedbackSuccess === true) {
            return (
                <Notification
                    content={{
                        title: "Thanks for your feedback !",
                        detail:
                            "This is very much a work in progress and your feedback helps us deliver a better website"
                    }}
                    type="success"
                    icon={success}
                    onDismiss={this.onDismissNotification}
                />
            );
        }

        if (this.props.sendFeedbackFailed === true) {
            return (
                <Notification
                    content={{
                        title: "We are so sorry !",
                        detail: "Error occured, please try later"
                    }}
                    type="error"
                    onDismiss={this.onDismissNotification}
                />
            );
        }
        return (
            <div className="feedback-form-inner">
                <div className="feedback-form-header">
                    <span>{`Have feedback on this website? We're all ears`}</span>
                    <button
                        className="close-btn au-btn au-btn--secondary"
                        onClick={() => {
                            this.props.hideFeedbackForm();
                        }}
                        title="close feedback"
                    >
                        <img alt="close" src={close} />
                    </button>
                </div>
                <div className="feedback-form-body">
                    <div className="feedback-form-field">
                        <label htmlFor="Name">Name</label>
                        <input
                            className="au-text-input"
                            id="Name"
                            value={this.state.name}
                            onChange={this.changeValue.bind(this, "name")}
                        />
                    </div>
                    <div className="feedback-form-field">
                        <label htmlFor="Email (*)">Email (*)</label>
                        <input
                            className="au-text-input"
                            id="Email (*)"
                            value={this.state.email}
                            onChange={this.changeValue.bind(this, "email")}
                        />
                    </div>
                    <div className="feedback-form-field">
                        <label htmlFor="Feedback (*)">Feedback (*)</label>
                        <textarea
                            className="au-text-input au-text-input--block"
                            name="Feedback (*)"
                            id="Feedback (*)"
                            value={this.state.feedback}
                            onChange={this.changeValue.bind(this, "feedback")}
                        />
                    </div>
                    <div className="feedback-form-footer">
                        <button
                            className="au-btn au-btn--tertiary send-btn disabled-looking-button"
                            disabled={this.props.isSendingFeedback}
                            onClick={this.onCancel}
                        >
                            Cancel
                        </button>

                        <button
                            className="au-btn "
                            onClick={this.onSubmit}
                            data-tip={this.state.validationErrorMessage}
                            data-place="top"
                            disabled={this.props.isSendingFeedback}
                        >
                            {this.props.isSendingFeedback
                                ? "Sending..."
                                : "Send"}
                        </button>
                        <div className="privacy-link">
                            <CommonLink
                                href="/page/privacy-policy"
                                target="_blank"
                            >
                                Privacy Policy
                            </CommonLink>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    render() {
        return this.props.isShowingFeedbackForm ? (
            <div className="feedback-form">{this.renderByState()}</div>
        ) : null;
    }
}

function mapStateToProps({
    feedback: {
        isShowingFeedbackForm,
        isSendingFeedback,
        sendFeedbackFailed,
        sendFeedbackSuccess
    }
}) {
    return {
        isShowingFeedbackForm,
        isSendingFeedback,
        sendFeedbackFailed,
        sendFeedbackSuccess
    };
}

const mapDispatchToProps = (dispatch) => {
    return bindActionCreators(
        {
            fetchFeedback: fetchFeedback,
            resetFeedback: resetFeedback,
            hideFeedbackForm,
            showFeedbackForm
        },
        dispatch
    );
};

export default connect(mapStateToProps, mapDispatchToProps)(FeedbackForm);
