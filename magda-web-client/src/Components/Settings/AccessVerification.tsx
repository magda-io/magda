import React, { FunctionComponent } from "react";
import { useSelector } from "react-redux";
import { StateType } from "reducers/reducer";
import { User } from "reducers/userManagementReducer";
import Message from "rsuite/Message";
import uniq from "lodash/uniq";
import { ADMIN_USERS_ROLE_ID } from "@magda/typescript-common/dist/authorization-api/constants";

type PropsType = {
    operationUris: string[];
};

const AccessVerification: FunctionComponent<PropsType> = (props) => {
    const requiredOperationUris = props?.operationUris?.length
        ? props.operationUris
        : [];
    const isLoading = useSelector<StateType, boolean>(
        (state) => state?.userManagement?.isFetchingWhoAmI
    );
    const loadingError = useSelector<StateType, Error | null>(
        (state) => state?.userManagement?.whoAmIError
    );
    const user = useSelector<StateType, User>(
        (state) => state?.userManagement?.user
    );
    const userRoleIds = user?.roles?.length
        ? user.roles.map((item) => item.id)
        : [];
    const userOpUris = uniq(
        user?.permissions?.length
            ? user.permissions.flatMap((permission) =>
                  permission?.operations?.length
                      ? permission?.operations.map((item) => item.uri)
                      : []
              )
            : []
    );

    if (!requiredOperationUris.length) {
        return null;
    }

    if (isLoading) {
        return null;
    }

    if (loadingError) {
        return (
            <Message
                showIcon
                type="error"
                header="Error"
                closable={true}
                style={{ margin: "5px" }}
            >
                {`Failed to verify user permissions: ${loadingError}`}
            </Message>
        );
    }

    if (
        userRoleIds.findIndex((roleId) => roleId === ADMIN_USERS_ROLE_ID) !== -1
    ) {
        // root admin user always has permissions
        return null;
    }

    if (
        requiredOperationUris.length &&
        userOpUris.length &&
        requiredOperationUris.findIndex(
            (opUri) => userOpUris.indexOf(opUri) === -1
        ) === -1
    ) {
        return null;
    }

    return (
        <Message
            showIcon
            type="error"
            header="Error"
            closable={true}
            style={{ margin: "5px" }}
        >
            {`You don't have access to this function.`}
        </Message>
    );
};

export default AccessVerification;
