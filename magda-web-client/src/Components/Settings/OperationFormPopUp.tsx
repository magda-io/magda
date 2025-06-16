import { OperationRecord } from "@magda/typescript-common/dist/authorization-api/model";
import {
    createOperation,
    getResOperationsById,
    getResourceById,
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
import Modal from "rsuite/Modal";
import Placeholder from "rsuite/Placeholder";
import Schema from "rsuite/Schema";
import reportError from "../../helpers/reportError";
import InputGroup from "rsuite/InputGroup";

interface TextareaInputProps extends InputProps {
    rows?: number;
}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaInputProps>(
    (props, ref) => <Input {...props} as="textarea" ref={ref} />
);

interface OpUriInputProps extends InputProps {
    resourceUri?: string;
    loading?: boolean;
}

const OpUriInput = React.forwardRef((props: OpUriInputProps, ref) => {
    const { resourceUri, loading, ...restProps } = props;
    return (
        <InputGroup style={{ width: "auto" }}>
            <InputGroup.Addon>
                {loading ? <Loader /> : resourceUri ? resourceUri + "/" : ""}
            </InputGroup.Addon>
            {loading ? null : <Input {...restProps} ref={ref as any} />}
        </InputGroup>
    );
});

type PropsType = {};

type UpdateCompleteHandlerType = (submittedOperationId: string) => void;

export type RefType = {
    open: (
        resourceId: string,
        operationId?: string,
        onComplete?: UpdateCompleteHandlerType
    ) => void;
    close: () => void;
};

interface OperationRecordUIType extends OperationRecord {
    localUri?: string;
    localUriHasManualInput?: boolean;
    resourceUri?: string;
}

const OperationFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [operationId, setOperationId] = useState<string>();
    const [operation, setOperation] = useState<Partial<OperationRecordUIType>>(
        {}
    );
    const [resourceId, setResourceId] = useState<string>();
    const [formError, setFormError] = useState({});
    // we might want to force reload the operation on open in avoid obsolete data.
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const onCompleteRef = useRef<UpdateCompleteHandlerType>();
    const formRef = useRef<FormInstance>(null);

    const isCreateForm = operationId ? false : true;

    const model = Schema.Model({
        uri: Schema.Types.StringType(),
        localUri: Schema.Types.StringType().pattern(
            /^(?:[a-zA-Z0-9_-]+|\*{1,2})(?:\/(?:[a-zA-Z0-9_-]+|\*{1,2}))*$/,
            "Please enter a valid format (alphanumeric characters plus `_` and `-` with `/` as segment separator and `*` or `**` as wildcard segment name)."
        ),
        hasPopulateLocalUri: Schema.Types.BooleanType(),
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
            resourceId: string,
            operationId?: string,
            onComplete?: UpdateCompleteHandlerType
        ) => {
            onCompleteRef.current = onComplete;
            operationId = operationId?.trim();
            resourceId = resourceId?.trim();
            setOperation({});
            setOperationId(operationId);
            setResourceId(resourceId);
            setDataReloadToken(`${Math.random()}`);
            setIsOpen(true);
        },
        close: onModalClose
    }));

    const validateForm = (): boolean => {
        if (!formRef?.current?.check?.()) {
            return false;
        }
        return true;
    };

    // load resource record data to prefill resourceUri
    const { loading: loadingResource } = useAsync(
        async (resourceId?: string, dataReloadToken?: string) => {
            try {
                if (!resourceId) {
                    return;
                }
                const resource = await getResourceById(
                    resourceId as string,
                    true
                );
                if (resource) {
                    setOperation((state) => {
                        const newState = {
                            ...state,
                            resourceUri: resource.uri
                        };

                        if (
                            !newState?.localUriHasManualInput &&
                            newState?.resourceUri &&
                            newState?.uri
                        ) {
                            newState.localUri = newState.uri.replace(
                                newState.resourceUri + "/",
                                ""
                            );
                        }
                        return newState;
                    });
                }
            } catch (e) {
                reportError(
                    `Failed to load resource data by ID: ${resourceId} Error:${e}`
                );
            }
        },
        [resourceId, operationId, dataReloadToken]
    );

    // load required data to prefill the form by id
    const { loading: loadingOperation } = useAsync(
        async (operationId?: string, dataReloadToken?: string) => {
            try {
                if (!operationId) {
                    return;
                }
                const operationRecord = await getResOperationsById<
                    OperationRecordUIType
                >(operationId as string, true);
                if (!operationRecord) {
                    return;
                }
                setOperation((state) => {
                    const newState = {
                        ...state,
                        ...operationRecord
                    };
                    if (
                        !newState?.localUriHasManualInput &&
                        newState?.resourceUri &&
                        newState?.uri
                    ) {
                        newState.localUri = newState.uri.replace(
                            newState.resourceUri + "/",
                            ""
                        );
                    }
                    return newState;
                });
            } catch (e) {
                reportError(
                    `Failed to load operation data with ID ${operationId}: ${e}`
                );
            }
        },
        [operationId, dataReloadToken]
    );

    const submitData = useAsyncCallback(async () => {
        try {
            if (!operation?.resourceUri) {
                throw new Error("Invalid empty resource uri!");
            }
            const {
                id,
                resource_id,
                localUri,
                localUriHasManualInput,
                resourceUri,
                ...operationData
            } = operation as OperationRecordUIType;

            if (!localUri) {
                throw new Error("Invalid empty operation local uri!");
            }

            operationData.uri = resourceUri + "/" + localUri;

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
            <Modal.Body style={{ minHeight: "100px" }}>
                {loadingOperation ? (
                    <Placeholder.Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
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
                                            accepter={OpUriInput}
                                            resourceUri={operation?.resourceUri}
                                            loading={
                                                loadingResource ||
                                                loadingOperation
                                            }
                                            name="localUri"
                                            placeholder="_/_"
                                            onChange={(v) => {
                                                if (v?.trim?.()) {
                                                    setOperation((state) => ({
                                                        ...state,
                                                        localUriHasManualInput: true
                                                    }));
                                                }
                                            }}
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
