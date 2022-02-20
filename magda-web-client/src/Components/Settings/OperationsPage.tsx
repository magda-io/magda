import React, { FunctionComponent } from "react";
import "./main.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import AccessVerification from "./AccessVerification";
import OperationsDataGrid from "./OperationsDataGrid";
import { useParams } from "react-router-dom";

const OperationsPage: FunctionComponent = () => {
    const { resourceId } = useParams<{ resourceId: string }>();

    return (
        <div className="flex-main-container setting-page-main-container resource-operations-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb
                    items={[
                        { to: "/settings/resources", title: "Resources" },
                        { title: "Resource Operations" }
                    ]}
                />
                <AccessVerification operationUri="authObject/resource/read" />

                <OperationsDataGrid resourceId={resourceId} />
            </div>
        </div>
    );
};

export default OperationsPage;
