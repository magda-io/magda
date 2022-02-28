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
import { useAsync, useAsyncCallback } from "react-async-hook";
import "./RecordFormPopUp.scss";
import {
    Record,
    fetchRecordById,
    createRecord,
    patchRecord
} from "api-clients/RegistryApis";
import Form from "rsuite/Form";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import { v4 as uuid } from "uuid";

const Paragraph = Placeholder.Paragraph;

type PropsType = {};

type SubmitCompleteHandlerType = (submittedRecordId: string) => void;

export type RefType = {
    open: (recordId?: string, onComplete?: SubmitCompleteHandlerType) => void;
    close: () => void;
};

const RecordFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [recordId, setRecordId] = useState<string>();
    const [record, setRecord] = useState<Partial<Record>>();
    const isCreateForm = recordId ? false : true;
    const onCompleteRef = useRef<SubmitCompleteHandlerType>();
    const [recordReloadToken, setRecordReloadToken] = useState<string>("");

    useImperativeHandle(ref, () => ({
        open: (
            selectRecordId?: string,
            onComplete?: SubmitCompleteHandlerType
        ) => {
            onCompleteRef.current = onComplete;
            if (typeof selectRecordId === "string") {
                selectRecordId = selectRecordId.trim();
                if (selectRecordId) {
                    setRecordId(selectRecordId);
                }
                if (selectRecordId === recordId) {
                    setRecordReloadToken(`${Math.random()}`);
                }
            }
            setIsOpen(true);
        },
        close: () => setIsOpen(false)
    }));

    const { loading, error } = useAsync(
        async (recordId?: string, recordReloadToken?: string) => {
            if (!recordId) {
                setRecord({
                    id: uuid()
                });
            } else {
                const record = await fetchRecordById(recordId as string);
                setRecord(record);
            }
        },
        [recordId, recordReloadToken]
    );

    const submitData = useAsyncCallback(async () => {
        try {
            if (typeof record?.name !== "string" || !record?.name?.trim()) {
                throw new Error("Record name can't be blank!");
            }
            if (isCreateForm) {
                if (typeof record?.id !== "string" || !record?.id?.trim()) {
                    throw new Error("Record ID can't be blank!");
                }
                const [newRecord] = await createRecord({
                    id: record.id as string,
                    name: record.name,
                    aspects: {}
                });
                setIsOpen(false);
                if (typeof onCompleteRef.current === "function") {
                    onCompleteRef.current(newRecord.id);
                }
            } else {
                if (typeof record?.id !== "string" || !record?.id?.trim()) {
                    throw new Error("Record ID can't be blank!");
                }
                await patchRecord(record?.id, [
                    { op: "replace", path: "/name", value: record.name }
                ]);
                setIsOpen(false);
                if (typeof onCompleteRef.current === "function") {
                    onCompleteRef.current(record?.id);
                }
            }
        } catch (e) {
            toaster.push(
                <Notification
                    type={"error"}
                    closable={true}
                    header="Error"
                >{`Failed to ${
                    isCreateForm ? "create record" : "update record"
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
            className="record-form-popup"
            backdrop={"static"}
            keyboard={false}
            open={isOpen}
            onClose={() => setIsOpen(false)}
        >
            <Modal.Header>
                <Modal.Title>
                    {isCreateForm ? "Create Record" : "Edit Record"}
                </Modal.Title>
            </Modal.Header>

            <Modal.Body>
                {loading ? (
                    <Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Paragraph>
                ) : error ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve record: {`${error}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content={`${
                                    isCreateForm ? "Creating" : "updating"
                                } record...`}
                                vertical
                            />
                        ) : null}
                        <Form
                            className="record-form-popup-table"
                            fluid
                            onChange={setRecord}
                            formValue={record as Record}
                        >
                            <Form.Group controlId="record-id">
                                <Form.ControlLabel>Record ID</Form.ControlLabel>
                                <Form.Control
                                    name="id"
                                    disabled={
                                        !isCreateForm || submitData.loading
                                    }
                                />
                                {isCreateForm ? (
                                    <Form.HelpText>Required</Form.HelpText>
                                ) : null}
                            </Form.Group>
                            <Form.Group controlId="record-name">
                                <Form.ControlLabel>
                                    Record Name
                                </Form.ControlLabel>
                                <Form.Control
                                    name="name"
                                    disabled={submitData.loading}
                                />
                                <Form.HelpText>Required</Form.HelpText>
                            </Form.Group>
                        </Form>
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="primary" onClick={submitData.execute}>
                    {isCreateForm ? "Create" : "Update"}
                </Button>
                <Button onClick={() => setIsOpen(false)}>Cancel</Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(RecordFormPopUp);
