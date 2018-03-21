import React, { Component } from "react";
import { Link } from "react-router-dom";
import HeaderNav from "./HeaderNav";
import { config } from "../../config.js";
import mobileMenu from "../../assets/mobile-menu.svg";

class HeaderMobile extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isMobileMenuOpen: false
        };
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
                    <div className="mobile-logo">
                        <Link to="/">{config.appName}</Link>
                    </div>
                    <button
                        className="mobile-toggle"
                        onClick={() => this.toggleMenu()}
                    >
                        <img src={mobileMenu} alt="open menu" />
                    </button>
                </div>
                <div
                    className={`${
                        this.state.isMobileMenuOpen ? "isOpen" : ""
                    } mobile-nav`}
                >
                    <HeaderNav />
                </div>
            </div>
        );
    }
}

export default HeaderMobile;
