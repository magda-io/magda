import React from "react";
import AUtextInput from "../../pancake/react/text-inputs";
import AUbutton from "../../pancake/react/buttons";
import AUheader from "../../pancake/react/header";
import "./FormTemplate.css";

//This is the react form template
export default class RequestFormTemplate extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            message: "",
            senderName: "",
            senderEmail: "",
            senderEmailValid: true,
            messageValid: true,
            senderNameValid: true
        };
    }
    componentDidMount() {
        const message = this.props.message ? this.props.message : "";
        const senderEmail = this.props.senderEmail
            ? this.props.senderEmail
            : "";
        const senderName = this.props.senderName ? this.props.senderName : "";
        this.setState(() => {
            return {
                senderEmail,
                message,
                senderName
            };
        });
    }

    /**
     * performs some basic validation on the 3 inputs
     * @param {Object} state current state
     */
    checkRequiredFields(state) {
        // this below package validates emails.
        var validator = require("email-validator");
        const requiredFields = [];
        if (
            !state ||
            !state.senderEmail ||
            state.senderEmail.trim() === "" ||
            !validator.validate(state.senderEmail.trim())
        ) {
            requiredFields.push(`senderEmail`);
            this.setState({ senderEmailValid: false });
        } else {
            this.setState({ senderEmailValid: true });
        }
        if (!state || !state.senderName || state.senderName.trim() === "") {
            requiredFields.push(`senderName`);
            this.setState({ senderNameValid: false });
        } else {
            this.setState({ senderNameValid: true });
        }
        if (!state || !state.message || state.message.trim() === "") {
            requiredFields.push(`message`);
            this.setState({ messageValid: false });
        } else {
            this.setState({ messageValid: true });
        }
        if (requiredFields.length) return requiredFields;
        return null;
    }

    /**
     * If valid this form is submitted.
     */
    handleSubmit = e => {
        e.preventDefault();
        if (this.checkRequiredFields(this.state)) {
            return;
        }
        this.props.handleSubmit(this.state);
    };

    /**
     * Handles change event when typed into any of the form inputs.
     * Sets the state according to which input is being typed in
     */
    handleInputChange = event => {
        const inputId = event.target.id;
        const inputVal = event.target.value;
        this.setState(
            () => {
                return {
                    [inputId]: inputVal
                };
            },
            () => {
                // put this in a callback since setState is async
                this.props.handleChange(this.state);
            }
        );
    };

    render() {
        return (
            <form className="correspondence-form" method="post">
                {this.props.title &&
                    (this.props.smallTitle ? (
                        <h3 className="correspondence-small-title">
                            {this.props.title}
                        </h3>
                    ) : (
                        <AUheader title={this.props.title} />
                    ))}
                <label htmlFor="message" className="field-label">
                    {this.props.textAreaLabel} *
                </label>
                <AUtextInput
                    as="textarea"
                    id="message"
                    value={this.state.message}
                    className={
                        "correspondence-message-input " +
                        (this.state.messageValid
                            ? ""
                            : "au-text-input--invalid")
                    }
                    onChange={this.handleInputChange}
                    type="text"
                    placeholder={this.props.textAreaPlaceHolder}
                />
                {!this.state.messageValid && (
                    <label className="correspondence-field-error">
                        Please enter a valid message
                    </label>
                )}
                <label htmlFor="senderName" className="field-label">
                    Your Name *
                </label>
                <AUtextInput
                    id="senderName"
                    value={this.state.senderName}
                    onChange={this.handleInputChange}
                    type="text"
                    className={
                        "correspondence-name-input " +
                        (this.state.senderNameValid
                            ? ""
                            : "au-text-input--invalid")
                    }
                    placeholder={this.props.namePlaceHolder}
                />
                {!this.state.senderNameValid && (
                    <label className="correspondence-field-error">
                        Please enter a name
                    </label>
                )}
                <label htmlFor="senderEmail" className={"field-label"}>
                    Email *
                </label>
                <AUtextInput
                    id="senderEmail"
                    value={this.state.senderEmail}
                    onChange={this.handleInputChange}
                    className={
                        "correspondence-email-input " +
                        (this.state.senderEmailValid
                            ? ""
                            : "au-text-input--invalid")
                    }
                    placeholder={this.props.emailPlaceHolder}
                />
                {!this.state.senderEmailValid && (
                    <label className="correspondence-field-error">
                        Email is invalid
                    </label>
                )}
                <AUbutton
                    onClick={this.handleSubmit}
                    className="correspondence-submit-button"
                    type="submit"
                    disabled={this.props.isSending}
                >
                    {this.props.isSending ? "Sending..." : "Send"}
                </AUbutton>
            </form>
        );
    }
}
