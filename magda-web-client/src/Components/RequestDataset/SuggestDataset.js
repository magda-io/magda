import React from "react";
import RequestFormLogic from "./RequestFormLogic";

export default class Suggest extends React.Component {
    //this is the page on /suggest url
    render() {
        const formProps = {
            title: "Suggest a Dataset",
            namePlaceHolder: "Irving Washington",
            emailPlaceHolder: "washington.irving@mail.com",
            textAreaPlaceHolder:
                "Location of all industrial solar plants in Victoria",
            textAreaLabel: "What sort of data are you looking for?"
        };
        const alertProps = {
            successMessage: `Someone from the Australian Digital Transformation
            Agency or the organisation that handles the relevant
            data will get in touch soon. Please note that the
            time taken to action your request may vary depending
            on the nature of the request.`,
            successHeader: "Your request has been sent!",
            failMessage: null,
            failHeader: "Uh oh. We've run into an error. Please try again."
        };

        return (
            <RequestFormLogic
                formProps={formProps}
                alertProps={alertProps}
                requestType="request"
            />
        );
    }
}
