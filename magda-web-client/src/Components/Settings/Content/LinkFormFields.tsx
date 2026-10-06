import React from "react";
import Form from "rsuite/Form";
import Toggle from "rsuite/Toggle";
import TagPicker from "rsuite/TagPicker";
import uniq from "lodash/uniq";
import { LinkFormValue, LINK_REL_VALUES } from "./contentUtils";

type PropsType<V extends LinkFormValue = LinkFormValue> = {
    value: V;
    onChange: (value: V) => void;
    hrefHelpText?: React.ReactNode;
    newWindowHelpText?: React.ReactNode;
};

/**
 * Form fields of a link: label, URL, open in new window (target) & rel.
 * Must be used inside a rsuite `Form` whose `formValue` is a `LinkFormValue`.
 */
function LinkFormFields<V extends LinkFormValue>({
    value,
    onChange,
    hrefHelpText,
    newWindowHelpText
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
                {newWindowHelpText ? (
                    <Form.HelpText>{newWindowHelpText}</Form.HelpText>
                ) : null}
            </Form.Group>
            {value.openInNewWindow ? (
                <Form.Group controlId="ctrl-target">
                    <Form.ControlLabel>Target</Form.ControlLabel>
                    <Form.Control name="target" placeholder="_blank" />
                    <Form.HelpText>
                        The window to open the link in. Use "_blank" for a new
                        window or tab.
                    </Form.HelpText>
                </Form.Group>
            ) : null}
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

export default LinkFormFields;
