import React, { FunctionComponent, ReactElement, useState } from "react";
import { withRouter } from "react-router-dom";
import CommonLink from "../Common/CommonLink";
import { Location, History } from "history";
import {
    MdSupervisorAccount,
    MdSwitchAccount,
    MdAccountTree,
    MdCollectionsBookmark,
    MdPageview,
    MdOutlineFolderSpecial,
    MdOutlineWeb,
    MdKeyboardArrowDown,
    MdKeyboardArrowRight,
    MdOutlineVerticalAlignTop,
    MdOutlineVerticalAlignBottom,
    MdOutlineImage,
    MdOutlineArticle,
    MdSecurity
} from "react-icons/md";
import { BsPersonCircle, BsJournals } from "react-icons/bs";
import "./SideNavigation.scss";
import { StateType } from "reducers/reducer";
import { useSelector } from "react-redux";
import uniq from "lodash/uniq";
import { User } from "reducers/userManagementReducer";
import { ADMIN_USERS_ROLE_ID } from "@magda/typescript-common/dist/authorization-api/constants.js";
import {
    getUrlWithPopUpQueryString,
    showSideNav
} from "../../helpers/popupUtils";

type PropsType = {
    menuItems?: MenuItem[];
    location: Location;
    history: History;
};

type MenuItem = {
    // the page path; for a group, a unique key (a group isn't a link)
    path: string;
    icon: ReactElement;
    title: string;
    active?: boolean;
    requireRoleIds?: string[];
    requireOperationUris?: string[];
    // second level menu items. A menu item with children is a group and is not a link itself.
    // A group is hidden when none of its children is available (e.g. due to access).
    children?: MenuItem[];
};

const contentManagementOperationUris = [
    "object/content/read",
    "object/content/update"
];

const defaultMenuItems: MenuItem[] = [
    {
        title: "My Account",
        path: "/settings/account",
        icon: <BsPersonCircle />
    },
    {
        path: "/settings/datasets",
        title: "Datasets",
        icon: <BsJournals />,
        requireOperationUris: [
            "object/dataset/draft/read",
            "object/dataset/draft/update",
            "object/dataset/published/read",
            "object/dataset/published/update",
            "object/distribution/draft/read",
            "object/distribution/draft/update",
            "object/distribution/published/read",
            "object/distribution/published/update",
            "object/organization/read",
            "object/faas/function/read",
            "object/faas/function/invoke"
        ]
    },
    {
        title: "Access Controls",
        path: "/settings/accessControls",
        icon: <MdSecurity />,
        children: [
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
                title: "Org Units",
                path: "/settings/orgUnits",
                requireOperationUris: [
                    "authObject/orgUnit/read",
                    "authObject/orgUnit/update"
                ],
                icon: <MdAccountTree />
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
                path: "/settings/accessGroups",
                title: "Access Groups",
                icon: <MdOutlineFolderSpecial />,
                requireOperationUris: ["object/accessGroup/read"]
            }
        ]
    },
    {
        title: "Registry Records",
        path: "/settings/records",
        requireOperationUris: ["object/record/read", "object/record/update"],
        icon: <MdPageview />
    },
    {
        title: "Site Content",
        path: "/settings/content",
        icon: <MdOutlineWeb />,
        children: [
            {
                title: "Header",
                path: "/settings/content/header",
                icon: <MdOutlineVerticalAlignTop />,
                requireOperationUris: contentManagementOperationUris
            },
            {
                title: "Footer",
                path: "/settings/content/footer",
                icon: <MdOutlineVerticalAlignBottom />,
                requireOperationUris: contentManagementOperationUris
            },
            {
                title: "Logos",
                path: "/settings/content/logos",
                icon: <MdOutlineImage />,
                requireOperationUris: contentManagementOperationUris
            },
            {
                title: "Pages",
                path: "/settings/content/pages",
                icon: <MdOutlineArticle />,
                requireOperationUris: contentManagementOperationUris
            }
        ]
    }
];

/* eslint-disable jsx-a11y/anchor-is-valid */
const SideNavigation: FunctionComponent<PropsType> = (props) => {
    const { location } = props;
    const shouldShowSideNav = showSideNav(location);
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
    const menuItems = props.menuItems?.length
        ? props.menuItems
        : defaultMenuItems;
    const isActive = (item: MenuItem) =>
        props.location.pathname.indexOf(item.path) === 0;
    // groups are collapsed by default, except the group of the current page.
    // Clicking a group title expands / collapses it.
    const [toggledGroups, setToggledGroups] = useState<{
        [path: string]: boolean;
    }>({});
    const isGroupExpanded = (group: MenuItem, children: MenuItem[]) =>
        typeof toggledGroups[group.path] === "boolean"
            ? toggledGroups[group.path]
            : children.some(isActive);
    const toggleGroup = (group: MenuItem, children: MenuItem[]) =>
        setToggledGroups((groups) => ({
            ...groups,
            [group.path]: !isGroupExpanded(group, children)
        }));

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
        <div
            className={`side-navigation${
                shouldShowSideNav ? "" : " no-side-nav"
            }`}
        >
            <div className="sidenav">
                {menuItems.filter(accessFilter).map((item, idx) => {
                    if (!item?.children?.length) {
                        return (
                            <CommonLink
                                key={idx}
                                to={getUrlWithPopUpQueryString(
                                    item.path,
                                    location
                                )}
                                className={isActive(item) ? "active" : ""}
                            >
                                <span>
                                    {item.icon}
                                    {item.title}
                                </span>
                            </CommonLink>
                        );
                    }
                    const children = item.children.filter(accessFilter);
                    if (!children.length) {
                        return null;
                    }
                    const isExpanded = isGroupExpanded(item, children);
                    return (
                        <div key={idx} className="sidenav-group">
                            <a
                                role="button"
                                tabIndex={0}
                                aria-expanded={isExpanded}
                                className={`sidenav-group-title${
                                    // highlight a collapsed group when one of its pages is open
                                    !isExpanded && children.some(isActive)
                                        ? " active"
                                        : ""
                                }`}
                                onClick={() => toggleGroup(item, children)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        toggleGroup(item, children);
                                    }
                                }}
                            >
                                <span>
                                    {item.icon}
                                    {item.title}
                                    {isExpanded ? (
                                        <MdKeyboardArrowDown className="sidenav-group-caret" />
                                    ) : (
                                        <MdKeyboardArrowRight className="sidenav-group-caret" />
                                    )}
                                </span>
                            </a>
                            {isExpanded
                                ? children.map((child, childIdx) => (
                                      <CommonLink
                                          key={childIdx}
                                          to={getUrlWithPopUpQueryString(
                                              child.path,
                                              location
                                          )}
                                          className={`sidenav-sub-item${
                                              isActive(child) ? " active" : ""
                                          }`}
                                      >
                                          <span>
                                              {child.icon}
                                              {child.title}
                                          </span>
                                      </CommonLink>
                                  ))
                                : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
/* eslint-enable jsx-a11y/anchor-is-valid */

export default withRouter(SideNavigation);
