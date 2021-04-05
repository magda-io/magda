import MagdaDocumentTitle from "./Components/i18n/MagdaDocumentTitle";
import React from "react";
import { config } from "./config";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";

import Banner from "Components/Common/Banner";
import Footer from "Components/Footer/Footer";

import { requestWhoAmI } from "./actions/userManagementActions";
import { fetchContent } from "./actions/contentActions";
import Notification from "Components/Common/Notification";
import { hideTopNotification } from "./actions/topNotificationAction";

import Routes from "./Routes";

import { Medium } from "Components/Common/Responsive";

import { Route, Switch } from "react-router-dom";

import { getPluginFooter } from "externalPluginComponents";

import "./AppContainer.scss";

const ExternalFooterComponent = getPluginFooter();
class AppContainer extends React.Component {
    componentDidMount() {
        this.props.requestWhoAmI();
        this.props.fetchContent();
    }

    render() {
        return (
            <MagdaDocumentTitle>
                <div className="au-grid wrapper">
                    <div>
                        <nav
                            className="au-skip-link"
                            aria-label="skip links navigation"
                        >
                            <a className="au-skip-link__link" href="#content">
                                Skip to main content
                            </a>
                            <a className="au-skip-link__link" href="#nav">
                                Skip to main navigation
                            </a>
                        </nav>
                        {config.fallbackUrl && config.showNotificationBanner && (
                            <Medium>
                                <Banner fallbackUrl={config.fallbackUrl} />
                            </Medium>
                        )}
                        <Routes />
                    </div>

                    <Switch>
                        {/** turn off top margin for home page only */}
                        <Route
                            exact
                            path="/"
                            render={() =>
                                ExternalFooterComponent ? (
                                    <ExternalFooterComponent
                                        noTopMargin={true}
                                        isFetchingWhoAmI={
                                            this.props.isFetchingWhoAmI
                                        }
                                        user={this.props.user}
                                        whoAmIError={this.props.whoAmIError}
                                        footerMediumNavs={
                                            this.props.footerMediumNavs
                                        }
                                        footerSmallNavs={
                                            this.props.footerSmallNavs
                                        }
                                        footerCopyRightItems={
                                            this.props.footerCopyRightItems
                                        }
                                    />
                                ) : (
                                    <Footer noTopMargin={true} />
                                )
                            }
                        />
                        <Route
                            path="/*"
                            render={() =>
                                ExternalFooterComponent ? (
                                    <ExternalFooterComponent
                                        isFetchingWhoAmI={
                                            this.props.isFetchingWhoAmI
                                        }
                                        user={this.props.user}
                                        whoAmIError={this.props.whoAmIError}
                                        footerMediumNavs={
                                            this.props.footerMediumNavs
                                        }
                                        footerSmallNavs={
                                            this.props.footerSmallNavs
                                        }
                                        footerCopyRightItems={
                                            this.props.footerCopyRightItems
                                        }
                                    />
                                ) : (
                                    <Footer />
                                )
                            }
                        />
                    </Switch>

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
            </MagdaDocumentTitle>
        );
    }
}

const mapStateToProps = (state) => {
    return {
        topNotification: state.topNotification,
        isFetchingWhoAmI: state.userManagement.isFetchingWhoAmI,
        user: state.userManagement.user,
        whoAmIError: state.userManagement.whoAmIError,
        footerMediumNavs: state.content.footerMediumNavs,
        footerSmallNavs: state.content.footerSmallNavs,
        footerCopyRightItems: state.content.footerCopyRightItems
    };
};

const mapDispatchToProps = (dispatch) => {
    return bindActionCreators(
        {
            requestWhoAmI: requestWhoAmI,
            fetchContent,
            hideTopNotification
        },
        dispatch
    );
};

export default connect(mapStateToProps, mapDispatchToProps)(AppContainer);
