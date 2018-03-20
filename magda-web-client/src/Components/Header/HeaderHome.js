import React from "react";
import { Link } from "react-router-dom";
import HeaderNav from "./HeaderNav";
import govtLogo from "../../assets/au-govt-logo.png";

const HeaderHome = props => {
    return (
        <table width="100%" className="nav-table">
            <tbody>
                <tr style={{ verticalAlign: "middle" }}>
                    <td className="logo">
                            <img src={govtLogo} alt="au-govt-logo" />
                    </td>
                    <td className="nav-bar-right">
                        <HeaderNav />
                    </td>
                </tr>
            </tbody>
        </table>
    );
};

export default HeaderHome;
