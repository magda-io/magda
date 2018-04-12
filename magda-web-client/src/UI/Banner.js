import { bindActionCreators } from "redux";

import React from "react";
import { connect } from "react-redux";
import "./Banner.css";
import close from "../assets/close-light.svg";
import { closeTopBanner } from "../actions/topBanner";

class Banner extends React.Component {
    constructor(props) {
        super(props);
        this.state = { isOpen: true };
    }

    goBack = event => {
        event.preventDefault();

        if (window.location.hostname === "search.data.gov.au") {
            // Delete all VWO's cookies
            const cookieNames = document.cookie.split(/=[^;]*(?:;\s*|$)/);
            // Remove any that match the pattern
            for (var i = 0; i < cookieNames.length; i++) {
                if (/^_(vis|vwo).*/.test(cookieNames[i])) {
                    console.log(cookieNames[i]);
                    document.cookie =
                        cookieNames[i] +
                        "=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/;domain=.data.gov.au";
                }
            }

            // Add our cookie
            document.cookie = "noPreview=true; path=/; domain=.data.gov.au";
        }

        window.location = "https://data.gov.au";
    };

    render() {
        if (this.state.isOpen) {
            return (
                <div className="banner">
                    <span>
                        A new look for Australia&apos;s data portal: our updated
                        site makes it easier for you to find relevant open data.
                        You can still{" "}
                        <a onClick={this.goBack} href="https://data.gov.au/">
                            go back
                        </a>{" "}
                        to the old site
                    </span>
                    <button
                        type="button"
                        className="close-btn"
                        onClick={() => {
                            this.setState({ isOpen: false });
                            this.props.closeTopBanner();
                        }}
                    >
                        <img alt="close banner" src={close} />
                    </button>
                </div>
            );
        }
        return null;
    }
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            closeTopBanner: closeTopBanner
        },
        dispatch
    );
};

export default connect(null, mapDispatchToProps)(Banner);
