import React from "react";
import { EditorState, convertFromRaw } from "draft-js";
import Editor from "draft-js-plugins-editor";
import prettydate from "pretty-date";

import pluginsFn from "./Plugins/Plugins";
import "./Message.css";

export default class Message extends React.Component {
    constructor(props) {
        super(props);

        this.plugins = pluginsFn();

        const message = props.message;

        this.state = {
            ...message,
            editorState: EditorState.createWithContent(
                convertFromRaw(message.message)
            )
        };
    }

    componentDidMount() {
        // Update the amount of time every minute.
        this.interval = setInterval(() => {
            this.forceUpdate();
        }, 60000);
    }

    componentWillUnmount() {
        clearInterval(this.interval);
    }

    UNSAFE_componentWillReceiveProps(props) {
        this.setState({
            editorState: EditorState.push(
                this.state.editorState,
                convertFromRaw(props.message.message)
            )
        });
    }

    onEditorChange(newEditorState) {
        this.setState({
            editorState: newEditorState
        });
    }

    filter(value) {
        if (typeof value === "object" && Object.keys(value).length === 0) {
            return;
        } else {
            return value;
        }
    }

    render() {
        return (
            <div className="cc-message">
                <img
                    alt={"avatar"}
                    className="cc-message__avatar"
                    src={this.filter(this.state.user.photoURL) || ""}
                />

                <div className="cc-message__right-of-avatar">
                    <strong>
                        {this.filter(this.state.user.displayName) || "Unknown"}
                    </strong>{" "}
                    <small>
                        {this.state.modified &&
                            prettydate.format(new Date(this.state.modified))}
                    </small>
                    <Editor
                        onChange={this.onEditorChange.bind(this)}
                        readOnly={true}
                        editorState={this.state.editorState}
                        plugins={Object.values(this.plugins)}
                    />
                </div>
            </div>
        );
    }
}
