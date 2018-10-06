import ReactDocumentTitle from "react-document-title";
import React from "react";
import ReactGA from "react-ga";
import { config } from "./config.js";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";

import Banner from "./UI/Banner";
import Footer from "./Components/Footer/Footer";

import { requestWhoAmI } from "./actions/userManagementActions";
import Notification from "./UI/Notification";
import { hideTopNotification } from "./actions/topNotificationAction";

import HomePage from "./Pages/HomePage";
import OtherPages from "./Pages/OtherPages";

import { Route, Switch } from "react-router-dom";
import { Medium } from "./UI/Responsive";
import AUskipLink from "./pancake/react/skip-link";

import "./AppContainer.css";

class AppContainer extends React.Component {
    componentDidMount() {
        this.props.requestWhoAmI();

        const _trackers = [];

        // Create GA trackers from the list provided to us
        config.gapiId
            ? [config.gapiId].map(trackingId =>
                  _trackers.push({
                      trackingId,
                      options: {
                          debug: false,
                          alwaysSendToDefaultTracker: false
                      }
                  })
              )
            : null;

        // Initalise Google Analytics with tracker provided to web-server
        ReactGA.initialize([
            {
                trackingId: _trackers
            }
        ]);
    }

    render() {
        const footerNavs = config.footerNavigation;
        return (
            <ReactDocumentTitle title={config.appName}>
                <div className="au-grid wrapper">
                    <div>
                        <AUskipLink
                            links={[
                                {
                                    link: "#content",
                                    text: "Skip to main content"
                                },
                                {
                                    link: "#nav",
                                    text: "Skip to main navigation"
                                }
                            ]}
                        />
                        {config.fallbackUrl && (
                            <Medium>
                                <Banner fallbackUrl={config.fallbackUrl} />
                            </Medium>
                        )}

                        <Switch>
                            <Route exact path="/" component={HomePage} />
                            <Route path="/*" component={OtherPages} />
                        </Switch>
                    </div>

                    <Footer footerNavs={footerNavs} />

                    {this.props.topNotification.visible ? (
                        <Notification
                            content={{
                                title: this.props.topNotification.title,
                                detail: this.props.topNotification.message
                            }}
                            type={this.props.topNotification.type}
                            onDismiss={() => {
                                this.props.hideTopNotification();
                                if (
                                    !this.props.topNotification.onDismiss ||
                                    typeof this.props.topNotification
                                        .onDismiss !== "function"
                                ) {
                                    return;
                                }
                                this.props.topNotification.onDismiss();
                            }}
                        />
                    ) : null}
                </div>
            </ReactDocumentTitle>
        );
    }
}

const mapStateToProps = state => {
    return {
        topNotification: state.topNotification
    };
};

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            requestWhoAmI: requestWhoAmI,
            hideTopNotification
        },
        dispatch
    );
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(AppContainer);
