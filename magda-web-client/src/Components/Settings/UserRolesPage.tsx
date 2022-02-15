import React, { FunctionComponent } from "react";
import { withRouter } from "react-router-dom";
import "./main.scss";
import "./UserRolesPage.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import AccessVerification from "./AccessVerification";
import RolesDataGrid from "./RolesDataGrid";

type PropsType = {
    location: Location;
    history: History;
};

const UserRolesPage: FunctionComponent<PropsType> = (props) => {
    return (
        <div className="flex-main-container setting-page-main-container roles-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb
                    items={[
                        { to: "/settings/users", title: "Users" },
                        { title: "Roles" }
                    ]}
                />
                <AccessVerification operationUri="authObject/role/read" />

                <RolesDataGrid />
            </div>
        </div>
    );
};

export default withRouter(UserRolesPage);
