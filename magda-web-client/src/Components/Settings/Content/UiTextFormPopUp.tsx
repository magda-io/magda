import React, {
    forwardRef,
    ForwardRefRenderFunction,
    useImperativeHandle,
    useState
} from "react";
import { useAsyncCallback } from "react-async-hook";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import Form from "rsuite/Form";
import Textarea from "rsuite/Textarea";
import Loader from "rsuite/Loader";
import { writeContent } from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import { UiTextRecord, UI_TEXT_LANGUAGE_LABEL } from "./uiTextUtils";

type PropsType = object;

export type RefType = {
    open: (item: UiTextRecord, onComplete?: () => void) => void;
};

type FormValueType = { value: string };

const UiTextFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [item, setItem] = useState<UiTextRecord>();
    const [formValue, setFormValue] = useState<FormValueType>({ value: "" });
    const [onComplete, setOnComplete] = useState<() => void>();

    useImperativeHandle(ref, () => ({
        open: (item, onComplete) => {
            setItem(item);
            setFormValue({
                value:
                    typeof item.value === "string"
                        ? item.value
                        : typeof item.defaultValue === "string"
                        ? item.defaultValue
                        : ""
            });
            // wrap the callback, as a function passed to a state setter is called
            setOnComplete(() => onComplete);
            setIsOpen(true);
        }
    }));

    const close = () => setIsOpen(false);

    const submitData = useAsyncCallback(async () => {
        if (!item) {
            return;
        }
        try {
            // an empty text is valid: e.g. no prefix / suffix text
            await writeContent(item.id, formValue.value, "text/plain");
            setIsOpen(false);
            if (typeof onComplete === "function") {
                onComplete();
            }
        } catch (e) {
            reportError(`Failed to save the text: ${e}`);
        }
    });

    const hasDefault = typeof item?.defaultValue === "string";

    return (
        <Modal
            className="content-settings-form-popup ui-text-form-popup"
            backdrop="static"
            keyboard={false}
            open={isOpen}
            size="md"
            onClose={close}
        >
            <Modal.Header>
                <Modal.Title>Update UI Text</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {submitData.loading ? (
                    <Loader backdrop content="Saving text..." vertical />
                ) : null}
                <dl className="ui-text-details">
                    <dt>Section / key</dt>
                    <dd>
                        <code>
                            {item?.namespace} / {item?.key}
                        </code>
                    </dd>
                    {item?.description ? (
                        <>
                            <dt>Used for</dt>
                            <dd>{item.description}</dd>
                        </>
                    ) : null}
                    <dt>Language</dt>
                    <dd>{UI_TEXT_LANGUAGE_LABEL}</dd>
                    {hasDefault ? (
                        <>
                            <dt>Default text</dt>
                            <dd>
                                {item?.defaultValue ? (
                                    item.defaultValue
                                ) : (
                                    <i>(empty)</i>
                                )}
                            </dd>
                        </>
                    ) : null}
                </dl>
                <Form
                    fluid
                    disabled={submitData.loading}
                    formValue={formValue}
                    onChange={(v) => setFormValue(v as FormValueType)}
                >
                    <Form.Group controlId="ctrl-ui-text">
                        <Form.ControlLabel>Text</Form.ControlLabel>
                        <Form.Control
                            name="value"
                            accepter={Textarea}
                            rows={4}
                        />
                        <Form.HelpText>
                            Plain text. It can be empty.
                        </Form.HelpText>
                    </Form.Group>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                {hasDefault ? (
                    <Button
                        appearance="subtle"
                        className="ui-text-use-default"
                        disabled={
                            submitData.loading ||
                            formValue.value === item?.defaultValue
                        }
                        onClick={() =>
                            setFormValue({
                                value: item?.defaultValue
                                    ? item.defaultValue
                                    : ""
                            })
                        }
                    >
                        Use default text
                    </Button>
                ) : null}
                <Button
                    appearance="primary"
                    onClick={submitData.execute}
                    disabled={submitData.loading}
                >
                    Save
                </Button>
                <Button onClick={close} disabled={submitData.loading}>
                    Cancel
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(UiTextFormPopUp);
