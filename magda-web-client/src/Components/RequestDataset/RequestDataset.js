import React from "react";
import RequestFormTemplate from "./RequestFormTemplate";
import SuccessAlert from "./SuccessAlert";

export default class RequestDataset extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            successResult: false
        };
    }
    /**
     * handles the logic of submitting form
     * I still need the form submission logic to be implemented
     * @param {Object} data form submitted data from child component "RequestFormTemplate.js"
     */
    handleSubmit = data => {
        const successResult = true;
        this.setState(() => {
            return { successResult: successResult };
        });
    };

    render() {
        const props = {
            title: "Suggest a Dataset",
            namePlaceHolder: "Irving Washington",
            emailPlaceHolder: "washington.irving@mail.com",
            textAreaPlaceHolder:
                "Location of all industrial solar plants in Victoria",
            textAreaLabel: "What sort of data are you looking for?",
            handleSubmit: this.handleSubmit
        };
        if (!this.state.successResult) {
            return <RequestFormTemplate {...props} />;
        } else {
            return <SuccessAlert />;
        }
    }
}
