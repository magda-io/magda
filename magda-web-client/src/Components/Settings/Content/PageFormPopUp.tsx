import React, {
    forwardRef,
    ForwardRefRenderFunction,
    useImperativeHandle,
    useMemo,
    useRef,
    useState
} from "react";
import { useAsyncCallback } from "react-async-hook";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import Form, { FormInstance } from "rsuite/Form";
import Schema from "rsuite/Schema";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Placeholder from "rsuite/Placeholder";
import { PageItem, queryContent, writeContent } from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import useContentFormState from "./useContentFormState";
import MarkdownEditor from "./MarkdownEditor";
import {
    formValueToPage,
    pageIdToSlug,
    PAGE_ID_PREFIX,
    validatePageSlug
} from "./contentUtils";

type FormValueType = {
    title: string;
    slug: string;
    content: string;
};

type PropsType = object;

export type RefType = {
    open: (
        id: string | undefined,
        options: { existingSlugs: string[]; onComplete?: (id: string) => void }
    ) => void;
};

const emptyFormValue = (): FormValueType => ({
    title: "",
    slug: "",
    content: ""
});

const toFormValue = (page: PageItem): FormValueType => ({
    title: page?.title ? page.title : "",
    slug: "",
    content: page?.content ? page.content : ""
});

const PageFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const formRef = useRef<FormInstance>(null);
    const [existingSlugs, setExistingSlugs] = useState<string[]>([]);
    const state = useContentFormState<PageItem, FormValueType>(
        toFormValue,
        emptyFormValue()
    );
    const { formValue, setFormValue, isCreateForm } = state;
    const slug = isCreateForm
        ? formValue.slug.trim()
        : pageIdToSlug(state.contentId as string);

    useImperativeHandle(ref, () => ({
        open: (id, { existingSlugs, onComplete }) => {
            setExistingSlugs(existingSlugs);
            state.open(id, { initialValue: emptyFormValue(), onComplete });
        }
    }));

    const model = useMemo(
        () =>
            Schema.Model({
                title: Schema.Types.StringType().isRequired(
                    "Title is required."
                ),
                ...(isCreateForm
                    ? {
                          slug: Schema.Types.StringType()
                              .isRequired("Page URL slug is required.")
                              .addRule((value) => {
                                  const error = validatePageSlug(
                                      value,
                                      existingSlugs
                                  );
                                  return error
                                      ? { hasError: true, errorMessage: error }
                                      : true;
                              }, "Invalid page URL slug.")
                      }
                    : {})
            }),
        [isCreateForm, existingSlugs]
    );

    const submitData = useAsyncCallback(async () => {
        if (!formRef.current?.check()) {
            return;
        }
        const id = isCreateForm
            ? `${PAGE_ID_PREFIX}${slug}`
            : (state.contentId as string);
        try {
            if (isCreateForm) {
                // the page list might be outdated
                const existing = await queryContent(id);
                if (existing.length) {
                    reportError(
                        `A page with URL slug "${slug}" already exists.`
                    );
                    return;
                }
            }
            await writeContent(
                id,
                formValueToPage(formValue.title, formValue.content)
            );
            state.complete(id);
        } catch (e) {
            reportError(
                `Failed to ${isCreateForm ? "create" : "update"} the page: ${e}`
            );
        }
    });

    return (
        <Modal
            className="content-settings-form-popup page-form-popup"
            backdrop="static"
            keyboard={false}
            open={state.isOpen}
            size="lg"
            overflow={true}
            onClose={state.close}
        >
            <Modal.Header>
                <Modal.Title>
                    {isCreateForm ? "Create Page" : "Update Page"}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {state.loading ? (
                    <Placeholder.Paragraph rows={10}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
                ) : state.loadError ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve the page: {`${state.loadError}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content="Saving page..."
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
                                setFormValue({
                                    ...formValue,
                                    ...(v as Partial<FormValueType>)
                                })
                            }
                            onCheck={state.setFormError}
                        >
                            <Form.Group controlId="ctrl-title">
                                <Form.ControlLabel>Title</Form.ControlLabel>
                                <Form.Control name="title" />
                            </Form.Group>
                            {isCreateForm ? (
                                <Form.Group controlId="ctrl-slug">
                                    <Form.ControlLabel>
                                        Page URL slug
                                    </Form.ControlLabel>
                                    <Form.Control
                                        name="slug"
                                        placeholder="e.g. about-us"
                                    />
                                    <Form.HelpText>
                                        Lowercase letters, numbers, hyphens and
                                        underscores. The page will be available
                                        at <b>/page/{slug ? slug : "<slug>"}</b>
                                        . The slug can't be changed later.
                                    </Form.HelpText>
                                </Form.Group>
                            ) : (
                                <Form.Group controlId="ctrl-slug">
                                    <Form.ControlLabel>
                                        Page URL
                                    </Form.ControlLabel>
                                    <div className="page-url-text">
                                        /page/{slug}
                                    </div>
                                </Form.Group>
                            )}
                            <Form.Group controlId="ctrl-content">
                                <Form.ControlLabel>
                                    Content (markdown)
                                </Form.ControlLabel>
                                <MarkdownEditor
                                    value={formValue.content}
                                    onChange={(content) =>
                                        setFormValue((v) => ({ ...v, content }))
                                    }
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

export default forwardRef<RefType, PropsType>(PageFormPopUp);
