import React, { FunctionComponent } from "react";
import { useParams } from "react-router-dom";
import "./main.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import AccessVerification from "./AccessVerification";
import RolesDataGrid from "./RolesDataGrid";
import { getUserById, getRoleById } from "api-clients/AuthApis";
import { useAsync } from "react-async-hook";

type PropsType = {};

const RolePermissionsPage: FunctionComponent<PropsType> = (props) => {
    const { userId, roleId } = useParams<{ userId?: string; roleId: string }>();

    const { result: user } = useAsync(
        async (userId?: string) => {
            if (!userId) {
                return undefined;
            }
            return await getUserById(userId);
        },
        [userId]
    );

    const { result: role } = useAsync(
        async (roleId: string) => {
            if (!roleId) {
                return undefined;
            }
            return await getRoleById(roleId);
        },
        [roleId]
    );

    const breadcrumbItems = userId
        ? [
              { to: "/settings/users", title: "Users" },
              {
                  to: `/settings/users/${encodeURIComponent(userId)}/roles`,
                  title: user?.displayName
                      ? `Roles of User: ${user?.displayName}`
                      : "Roles of User"
              },
              {
                  title: role?.name
                      ? `Permissions of Role: ${role.name}`
                      : "Permissions of Role"
              }
          ]
        : [
              { to: "/settings/roles", title: "Roles" },
              {
                  title: role?.name
                      ? `Permissions of Role: ${role.name}`
                      : "Permissions of Role"
              }
          ];

    return (
        <div className="flex-main-container setting-page-main-container role-permissions-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb items={breadcrumbItems} />
                <AccessVerification operationUri="authObject/role/read" />

                <RolesDataGrid queryParams={{ user_id: userId }} />
            </div>
        </div>
    );
};

export default RolePermissionsPage;
