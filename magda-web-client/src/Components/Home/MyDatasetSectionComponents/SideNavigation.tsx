import React, { FunctionComponent } from "react";
import { Link } from "react-router-dom";
import "./SideNavigation.scss";

type PropsType = {};

const SideNavigation: FunctionComponent<PropsType> = (props) => {
    return (
        <div className="side-navigation">
            <div className="sidenav">
                <a className="icon-my-data active">
                    <span>My data sets</span>
                </a>
                <Link to="/dataset/add" className="icon-add-dataset">
                    <span>Add a data set</span>
                </Link>
            </div>
        </div>
    );
};

export default SideNavigation;
