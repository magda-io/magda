import React, { Component } from "react";
import { Link } from "react-router-dom";
import AccountNavbar from "Components/Account/AccountNavbar";
import { config } from "config";
import isExternalURL from "is-url-external";

const headerNavigationPlugins = {
    default: function (nav, i) {
        const { href, target, rel } = nav;
        const opts = { href, target, rel };
        if (href === window.location.pathname) {
            opts["className"] = "active";
            opts["aria-active"] = "page";
        }
        return (
            <li key={i}>
                {isExternalURL(opts.href) ? (
                    <a {...opts} title={`Go to ${nav.label}`}>
                        <span>{nav.label}</span>
                    </a>
                ) : (
                    <Link
                        to={opts.href}
                        target={opts.target}
                        rel={opts.rel}
                        title={`Go to ${nav.label}`}
                        id={i === 0 ? "nav" : undefined}
                    >
                        <span>{nav.label}</span>
                    </Link>
                )}
            </li>
        );
    },
    auth: (nav, i) =>
        config.disableAuthenticationFeatures ? (
            <span key={i} />
        ) : (
            <AccountNavbar key={i} skipLink={i === 0} />
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
            <nav className="navigation header-nav">
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
