import React from "react";
import Editor from "./Editors/Editor";

interface AlwaysEditorProps<V> {
    value: V | undefined;
    onChange: (value: V | undefined) => void;
    editor: Editor<V>;
}

/**
 * Will always show editing interface.
 * Interchangable with ToggleEditor.
 */
export class AlwaysEditor<V> extends React.Component<AlwaysEditorProps<V>> {
    change(value: V | undefined) {
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
