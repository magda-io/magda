import React, {
    ForwardRefRenderFunction,
    useState,
    forwardRef,
    useImperativeHandle,
    useRef
} from "react";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Placeholder from "rsuite/Placeholder";
import TreePicker from "rsuite/TreePicker";
import { useAsync, useAsyncCallback } from "react-async-hook";
import "./RoleFormPopUp.scss";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import { getUserById, updateUser, whoami } from "api-clients/AuthApis";
import { User } from "reducers/userManagementReducer";
import ServerError from "api-clients/ServerError";
import {
    getRootNode,
    OrgUnit,
    getImmediateChildren
} from "api-clients/OrgUnitApis";
import { ItemDataType } from "rsuite/esm/@types/common";

const Paragraph = Placeholder.Paragraph;

type PropsType = {};

type SubmitCompleteHandlerType = (submittedRoleId: string) => void;

export type RefType = {
    open: (userId: string, onComplete?: SubmitCompleteHandlerType) => void;
    close: () => void;
};

interface ItemType extends ItemDataType {
    rawData: OrgUnit;
}

const AssignUserOrgUnitFormPopUp: ForwardRefRenderFunction<
    RefType,
    PropsType
> = (props, ref) => {
    const [data, setData] = useState<ItemType[]>([]);
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [userId, setUserId] = useState<string>();
    const [user, setUser] = useState<Partial<User>>();
    const onCompleteRef = useRef<SubmitCompleteHandlerType>();
    const [dataReloadToken, setdataReloadToken] = useState<string>("");

    useImperativeHandle(ref, () => ({
        open: (
            selectUserId: string,
            onComplete?: SubmitCompleteHandlerType
        ) => {
            onCompleteRef.current = onComplete;
            setUserId(selectUserId);
            setdataReloadToken(`${Math.random()}`);
            setIsOpen(true);
        },
        close: () => {
            setUserId(undefined);
            setIsOpen(false);
        }
    }));

    const { loading, error } = useAsync(
        async (userId?: string, dataReloadToken?: string) => {
            if (!userId) {
                setUser(undefined);
            } else {
                if (!userId) {
                    throw new ServerError("user id cannot be empty!");
                }
                const record = await getUserById(userId, true);
                setUser(record);
            }
        },
        [userId, dataReloadToken]
    );

    const { result: userRootNode, loading: isUserRootNodeLoading } = useAsync(
        async (dataReloadToken: string) => {
            try {
                const userInfo = await whoami();
                let rootNode: OrgUnit;
                if (userInfo?.orgUnit?.id) {
                    rootNode = userInfo.orgUnit;
                } else {
                    rootNode = await getRootNode(true);
                }
                setData([
                    {
                        label: rootNode.name,
                        value: rootNode.id,
                        rawData: rootNode,
                        children: []
                    }
                ]);
                return rootNode;
            } catch (e) {
                toaster.push(
                    <Notification
                        type={"error"}
                        closable={true}
                        header="Error"
                    >{`Failed to retrieve user root node: ${e}`}</Notification>,
                    {
                        placement: "topEnd"
                    }
                );
                throw e;
            }
        },
        [dataReloadToken]
    );

    const submitData = useAsyncCallback(async () => {
        try {
            const orgUnitId = user?.orgUnitId?.trim();
            if (!orgUnitId) {
                throw new Error("Please select an Org Unit!");
            }
            if (!userId) {
                throw new ServerError("user id cannot be empty!");
            }
            await updateUser(userId, {
                orgUnitId
            });
            setIsOpen(false);
            if (typeof onCompleteRef.current === "function") {
                onCompleteRef.current(userId);
            }
        } catch (e) {
            toaster.push(
                <Notification
                    type={"error"}
                    closable={true}
                    header="Error"
                >{`Failed to update org unit for the user: ${e}`}</Notification>,
                {
                    placement: "topEnd"
                }
            );
            throw e;
        }
    });

    return (
        <Modal
            className="assign-user-org-unit-form-popup"
            backdrop={"static"}
            keyboard={false}
            open={isOpen}
            size="md"
            overflow={true}
            onClose={() => setIsOpen(false)}
        >
            <Modal.Header>
                <Modal.Title>Assign Org Unit to User</Modal.Title>
            </Modal.Header>

            <Modal.Body>
                {loading || isUserRootNodeLoading ? (
                    <Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Paragraph>
                ) : error ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve user record: {`${error}`}
                    </Message>
                ) : !userRootNode ? (
                    <Message showIcon type="warning">
                        Cannot locate the root node.
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content={`Updating user record & assigning Org Unit...`}
                                vertical
                            />
                        ) : null}
                        <TreePicker
                            data={data}
                            block={true}
                            disabled={submitData.loading}
                            onSelect={(activeNode, value, event) => {
                                setUser((u) => ({
                                    ...(u ? u : {}),
                                    orgUnitId: value as string
                                }));
                            }}
                            getChildren={async (activeNode) => {
                                try {
                                    const nodes = await getImmediateChildren(
                                        activeNode?.rawData?.id,
                                        true
                                    );
                                    if (!nodes?.length) {
                                        return [] as ItemType[];
                                    } else {
                                        return nodes.map((node) => ({
                                            label: node.name,
                                            value: node.id,
                                            rawData: node,
                                            children: []
                                        }));
                                    }
                                } catch (e) {
                                    toaster.push(
                                        <Notification
                                            type={"error"}
                                            closable={true}
                                            header="Error"
                                        >{`Failed to retrieve org unit data: ${e}`}</Notification>,
                                        {
                                            placement: "topEnd"
                                        }
                                    );
                                    throw e;
                                }
                            }}
                        />
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button
                    appearance="primary"
                    onClick={submitData.execute}
                    disabled={!!error}
                >
                    {"Confirm"}
                </Button>
                <Button onClick={() => setIsOpen(false)}>Cancel</Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(AssignUserOrgUnitFormPopUp);
