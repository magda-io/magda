import React, { Component } from "react";
// import { NavLink } from "react-router-dom";
import AccountNavbar from "../Account/AccountNavbar";
import { config } from "../../config.js";

const headerNavigationPlugins = {
    default: function(nav, i) {
        const { href, target, rel } = nav;
        const opts = { href, target, rel };
        return (
            <li key={i}>
                <a {...opts}>
                    <span>{nav.label}</span>
                </a>
            </li>
        );
    },
    auth: (nav, i) =>
        config.disableAuthenticationFeatures ? (
            <span key={i} />
        ) : (
            <AccountNavbar key={i} />
        )
};

function invokeHeaderNavigationPlugin(nav, i) {
    for (const [type, callback] of Object.entries(headerNavigationPlugins)) {
        if (nav[type]) {
            return callback(nav[type], i);
        }
    }
}

class HeaderNav extends Component {
    render() {
        return (
            <nav className="navigation header-nav" id="nav">
                <ul
                    className={`au-link-list ${
                        this.props.isMobile ? "" : "au-link-list--inline"
                    }`}
                >
                    {this.props.headerNavigation &&
                        this.props.headerNavigation.map((nav, i) =>
                            invokeHeaderNavigationPlugin(nav, i)
                        )}
                </ul>
            </nav>
        );
    }
}

export default HeaderNav;
