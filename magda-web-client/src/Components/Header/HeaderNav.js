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
                {headerNavs.map(nav => (
                    <li key={nav[1]}>
                        <Link key={nav[1]} to={`/${encodeURI(nav[1])}`}>
                            {nav[0]}
                        </Link>
                    </li>
                ))}
                {config.disableAuthenticationFeatures || <AccountNavbar />}
            </ul>
        </nav>
    );
};

export default HeaderNav;
