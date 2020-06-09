import { bindActionCreators } from "redux";
import Cookies from "js-cookie";

import React from "react";
import { connect } from "react-redux";
import "./Banner.scss";
import { closeTopBanner } from "actions/topBanner";

class Banner extends React.Component {
    constructor(props) {
        super(props);
        this.state = { isOpen: true };
    }

    goBack = (event) => {
        event.preventDefault();

        if (window.location.hostname === "search.data.gov.au") {
            // Delete all VWO's cookies
            const cookieNames = Object.keys(Cookies.get());
            cookieNames
                .filter((name) => /^_(vis|vwo).*/.test(name))
                .forEach((name) =>
                    Cookies.remove(name, {
                        path: "/",
                        domain: ".data.gov.au"
                    })
                );

            // Add our cookie
            Cookies.set("noPreview", "true", {
                path: "/",
                domain: ".data.gov.au"
            });
        }

        window.location = this.props.fallbackUrl;
    };

    render() {
        if (this.state.isOpen) {
            return (
                <div className="banner au-body au-body--dark no-print">
                    <span>
                        A new look for Australia&apos;s data portal: our updated
                        site makes it easier for you to find relevant open data.
                        You can still{" "}
                        <a onClick={this.goBack} href={this.props.fallbackUrl}>
                            go back to the old site
                        </a>
                    </span>
                    <button
                        type="button"
                        className="close-btn"
                        onClick={() => {
                            this.setState({ isOpen: false });
                            this.props.closeTopBanner();
                        }}
                    />
                </div>
            );
        }
        return null;
    }
}

const mapDispatchToProps = (dispatch) => {
    return bindActionCreators(
        {
            closeTopBanner: closeTopBanner
        },
        dispatch
    );
};

export default connect(null, mapDispatchToProps)(Banner);
