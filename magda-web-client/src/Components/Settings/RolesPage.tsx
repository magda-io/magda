import React, { FunctionComponent } from "react";
import "./main.scss";
import "./RolesPage.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import AccessVerification from "./AccessVerification";
import RolesDataGrid from "./RolesDataGrid";

const RolesPage: FunctionComponent = () => {
    return (
        <div className="flex-main-container setting-page-main-container roles-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb
                    items={[{ to: "/settings/roles", title: "Roles" }]}
                />
                <AccessVerification operationUri="authObject/role/read" />

                <RolesDataGrid />
            </div>
        </div>
    );
};

export default RolesPage;
