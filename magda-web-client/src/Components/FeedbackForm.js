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

class FeedbackForm extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            isOpen: false,
            name: "",
            email: "",
            feedback: "",
            errorMessage: null
        };
        this.onCancel = this.onCancel.bind(this);
        this.changeValue = this.changeValue.bind(this);
        this.onSubmit = this.onSubmit.bind(this);
        this.onDismissNotification = this.onDismissNotification.bind(this);
    }

    onSubmit() {
        if(this.state.email.trim()==='') {
            this.setState({
                errorMessage : "`Email` field is mandatory."
            });
            return;
        }
        if(this.state.feedback.trim()==='') {
            this.setState({
                errorMessage : "`Feedback` field is mandatory."
            });
            return;
        }
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
            feedback: ""
        });
    }

    changeValue(key, event) {
        this.setState({
            [key]: event.target.value
        });
    }

    onDismissNotification() {
        this.props.resetFeedback();
        this.setState({
            isOpen: false,
            name: "",
            email: "",
            feedback: ""
        });
    }

    onDismissErrorNotification() {
        this.setState({
            errorMessage : null
        })
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
                {this.state.errorMessage ? (
                    <Notification content={{title: 'Error:', detail: this.state.errorMessage}} type='error' onDismiss={()=>this.onDismissErrorNotification()}/>
                ) : null}
                <div className="feedback-form-header">
                    {`Have feedback on this website? We're all ears`}
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
                            className="send-btn"
                            disabled={this.props.isSendingFeedback}
                            onClick={this.onSubmit}
                        >
                            {this.props.isSendingFeedback
                                ? "Sending..."
                                : "Send"}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    render() {
        return (
            <div className="feedback-form">
                <Button
                    className="feedback-button"
                    onClick={() => this.setState({ isOpen: true })}
                >
                    <img alt="feedback" src={feedback} />Give feedback
                </Button>
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
