import React from "react";
import { Medium, Small } from "../../UI/Responsive";
import { Link } from "react-router-dom";
import govtLogo from "../../assets/au-govt-logo.svg";
import HeaderNav from "./HeaderNav";
import HeaderMobile from "./HeaderMobile";
import "./Header.css";

const Header = props => {
    return (
        <div className="top-header-container">
            <Small>
                <HeaderMobile />
            </Small>
            <Medium>
                <div className="desktop-nav container">
                    <Link to="/" className="logo">
                        <img src={govtLogo} alt="Coat of Arms" />
                    </Link>
                    <HeaderNav />
                </div>
            </Medium>
        </div>
    );
};

export default Header;
