import React, { FunctionComponent, ReactElement } from "react";
import { withRouter } from "react-router-dom";
import { Link } from "react-router-dom";
import { Location, History } from "history";
import {
    MdSupervisorAccount,
    MdSwitchAccount,
    MdAccountTree,
    MdCollectionsBookmark,
    MdPageview
} from "react-icons/md";
import { BsPersonCircle, BsJournals } from "react-icons/bs";
import "./SideNavigation.scss";
import { StateType } from "reducers/reducer";
import { useSelector } from "react-redux";
import uniq from "lodash/uniq";
import { User } from "reducers/userManagementReducer";
import { ADMIN_USERS_ROLE_ID } from "@magda/typescript-common/dist/authorization-api/constants";

type PropsType = {
    menuItems?: MenuItem[];
    location: Location;
    history: History;
};

type MenuItem = {
    path: string;
    icon: ReactElement;
    title: string;
    active?: boolean;
    requireRoleIds?: string[];
    requireOperationUris?: string[];
};

const defaultMenuItems: MenuItem[] = [
    {
        title: "My Account",
        path: "/settings/account",
        icon: <BsPersonCircle />
    },
    {
        path: "/settings/datasets",
        title: "Data Management",
        icon: <BsJournals />,
        requireOperationUris: [
            "object/dataset/draft/read",
            "object/dataset/draft/update",
            "object/dataset/published/read",
            "object/dataset/published/update",
            "object/distribution/read",
            "object/distribution/update",
            "object/organization/read",
            "object/faas/function/read",
            "object/faas/function/invoke"
        ]
    },
    {
        title: "Users",
        path: "/settings/users",
        requireOperationUris: [
            "authObject/user/read",
            "authObject/user/update"
        ],
        icon: <MdSupervisorAccount />
    },
    {
        title: "Roles",
        path: "/settings/roles",
        requireOperationUris: [
            "authObject/role/read",
            "authObject/role/update"
        ],
        icon: <MdSwitchAccount />
    },
    {
        title: "Resources",
        path: "/settings/resources",
        requireOperationUris: [
            "authObject/resource/read",
            "authObject/resource/update"
        ],
        icon: <MdCollectionsBookmark />
    },
    {
        title: "Org Units",
        path: "/settings/orgUnits",
        requireOperationUris: [
            "authObject/orgUnits/read",
            "authObject/orgUnits/update"
        ],
        icon: <MdAccountTree />
    },
    {
        title: "Registry Records",
        path: "/settings/records",
        requireOperationUris: ["object/record/read", "object/record/update"],
        icon: <MdPageview />
    }
];

/* eslint-disable jsx-a11y/anchor-is-valid */
const SideNavigation: FunctionComponent<PropsType> = (props) => {
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
    const isUserLoading = useSelector<StateType, boolean>(
        (state) => state?.userManagement?.isFetchingWhoAmI
    );
    const userLoadingError = useSelector<StateType, Error | null>(
        (state) => state?.userManagement?.whoAmIError
    );
    const menuItems = (props.menuItems?.length
        ? props.menuItems
        : defaultMenuItems
    ).map((item) => {
        if (props.location.pathname.indexOf(item.path) === 0) {
            item.active = true;
        } else {
            item.active = false;
        }
        return item;
    });

    function accessFilter(item: MenuItem): boolean {
        if (
            (item?.requireRoleIds?.length ||
                item?.requireOperationUris?.length) &&
            (isUserLoading || userLoadingError)
        ) {
            // any require access check items will not will be shown until user data is available
            return false;
        }
        if (
            userRoleIds.findIndex(
                (roleId) => roleId === ADMIN_USERS_ROLE_ID
            ) !== -1
        ) {
            // admin user will see all menu items
            return true;
        }
        if (item?.requireRoleIds?.length) {
            if (!userRoleIds.length) {
                return false;
            }
            for (const roleId of item.requireRoleIds) {
                if (userRoleIds.indexOf(roleId) === -1) {
                    return false;
                }
            }
        }
        if (item?.requireOperationUris?.length) {
            if (!userOpUris.length) {
                return false;
            }
            for (const opUri of item.requireOperationUris) {
                if (userOpUris.indexOf(opUri) === -1) {
                    return false;
                }
            }
        }
        return true;
    }

    return (
        <div className="side-navigation">
            <div className="sidenav">
                {menuItems.filter(accessFilter).map((item, idx) => (
                    <Link
                        key={idx}
                        to={item.path}
                        className={item?.active ? "active" : ""}
                    >
                        <span>
                            {item.icon}
                            {item.title}
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
};
/* eslint-enable jsx-a11y/anchor-is-valid */

export default withRouter(SideNavigation);
