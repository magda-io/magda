import React from "react";
import { Link } from "react-router-dom";
import HeaderNav from "./HeaderNav";
//import { config } from "../../config.js";
import dgalogo from "../../dga.png";

const HeaderOthers = props => {
    return (
        <table width="100%" className="nav-table">
            <tbody>
                <tr style={{ verticalAlign: "middle" }}>
                    <td className="logo">
                        <Link to="/">
                            <img src={dgalogo} alt="dga-logo" />
                        </Link>
                    </td>
                    <td className="nav-bar-right">
                        <HeaderNav />
                    </td>
                </tr>
            </tbody>
        </table>
    );
};

export default HeaderOthers;
