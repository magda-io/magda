import React, { Component } from "react";
import { Link } from "react-router-dom";
import PropTypes from "prop-types";
import govtLogo from "../../assets/au-govt-logo.svg";
import govtLogoMobile from "../../assets/au-govt-logo-mobile.svg";
import dgaLogo from "../../assets/dga-logo.svg";
import HeaderNav from "./HeaderNav";
import "./Header.css";
import { config } from "../../config";
import { Small, Medium } from "../../UI/Responsive";

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
        return (
            <div className="header">
                <div className="au-header">
                    <div className="container">
                        <div className="row">
                            <div className="col-md-6 col-xs-12">
                                <Link to="/" className="au-header__brand">
                                    <div>
                                        <Small>
                                            <img
                                                src={govtLogoMobile}
                                                height={62}
                                                alt="Coat of Arms"
                                                className="au-header__brand-image"
                                            />
                                        </Small>
                                        <Medium>
                                            <img
                                                src={govtLogo}
                                                height={70}
                                                alt="Coat of Arms"
                                                className="au-header__brand-image"
                                            />
                                        </Medium>
                                        <div className="au-header__text">
                                            <img
                                                src={dgaLogo}
                                                height={70}
                                                alt={config.appName}
                                                className="au-header__heading"
                                            />
                                            <span className="header__badge">
                                                beta
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            </div>
                            <div className="col-md-6 col-xs-12">
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
                            <div className="col-md-6 col-xs-12">
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
                                            <HeaderNav isMobile={true} />
                                        </div>
                                    </Small>
                                    <Medium>
                                        <HeaderNav />
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

export default Header;
