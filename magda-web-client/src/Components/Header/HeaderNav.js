import React from "react";
import { NavLink } from "react-router-dom";
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
                                    <span>{nav[0]}</span>
                                </a>
                            </li>
                        ) : (
                            <li key={i}>
                                <NavLink
                                    to={`/${encodeURI(nav[1])}`}
                                    activeClassName="active"
                                >
                                    <span>{nav[0]}</span>
                                </NavLink>
                            </li>
                        )
                )}
                {config.disableAuthenticationFeatures || <AccountNavbar />}
            </ul>
        </nav>
    );
};

export default HeaderNav;
