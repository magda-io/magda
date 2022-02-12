import React, { FunctionComponent } from "react";
import "./main.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";

const UsersPage: FunctionComponent = () => {
    return (
        <div className="flex-main-container setting-page-main-container">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb
                    items={[{ to: "/settings/users", title: "Users" }]}
                />
            </div>
        </div>
    );
};

export default UsersPage;
