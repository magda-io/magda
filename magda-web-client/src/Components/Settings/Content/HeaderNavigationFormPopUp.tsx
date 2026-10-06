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
import Radio from "rsuite/Radio";
import RadioGroup from "rsuite/RadioGroup";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Placeholder from "rsuite/Placeholder";
import { HeaderNavigationItem, writeContent } from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import useContentFormState from "./useContentFormState";
import LinkFormFields from "./LinkFormFields";
import {
    emptyHeaderNavigationFormValue,
    formValueToHeaderNavigation,
    headerNavigationToFormValue,
    HeaderItemType,
    HeaderNavigationFormValue,
    HEADER_ITEM_TYPE_AUTH,
    HEADER_ITEM_TYPE_LINK,
    isValidHeaderHref
} from "./contentUtils";

type PropsType = object;

export type RefType = {
    open: (
        id: string | undefined,
        options: {
            nextOrder: number;
            // id of the existing authentication menu item, if any
            authItemId?: string;
            onComplete?: (id: string) => void;
        }
    ) => void;
};

const orderRule = Schema.Types.NumberType("Please enter a number.").isRequired(
    "Order is required."
);

const authItemModel = Schema.Model({ order: orderRule });

const linkItemModel = Schema.Model({
    order: orderRule,
    label: Schema.Types.StringType().isRequired("Label is required."),
    href: Schema.Types.StringType()
        .isRequired("URL is required.")
        .addRule(
            (value) => isValidHeaderHref(value),
            "Please enter a site path that starts with '/' (e.g. /page/about), a full URL (e.g. https://example.com) or a mailto: link."
        )
});

const HeaderNavigationFormPopUp: ForwardRefRenderFunction<
    RefType,
    PropsType
> = (props, ref) => {
    const formRef = useRef<FormInstance>(null);
    const authItemIdRef = useRef<string>();
    const state = useContentFormState<
        HeaderNavigationItem,
        HeaderNavigationFormValue
    >(headerNavigationToFormValue, emptyHeaderNavigationFormValue());
    const { formValue, setFormValue, isCreateForm } = state;
    const isAuthItem = formValue.itemType === HEADER_ITEM_TYPE_AUTH;
    const hasOtherAuthItem =
        !!authItemIdRef.current && authItemIdRef.current !== state.contentId;

    useImperativeHandle(ref, () => ({
        open: (id, { nextOrder, authItemId, onComplete }) => {
            authItemIdRef.current = authItemId;
            state.open(id, {
                initialValue: emptyHeaderNavigationFormValue(nextOrder),
                onComplete
            });
        }
    }));

    const model = useMemo(() => (isAuthItem ? authItemModel : linkItemModel), [
        isAuthItem
    ]);

    const submitData = useAsyncCallback(async () => {
        if (!formRef.current?.check()) {
            return;
        }
        if (isAuthItem && hasOtherAuthItem) {
            reportError(
                "The header can only have one account menu item. Please edit the existing one instead."
            );
            return;
        }
        const id = state.contentId
            ? state.contentId
            : `header/navigation/${uuidv4()}`;
        try {
            await writeContent(id, formValueToHeaderNavigation(formValue));
            state.complete(id);
        } catch (e) {
            reportError(
                `Failed to ${
                    isCreateForm ? "create" : "update"
                } the header menu item: ${e}`
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
                    {isCreateForm
                        ? "Create Header Menu Item"
                        : "Update Header Menu Item"}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {state.loading ? (
                    <Placeholder.Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
                ) : state.loadError ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve the header menu item:{" "}
                        {`${state.loadError}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content={`${
                                    isCreateForm ? "Creating" : "Updating"
                                } header menu item...`}
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
                                setFormValue(v as HeaderNavigationFormValue)
                            }
                            onCheck={state.setFormError}
                        >
                            <Form.Group controlId="ctrl-item-type">
                                <Form.ControlLabel>Item type</Form.ControlLabel>
                                <RadioGroup
                                    inline
                                    name="itemType"
                                    value={formValue.itemType}
                                    onChange={(itemType) => {
                                        state.setFormError({});
                                        setFormValue({
                                            ...formValue,
                                            itemType: itemType as HeaderItemType
                                        });
                                    }}
                                >
                                    <Radio value={HEADER_ITEM_TYPE_LINK}>
                                        Link
                                    </Radio>
                                    <Radio
                                        value={HEADER_ITEM_TYPE_AUTH}
                                        disabled={hasOtherAuthItem}
                                    >
                                        Account menu (sign in / account)
                                    </Radio>
                                </RadioGroup>
                                <Form.HelpText>
                                    {hasOtherAuthItem
                                        ? "The header already has an account menu item. Only one is allowed."
                                        : "The account menu shows a sign in link, or the account menu when the user has signed in."}
                                </Form.HelpText>
                            </Form.Group>
                            <Form.Group controlId="ctrl-order">
                                <Form.ControlLabel>Order</Form.ControlLabel>
                                <Form.Control name="order" type="number" />
                                <Form.HelpText>
                                    Items are shown in ascending order.
                                </Form.HelpText>
                            </Form.Group>
                            {isAuthItem ? null : (
                                <LinkFormFields
                                    value={formValue}
                                    onChange={setFormValue}
                                    hrefHelpText="For a page of this site, enter the path only, e.g. /page/about. Otherwise, enter a full URL."
                                />
                            )}
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

export default forwardRef<RefType, PropsType>(HeaderNavigationFormPopUp);
