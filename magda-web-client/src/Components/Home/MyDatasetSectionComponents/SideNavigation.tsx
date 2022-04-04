import React, { FunctionComponent } from "react";
import { Link } from "react-router-dom";
import "./SideNavigation.scss";
import { User } from "reducers/userManagementReducer";
import { hasPermission } from "helpers/accessControlUtils";

type PropsType = {
    user: User;
};

/* eslint-disable jsx-a11y/anchor-is-valid */
const SideNavigation: FunctionComponent<PropsType> = (props) => {
    return (
        <div className="side-navigation">
            <div className="sidenav">
                <a className="icon-my-data active">
                    <span>Datasets</span>
                </a>
                {hasPermission("object/dataset/draft/create", props.user) ? (
                    <Link
                        to="/dataset/add/metadata"
                        className="icon-add-dataset"
                    >
                        <span>Add a Dataset</span>
                    </Link>
                ) : null}
            </div>
        </div>
    );
};
/* eslint-enable jsx-a11y/anchor-is-valid */

export default SideNavigation;
