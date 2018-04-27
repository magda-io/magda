import React from "react";
import Input from "muicss/lib/react/input";
import { fetchFeedback, resetFeedback } from "../actions/feedbackActions";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import "./FeedbackForm.css";
import Button from "muicss/lib/react/button";
import Textarea from "muicss/lib/react/textarea";
import feedback from "../assets/feedback.svg";
import close from "../assets/close.svg";
import success from "../assets/success.svg";
import Notification from "../UI/Notification";
import ReactTooltip from "react-tooltip";
import { Medium } from "../UI/Responsive";

class FeedbackForm extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            isOpen: false,
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
        this.setState({
            isOpen: false,
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
        this.setState({
            isOpen: false,
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
                    <span
                    >{`Have feedback on this website? We're all ears`}</span>
                    <Button
                        className="close-btn"
                        onClick={() => {
                            this.setState({ isOpen: false });
                        }}
                        title="close feedback"
                    >
                        <img alt="close" src={close} />
                    </Button>
                </div>
                <div className="feedback-form-body">
                    <Input
                        label="Name"
                        value={this.state.name}
                        onChange={this.changeValue.bind(this, "name")}
                    />
                    <Input
                        label="Email (*)"
                        value={this.state.email}
                        onChange={this.changeValue.bind(this, "email")}
                    />
                    <Textarea
                        label="Feedback (*)"
                        value={this.state.feedback}
                        onChange={this.changeValue.bind(this, "feedback")}
                    />
                    <div className="feedback-form-footer">
                        <Button
                            variant="flat"
                            disabled={this.props.isSendingFeedback}
                            onClick={this.onCancel}
                        >
                            Cancel
                        </Button>

                        <Button
                            className="send-btn disabled-looking-button"
                            onClick={this.onSubmit}
                            data-tip={this.state.validationErrorMessage}
                            data-place="top"
                        >
                            {this.props.isSendingFeedback
                                ? "Sending..."
                                : "Send"}
                        </Button>

                        <ReactTooltip />
                        <div className="privacy-link">
                            <a href="/page/privacy-policy" target="_blank">
                                Privacy Policy
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    render() {
        return (
            <div className="feedback-form">
                <Medium>
                    <Button
                        className="feedback-button"
                        onClick={() => this.setState({ isOpen: true })}
                    >
                        <img alt="feedback" src={feedback} />Give feedback
                    </Button>
                </Medium>
                {this.state.isOpen && this.renderByState()}
            </div>
        );
    }
}

function mapStateToProps(state) {
    const feedback = state.feedback;
    const isSendingFeedback = feedback.isSendingFeedback;
    const sendFeedbackFailed = feedback.sendFeedbackFailed;
    const sendFeedbackSuccess = feedback.sendFeedbackSuccess;
    return {
        isSendingFeedback,
        sendFeedbackFailed,
        sendFeedbackSuccess
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            fetchFeedback: fetchFeedback,
            resetFeedback: resetFeedback
        },
        dispatch
    );
};

export default connect(mapStateToProps, mapDispatchToProps)(FeedbackForm);
