import React from "react";
import Editor from "./Editor";
import "./multiItem.scss";

export abstract class MultiItemEditor<V> extends React.Component<
    {
        value?: V[];
        editor: Editor<V>;
        enabled?: boolean;
        createNewValue: Function;
        onChange?: Function;
        canBeAdded: (value: V) => boolean;
        addOnChange: boolean;
    },
    { value?: V[]; newValue: V }
> {
    constructor(props) {
        super(props);
        this.state = {
            newValue: props.createNewValue()
        };
    }

    change(newValueFromControl) {
        this.setState(
            {
                newValue: newValueFromControl
            },
            () => {
                if (
                    this.props.addOnChange &&
                    this.props.canBeAdded(newValueFromControl)
                ) {
                    this.add();
                }
            }
        );
    }

    addHandler(event) {
        event.preventDefault();

        this.add();
    }

    add() {
        const value = this.value();
        let newValue = this.state.newValue;
        if (newValue) {
            value.push(newValue);
            newValue = this.props.createNewValue();
        }
        this.setState({ value, newValue });
        if (this.props.onChange) {
            this.props.onChange(value);
        }
    }

    deleteIndex(index) {
        return () => {
            const value = this.value();
            value.splice(index, 1);
            this.setState({ value });
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

export class ListMultiItemEditor<V> extends MultiItemEditor<V> {
    render() {
        const { editor, enabled } = this.props;
        const { newValue } = this.state;
        const value = this.value();

        return (
            <React.Fragment>
                {!enabled && (!value || !value.length) ? null : (
                    <div className="multi-list-item-editor-container">
                        {value.map((val, i) => {
                            return (
                                <div className="multi-list-item-editor-item">
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
                {enabled && (
                    <React.Fragment>
                        {editor.edit(newValue, this.change.bind(this))}
                        {!this.props.addOnChange && (
                            <button
                                className="au-btn add-button"
                                onClick={this.addHandler.bind(this)}
                                disabled={!this.props.canBeAdded(newValue)}
                            >
                                Add
                            </button>
                        )}
                    </React.Fragment>
                )}
                {!enabled && (!value || !value.length) && "NOT SET"}
            </React.Fragment>
        );
    }

    static create<V>(
        singleEditor: Editor<V>,
        createNewValue: () => V,
        canBeAdded: (value: V) => boolean = value => !!value,
        addOnChange: boolean = false
    ): Editor<V[]> {
        return {
            edit: (
                outerMultiValue: V[] | undefined,
                onChange: (innerMultiValue: V[] | undefined) => void
            ) => {
                return (
                    <ListMultiItemEditor<V>
                        value={outerMultiValue}
                        editor={singleEditor}
                        enabled={true}
                        createNewValue={createNewValue}
                        onChange={onChange}
                        canBeAdded={canBeAdded}
                        addOnChange={addOnChange}
                    />
                );
            },
            view: (value: V[] | undefined) => {
                return (
                    <ListMultiItemEditor<V>
                        value={value}
                        editor={singleEditor}
                        enabled={false}
                        createNewValue={createNewValue}
                        canBeAdded={canBeAdded}
                        addOnChange={addOnChange}
                    />
                );
            }
        };
    }
}
