import { OperationRecord } from "@magda/typescript-common/dist/authorization-api/model";
import {
    createOperation,
    getResOperationsById,
    updateOperation
} from "api-clients/AuthApis";
import isEmpty from "lodash/isEmpty";
import React, {
    forwardRef,
    ForwardRefRenderFunction,
    useCallback,
    useImperativeHandle,
    useRef,
    useState
} from "react";
import { useAsync, useAsyncCallback } from "react-async-hook";
import Button from "rsuite/Button";
import Form, { FormInstance } from "rsuite/Form";
import Input, { InputProps } from "rsuite/Input";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Modal from "rsuite/Modal";
import Placeholder from "rsuite/Placeholder";
import Schema from "rsuite/Schema";
import reportError from "../../helpers/reportError";

interface TextareaInputProps extends InputProps {
    rows?: number;
}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaInputProps>(
    (props, ref) => <Input {...props} as="textarea" ref={ref} />
);

type PropsType = {};

type UpdateCompleteHandlerType = (submittedOperationId: string) => void;

export type RefType = {
    open: (
        operationId?: string,
        resourceId?: string,
        onComplete?: UpdateCompleteHandlerType
    ) => void;
    close: () => void;
};

const OperationFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [operationId, setOperationId] = useState<string>();
    const [operation, setOperation] = useState<OperationRecord>();
    const [resourceId, setResourceId] = useState<string>();
    const [formError, setFormError] = useState({});
    // we might want to force reload the operation on open in avoid obsolete data.
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const onCompleteRef = useRef<UpdateCompleteHandlerType>();
    const formRef = useRef<FormInstance>(null);

    const isCreateForm = operationId ? false : true;

    const model = Schema.Model({
        uri: Schema.Types.StringType()
            .isRequired("This field is required.")
            .pattern(
                /^[a-zA-Z0-9]+(\/[a-zA-Z0-9]+)*$/g,
                "Please enter a valid format."
            ),
        name: Schema.Types.StringType().isRequired("This field is required."),
        description: Schema.Types.StringType()
    });

    // use useCallback to make handler ref stable
    // not a logic-wise must-have but will be performance-wise better
    const onModalClose = useCallback(() => {
        setOperationId(undefined);
        setIsOpen(false);
    }, []);

    useImperativeHandle(ref, () => ({
        open: (
            operationId?: string,
            resourceId?: string,
            onComplete?: UpdateCompleteHandlerType
        ) => {
            onCompleteRef.current = onComplete;
            operationId = operationId?.trim();
            setOperationId(operationId);
            setResourceId(resourceId);
            setDataReloadToken(`${Math.random()}`);
            setIsOpen(true);
        },
        close: onModalClose
    }));

    const validateForm = (): boolean => {
        if (formRef?.current?.check && !formRef.current.check()) {
            return false;
        }
        return true;
    };

    // load operation record data to prefill the form by id
    const {
        loading: loadingOperation,
        error: loadingOperationError
    } = useAsync(
        async (operationId?: string, dataReloadToken?: string) => {
            if (!operationId) {
                setOperation(undefined);
            } else {
                const operations = await getResOperationsById(
                    operationId as string,
                    true
                );
                if (operations) {
                    setOperation(operations);
                } else {
                    setOperation(undefined);
                }
            }
        },
        [operationId, dataReloadToken]
    );

    const submitData = useAsyncCallback(async () => {
        try {
            const {
                id,
                resource_id,
                ...operationData
            } = operation as OperationRecord;
            if (operationId) {
                await updateOperation(operationId as string, operationData);
                setIsOpen(false);
                if (typeof onCompleteRef.current === "function") {
                    // call the callback to notify the popup opener
                    onCompleteRef.current(operationId as string);
                }
            } else {
                const result = await createOperation(
                    resourceId as string,
                    operationData
                );
                setIsOpen(false);
                if (typeof onCompleteRef.current === "function") {
                    // call the callback to notify the popup opener
                    onCompleteRef.current(result.id as string);
                }
            }
        } catch (e) {
            reportError(
                `Failed to ${
                    isCreateForm ? "create" : "update"
                } operation: ${e}`,
                {
                    header: "Error:"
                }
            );
            throw e;
        }
    });

    return (
        <Modal
            className="update-operation-form"
            backdrop="static"
            keyboard={false}
            open={isOpen}
            onClose={onModalClose}
        >
            <Modal.Header>
                <Modal.Title>
                    {isCreateForm ? "Create Operation" : "Update Operation"}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {loadingOperation ? (
                    <Placeholder.Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
                ) : loadingOperationError ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve the operation record:{" "}
                        {`${loadingOperationError}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content={`${
                                    isCreateForm ? "Creating" : "Updating"
                                } operation record...`}
                                vertical
                            />
                        ) : (
                            <>
                                <Form
                                    ref={formRef}
                                    model={model}
                                    className="operation-popup-form"
                                    fluid
                                    onChange={setOperation as any}
                                    onCheck={setFormError}
                                    formValue={operation}
                                >
                                    <Form.ErrorMessage />

                                    <Form.Group controlId="ctrl-uri">
                                        <Form.ControlLabel>
                                            URI:
                                        </Form.ControlLabel>
                                        <Form.Control
                                            name="uri"
                                            placeholder="_/_"
                                        />
                                        <Form.HelpText>
                                            {`Input should be in a directory
                                            format similar to abc/def/ghij`}
                                        </Form.HelpText>
                                    </Form.Group>

                                    <Form.Group controlId="ctrl-name">
                                        <Form.ControlLabel>
                                            Name:
                                        </Form.ControlLabel>
                                        <Form.Control name="name" />
                                    </Form.Group>

                                    <Form.Group controlId="ctrl-description">
                                        <Form.ControlLabel>
                                            Description:
                                        </Form.ControlLabel>
                                        <Form.Control
                                            rows={6}
                                            name="description"
                                            accepter={Textarea}
                                        />
                                    </Form.Group>
                                </Form>
                            </>
                        )}
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button
                    onClick={() => {
                        if (validateForm()) {
                            submitData.execute();
                        }
                    }}
                    appearance="primary"
                    disabled={submitData.loading || !isEmpty(formError)}
                >
                    Save
                </Button>
                <Button onClick={onModalClose} disabled={submitData.loading}>
                    Cancel
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(OperationFormPopUp);
