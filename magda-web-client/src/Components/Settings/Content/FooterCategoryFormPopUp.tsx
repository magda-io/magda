import React, {
    forwardRef,
    ForwardRefRenderFunction,
    useImperativeHandle,
    useRef
} from "react";
import { useAsyncCallback } from "react-async-hook";
import { v4 as uuidv4 } from "uuid";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import Form, { FormInstance } from "rsuite/Form";
import Schema from "rsuite/Schema";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Placeholder from "rsuite/Placeholder";
import { FooterCategoryItem, writeContent } from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import useContentFormState from "./useContentFormState";
import { toOrderNumber } from "./contentUtils";
import { FooterSize, footerSizeLabel } from "./footerUtils";

type FormValueType = {
    order: number | string;
    label: string;
};

export type RefType = {
    open: (
        id: string | undefined,
        options: { nextOrder: number; onComplete?: (id: string) => void }
    ) => void;
};

type PropsType = {
    size: FooterSize;
};

const model = Schema.Model({
    order: Schema.Types.NumberType("Please enter a number.").isRequired(
        "Order is required."
    ),
    label: Schema.Types.StringType().isRequired("Label is required.")
});

const toFormValue = (item: FooterCategoryItem): FormValueType => ({
    order: typeof item?.order === "number" ? item.order : 1,
    label: item?.label ? item.label : ""
});

const FooterCategoryFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    { size },
    ref
) => {
    const formRef = useRef<FormInstance>(null);
    const state = useContentFormState<FooterCategoryItem, FormValueType>(
        toFormValue,
        { order: 1, label: "" }
    );
    const { formValue, isCreateForm } = state;
    const sizeLabel = footerSizeLabel(size).toLowerCase();

    useImperativeHandle(ref, () => ({
        open: (id, { nextOrder, onComplete }) =>
            state.open(id, {
                initialValue: { order: nextOrder, label: "" },
                onComplete
            })
    }));

    const submitData = useAsyncCallback(async () => {
        if (!formRef.current?.check()) {
            return;
        }
        const id = state.contentId
            ? state.contentId
            : `footer/navigation/${size}/category/${uuidv4()}`;
        try {
            const data: FooterCategoryItem = {
                order: toOrderNumber(formValue.order),
                label: formValue.label.trim()
            };
            await writeContent(id, data);
            state.complete(id);
        } catch (e) {
            reportError(
                `Failed to ${
                    isCreateForm ? "create" : "update"
                } the ${sizeLabel} footer category: ${e}`
            );
        }
    });

    return (
        <Modal
            className="content-settings-form-popup"
            backdrop="static"
            keyboard={false}
            open={state.isOpen}
            size="sm"
            overflow={true}
            onClose={state.close}
        >
            <Modal.Header>
                <Modal.Title>
                    {isCreateForm ? "Create" : "Update"} {sizeLabel} footer
                    category
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {state.loading ? (
                    <Placeholder.Paragraph rows={4}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
                ) : state.loadError ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve the footer category:{" "}
                        {`${state.loadError}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content="Saving footer category..."
                                vertical
                            />
                        ) : null}
                        <Form
                            ref={formRef}
                            model={model}
                            fluid
                            disabled={submitData.loading}
                            formValue={formValue}
                            onChange={(v) =>
                                state.setFormValue(v as FormValueType)
                            }
                            onCheck={state.setFormError}
                        >
                            <Form.Group controlId="ctrl-order">
                                <Form.ControlLabel>Order</Form.ControlLabel>
                                <Form.Control name="order" type="number" />
                                <Form.HelpText>
                                    Categories are shown in ascending order.
                                </Form.HelpText>
                            </Form.Group>
                            <Form.Group controlId="ctrl-label">
                                <Form.ControlLabel>Label</Form.ControlLabel>
                                <Form.Control name="label" />
                            </Form.Group>
                        </Form>
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button
                    appearance="primary"
                    onClick={submitData.execute}
                    disabled={
                        state.loading || !!state.loadError || submitData.loading
                    }
                >
                    {isCreateForm ? "Create" : "Update"}
                </Button>
                <Button onClick={state.close} disabled={submitData.loading}>
                    Cancel
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(FooterCategoryFormPopUp);
