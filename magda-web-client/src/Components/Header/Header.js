import React, { Component } from "react";
import { Link } from "react-router-dom";
import PropTypes from "prop-types";
import HeaderNav from "./HeaderNav";
import "./Header.css";
import { config } from "../../config";
import { Small, Medium } from "../../UI/Responsive";
import { needsContent } from "../../helpers/content";
import { UIPreviewerTarget } from "../../helpers/UIPreviewer";

class Header extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isMobileMenuOpen: false
        };
    }

    componentDidMount() {
        this.context.router.history.listen(() => {
            this.setState({
                isMobileMenuOpen: false
            });
        });
    }

    toggleMenu() {
        this.setState({
            isMobileMenuOpen: !this.state.isMobileMenuOpen
        });
    }

    render() {
        const applicationName = this.props.strings.applicationName;
        return (
            <div className="header">
                <div className="au-header">
                    <div className="container">
                        <div className="row">
                            <div className="col-md-4 col-xs-12">
                                <Link to="/" className="au-header__brand">
                                    <Small>
                                        <img
                                            src={UIPreviewerTarget.convertContentUrl(
                                                config.headerMobileLogoUrl
                                            )}
                                            alt={applicationName}
                                            className="au-header__logo"
                                        />
                                    </Small>
                                    <Medium>
                                        <img
                                            src={UIPreviewerTarget.convertContentUrl(
                                                config.headerLogoUrl
                                            )}
                                            alt={applicationName}
                                            className="au-header__logo"
                                        />
                                    </Medium>
                                </Link>
                            </div>
                            <div className="col-md-8 col-xs-12">
                                <button
                                    id="menu-toggle"
                                    className={`menu-toggle au-btn au-btn--block au-btn--tertiary icon au-accordion--${
                                        this.state.isMobileMenuOpen
                                            ? "open"
                                            : "closed"
                                    }`}
                                    onClick={() => this.toggleMenu()}
                                >
                                    {this.state.isMobileMenuOpen
                                        ? "Close menu"
                                        : "Open menu"}
                                </button>
                            </div>
                            <div className="col-md-8 col-xs-12">
                                <div
                                    className={`au-accordion__body au-accordion--${
                                        this.state.isMobileMenuOpen
                                            ? "open"
                                            : "closed"
                                    } menu`}
                                    aria-hidden={!this.state.isMobileMenuOpen}
                                >
                                    <Small>
                                        <div className="mobile-nav">
                                            <HeaderNav
                                                isMobile={true}
                                                headerNavigation={
                                                    this.props.headerNavigation
                                                }
                                            />
                                        </div>
                                    </Small>
                                    <Medium>
                                        <HeaderNav
                                            headerNavigation={
                                                this.props.headerNavigation
                                            }
                                        />
                                    </Medium>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

Header.contextTypes = {
    router: PropTypes.object.isRequired
};

export default needsContent("headerNavigation", "strings")(Header);
