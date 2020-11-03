import React, { FunctionComponent } from "react";
import { Link } from "react-router-dom";
import "./SideNavigation.scss";

type PropsType = {};

/* eslint-disable jsx-a11y/anchor-is-valid */
const SideNavigation: FunctionComponent<PropsType> = (props) => {
    return (
        <div className="side-navigation">
            <div className="sidenav">
                <a className="icon-my-data active">
                    <span>My data sets</span>
                </a>
                <Link to="/dataset/add/metadata" className="icon-add-dataset">
                    <span>Add a data set</span>
                </Link>
            </div>
        </div>
    );
};
/* eslint-enable jsx-a11y/anchor-is-valid */

export default SideNavigation;
