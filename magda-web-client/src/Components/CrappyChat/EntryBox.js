import React from "react";
import Editor from "draft-js-plugins-editor";
import { EditorState, ContentState, convertToRaw } from "draft-js";
import pluginsFn from "./Plugins/Plugins";
import PluginComponents from "./Plugins/PluginComponents";

import "./EntryBox.css";

export default class EntryBox extends React.Component {
    constructor(props) {
        super(props);

        this.plugins = pluginsFn();

        this.state = {
            editorState: EditorState.createEmpty(),
            users: []
        };
    }

    onEditorChange(newEditorState) {
        this.setState({
            editorState: newEditorState
        });
    }

    resetState() {
        this.setState({
            editorState: EditorState.push(
                this.state.editorState,
                ContentState.createFromText("")
            )
        });
    }

    onSubmit(e) {
        e.preventDefault();

        this.submit();
    }

    submit() {
        this.props.onSubmit(
            convertToRaw(this.state.editorState.getCurrentContent())
        );

        this.resetState();

        setTimeout(() => {
            document.activeElement.blur();
            setTimeout(() => this.editor.focus());
        });
    }

    onReturnPressed(e) {
        if (e.shiftKey) {
            return "not-handled";
        } else {
            this.submit();
            return "handled";
        }
    }

    render() {
        return (
            <div className="clearfix">
                <form className="entry-box" onSubmit={this.onSubmit.bind(this)}>
                    <div className="entry-box__editor">
                        <Editor
                            editorState={this.state.editorState}
                            onChange={this.onEditorChange.bind(this)}
                            plugins={Object.values(this.plugins)}
                            handleReturn={this.onReturnPressed.bind(this)}
                            ref={editor => (this.editor = editor)}
                        />
                    </div>
                    <PluginComponents
                        userMentionsPlugin={this.plugins.userMentions}
                        dataSetMentionsPlugin={this.plugins.dataSetMentions}
                    />
                    <button className="entry-box__submit-button au-btn">
                        Submit
                    </button>
                </form>
            </div>
        );
    }
}
