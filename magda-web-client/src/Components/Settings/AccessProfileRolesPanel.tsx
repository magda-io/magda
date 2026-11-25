import React, { FunctionComponent, useState } from "react";
import { useAsync } from "react-async-hook";
import { Link } from "react-router-dom";
import Button from "rsuite/Button";
import Message from "rsuite/Message";
import Table from "rsuite/Table";
import { MdAddCircle } from "react-icons/md";
import ConfirmDialog from "./ConfirmDialog";
import reportInfo from "./reportInfo";
import AccessProfileAddRolePopUp from "./AccessProfileAddRolePopUp";
import { getUrlWithPopUpQueryString } from "helpers/popupUtils";
import {
    AccessProfileRole,
    describeLlmServicesError,
    detachAccessProfileRole,
    listAccessProfileRoles
} from "api-clients/LlmServicesApis";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

const PAGE_SIZE = 20;

export const removeRoleConfirmText = (roleName: string, profileName: string) =>
    `Remove "${profileName}" from role "${roleName}"? People with this role lose the access this profile gives them through it. The role and its users are not changed.`;

type PropsType = {
    profileId: string;
    profileName: string;
    canEdit: boolean;
};

/**
 * The roles holding the profile's Use permission (API-3). Grants are only
 * via roles: there's no user list, and no attempt to work out who
 * effectively has access.
 */
const AccessProfileRolesPanel: FunctionComponent<PropsType> = (props) => {
    const { profileId, profileName, canEdit } = props;
    const [offset, setOffset] = useState<number>(0);
    const [reloadToken, setReloadToken] = useState<string>("");
    const [isAddOpen, setIsAddOpen] = useState<boolean>(false);

    const reload = () => setReloadToken(`${Math.random()}`);

    const { result, loading, error, execute } = useAsync(
        async (profileId: string, offset: number, _reloadToken: string) =>
            listAccessProfileRoles(profileId, { offset, limit: PAGE_SIZE }),
        [profileId, offset, reloadToken]
    );
    const roles = result || [];

    const removeRole = (role: AccessProfileRole) =>
        ConfirmDialog.open({
            headingText: "Remove role?",
            confirmMsg: removeRoleConfirmText(role.name, profileName),
            loadingText: "Removing the role's access...",
            confirmHandler: async () => {
                try {
                    await detachAccessProfileRole(profileId, role.id);
                } catch (e) {
                    throw new Error(
                        `The role's access wasn't removed. ${describeLlmServicesError(
                            e
                        )}`
                    );
                }
                reportInfo(
                    `Role "${role.name}" no longer gives access to this profile.`,
                    { type: "success", header: "Role removed" }
                );
                if (roles.length === 1 && offset > 0) {
                    setOffset(Math.max(0, offset - PAGE_SIZE));
                } else {
                    reload();
                }
            }
        });

    return (
        <div className="access-profile-roles-panel">
            <p className="access-profile-roles-note">
                To give individual people access, add them to one of these roles
                in{" "}
                <Link to={getUrlWithPopUpQueryString("/settings/users")}>
                    Settings → Users
                </Link>
                . People may also have access through the profile's org unit or
                the Public setting.
            </p>
            {canEdit ? (
                <div className="search-button-container">
                    <Button
                        color="blue"
                        appearance="primary"
                        startIcon={<MdAddCircle />}
                        onClick={() => setIsAddOpen(true)}
                    >
                        Add role
                    </Button>
                </div>
            ) : null}
            {error ? (
                <Message
                    showIcon
                    type="error"
                    header="Unable to load the roles"
                >
                    <p>{describeLlmServicesError(error)}</p>
                    <Button
                        appearance="link"
                        onClick={() => execute(profileId, offset, reloadToken)}
                    >
                        Retry
                    </Button>
                </Message>
            ) : !loading && !roles.length && offset === 0 ? (
                <Message showIcon type="info">
                    No roles give access to this profile yet.
                    {canEdit
                        ? " Add a role to let everyone with that role use it."
                        : ""}
                </Message>
            ) : (
                <>
                    <Table
                        autoHeight={true}
                        data={roles}
                        loading={loading}
                        rowKey="id"
                    >
                        <Column width={300} resizable>
                            <HeaderCell>Role</HeaderCell>
                            <Cell>
                                {(row: AccessProfileRole) => (
                                    <span>
                                        {row.name}
                                        <span className="access-profile-role-id">
                                            {row.id}
                                        </span>
                                    </span>
                                )}
                            </Cell>
                        </Column>
                        <Column width={200} flexGrow={1}>
                            <HeaderCell>Description</HeaderCell>
                            <Cell>
                                {(row: AccessProfileRole) =>
                                    row.description || ""
                                }
                            </Cell>
                        </Column>
                        {canEdit ? (
                            <Column width={120} fixed="right">
                                <HeaderCell align="center">Actions</HeaderCell>
                                <Cell
                                    align="center"
                                    verticalAlign="middle"
                                    style={{ padding: "0px" }}
                                >
                                    {(row: AccessProfileRole) => (
                                        <Button
                                            size="sm"
                                            aria-label={`Remove role ${row.name}`}
                                            onClick={() => removeRole(row)}
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </Cell>
                            </Column>
                        ) : null}
                    </Table>
                    {offset > 0 || roles.length >= PAGE_SIZE ? (
                        <div className="access-profile-roles-pager">
                            <Button
                                disabled={offset === 0 || loading}
                                onClick={() =>
                                    setOffset(Math.max(0, offset - PAGE_SIZE))
                                }
                            >
                                Previous page
                            </Button>
                            <Button
                                disabled={roles.length < PAGE_SIZE || loading}
                                onClick={() => setOffset(offset + PAGE_SIZE)}
                            >
                                Next page
                            </Button>
                        </div>
                    ) : null}
                </>
            )}
            {canEdit ? (
                <AccessProfileAddRolePopUp
                    open={isAddOpen}
                    profileId={profileId}
                    profileName={profileName}
                    onClose={() => setIsAddOpen(false)}
                    onAdded={(role) => {
                        setIsAddOpen(false);
                        reportInfo(
                            `Everyone with role "${role.name}" can now use this profile.`,
                            { type: "success", header: "Role added" }
                        );
                        reload();
                    }}
                />
            ) : null}
        </div>
    );
};

export default AccessProfileRolesPanel;
