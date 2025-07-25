import React, { FunctionComponent, useState, useCallback } from "react";
import { useLocation, Switch, Route, useHistory, Link } from "react-router-dom";
import SideNavigation from "./SideNavigation";
import Breadcrumb, { BreadcrumbItem } from "./Breadcrumb";
import { AccessGroup, getAccessGroupById } from "api-clients/AuthApis";
import reportError from "../../helpers/reportError";
import { useAsync } from "react-async-hook";
import urijs from "urijs";
import Nav from "rsuite/Nav";
import Panel from "rsuite/Panel";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import Tag from "rsuite/Tag";
import Whisper from "rsuite/Whisper";
import Popover from "rsuite/Popover";
import Message from "rsuite/Message";
import {
    BsFillJournalBookmarkFill,
    BsPeopleFill,
    BsFillInboxesFill
} from "react-icons/bs";
import UserNameLabel from "Components/UserNameLabel";
import DateDisplayWithTooltip from "Components/DateDisplayWithTooltip";
import AccessGroupDatasetsPanel from "./AccessGroupDatasetsPanel";
import AccessGroupUsersPanel from "./AccessGroupUsersPanel";
import "./AccessGroupDetailsPage.scss";

type PropsType = {};

const createBreadcrumbsData = (currentItem: BreadcrumbItem) => [
    {
        to: "/settings/accessGroups",
        title: "Access Group Management"
    },
    ...[currentItem]
];

const AccessGroupDetailsPage: FunctionComponent<PropsType> = (props) => {
    const history = useHistory();
    const location = useLocation();
    const accessGroupId = (() => {
        try {
            const segments = urijs(location.pathname).segmentCoded();
            const idx = segments.findIndex((item) => item === "accessGroups");
            if (idx === -1 || idx > segments.length - 2) {
                throw new Error("Invalid url: " + location.pathname);
            }
            return segments[idx + 1];
        } catch (e) {
            console.error(e);
            return "";
        }
    })();
    const [dataReloadToken, setDataReloadToken] = useState<string>("");
    const [accessGroup, setAccessGroup] = useState<AccessGroup>();
    const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>(
        createBreadcrumbsData({
            title: "Access Group Details"
        })
    );
    const [active, setActive] = React.useState(location.pathname);
    const onSelectTab = useCallback((key) => {
        setActive(key);
        history.push(key);
    }, []);

    const { loading: isLoading } = useAsync(
        async (accessGroupId?: string, dataReloadToken?: string) => {
            try {
                const data = await getAccessGroupById(accessGroupId as string);
                setAccessGroup(data);
                setBreadcrumbs(
                    createBreadcrumbsData({
                        title: `Access Group: ${data.name}`
                    })
                );
            } catch (e) {
                reportError(`Failed to fetch access group data: ${e}`);
                throw e;
            }
        },
        [accessGroupId, dataReloadToken]
    );

    return (
        <div className="flex-main-container setting-page-main-container access-group-details-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb items={breadcrumbs} />
                <Nav
                    className="access-group-details-tab"
                    appearance="tabs"
                    activeKey={active}
                    onSelect={onSelectTab}
                >
                    <Nav.Item
                        eventKey={`/settings/accessGroups/${accessGroupId}`}
                        icon={<BsFillJournalBookmarkFill />}
                    >
                        General Info
                    </Nav.Item>
                    <Nav.Item
                        eventKey={`/settings/accessGroups/${accessGroupId}/datasets`}
                        icon={<BsFillInboxesFill />}
                    >
                        Datasets
                    </Nav.Item>
                    <Nav.Item
                        eventKey={`/settings/accessGroups/${accessGroupId}/users`}
                        icon={<BsPeopleFill />}
                    >
                        Users
                    </Nav.Item>
                </Nav>
                <Switch>
                    <Route
                        exact
                        path={`/settings/accessGroups/${accessGroupId}`}
                    >
                        <Panel bordered>
                            {isLoading ? (
                                <Placeholder.Paragraph rows={8}>
                                    <Loader center content="loading" />
                                </Placeholder.Paragraph>
                            ) : (
                                <table className="general-info-table">
                                    <tbody>
                                        <tr>
                                            <td>Name: </td>
                                            <td colSpan={3}>
                                                {accessGroup?.name}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Keywords: </td>
                                            <td colSpan={3}>
                                                {accessGroup?.keywords
                                                    ?.length ? (
                                                    <>
                                                        {accessGroup.keywords.map(
                                                            (item, idx) => (
                                                                <Tag
                                                                    key={idx}
                                                                    color="blue"
                                                                >
                                                                    {item}
                                                                </Tag>
                                                            )
                                                        )}
                                                    </>
                                                ) : (
                                                    "N/A"
                                                )}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Create By: </td>
                                            <td>
                                                <UserNameLabel
                                                    userId={
                                                        accessGroup?.createBy
                                                    }
                                                />
                                            </td>
                                            <td>Create Time: </td>
                                            <td>
                                                {accessGroup?.createTime ? (
                                                    <DateDisplayWithTooltip
                                                        dateValue={
                                                            new Date(
                                                                accessGroup.createTime
                                                            )
                                                        }
                                                    />
                                                ) : (
                                                    "N/A"
                                                )}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Edit By: </td>
                                            <td>
                                                <UserNameLabel
                                                    userId={accessGroup?.editBy}
                                                />
                                            </td>
                                            <td>Edit Time: </td>
                                            <td>
                                                {accessGroup?.editTime ? (
                                                    <DateDisplayWithTooltip
                                                        dateValue={
                                                            new Date(
                                                                accessGroup.editTime
                                                            )
                                                        }
                                                    />
                                                ) : (
                                                    "N/A"
                                                )}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Granted Access:</td>
                                            <td colSpan={3}>
                                                {accessGroup?.operationUris
                                                    ?.length
                                                    ? accessGroup.operationUris.map(
                                                          (item, idx) => (
                                                              <Tag
                                                                  key={idx}
                                                                  color="green"
                                                              >
                                                                  {item}
                                                              </Tag>
                                                          )
                                                      )
                                                    : "N/A"}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Auto-created Role ID:</td>
                                            <td>
                                                {accessGroup?.roleId ? (
                                                    <Whisper
                                                        placement="top"
                                                        trigger="hover"
                                                        speaker={
                                                            <Popover>
                                                                Click the link
                                                                to view the
                                                                auto-managed
                                                                role
                                                            </Popover>
                                                        }
                                                    >
                                                        <Link
                                                            to={`/settings/roles/${accessGroup?.roleId}/permissions`}
                                                        >
                                                            {
                                                                accessGroup?.roleId
                                                            }
                                                        </Link>
                                                    </Whisper>
                                                ) : (
                                                    "N/A"
                                                )}
                                            </td>
                                            <td>Auto-created Permission ID:</td>
                                            <td>
                                                {accessGroup?.permissionId
                                                    ? accessGroup.permissionId
                                                    : "N/A"}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td valign="top">Description:</td>
                                            <td colSpan={3}>
                                                <pre>
                                                    {accessGroup?.description
                                                        ? accessGroup?.description
                                                        : "N/A"}
                                                </pre>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            )}
                        </Panel>
                    </Route>
                    <Route
                        exact
                        path={`/settings/accessGroups/${accessGroupId}/datasets`}
                    >
                        {isLoading ? (
                            <Placeholder.Paragraph rows={8}>
                                <Loader center content="loading" />
                            </Placeholder.Paragraph>
                        ) : accessGroupId && accessGroup?.permissionId ? (
                            <Panel bordered>
                                <AccessGroupDatasetsPanel
                                    groupId={accessGroupId}
                                    groupPermissionId={accessGroup.permissionId}
                                />
                            </Panel>
                        ) : (
                            <Message showIcon type="error" header="Error">
                                Invalid Empty Access Group Id: {accessGroupId}{" "}
                                or Empty Access Group Permission Id:{" "}
                                {accessGroup?.permissionId}
                            </Message>
                        )}
                    </Route>
                    <Route
                        exact
                        path={`/settings/accessGroups/${accessGroupId}/users`}
                    >
                        {isLoading ? (
                            <Placeholder.Paragraph rows={8}>
                                <Loader center content="loading" />
                            </Placeholder.Paragraph>
                        ) : accessGroupId && accessGroup?.roleId ? (
                            <Panel bordered>
                                <AccessGroupUsersPanel
                                    groupId={accessGroupId}
                                    groupRoleId={accessGroup.roleId}
                                />
                            </Panel>
                        ) : (
                            <Message showIcon type="error" header="Error">
                                Invalid Empty Access Group Id: {accessGroupId}{" "}
                                or Empty Access Group Role Id:{" "}
                                {accessGroup?.roleId}
                            </Message>
                        )}
                    </Route>
                </Switch>
            </div>
        </div>
    );
};

export default AccessGroupDetailsPage;
