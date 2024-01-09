import React, { FunctionComponent, useState } from "react";
import Button from "rsuite/Button";
import Modal from "rsuite/Modal";
import { MdAssignmentReturn } from "react-icons/md";
import { User } from "reducers/userManagementReducer";
import {
    queryRoles,
    RoleRecord,
    addUserRoles
} from "../../api-clients/AuthApis";
import { useAsync, useAsyncCallback } from "react-async-hook";
import reportError from "../../helpers/reportError";
import { ItemDataType } from "rsuite/esm/@types/common";
import Placeholder from "rsuite/Placeholder";
import Message from "rsuite/Message";
import Loader from "rsuite/Loader";
import SelectPicker from "rsuite/SelectPicker";

const Paragraph = Placeholder.Paragraph;

type PropsType = {
    userId: string;
    onAssignedRole?: (roleId: string) => void;
    user?: User;
};

interface RoleDropdownItemType extends ItemDataType<string> {
    rawData: RoleRecord;
}

const AssignUserRoleButton: FunctionComponent<PropsType> = (props) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [selectRoleId, setSelectRoleId] = useState<string>("");
    const { userId, user, onAssignedRole } = props;

    const {
        result: roles,
        loading: loadingRoles,
        error: loadingRoleError
    } = useAsync(
        async (userId: string, isOpen: boolean) => {
            if (!isOpen) {
                // only load the data when popup is opened.
                return [];
            }
            const allRoles = await queryRoles();
            const userRoles = await queryRoles({
                user_id: userId,
                noCache: true
            });
            let availableRoles: RoleRecord[];
            if (!userRoles?.length) {
                availableRoles = allRoles;
            }
            availableRoles = allRoles.filter(
                (role) =>
                    userRoles.findIndex(
                        (userRole) => userRole.id === role.id
                    ) === -1
            );
            setSelectRoleId("");
            return availableRoles.map((role) => ({
                label: role.name,
                value: role.id
            })) as RoleDropdownItemType[];
        },
        [userId, isOpen]
    );

    const submitData = useAsyncCallback(async () => {
        try {
            if (!selectRoleId) {
                throw new Error("you haven't selected a role.");
            }
            await addUserRoles(userId, [selectRoleId]);
            if (typeof onAssignedRole === "function") {
                onAssignedRole(selectRoleId);
            }
            setIsOpen(false);
        } catch (e) {
            reportError(`Failed to assign a role to the user: ${e}`);
            throw e;
        }
    });

    return (
        <>
            <Button
                color="blue"
                appearance="primary"
                onClick={() => setIsOpen(true)}
            >
                <MdAssignmentReturn /> Assign Role to User
            </Button>
            <Modal
                className="assign-user-role-form-popup"
                overflow={true}
                size="md"
                backdrop={"static"}
                keyboard={false}
                open={isOpen}
                onClose={() => setIsOpen(false)}
            >
                <Modal.Header>
                    <Modal.Title>
                        {user?.displayName
                            ? `Assign Role to User: ${user.displayName}`
                            : "Assign Role to User"}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {loadingRoles ? (
                        <Paragraph rows={6}>
                            <Loader center content="loading" />
                        </Paragraph>
                    ) : loadingRoleError ? (
                        <Message showIcon type="error" header="Error">
                            {`Failed to retrieve available roles from system: ${loadingRoleError}`}
                        </Message>
                    ) : (
                        <>
                            {submitData.loading ? (
                                <Loader
                                    backdrop
                                    content={"Assigning role to the user..."}
                                    vertical
                                />
                            ) : (
                                <SelectPicker
                                    virtualized
                                    block
                                    disabled={submitData.loading}
                                    data={roles ? roles : []}
                                    onChange={(roleId) =>
                                        setSelectRoleId(roleId ? roleId : "")
                                    }
                                />
                            )}
                        </>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button appearance="primary" onClick={submitData.execute}>
                        Confirm
                    </Button>
                    <Button onClick={() => setIsOpen(false)}>Cancel</Button>
                </Modal.Footer>
            </Modal>
        </>
    );
};

export default AssignUserRoleButton;
