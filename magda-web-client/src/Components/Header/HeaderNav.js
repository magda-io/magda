import React from "react";
import { Link } from "react-router-dom";
import AccountNavbar from "../Account/AccountNavbar";
import { config } from "../../config.js";

const headerNavs = config.headerNavigation;

const HeaderNav = props => {
    return (
        <div className="header-nav" id="nav">
            {headerNavs.map(nav => (
                <Link key={nav[1]} to={`/${encodeURI(nav[1])}`}>
                    {nav[0]}
                </Link>
            ))}
            {config.disableAuthenticationFeatures || <AccountNavbar />}
        </div>
    );
};

export default HeaderNav;
