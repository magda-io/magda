import React, { FunctionComponent } from "react";
import { withRouter, match } from "react-router-dom";
import { Location, History } from "history";
import "./main.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import AccessVerification from "./AccessVerification";
import RolesDataGrid from "./RolesDataGrid";

type PropsType = {
    location: Location;
    history: History;
    match: match<{ userId: string }>;
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

                <RolesDataGrid
                    queryParams={{ user_id: props?.match?.params?.userId }}
                />
            </div>
        </div>
    );
};

export default withRouter(UserRolesPage);
