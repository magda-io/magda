import React, { FunctionComponent } from "react";
import "./main.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import ResourcesDataGrid from "./ResourcesDataGrid";

const ResourcesPage: FunctionComponent = () => {
    return (
        <div className="flex-main-container setting-page-main-container resources-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb
                    items={[{ to: "/settings/resources", title: "Resources" }]}
                />
                <ResourcesDataGrid directory="settings" />
            </div>
        </div>
    );
};

export default ResourcesPage;
