import { ResourceRecord } from "@magda/typescript-common/dist/authorization-api/model";
import {
    createResource,
    getResourceById,
    updateResource
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
import Loader from "rsuite/esm/Loader";
import Message from "rsuite/esm/Message";
import Modal from "rsuite/esm/Modal";
import Placeholder from "rsuite/esm/Placeholder";
import Form, { FormInstance } from "rsuite/Form";
import Input, { InputProps } from "rsuite/Input";
import Schema from "rsuite/Schema";
import reportError from "../../helpers/reportError";

interface TextareaInputProps extends InputProps {
    rows?: number;
}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaInputProps>(
    (props, ref) => <Input {...props} as="textarea" ref={ref} />
);

type PropsType = {};

type SubmitCompleteHandlerType = (submittedResourceId: string) => void;

export type RefType = {
    open: (resourceId?: string, onComplete?: SubmitCompleteHandlerType) => void;
    close: () => void;
};

const ResourceFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [resourceId, setResourceId] = useState<string>();
    const [resource, setResource] = useState<ResourceRecord>();
    const [formError, setFormError] = useState({});
    // we might want to force reload the resource on open in avoid obsolete data.
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const onCompleteRef = useRef<SubmitCompleteHandlerType>();
    const formRef = useRef<FormInstance>(null);

    const isCreateForm = resourceId ? false : true;

    const model = Schema.Model({
        uri: Schema.Types.StringType()
            .isRequired("This field is required.")
            .pattern(
                /^[a-zA-Z0-9-]+(\/[a-zA-Z0-9-*]+)*$/g,
                "Please enter a valid format (alphanumeric characters plus `*` and `-` with `/` as segment separator)."
            ),
        name: Schema.Types.StringType().isRequired("This field is required."),
        description: Schema.Types.StringType()
    });

    // use useCallback to make handler ref stable
    // not a logic-wise must-have but will be performance-wise better
    const onModalClose = useCallback(() => {
        setResourceId(undefined);
        setIsOpen(false);
    }, []);

    useImperativeHandle(ref, () => ({
        open: (resourceId?: string, onComplete?: SubmitCompleteHandlerType) => {
            onCompleteRef.current = onComplete;
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

    // load resource data to prefill form by id
    const { loading: loadingResource, error: loadingResourceError } = useAsync(
        async (resourceId?: string, dataReloadToken?: string) => {
            if (!resourceId) {
                setResource(undefined);
            } else {
                const resource = await getResourceById(
                    resourceId as string,
                    true
                );
                if (resource) {
                    setResource(resource);
                } else {
                    setResource(undefined);
                }
            }
        },
        [resourceId, dataReloadToken]
    );

    const submitData = useAsyncCallback(async () => {
        try {
            const { id, ...resourceData } = resource as ResourceRecord;
            if (resourceId) {
                await updateResource(resourceId, resourceData);
                setIsOpen(false);
                if (typeof onCompleteRef.current === "function") {
                    // call the callback to notify the popup opener
                    onCompleteRef.current(resourceId as string);
                }
            } else {
                const result = await createResource(resourceData);
                setIsOpen(false);
                if (typeof onCompleteRef.current === "function") {
                    // call the callback to notify the popup opener
                    onCompleteRef.current(result.id as string);
                }
            }
        } catch (ex) {
            reportError(
                `Failed to ${
                    isCreateForm ? "create" : "update"
                } resource: ${ex}`,
                {
                    header: "Error:"
                }
            );
            throw ex;
        }
    });

    return (
        <Modal
            backdrop="static"
            keyboard={false}
            open={isOpen}
            onClose={onModalClose}
        >
            <Modal.Header>
                <Modal.Title>
                    {isCreateForm ? "Create Resource" : "Update Resource"}
                </Modal.Title>
            </Modal.Header>

            <Modal.Body>
                {loadingResource ? (
                    <Placeholder.Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
                ) : loadingResourceError ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve the resource record:{" "}
                        {`${loadingResourceError}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content={`${
                                    isCreateForm ? "Creating" : "Updating"
                                } resource record...`}
                                vertical
                            />
                        ) : (
                            <>
                                <Form
                                    ref={formRef}
                                    model={model}
                                    fluid
                                    onChange={setResource as any}
                                    onCheck={setFormError}
                                    formValue={resource}
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
                                            Name
                                        </Form.ControlLabel>
                                        <Form.Control name="name" />
                                    </Form.Group>

                                    <Form.Group controlId="ctrl-description">
                                        <Form.ControlLabel>
                                            Description
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

export default forwardRef<RefType, PropsType>(ResourceFormPopUp);
