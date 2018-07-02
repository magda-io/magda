import React from "react";
import { Link } from "react-router-dom";
import AccountNavbar from "../Account/AccountNavbar";
import { config } from "../../config.js";

const headerNavs = config.headerNavigation;

const HeaderNav = props => {
    return (
        <nav className="navigation header-nav" id="nav">
            <ul
                className={`au-link-list ${
                    props.isMobile ? "" : "au-link-list--inline"
                }`}
            >
                {headerNavs.map(
                    (nav, i) =>
                        nav[0] === "Community" ? (
                            <li key={i}>
                                <a
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    href={nav[1]}
                                >
                                    {nav[0]}
                                </a>
                            </li>
                        ) : (
                            <li key={i}>
                                <Link key={i} to={`/${encodeURI(nav[1])}`}>
                                    {nav[0]}
                                </Link>
                            </li>
                        )
                )}
                {config.disableAuthenticationFeatures || <AccountNavbar />}
            </ul>
        </nav>
    );
};

export default HeaderNav;
