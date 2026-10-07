import React from "react";
import Form from "rsuite/Form";
import Toggle from "rsuite/Toggle";
import TagPicker from "rsuite/TagPicker";
import Radio from "rsuite/Radio";
import RadioGroup from "rsuite/RadioGroup";
import uniq from "lodash/uniq";
import {
    FooterLinkFormValue,
    LinkBaseFormValue,
    LinkFormValue,
    LinkOpenInOption,
    LINK_REL_VALUES
} from "./contentUtils";

type PropsType<V extends LinkBaseFormValue> = {
    value: V;
    onChange: (value: V) => void;
    hrefHelpText?: React.ReactNode;
    // the control of how the link opens (target), shown between the URL & rel fields
    children?: React.ReactNode;
};

/**
 * Form fields of a link: label, URL, how it opens (`children`) & rel.
 * Must be used inside a rsuite `Form` whose `formValue` is the link form value.
 */
function LinkFormFields<V extends LinkBaseFormValue>({
    value,
    onChange,
    hrefHelpText,
    children
}: PropsType<V>) {
    const relOptions = uniq([
        ...LINK_REL_VALUES,
        ...(value.rel ? value.rel : [])
    ]).map((item) => ({ label: item, value: item }));

    return (
        <>
            <Form.Group controlId="ctrl-label">
                <Form.ControlLabel>Label</Form.ControlLabel>
                <Form.Control name="label" />
            </Form.Group>
            <Form.Group controlId="ctrl-href">
                <Form.ControlLabel>URL</Form.ControlLabel>
                <Form.Control name="href" placeholder="e.g. /page/about" />
                {hrefHelpText ? (
                    <Form.HelpText>{hrefHelpText}</Form.HelpText>
                ) : null}
            </Form.Group>
            {children}
            <Form.Group controlId="ctrl-rel">
                <Form.ControlLabel>Link rel</Form.ControlLabel>
                <TagPicker
                    block
                    creatable
                    data={relOptions}
                    value={value.rel ? value.rel : []}
                    onChange={(rel) =>
                        onChange({
                            ...value,
                            rel: (rel ? rel : []) as string[]
                        })
                    }
                    placeholder="Optional: select or type in values"
                />
            </Form.Group>
        </>
    );
}

const TargetField = () => (
    <Form.Group controlId="ctrl-target">
        <Form.ControlLabel>Target</Form.ControlLabel>
        <Form.Control name="target" placeholder="_blank" />
        <Form.HelpText>
            The window to open the link in, e.g. "_blank" for a new window or
            tab.
        </Form.HelpText>
    </Form.Group>
);

/**
 * "Open in a new window" toggle & target (header links open in the same window by default).
 */
export function NewWindowFields<V extends LinkFormValue>({
    value,
    onChange
}: {
    value: V;
    onChange: (value: V) => void;
}) {
    return (
        <>
            <Form.Group controlId="ctrl-open-in-new-window">
                <div className="inline-toggle-container">
                    <Toggle
                        checked={!!value.openInNewWindow}
                        onChange={(checked) =>
                            onChange({ ...value, openInNewWindow: checked })
                        }
                    >
                        Open in a new window
                    </Toggle>
                </div>
            </Form.Group>
            {value.openInNewWindow ? <TargetField /> : null}
        </>
    );
}

/**
 * "Open link in" choice of footer links, including the footer's URL based default.
 */
export function OpenLinkInFields<V extends FooterLinkFormValue>({
    value,
    onChange
}: {
    value: V;
    onChange: (value: V) => void;
}) {
    return (
        <>
            <Form.Group controlId="ctrl-open-in">
                <Form.ControlLabel>Open link in</Form.ControlLabel>
                <RadioGroup
                    inline
                    name="openIn"
                    value={value.openIn}
                    onChange={(openIn) =>
                        onChange({
                            ...value,
                            openIn: openIn as LinkOpenInOption
                        })
                    }
                >
                    <Radio value="default">Default</Radio>
                    <Radio value="_self">Same window</Radio>
                    <Radio value="_blank">New window</Radio>
                    <Radio value="custom">Custom target</Radio>
                </RadioGroup>
                {value.openIn === "default" ? (
                    <Form.HelpText>
                        Full URLs and API paths (/api/... or /auth/...) open in
                        a new window. Other links open in the same window.
                    </Form.HelpText>
                ) : null}
            </Form.Group>
            {value.openIn === "custom" ? <TargetField /> : null}
        </>
    );
}

export default LinkFormFields;
