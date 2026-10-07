import React, { FunctionComponent, useState } from "react";
import { useAsync, useAsyncCallback } from "react-async-hook";
import { useDispatch } from "react-redux";
import Form from "rsuite/Form";
import Button from "rsuite/Button";
import ButtonToolbar from "rsuite/ButtonToolbar";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Placeholder from "rsuite/Placeholder";
import { MdComputer, MdSave, MdSmartphone } from "react-icons/md";
import { fetchContent } from "actions/contentActions";
import { queryContent, writeContent } from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import { TAGLINE_DESKTOP_ID, TAGLINE_MOBILE_ID } from "./homeUtils";

type TaglinesType = {
    desktop: string;
    mobile: string;
};

const TAGLINE_IDS: { [field in keyof TaglinesType]: string } = {
    desktop: TAGLINE_DESKTOP_ID,
    mobile: TAGLINE_MOBILE_ID
};

const TaglinePreview: FunctionComponent<{ text: string }> = ({ text }) => (
    <div className="home-tagline-preview">
        {text ? (
            <div className="home-tagline-preview-inner">{text}</div>
        ) : (
            <i className="home-tagline-preview-empty">
                No tagline: nothing is shown.
            </i>
        )}
    </div>
);

const HomeTaglinesTab: FunctionComponent = () => {
    const dispatch = useDispatch();
    const [reloadToken, setReloadToken] = useState<string>("");
    const [savedValue, setSavedValue] = useState<TaglinesType>({
        desktop: "",
        mobile: ""
    });
    const [formValue, setFormValue] = useState<TaglinesType>({
        desktop: "",
        mobile: ""
    });

    const { loading, error } = useAsync(
        async (reloadToken: string) => {
            const records = await queryContent<string>("home/tagline/*");
            const getValue = (id: string) => {
                const content = records.find((item) => item.id === id)?.content;
                return typeof content === "string" ? content : "";
            };
            const value = {
                desktop: getValue(TAGLINE_DESKTOP_ID),
                mobile: getValue(TAGLINE_MOBILE_ID)
            };
            setSavedValue(value);
            setFormValue(value);
        },
        [reloadToken]
    );

    const changedFields = (Object.keys(TAGLINE_IDS) as Array<
        keyof TaglinesType
    >).filter((field) => formValue[field] !== savedValue[field]);

    const save = useAsyncCallback(async () => {
        try {
            for (const field of changedFields) {
                // the `home-tag-line` schema: the content is a JSON string
                await writeContent(
                    TAGLINE_IDS[field],
                    formValue[field].trim(),
                    "application/json"
                );
            }
        } catch (e) {
            reportError(`Failed to save the taglines: ${e}`);
        } finally {
            setReloadToken(`${Math.random()}`);
            dispatch(fetchContent(true) as any);
        }
    });

    if (loading && !save.loading) {
        return (
            <Placeholder.Paragraph rows={6}>
                <Loader center content="loading" />
            </Placeholder.Paragraph>
        );
    }

    if (error) {
        return (
            <Message showIcon type="error" header="Error">
                Failed to load the taglines: {`${error}`}
            </Message>
        );
    }

    return (
        <div className="home-taglines-tab">
            <p className="tab-intro">
                The tagline is shown above the search box of the home page.
                Leave a tagline empty to show none.
            </p>
            <Form
                fluid
                disabled={save.loading}
                formValue={formValue}
                onChange={(v) =>
                    setFormValue({ ...formValue, ...(v as TaglinesType) })
                }
            >
                <Form.Group controlId="ctrl-desktop-tagline">
                    <Form.ControlLabel>
                        <MdComputer className="form-label-icon" />
                        Desktop tagline
                    </Form.ControlLabel>
                    <Form.Control name="desktop" />
                    <Form.HelpText>
                        Shown on larger screens. The highlight link is shown
                        below it, so it's hidden too when this is empty.
                    </Form.HelpText>
                    <TaglinePreview text={formValue.desktop.trim()} />
                </Form.Group>
                <Form.Group controlId="ctrl-mobile-tagline">
                    <Form.ControlLabel>
                        <MdSmartphone className="form-label-icon" />
                        Mobile tagline
                    </Form.ControlLabel>
                    <Form.Control name="mobile" />
                    <Form.HelpText>Shown on small screens.</Form.HelpText>
                    <TaglinePreview text={formValue.mobile.trim()} />
                </Form.Group>
                <ButtonToolbar>
                    <Button
                        appearance="primary"
                        startIcon={<MdSave />}
                        loading={save.loading}
                        disabled={!changedFields.length}
                        onClick={save.execute}
                    >
                        Save
                    </Button>
                    <Button
                        disabled={!changedFields.length || save.loading}
                        onClick={() => setFormValue(savedValue)}
                    >
                        Discard changes
                    </Button>
                </ButtonToolbar>
            </Form>
        </div>
    );
};

export default HomeTaglinesTab;
