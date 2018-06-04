import React, { Component } from "react";
import { Link } from "react-router-dom";
import HeaderNav from "./HeaderNav";
import { config } from "../../config.js";
import PropTypes from "prop-types";
import govtLogo from "../../assets/au-govt-logo-mobile.svg";

class HeaderMobile extends Component {
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
            <div className="mobile-header">
                <div className="mobile-header-inner">
                    <Link to="/" className="mobile-logo-link">
                        <img
                            className="mobile-logo"
                            src={govtLogo}
                            height={50}
                            alt="au Gov logo"
                        />
                    </Link>
                    <div className="mobile-title">
                        <Link to="/">{config.appName}</Link>
                    </div>
                    <button
                        className={`mobile-toggle au-btn au-btn--tertiary icon au-accordion--${
                            this.state.isMobileMenuOpen ? "open" : "closed"
                        }`}
                        onClick={() => this.toggleMenu()}
                    />
                </div>
                <div
                    className="mobile-nav-wrapper au-body"
                    aria-hidden={!this.state.isMobileMenuOpen}
                >
                    <div
                        className={`${
                            this.state.isMobileMenuOpen ? "isOpen" : ""
                        } mobile-nav`}
                    >
                        <HeaderNav isMobile={true} />
                    </div>
                </div>
            </div>
        );
    }
}

HeaderMobile.contextTypes = {
    router: PropTypes.object.isRequired
};

export default HeaderMobile;
