import React, { FunctionComponent } from "react";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import AccessGroupDataGrid from "./AccessGroupDataGrid";

type PropsType = {};

const settingsBreadcrumbs = [
    {
        to: "/settings/accessGroups",
        title: "Access Group Management"
    }
];

const AccessGroupsPage: FunctionComponent<PropsType> = (props) => {
    return (
        <div className="flex-main-container setting-page-main-container">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb items={settingsBreadcrumbs} />
                <AccessGroupDataGrid />
            </div>
        </div>
    );
};

export default AccessGroupsPage;
