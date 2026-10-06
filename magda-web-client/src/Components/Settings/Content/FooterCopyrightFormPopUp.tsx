import React, {
    forwardRef,
    ForwardRefRenderFunction,
    useImperativeHandle,
    useRef,
    useState
} from "react";
import { useAsyncCallback } from "react-async-hook";
import { v4 as uuidv4 } from "uuid";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import Form, { FormInstance } from "rsuite/Form";
import Schema from "rsuite/Schema";
import Input, { InputProps } from "rsuite/Input";
import Radio from "rsuite/Radio";
import RadioGroup from "rsuite/RadioGroup";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Placeholder from "rsuite/Placeholder";
import { MdImage } from "react-icons/md";
import { FooterCopyrightItem, writeContent } from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import useContentFormState from "./useContentFormState";
import {
    emptyFooterCopyrightFormValue,
    footerCopyrightToFormValue,
    formValueToFooterCopyright,
    FooterCopyrightFormValue
} from "./contentUtils";
import { readFileAsDataUrl, SUPPORTED_IMAGE_TYPES } from "./imageUtils";
import FooterCopyrightPreview from "./FooterCopyrightPreview";

type LogoSourceType = "upload" | "url";

type PropsType = object;

export type RefType = {
    open: (
        id: string | undefined,
        options: { nextOrder: number; onComplete?: (id: string) => void }
    ) => void;
};

interface TextareaInputProps extends InputProps {
    rows?: number;
}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaInputProps>(
    (props, ref) => <Input {...props} as="textarea" ref={ref} />
);

// the logo is embedded in the site content loaded by every page
const LARGE_LOGO_SIZE = 100 * 1024;

const model = Schema.Model({
    order: Schema.Types.NumberType("Please enter a number.").isRequired(
        "Order is required."
    ),
    href: Schema.Types.StringType()
        .isRequired("Logo link URL is required.")
        .pattern(/^\S+$/, "URL can't contain spaces."),
    htmlContent: Schema.Types.StringType().isRequired(
        "HTML content is required."
    )
});

const isDataUrl = (src: string) => /^data:/i.test(src);

const FooterCopyrightFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const formRef = useRef<FormInstance>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [logoSourceType, setLogoSourceType] = useState<LogoSourceType>(
        "upload"
    );
    // keep the uploaded image & the URL separately, so switching between them doesn't lose either
    const [uploadedLogo, setUploadedLogo] = useState<string>("");
    const [uploadedLogoSize, setUploadedLogoSize] = useState<number>(0);
    const [logoError, setLogoError] = useState<string>("");

    const toFormValue = (item: FooterCopyrightItem) => {
        const value = footerCopyrightToFormValue(item);
        if (isDataUrl(value.logoSrc)) {
            setLogoSourceType("upload");
            setUploadedLogo(value.logoSrc);
            return { ...value, logoSrc: "" };
        } else {
            setLogoSourceType(value.logoSrc ? "url" : "upload");
            setUploadedLogo("");
            return value;
        }
    };

    const state = useContentFormState<
        FooterCopyrightItem,
        FooterCopyrightFormValue
    >(toFormValue, emptyFooterCopyrightFormValue());
    const { formValue, setFormValue, isCreateForm } = state;

    useImperativeHandle(ref, () => ({
        open: (id, { nextOrder, onComplete }) => {
            setLogoSourceType("upload");
            setUploadedLogo("");
            setUploadedLogoSize(0);
            setLogoError("");
            state.open(id, {
                initialValue: emptyFooterCopyrightFormValue(nextOrder),
                onComplete
            });
        }
    }));

    const logoSrc =
        logoSourceType === "upload" ? uploadedLogo : formValue.logoSrc.trim();

    const onSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) {
            return;
        }
        if (SUPPORTED_IMAGE_TYPES.indexOf(file.type) === -1) {
            setLogoError(
                "Please select a PNG, GIF, JPEG, WebP or SVG image file."
            );
            return;
        }
        try {
            setUploadedLogo(await readFileAsDataUrl(file));
            setUploadedLogoSize(file.size);
            setLogoError("");
        } catch (e) {
            setLogoError(`Failed to read the image file: ${e}`);
        }
    };

    const submitData = useAsyncCallback(async () => {
        const isFormValid = !!formRef.current?.check();
        if (!logoSrc) {
            setLogoError(
                logoSourceType === "upload"
                    ? "Please select a logo image."
                    : "Please enter the logo image URL."
            );
            return;
        }
        if (/\s/.test(logoSrc)) {
            setLogoError("Logo image URL can't contain spaces.");
            return;
        }
        setLogoError("");
        if (!isFormValid) {
            return;
        }
        const id = state.contentId
            ? state.contentId
            : `footer/copyright/${uuidv4()}`;
        try {
            await writeContent(
                id,
                formValueToFooterCopyright({ ...formValue, logoSrc })
            );
            state.complete(id);
        } catch (e) {
            reportError(
                `Failed to ${
                    isCreateForm ? "create" : "update"
                } the footer copyright item: ${e}`
            );
        }
    });

    return (
        <Modal
            className="content-settings-form-popup footer-copyright-form-popup"
            backdrop="static"
            keyboard={false}
            open={state.isOpen}
            size="lg"
            overflow={true}
            onClose={state.close}
        >
            <Modal.Header>
                <Modal.Title>
                    {isCreateForm
                        ? "Create Footer Copyright Item"
                        : "Update Footer Copyright Item"}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {state.loading ? (
                    <Placeholder.Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
                ) : state.loadError ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve the footer copyright item:{" "}
                        {`${state.loadError}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content="Saving footer copyright item..."
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
                                setFormValue(v as FooterCopyrightFormValue)
                            }
                            onCheck={state.setFormError}
                        >
                            <Form.Group controlId="ctrl-order">
                                <Form.ControlLabel>Order</Form.ControlLabel>
                                <Form.Control name="order" type="number" />
                                <Form.HelpText>
                                    Items are shown in ascending order.
                                </Form.HelpText>
                            </Form.Group>
                            <Form.Group controlId="ctrl-logo">
                                <Form.ControlLabel>Logo</Form.ControlLabel>
                                <RadioGroup
                                    inline
                                    name="logoSourceType"
                                    value={logoSourceType}
                                    onChange={(v) => {
                                        setLogoError("");
                                        setLogoSourceType(v as LogoSourceType);
                                    }}
                                >
                                    <Radio value="upload">
                                        Upload an image
                                    </Radio>
                                    <Radio value="url">Image URL</Radio>
                                </RadioGroup>
                                {logoSourceType === "upload" ? (
                                    <div className="logo-upload-container">
                                        <div className="logo-thumbnail">
                                            {uploadedLogo ? (
                                                <img
                                                    src={uploadedLogo}
                                                    alt="Selected logo"
                                                />
                                            ) : (
                                                <MdImage className="img-placeholder" />
                                            )}
                                        </div>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept={SUPPORTED_IMAGE_TYPES.join(
                                                ","
                                            )}
                                            style={{ display: "none" }}
                                            onChange={onSelectFile}
                                        />
                                        <Button
                                            onClick={() =>
                                                fileInputRef.current?.click()
                                            }
                                        >
                                            {uploadedLogo
                                                ? "Change image..."
                                                : "Select image..."}
                                        </Button>
                                    </div>
                                ) : (
                                    <Form.Control
                                        name="logoSrc"
                                        placeholder="e.g. /assets/logo.png or https://example.com/logo.png"
                                    />
                                )}
                                {logoError ? (
                                    <div className="logo-error" role="alert">
                                        {logoError}
                                    </div>
                                ) : null}
                                <Form.HelpText>
                                    {logoSourceType === "upload"
                                        ? "The uploaded image is saved within the footer content, so please keep it small."
                                        : "A URL or site path of the logo image."}
                                    {logoSourceType === "upload" &&
                                    uploadedLogoSize > LARGE_LOGO_SIZE
                                        ? ` The selected image is ${Math.round(
                                              uploadedLogoSize / 1024
                                          )}KB and will be loaded by every page.`
                                        : null}
                                </Form.HelpText>
                            </Form.Group>
                            <Form.Group controlId="ctrl-href">
                                <Form.ControlLabel>
                                    Logo link URL
                                </Form.ControlLabel>
                                <Form.Control
                                    name="href"
                                    placeholder="e.g. https://example.com"
                                />
                                <Form.HelpText>
                                    Where the logo links to (opens in a new
                                    window). For a page of this site, enter the
                                    path only, e.g. /page/about.
                                </Form.HelpText>
                            </Form.Group>
                            <Form.Group controlId="ctrl-logoAlt">
                                <Form.ControlLabel>
                                    Logo alternative text
                                </Form.ControlLabel>
                                <Form.Control
                                    name="logoAlt"
                                    placeholder="Optional: a text description of the logo image"
                                />
                            </Form.Group>
                            <Form.Group controlId="ctrl-logoClassName">
                                <Form.ControlLabel>
                                    Logo CSS class name
                                </Form.ControlLabel>
                                <Form.Control
                                    name="logoClassName"
                                    placeholder="Optional: an extra CSS class of the logo"
                                />
                            </Form.Group>
                            <Form.Group controlId="ctrl-htmlContent">
                                <Form.ControlLabel>
                                    HTML content
                                </Form.ControlLabel>
                                <Form.Control
                                    rows={5}
                                    name="htmlContent"
                                    accepter={Textarea}
                                />
                                <Form.HelpText>
                                    The HTML is shown in the site footer as is.
                                </Form.HelpText>
                            </Form.Group>
                        </Form>
                        <div className="footer-copyright-preview-container">
                            <div className="preview-label">Preview</div>
                            <FooterCopyrightPreview
                                item={formValueToFooterCopyright({
                                    ...formValue,
                                    logoSrc
                                })}
                            />
                        </div>
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

export default forwardRef<RefType, PropsType>(FooterCopyrightFormPopUp);
