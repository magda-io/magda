import React, { FunctionComponent } from "react";
import "./main.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import OperationsDataGrid from "./OperationsDataGrid";
import { useParams } from "react-router-dom";
import { useAsync } from "react-async-hook";
import { getResourceById } from "../../api-clients/AuthApis";

const OperationsPage: FunctionComponent = () => {
    const { resourceId } = useParams<{ resourceId: string }>();

    const { result: resource } = useAsync(
        async (resourceId: string) => {
            if (!resourceId) {
                return undefined;
            }
            return await getResourceById(resourceId);
        },
        [resourceId]
    );

    return (
        <div className="flex-main-container setting-page-main-container resource-operations-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb
                    items={[
                        { to: "/settings/resources", title: "Resources" },
                        {
                            title: resource?.name
                                ? `Operations of Resource: ${resource.name}`
                                : "Resource Operations"
                        }
                    ]}
                />
                <OperationsDataGrid resourceId={resourceId} />
            </div>
        </div>
    );
};

export default OperationsPage;
