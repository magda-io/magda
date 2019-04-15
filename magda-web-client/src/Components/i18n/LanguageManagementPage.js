import React from "react";
import MagdaDocumentTitle from "Components/i18n/MagdaDocumentTitle";

import { listContent, writeContent } from "actions/contentActions";
import { ToggleEditor } from "Components/Editing/ToggleEditor";
import { textEditor } from "Components/Editing/Editors/textEditor";

class Account extends React.Component {
    state = {
        items: []
    };

    updateState(update: any) {
        this.setState((state, props) => Object.assign({}, state, update));
    }

    componentDidMount() {
        listContent("lang/en/*").then(items => this.updateState({ items }));
    }

    render() {
        const { items } = this.state;

        items.sort((a, b) => (a.id > b.id ? 1 : -1));

        return (
            <MagdaDocumentTitle prefixes={["I18N"]}>
                <div>
                    <h1>I18N</h1>
                    {items.length === 0 ? (
                        <p>No users</p>
                    ) : (
                        <div>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Section</th>
                                        <th>Item</th>
                                        <th>Text</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(this.renderItem.bind(this))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </MagdaDocumentTitle>
        );
    }

    renderItem(item) {
        const [, , section, head] = item.id.split("/");
        const save = async value => {
            return writeContent(item.id, value, "text/plain");
        };
        return (
            <tr>
                <td>{section}</td>
                <td>{head}</td>
                <td>
                    <ToggleEditor
                        editor={textEditor}
                        value={item.content}
                        onChange={save}
                    />
                </td>
            </tr>
        );
    }
}

export default Account;
