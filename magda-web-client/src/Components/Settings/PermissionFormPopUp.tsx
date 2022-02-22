import React, {
    ForwardRefRenderFunction,
    useState,
    forwardRef,
    useImperativeHandle,
    useRef
} from "react";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import InputPicker from "rsuite/InputPicker";
import Input, { InputProps } from "rsuite/Input";
import Checkbox from "rsuite/Checkbox";
import CheckboxGroup from "rsuite/CheckboxGroup";
import { useAsync, useAsyncCallback } from "react-async-hook";
import "./PermissionFormPopUp.scss";
import Form from "rsuite/Form";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import { ItemDataType } from "rsuite/esm/@types/common";
import {
    getPermissionById,
    createRolePermission,
    updateRolePermission,
    queryResources,
    queryResOperations,
    ResourceRecord,
    OperationRecord,
    CreateRolePermissionInputData
} from "api-clients/AuthApis";
import reportError from "./reportError";

interface ResourceDropDownItemType extends ItemDataType {
    rawData: ResourceRecord;
}

interface OperationDropDownItemType extends ItemDataType {
    rawData: OperationRecord;
}

interface PermissionDataType extends Partial<CreateRolePermissionInputData> {
    // will fill this single field with values from all 3 contraint fields
    // this field is mainly used by checkbox UI
    // at this moment, we only allow permission to have one type of constraint
    // but checkbox group requires array data type. Thus, string[]
    constraints: string[];
}

const Paragraph = Placeholder.Paragraph;

type PropsType = {
    roleId: string;
};

type SubmitCompleteHandlerType = (submittedPermissionId: string) => void;

export type RefType = {
    open: (
        permissionId?: string,
        onComplete?: SubmitCompleteHandlerType
    ) => void;
    close: () => void;
};

interface TextareaInputProps extends InputProps {
    rows?: number;
}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaInputProps>(
    (props, ref) => <Input {...props} as="textarea" ref={ref} />
);

const PermissionFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const { roleId } = props;
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [permissionId, setPermissionId] = useState<string>();
    const [permission, setPermission] = useState<PermissionDataType>();
    const isCreateForm = permissionId ? false : true;
    const onCompleteRef = useRef<SubmitCompleteHandlerType>();
    const [dataReloadToken, setdataReloadToken] = useState<string>("");
    const selectedResourceId = permission?.resource_id;

    useImperativeHandle(ref, () => ({
        open: (
            selectPermissionId?: string,
            onComplete?: SubmitCompleteHandlerType
        ) => {
            onCompleteRef.current = onComplete;
            selectPermissionId = selectPermissionId?.trim();
            setPermissionId(selectPermissionId);
            if (selectPermissionId === permissionId) {
                setdataReloadToken(`${Math.random()}`);
            }
            setIsOpen(true);
        },
        close: () => {
            setPermissionId(undefined);
            setIsOpen(false);
        }
    }));

    const { loading, error } = useAsync(
        async (permissionId?: string, dataReloadToken?: string) => {
            if (!permissionId) {
                setPermission(undefined);
            } else {
                const record = await getPermissionById(permissionId, true);
                setPermission({
                    ...record,
                    constraints: record?.user_ownership_constraint
                        ? ["user_ownership_constraint"]
                        : record?.org_unit_ownership_constraint
                        ? ["org_unit_ownership_constraint"]
                        : record?.pre_authorised_constraint
                        ? ["pre_authorised_constraint"]
                        : [],
                    operationIds: record?.operations?.length
                        ? record.operations.map((op) => op.id)
                        : []
                });
            }
        },
        [permissionId, dataReloadToken]
    );

    const {
        result: resourceItems,
        loading: resourcesLoading
    } = useAsync(async () => {
        try {
            const resources = await queryResources({ noCache: true });
            if (!resources?.length) {
                return [];
            }
            return resources.map((item) => ({
                label: `${item.uri} (${item.name})`,
                value: item.id,
                rawData: item
            })) as ResourceDropDownItemType[];
        } catch (e) {
            reportError(`Failed to load resource data.`);
            throw e;
        }
    }, []);

    const { result: operationItems, loading: operationsLoading } = useAsync(
        async (resourceId?: string) => {
            try {
                if (!resourceId) {
                    return [];
                }
                const operations = await queryResOperations(resourceId, {
                    noCache: true
                });
                if (!operations?.length) {
                    return [];
                }
                return operations.map((item) => ({
                    label: `${item.uri} (${item.name})`,
                    value: item.id,
                    rawData: item
                })) as OperationDropDownItemType[];
            } catch (e) {
                reportError(`Failed to load resource data.`);
                throw e;
            }
        },
        [selectedResourceId]
    );

    const submitData = useAsyncCallback(async () => {
        try {
            if (
                typeof permission?.name !== "string" ||
                !permission?.name?.trim()
            ) {
                throw new Error("permission name can't be blank!");
            }
            if (
                typeof permission?.resource_id !== "string" ||
                !permission?.resource_id?.trim()
            ) {
                throw new Error("You must select a resource!");
            }
            if (!permission?.operationIds?.length) {
                throw new Error("You must select at least one operation!");
            }
            const permissionData = {
                name: permission.name,
                description: permission?.description
                    ? permission.description
                    : "",
                resource_id: permission.resource_id,
                user_ownership_constraint: permission.user_ownership_constraint
                    ? true
                    : false,
                org_unit_ownership_constraint: permission.org_unit_ownership_constraint
                    ? true
                    : false,
                pre_authorised_constraint: permission.pre_authorised_constraint
                    ? true
                    : false,
                operationIds: permission.operationIds
            };
            if (isCreateForm) {
                const newPermission = await createRolePermission(
                    roleId,
                    permissionData
                );
                setIsOpen(false);
                if (typeof onCompleteRef.current === "function") {
                    onCompleteRef.current(newPermission.id);
                }
            } else {
                await updateRolePermission(
                    roleId,
                    permissionId as string,
                    permissionData
                );
                setIsOpen(false);
                if (typeof onCompleteRef.current === "function") {
                    onCompleteRef.current(permissionId as string);
                }
            }
        } catch (e) {
            toaster.push(
                <Notification
                    type={"error"}
                    closable={true}
                    header="Error"
                >{`Failed to ${
                    isCreateForm ? "create permission" : "update permission"
                }: ${e}`}</Notification>,
                {
                    placement: "topEnd"
                }
            );
            throw e;
        }
    });

    return (
        <Modal
            className="role-permission-form-popup"
            backdrop={"static"}
            keyboard={false}
            open={isOpen}
            size="lg"
            overflow={true}
            onClose={() => setIsOpen(false)}
        >
            <Modal.Header>
                <Modal.Title>
                    {isCreateForm
                        ? "Create Permission for Role"
                        : "Update Permission for Role"}
                </Modal.Title>
            </Modal.Header>

            <Modal.Body>
                {loading ? (
                    <Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Paragraph>
                ) : error ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve permission: {`${error}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content={`${
                                    isCreateForm ? "Creating" : "Updating"
                                } Permission for Role...`}
                                vertical
                            />
                        ) : null}
                        <Form
                            className="role-permission-popup-form"
                            disabled={submitData.loading}
                            fluid
                            onChange={(p) => {
                                const pData = {
                                    ...p
                                } as PermissionDataType;
                                const constraints = pData?.constraints;
                                pData.user_ownership_constraint = false;
                                pData.org_unit_ownership_constraint = false;
                                pData.pre_authorised_constraint = false;

                                if (
                                    constraints?.[0] ===
                                    "user_ownership_constraint"
                                ) {
                                    pData.user_ownership_constraint = true;
                                } else if (
                                    constraints?.[0] ===
                                    "org_unit_ownership_constraint"
                                ) {
                                    pData.org_unit_ownership_constraint = true;
                                } else if (
                                    constraints?.[0] ===
                                    "pre_authorised_constraint"
                                ) {
                                    pData.pre_authorised_constraint = true;
                                }

                                if (
                                    pData?.resource_id !==
                                    permission?.resource_id
                                ) {
                                    pData.operationIds = [];
                                }

                                setPermission(pData);
                            }}
                            formValue={permission as any}
                        >
                            <Form.Group controlId="ctrl-name">
                                <Form.ControlLabel>Name</Form.ControlLabel>
                                <Form.Control name="name" />
                            </Form.Group>
                            <Form.Group controlId="ctrl-resource-id">
                                <Form.ControlLabel>Resource:</Form.ControlLabel>
                                {resourcesLoading ? (
                                    <Loader content="Loading resource data..." />
                                ) : (
                                    <Form.Control
                                        name="resource_id"
                                        accepter={InputPicker}
                                        block
                                        data={
                                            resourceItems ? resourceItems : []
                                        }
                                    />
                                )}
                            </Form.Group>
                            <Form.Group controlId="ctrl-operationIds">
                                <Form.ControlLabel>
                                    Operations:
                                </Form.ControlLabel>
                                {!selectedResourceId ? (
                                    <p>Please select a resource first...</p>
                                ) : operationsLoading ? (
                                    <Loader content="Loading operations data..." />
                                ) : (
                                    <Form.Control
                                        name="operationIds"
                                        accepter={CheckboxGroup}
                                    >
                                        {operationItems?.map((item, idx) => (
                                            <Checkbox
                                                value={item.value}
                                                key={idx}
                                            >
                                                {item.label}
                                            </Checkbox>
                                        ))}
                                    </Form.Control>
                                )}
                            </Form.Group>
                            <Form.Group controlId="ctrl-permission-constraint">
                                <Form.ControlLabel>
                                    Constraint:
                                </Form.ControlLabel>
                                <Form.Control
                                    name="constraints"
                                    accepter={CheckboxGroup}
                                    inline
                                >
                                    <Checkbox
                                        key="user_ownership_constraint"
                                        value="user_ownership_constraint"
                                        disabled={
                                            !!permission?.constraints?.[0] &&
                                            !permission.user_ownership_constraint
                                        }
                                    >
                                        Ownership Constraint
                                    </Checkbox>
                                    <Checkbox
                                        key="org_unit_ownership_constraint"
                                        value="org_unit_ownership_constraint"
                                        disabled={
                                            !!permission?.constraints?.[0] &&
                                            !permission.org_unit_ownership_constraint
                                        }
                                    >
                                        Org Unit Constraint
                                    </Checkbox>
                                    <Checkbox
                                        key="pre_authorised_constraint"
                                        value="pre_authorised_constraint"
                                        disabled={
                                            !!permission?.constraints?.[0] &&
                                            !permission.pre_authorised_constraint
                                        }
                                    >
                                        Pre-Authorised Constraint
                                    </Checkbox>
                                </Form.Control>
                            </Form.Group>
                            <Form.Group controlId="ctrl-description">
                                <Form.ControlLabel>
                                    Description:
                                </Form.ControlLabel>
                                <Form.Control
                                    rows={5}
                                    name="description"
                                    accepter={Textarea}
                                />
                            </Form.Group>
                        </Form>
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button
                    appearance="primary"
                    onClick={submitData.execute}
                    disabled={!!error}
                >
                    {isCreateForm ? "Create" : "Update"}
                </Button>
                <Button onClick={() => setIsOpen(false)}>Cancel</Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(PermissionFormPopUp);
