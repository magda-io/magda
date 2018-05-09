import React from "react";
import AUtextInput from "@gov.au/text-inputs";
import AUbutton from "@gov.au/buttons";
import AUheader from "@gov.au/header";
import "./FormTemplate.css";

export default class RequestFormTemplate extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            message: "",
            senderName: "",
            senderEmail: "",
            emailValid: true,
            messageValid: true,
            nameValid: true
        };
    }

    /**
     * performs some basic validation on the 3 inputs
     * @param {Object} state current state
     */
    checkRequiredFields(state) {
        const requiredFields = [];
        if (!state || !state.senderEmail || state.senderEmail.trim() === "") {
            requiredFields.push(`senderEmail`);
            this.setState({ emailValid: false });
        } else {
            this.setState({ emailValid: true });
        }
        if (!state || !state.senderName || state.senderName.trim() === "") {
            requiredFields.push(`senderName`);
            this.setState({ nameValid: false });
        } else {
            this.setState({ nameValid: true });
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
        const inputVal = event.target.value.trim();
        switch (inputId) {
            case "textarea-input":
                this.setState({ message: inputVal });
                break;
            case "name-input":
                this.setState({ senderName: inputVal });
                break;
            case "email-input":
                this.setState({ senderEmail: inputVal });
                break;
            default:
                break;
        }
    };

    render() {
        return (
            <form>
                {this.props.title && <AUheader title={this.props.title} />}
                <label htmlFor="textarea-input">
                    {this.props.textAreaLabel}
                </label>
                <AUtextInput
                    as="textarea"
                    id="textarea-input"
                    className={
                        "textarea-input " +
                        (this.state.messageValid
                            ? ""
                            : "au-text-input--invalid")
                    }
                    onChange={this.handleInputChange}
                    type="text"
                    placeholder={this.props.textAreaPlaceHolder}
                />
                <label htmlFor="name-input">Your Name</label>
                <AUtextInput
                    id="name-input"
                    onChange={this.handleInputChange}
                    type="text"
                    className={
                        "suggest-page-input " +
                        (this.state.nameValid ? "" : "au-text-input--invalid")
                    }
                    placeholder={this.props.namePlaceHolder}
                />
                <label htmlFor="email-input">Email</label>
                <AUtextInput
                    id="email-input"
                    onChange={this.handleInputChange}
                    className={
                        "suggest-page-input " +
                        (this.state.emailValid ? "" : "au-text-input--invalid")
                    }
                    placeholder={this.props.emailPlaceHolder}
                />
                <AUbutton
                    onClick={this.handleSubmit}
                    className="submit-button"
                    type="submit"
                >
                    Send
                </AUbutton>
            </form>
        );
    }
}
