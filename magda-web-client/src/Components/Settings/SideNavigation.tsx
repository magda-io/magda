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
import "./SideNavigation.scss";

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
};

const defaultMenuItems: MenuItem[] = [
    {
        title: "Users",
        path: "/settings/users",
        icon: <MdSupervisorAccount />
    },
    {
        title: "Roles",
        path: "/settings/roles",
        icon: <MdSwitchAccount />
    },
    {
        title: "Resources",
        path: "/settings/resources",
        icon: <MdCollectionsBookmark />
    },
    {
        title: "Org Units",
        path: "/settings/orgUnits",
        icon: <MdAccountTree />
    },
    {
        title: "Registry Records",
        path: "/settings/records",
        icon: <MdPageview />
    }
];

/* eslint-disable jsx-a11y/anchor-is-valid */
const SideNavigation: FunctionComponent<PropsType> = (props) => {
    const menuItems = (props.menuItems?.length
        ? props.menuItems
        : defaultMenuItems
    ).map((item) => {
        if (item.path === props.location.pathname) {
            item.active = true;
        } else {
            item.active = false;
        }
        return item;
    });

    return (
        <div className="side-navigation">
            <div className="sidenav">
                {menuItems.map((item, idx) => (
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
