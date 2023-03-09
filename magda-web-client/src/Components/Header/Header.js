import React, { Component } from "react";
import CommonLink from "../Common/CommonLink";
import HeaderNav from "./HeaderNav";
import "./Header.scss";
import { config } from "../../config";
import { Small, Medium } from "Components/Common/Responsive";
import MagdaNamespacesConsumer from "Components/i18n/MagdaNamespacesConsumer";
import { needsContent } from "helpers/content";
import { withRouter } from "react-router-dom";

class Header extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isMobileMenuOpen: false
        };
    }

    componentDidMount() {
        this.unListen = this.props.history.listen(() => {
            this.setState({
                isMobileMenuOpen: false
            });
        });
    }

    componentWillUnmount() {
        this.unListen();
    }

    toggleMenu() {
        this.setState({
            isMobileMenuOpen: !this.state.isMobileMenuOpen
        });
    }

    render() {
        return (
            <MagdaNamespacesConsumer ns={["global"]}>
                {(translate) => {
                    const applicationName = translate(["appName", "Magda"]);

                    return (
                        <div className="header">
                            <div className="au-header">
                                <div className="container">
                                    <div className="row">
                                        <div className="col-md-4 col-xs-12">
                                            <CommonLink
                                                to={config.homePageUrl}
                                                className="au-header__brand"
                                            >
                                                <Small>
                                                    <img
                                                        src={
                                                            config.headerMobileLogoUrl
                                                        }
                                                        alt={applicationName}
                                                        className="au-header__logo"
                                                    />
                                                </Small>
                                                <Medium>
                                                    <img
                                                        src={
                                                            config.headerLogoUrl
                                                        }
                                                        alt={applicationName}
                                                        className="au-header__logo"
                                                    />
                                                </Medium>
                                            </CommonLink>
                                        </div>
                                        <div className="col-md-8 col-xs-12">
                                            <button
                                                id="menu-toggle"
                                                className={`menu-toggle au-btn au-btn--block au-btn--tertiary icon au-accordion--${
                                                    this.state.isMobileMenuOpen
                                                        ? "open"
                                                        : "closed"
                                                }`}
                                                onClick={() =>
                                                    this.toggleMenu()
                                                }
                                            >
                                                {this.state.isMobileMenuOpen
                                                    ? "Close menu"
                                                    : "Open menu"}
                                            </button>
                                        </div>
                                        <div className="col-md-8 col-xs-12">
                                            <Small>
                                                <div
                                                    className={`au-accordion__body au-accordion--${
                                                        this.state
                                                            .isMobileMenuOpen
                                                            ? "open"
                                                            : "closed"
                                                    } menu`}
                                                    aria-hidden={
                                                        !this.state
                                                            .isMobileMenuOpen
                                                    }
                                                >
                                                    <div className="mobile-nav">
                                                        <HeaderNav
                                                            isMobile={true}
                                                            headerNavigation={
                                                                this.props
                                                                    .headerNavigation
                                                            }
                                                        />
                                                    </div>
                                                </div>
                                            </Small>
                                            <Medium>
                                                <div
                                                    className={`au-accordion__body au-accordion--closed menu`}
                                                >
                                                    <HeaderNav
                                                        headerNavigation={
                                                            this.props
                                                                .headerNavigation
                                                        }
                                                    />
                                                </div>
                                            </Medium>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                }}
            </MagdaNamespacesConsumer>
        );
    }
}

export default needsContent("headerNavigation")(withRouter(Header));
