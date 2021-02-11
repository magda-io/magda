import React from "react";
import RequestFormLogic from "./Suggest/RequestFormLogic";
import MagdaDocumentTitle from "Components/i18n/MagdaDocumentTitle";
import MagdaNamespacesConsumer from "Components/i18n/MagdaNamespacesConsumer";
import Breadcrumbs from "Components/Common/Breadcrumbs";
import { Medium } from "Components/Common/Responsive";
import { connect } from "react-redux";

export class Suggest extends React.Component {
    //this is the page on /suggest url
    constructor(props) {
        super(props);
        this.state = {
            message: "",
            senderEmail: "",
            senderName: ""
        };
    }

    /**
     * If the form is posted successfully the form will reset to default values,
     * else the values typed in previously are retained.
     * @data: is the object consisting of email, message and name
     * @isFormPosted: is a boolean to say whether or not the form is posted
     * successfully or not
     */
    handleChange = (data, isFormPosted) => {
        const senderEmail = isFormPosted ? "" : data.senderEmail;
        const message = isFormPosted ? "" : data.message;
        const senderName = isFormPosted ? "" : data.senderName;
        this.setState(() => {
            return {
                senderEmail,
                message,
                senderName
            };
        });
    };

    render() {
        return (
            <MagdaDocumentTitle prefixes={["Suggest a Dataset"]}>
                <div>
                    <Medium>
                        <Breadcrumbs
                            breadcrumbs={[
                                <li>
                                    <span>Suggest a Dataset</span>
                                </li>
                            ]}
                        />
                    </Medium>
                    <MagdaNamespacesConsumer ns={["global"]}>
                        {(translate) => {
                            const appName = translate(["appName", "Magda"]);
                            const formProps = {
                                title: "Suggest a Dataset",
                                description: `We are always interested in finding out what datasets people need.  While we cannot guarantee that we can find or publish the data, your suggestion will help improve ${appName}.`,
                                namePlaceHolder: "Dorothy Hill",
                                emailPlaceHolder: "dorothyhill@example.com",
                                textAreaPlaceHolder:
                                    "It helps if you're really specific on the kind of data you're looking for and what you would use it for. Feel free to report any problems you run into as well.",
                                textAreaLabel:
                                    "What sort of data are you looking for?",
                                successHeader:
                                    "Your suggestion has been submitted!"
                            };

                            return (
                                <RequestFormLogic
                                    formProps={formProps}
                                    requestType="request"
                                    senderName={this.state.senderName}
                                    senderEmail={this.state.senderEmail}
                                    message={this.state.message}
                                    handleChange={this.handleChange}
                                />
                            );
                        }}
                    </MagdaNamespacesConsumer>
                </div>
            </MagdaDocumentTitle>
        );
    }
}

function mapStateToProps(state) {
    return {
        strings: state.content.strings
    };
}

export default connect(mapStateToProps, null)(Suggest);
