import React, { FunctionComponent } from "react";
import { useAsync } from "react-async-hook";
import { config } from "config";
import request from "helpers/request";
import { User } from "reducers/userManagementReducer";

const UserNameLabel: FunctionComponent<{ userId?: string }> = (props) => {
    const { userId } = props;
    const {
        result: userName,
        loading: isUserNameLoading,
        error: userNameLoadingError
    } = useAsync(
        async (userId?: string) => {
            if (!userId) {
                return "Unknown User";
            }
            const data = await request<User>(
                "GET",
                config.authApiUrl + `users/${userId}`
            );
            return data.displayName ? data.displayName : "Unknown User";
        },
        [userId]
    );
    if (isUserNameLoading) {
        return <>...</>;
    } else if (userNameLoadingError) {
        console.error("Failed to load user name: ", userNameLoadingError);
        return <>Unknown User</>;
    } else {
        return <>{userName}</>;
    }
};

export default UserNameLabel;
