import React from "react";
import { Medium, Small } from "../../UI/Responsive";
import { Link } from "react-router-dom";
import govtLogo from "../../assets/au-govt-logo.svg";
import dgaLogo from "../../assets/dga-logo.svg";
import HeaderNav from "./HeaderNav";
import HeaderMobile from "./HeaderMobile";
import "./Header.css";
import { config } from "../../config";

const Header = props => {
    return (
        <div className="top-header-container">
            <Small>
                <HeaderMobile />
            </Small>
            <Medium>
                <div className="desktop-nav container">
                    <Link to="/" className="logo">
                        <div>
                            <img
                                src={govtLogo}
                                height={70}
                                alt="Coat of Arms"
                            />
                            <img
                                className="site-logo"
                                src={dgaLogo}
                                height={70}
                                alt={config.appName}
                            />
                        </div>
                    </Link>
                    <HeaderNav />
                </div>
            </Medium>
        </div>
    );
};

export default Header;
