import React from "react";
import HelpIcon from "assets/help.svg";
import "./HelpSnippet.scss";

export default class HelpSnippet extends React.Component<any, any> {
    state = {
        visible: false
    };
    updateState(update: any) {
        this.setState(Object.assign({}, this.state, update));
    }
    render() {
        const { visible } = this.state;
        if (!visible) {
            return (
                <img
                    className="helpSnippet-button"
                    src={HelpIcon}
                    onClick={() => this.updateState({ visible: true })}
                />
            );
        }
        return (
            <div className="helpSnippet-body">
                <span
                    className="helpSnippet-body-close"
                    onClick={() => this.updateState({ visible: false })}
                >
                    &#x2716;
                </span>
                <div>{this.props.children}</div>
            </div>
        );
    }
}
