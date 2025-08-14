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
import Input, { InputProps } from "rsuite/Input";
import { useAsync, useAsyncCallback } from "react-async-hook";
import "./RoleFormPopUp.scss";
import Form from "rsuite/Form";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import {
    RoleRecord,
    getRoleById,
    createRole,
    updateRole
} from "api-clients/AuthApis";

const Paragraph = Placeholder.Paragraph;

type PropsType = {};

type SubmitCompleteHandlerType = (submittedRoleId: string) => void;

export type RefType = {
    open: (roleId?: string, onComplete?: SubmitCompleteHandlerType) => void;
    close: () => void;
};

interface TextareaInputProps extends InputProps {
    rows?: number;
}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaInputProps>(
    (props, ref) => <Input {...props} as="textarea" ref={ref} />
);

const RoleFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [roleId, setRoleId] = useState<string>();
    const [role, setRole] = useState<RoleRecord>();
    const isCreateForm = roleId ? false : true;
    const onCompleteRef = useRef<SubmitCompleteHandlerType>();
    const [dataReloadToken, setdataReloadToken] = useState<string>("");

    useImperativeHandle(ref, () => ({
        open: (
            selectRoleId?: string,
            onComplete?: SubmitCompleteHandlerType
        ) => {
            onCompleteRef.current = onComplete;
            selectRoleId = selectRoleId?.trim();
            setRoleId(selectRoleId);
            if (selectRoleId === roleId) {
                setdataReloadToken(`${Math.random()}`);
            }
            setIsOpen(true);
        },
        close: () => {
            setRoleId(undefined);
            setIsOpen(false);
        }
    }));

    const { loading, error } = useAsync(
        async (roleId?: string, dataReloadToken?: string) => {
            if (!roleId) {
                setRole({ name: "", description: "" } as RoleRecord);
            } else {
                const record = await getRoleById(roleId, true);
                setRole(record);
            }
        },
        [roleId, dataReloadToken]
    );

    const submitData = useAsyncCallback(async () => {
        try {
            if (typeof role?.name !== "string" || !role?.name?.trim()) {
                throw new Error("role name can't be blank!");
            }

            const roleData = {
                name: role.name,
                description: role?.description ? role.description : ""
            };
            if (isCreateForm) {
                const newPermission = await createRole(roleData);
                setIsOpen(false);
                if (typeof onCompleteRef.current === "function") {
                    onCompleteRef.current(newPermission.id);
                }
            } else {
                await updateRole(roleId as string, roleData);
                setIsOpen(false);
                if (typeof onCompleteRef.current === "function") {
                    onCompleteRef.current(roleId as string);
                }
            }
        } catch (e) {
            toaster.push(
                <Notification
                    type={"error"}
                    closable={true}
                    header="Error"
                >{`Failed to ${
                    isCreateForm ? "create role" : "update role"
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
            className="role-form-popup"
            backdrop={"static"}
            keyboard={false}
            open={isOpen}
            size="lg"
            overflow={true}
            onClose={() => setIsOpen(false)}
        >
            <Modal.Header>
                <Modal.Title>
                    {isCreateForm ? "Create Role" : "Update Role"}
                </Modal.Title>
            </Modal.Header>

            <Modal.Body>
                {loading ? (
                    <Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Paragraph>
                ) : error ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve role record: {`${error}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content={`${
                                    isCreateForm ? "Creating" : "Updating"
                                } Role...`}
                                vertical
                            />
                        ) : null}
                        <Form
                            className="role-popup-form"
                            disabled={submitData.loading}
                            fluid
                            onChange={(v) => setRole(v as any)}
                            formValue={role}
                        >
                            <Form.Group controlId="ctrl-name">
                                <Form.ControlLabel>Name</Form.ControlLabel>
                                <Form.Control name="name" />
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

export default forwardRef<RefType, PropsType>(RoleFormPopUp);
