import React, { FunctionComponent } from "react";
import { useAsync } from "react-async-hook";
import { config } from "config";
import request from "helpers/request";
import { v4 as isUuid } from "is-uuid";

const OrgUnitNameLabel: FunctionComponent<{ id?: string }> = (props) => {
    const { id } = props;
    const {
        result: name,
        loading: isUNameLoading,
        error: nameLoadingError
    } = useAsync(
        async (id?: string) => {
            if (!id || !isUuid(id)) {
                return "N/A";
            }
            const data = await request<any>(
                "GET",
                config.authApiUrl + `orgUnits/${id}`
            );
            return data?.name ? data.name : "Unknown Unit";
        },
        [id]
    );
    if (isUNameLoading) {
        return <>...</>;
    } else if (nameLoadingError) {
        console.error("Failed to retrieve org unit name: ", nameLoadingError);
        return <>Unknown User</>;
    } else {
        return <>{name}</>;
    }
};

export default OrgUnitNameLabel;
