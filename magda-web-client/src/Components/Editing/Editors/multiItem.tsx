import React from "react";
import Editor from "./Editor";
import "./multiItem.scss";

export abstract class MultiItemEditor extends React.Component<
    {
        value?: any[];
        editor: Editor;
        enabled?: boolean;
        createNewValue?: Function;
        onChange?: Function;
    },
    { value?: any[]; newValue: any }
> {
    constructor(props) {
        super(props);
        this.state = {
            newValue: props.createNewValue()
        };
    }

    updateState(update: any) {
        this.setState((state, props) => Object.assign({}, state, update));
    }

    change(newValueFromControl) {
        this.updateState({
            newValue: newValueFromControl
        });
    }

    add(event) {
        event.preventDefault();

        const value = this.value();
        let newValue = this.state.newValue;
        if (newValue) {
            value.push(newValue);
            newValue = "";
        }
        this.updateState({ value, newValue });
        if (this.props.onChange) {
            this.props.onChange(value);
        }
    }

    deleteIndex(index) {
        return () => {
            const value = this.value();
            value.splice(index, 1);
            this.updateState({ value });
            if (this.props.onChange) {
                this.props.onChange(value);
            }
        };
    }

    value() {
        let value = this.state.value;
        if (!value && this.props.value) {
            value = this.props.value.slice();
        }
        value = value || [];
        return value;
    }
}

export class ListMultiItemEditor extends MultiItemEditor {
    render() {
        const { editor, enabled } = this.props;
        const { newValue } = this.state;
        const value = this.value();
        return (
            <React.Fragment>
                {enabled && (
                    <React.Fragment>
                        {editor.edit(newValue, this.change.bind(this), value, {
                            onKeyUp: e => {
                                if (e.keyCode !== 13) return;
                                this.add(e);
                            }
                        })}
                        {newValue && (
                            <button
                                className="au-btn add-button"
                                onClick={this.add.bind(this)}
                            >
                                Add
                            </button>
                        )}
                    </React.Fragment>
                )}
                {!enabled && (!value || !value.length) && "NOT SET"}
                {!enabled && (!value || !value.length) ? null : (
                    <div className="multi-list-item-editor-container">
                        {value.map((val, i) => {
                            return (
                                <div
                                    key={i}
                                    className="multi-list-item-editor-item"
                                >
                                    {editor.view(val)}
                                    {enabled && (
                                        <button
                                            className="edit-button"
                                            onClick={this.deleteIndex(i)}
                                        >
                                            &#215;
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </React.Fragment>
        );
    }

    static create(singleEditor: Editor, createNewValue: Function): Editor {
        return {
            edit: (value: any, onChange: Function) => {
                return (
                    <ListMultiItemEditor
                        value={value}
                        editor={singleEditor}
                        enabled={true}
                        createNewValue={createNewValue}
                        onChange={onChange}
                    />
                );
            },
            view: (value: any) => {
                return (
                    <ListMultiItemEditor
                        value={value}
                        editor={singleEditor}
                        enabled={false}
                        createNewValue={createNewValue}
                    />
                );
            }
        };
    }
}
