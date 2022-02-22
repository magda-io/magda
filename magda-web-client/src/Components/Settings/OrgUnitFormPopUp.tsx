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
import "./OrgUnitFormPopUp.scss";
import Form from "rsuite/Form";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import {
    RoleRecord,
    getRoleById,
    createRole,
    updateRole
} from "api-clients/AuthApis";
import { OrgUnit } from "reducers/userManagementReducer";
import { getOrgUnitById } from "api-clients/OrgUnitApis";

const Paragraph = Placeholder.Paragraph;

type PropsType = {};

type SubmitCompleteHandlerType = (submittedOrgUnitId: string) => void;

export type RefType = {
    open: (orgUnitId?: string, onComplete?: SubmitCompleteHandlerType) => void;
    close: () => void;
};

interface TextareaInputProps extends InputProps {
    rows?: number;
}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaInputProps>(
    (props, ref) => <Input {...props} as="textarea" ref={ref} />
);

const OrgUnitFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [parentOrgUnitId, setParentOrgUnitId] = useState<string>();
    const [orgUnitId, setOrgUnitId] = useState<string>();
    const [orgUnit, setOrgUnit] = useState<OrgUnit>();
    const isCreateForm = orgUnitId ? false : true;
    const onCompleteRef = useRef<SubmitCompleteHandlerType>();
    const [dataReloadToken, setdataReloadToken] = useState<string>("");

    useImperativeHandle(ref, () => ({
        open: (
            selectOrgUnitId?: string,
            onComplete?: SubmitCompleteHandlerType,
            parentOrgUnitId?: string
        ) => {
            onCompleteRef.current = onComplete;
            selectOrgUnitId = selectOrgUnitId?.trim();
            setOrgUnitId(selectOrgUnitId);
            parentOrgUnitId = parentOrgUnitId?.trim();
            setParentOrgUnitId(parentOrgUnitId);
            if (selectOrgUnitId === orgUnitId) {
                setdataReloadToken(`${Math.random()}`);
            }
            setIsOpen(true);
        },
        close: () => {
            setOrgUnitId(undefined);
            setParentOrgUnitId(undefined);
            setIsOpen(false);
        }
    }));

    const { loading, error } = useAsync(
        async (orgUnitId?: string, dataReloadToken?: string) => {
            if (!orgUnitId) {
                setOrgUnit(undefined);
            } else {
                const record = await getOrgUnitById(orgUnitId, true);
                setOrgUnit(record);
            }
        },
        [orgUnitId, dataReloadToken]
    );

    const submitData = useAsyncCallback(async () => {
        try {
            if (typeof orgUnit?.name !== "string" || !orgUnit?.name?.trim()) {
                throw new Error("org unit name can't be blank!");
            }

            const orgUnitData = {
                name: orgUnit.name,
                description: orgUnit?.description ? orgUnit.description : ""
            };
            if (isCreateForm) {
                const newPermission = await create(orgUnitData);
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

export default forwardRef<RefType, PropsType>(OrgUnitFormPopUp);
