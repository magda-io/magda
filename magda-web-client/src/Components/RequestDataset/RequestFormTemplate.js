import React from "react";
import AUtextInput from "@gov.au/text-inputs";
import AUbutton from "@gov.au/buttons";
import AUheader from "@gov.au/header";
import "./FormTemplate.css";
import Form from "muicss/lib/react/form";

export default class RequestFormTemplate extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            textAreaValue: "",
            nameInputValue: "",
            emailInputvalue: ""
        };
    }

    handleSubmit = () => {
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
                this.setState({ textAreaValue: inputVal });
                break;
            case "name-input":
                this.setState({ nameInputValue: inputVal });
                break;
            case "email-input":
                this.setState({ emailInputvalue: inputVal });
                break;
            default:
                break;
        }
    };

    render() {
        return (
            <Form>
                <AUheader title={this.props.title} />
                <label htmlFor="textarea-input">
                    {this.props.textAreaLabel}
                </label>
                <AUtextInput
                    as="textarea"
                    id="textarea-input"
                    className="textarea-input"
                    onChange={this.handleInputChange}
                    placeholder={this.props.textAreaPlaceHolder}
                />
                <label htmlFor="name-input">Your Name</label>
                <AUtextInput
                    id="name-input"
                    onChange={this.handleInputChange}
                    className="suggest-page-input"
                    placeholder={this.props.namePlaceHolder}
                />
                <label htmlFor="email-input">Email</label>
                <AUtextInput
                    id="email-input"
                    onChange={this.handleInputChange}
                    className="suggest-page-input"
                    placeholder={this.props.emailPlaceHolder}
                />
                <AUbutton onClick={this.handleSubmit}>Send</AUbutton>
            </Form>
        );
    }
}
