import React from "react";
import Editor from "./Editors/Editor";

interface AlwaysEditorProps {
    value: any;
    onChange: Function;
    editor: Editor;
}

/**
 * Will always show editing interface.
 * Interchangable with ToggleEditor.
 */
export class AlwaysEditor extends React.Component<AlwaysEditorProps> {
    change(value) {
        this.props.onChange(value);
    }

    updateState(update: any) {
        this.setState(Object.assign({}, this.state, update));
    }

    render() {
        let { value, editor } = this.props;
        return editor.edit(value, this.change.bind(this));
    }
}
