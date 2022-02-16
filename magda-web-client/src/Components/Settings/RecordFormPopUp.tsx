import React, {
    ForwardRefRenderFunction,
    useState,
    forwardRef,
    useImperativeHandle
} from "react";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import { useAsync } from "react-async-hook";
import "./RecordFormPopUp.scss";
import { Record, fetchRecordById } from "api-clients/RegistryApis";
import Form from "rsuite/Form";

const Paragraph = Placeholder.Paragraph;

type PropsType = {};

export type RefType = {
    open: (recordId?: string) => void;
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
    console.log(recordId, isCreateForm);

    useImperativeHandle(ref, () => ({
        open: (recordId?: string) => {
            setRecordId(
                typeof recordId === "string" ? recordId.trim() : recordId
            );
            setIsOpen(true);
        },
        close: () => setIsOpen(false)
    }));

    const { loading, error } = useAsync(
        async (recordId?: string) => {
            if (!recordId) {
                setRecordId(undefined);
                return;
            }
            return await fetchRecordById(recordId as string);
        },
        [recordId]
    );

    return (
        <Modal
            className="record-form-popup"
            backdrop={true}
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
                    <Form
                        className="record-form-popup-table"
                        fluid
                        onChange={setRecord}
                        formValue={record as Record}
                    >
                        <Form.Group controlId="record-name">
                            <Form.ControlLabel>Record Name</Form.ControlLabel>
                            <Form.Control name="name" />
                            <Form.HelpText>Required</Form.HelpText>
                        </Form.Group>
                    </Form>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="primary" onClick={() => setIsOpen(false)}>
                    {isCreateForm ? "Create" : "Update"}
                </Button>
                <Button onClick={() => setIsOpen(false)}>Cancel</Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(RecordFormPopUp);
