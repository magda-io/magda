import React, {
    forwardRef,
    ForwardRefRenderFunction,
    useImperativeHandle,
    useMemo,
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
import { FooterLinkItem, writeContent } from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import useContentFormState from "./useContentFormState";
import LinkFormFields, { OpenLinkInFields } from "./LinkFormFields";
import {
    footerLinkToFormValue,
    formValueToFooterLink,
    FooterLinkFormValue
} from "./contentUtils";
import { FooterSize, footerCategoryLinksIdPrefix } from "./footerUtils";

export type RefType = {
    open: (
        id: string | undefined,
        options: { nextOrder: number; onComplete?: (id: string) => void }
    ) => void;
};

type PropsType = {
    size: FooterSize;
    categoryKey: string;
};

const baseModelFields = {
    order: Schema.Types.NumberType("Please enter a number.").isRequired(
        "Order is required."
    ),
    label: Schema.Types.StringType().isRequired("Label is required."),
    href: Schema.Types.StringType()
        .isRequired("URL is required.")
        .pattern(/^\S+$/, "URL can't contain spaces.")
};

const defaultModel = Schema.Model(baseModelFields);

const customTargetModel = Schema.Model({
    ...baseModelFields,
    target: Schema.Types.StringType().isRequired("Target is required.")
});

const FooterLinkFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    { size, categoryKey },
    ref
) => {
    const formRef = useRef<FormInstance>(null);
    const state = useContentFormState<FooterLinkItem, FooterLinkFormValue>(
        footerLinkToFormValue,
        footerLinkToFormValue()
    );
    const { formValue, setFormValue, isCreateForm } = state;
    const model = useMemo(
        () =>
            formValue.openIn === "custom" ? customTargetModel : defaultModel,
        [formValue.openIn]
    );

    useImperativeHandle(ref, () => ({
        open: (id, { nextOrder, onComplete }) =>
            state.open(id, {
                initialValue: { ...footerLinkToFormValue(), order: nextOrder },
                onComplete
            })
    }));

    const submitData = useAsyncCallback(async () => {
        if (!formRef.current?.check()) {
            return;
        }
        const id = state.contentId
            ? state.contentId
            : `${footerCategoryLinksIdPrefix(size, categoryKey)}${uuidv4()}`;
        try {
            await writeContent(id, formValueToFooterLink(formValue));
            state.complete(id);
        } catch (e) {
            reportError(
                `Failed to ${
                    isCreateForm ? "create" : "update"
                } the footer link: ${e}`
            );
        }
    });

    return (
        <Modal
            className="content-settings-form-popup"
            backdrop="static"
            keyboard={false}
            open={state.isOpen}
            size="md"
            overflow={true}
            onClose={state.close}
        >
            <Modal.Header>
                <Modal.Title>
                    {isCreateForm ? "Create Footer Link" : "Update Footer Link"}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {state.loading ? (
                    <Placeholder.Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
                ) : state.loadError ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve the footer link:{" "}
                        {`${state.loadError}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content="Saving footer link..."
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
                                setFormValue(v as FooterLinkFormValue)
                            }
                            onCheck={state.setFormError}
                        >
                            <Form.Group controlId="ctrl-order">
                                <Form.ControlLabel>Order</Form.ControlLabel>
                                <Form.Control name="order" type="number" />
                                <Form.HelpText>
                                    Links are shown in ascending order.
                                </Form.HelpText>
                            </Form.Group>
                            <LinkFormFields
                                value={formValue}
                                onChange={setFormValue}
                                hrefHelpText={
                                    <>
                                        For a page of this site, leave out the
                                        protocol & host and start from the path,
                                        e.g. /page/about. A mailto: link or a
                                        full URL also works.
                                    </>
                                }
                            >
                                <OpenLinkInFields
                                    value={formValue}
                                    onChange={setFormValue}
                                />
                            </LinkFormFields>
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

export default forwardRef<RefType, PropsType>(FooterLinkFormPopUp);
