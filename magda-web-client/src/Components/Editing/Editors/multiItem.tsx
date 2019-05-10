import React from "react";
import Editor from "./Editor";

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
                <ul>
                    {value.map((val, i) => {
                        return (
                            <li key={i}>
                                {editor.view(val)}
                                {enabled && (
                                    <button
                                        className="edit-button"
                                        onClick={this.deleteIndex(i)}
                                    >
                                        &#215;
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {enabled && (
                    <React.Fragment>
                        {editor.edit(newValue, this.change.bind(this))}
                        <button
                            className="edit-button"
                            onClick={this.add.bind(this)}
                        >
                            Add
                        </button>
                    </React.Fragment>
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
