import React from "react";
import Editor from "./Editor";
import "../Style.scss";

import "./contactEditor.scss";
import editIcon from "assets/edit.svg";

export type Contact = {
    name?: string;
    role?: string;
    organisation?: string;
};

export const contacts: Contact[] = [
    {
        name: "Daryl Quinlivan",
        role: "​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​Secretary",
        organisation: "Department of Agriculture"
    },
    {
        name: "Cindy Briscoe",
        role: "Deputy Secretary",
        organisation: "Department of Agriculture"
    },
    {
        name: "Cass Kennedy",
        role: "First Assistant Secretary",
        organisation: "Department of Agriculture"
    },
    {
        name: "Laura Timmins",
        role: "Assistant Secretary",
        organisation: "Fisheries branch"
    },
    {
        name: "Michelle Lauder",
        role: "Assistant Secretary",
        organisation: "Forestry branch"
    },
    {
        name: "Julie Gaglia",
        role: "Assistant Secretary",
        organisation: "Ag Vet Chemicals"
    }
];

class ContactEditorComponent extends React.Component<any, any> {
    state = {
        results: [],
        searched: false
    };
    updateState(update: any) {
        this.setState((state, props) => Object.assign({}, state, update));
    }

    async search(e) {
        let searched = false;
        let results: Contact[] = [];

        try {
            const query = new RegExp(e.target.value, "i");
            const { existing } = this.props;

            if (e.target.value) {
                searched = true;
                results = contacts
                    .filter((contact: Contact) => {
                        return (
                            existing.filter(
                                (existingItem) =>
                                    existingItem.name === contact.name
                            ).length === 0 &&
                            ((contact.name || "").match(query) ||
                                (contact.role || "").match(query) ||
                                (contact.organisation || "").match(query))
                        );
                    })
                    .slice(0, 5);
            }
        } catch (e) {}
        this.updateState({ results, searched });
    }

    render() {
        let { existing, onChange } = this.props;
        const { results, searched } = this.state;

        const add = (item) => {
            existing = existing.slice(0);
            existing.push(item);
            onChange(existing);
        };
        const remove = (item) => {
            existing = existing.filter((i) => i !== item);
            onChange(existing);
        };

        return (
            <div>
                <div className="contact-editor-input-outer-container">
                    <input
                        className="au-text-input contact-editor-input"
                        type="search"
                        placeholder="Search for a contact"
                        onChange={this.search.bind(this)}
                    />
                    <div className="edit-icon-container">
                        <img className="edit-icon" src={editIcon} />
                    </div>
                </div>

                <div className="contactList">
                    {existing.map((val) => {
                        return (
                            <div className="contactList-item">
                                {val.name} ({val.role}, {val.organisation}){" "}
                                <button
                                    className="contactList-item-btn"
                                    onClick={() => remove(val)}
                                >
                                    &#x2715;
                                </button>
                            </div>
                        );
                    })}
                    {searched &&
                        results.map((val: Contact) => {
                            return (
                                <div className="contactList-item">
                                    {val.name} ({val.role}, {val.organisation}){" "}
                                    <button
                                        className="contactList-item-btn"
                                        onClick={() => {
                                            add(val);
                                            this.updateState({
                                                results: this.state.results.filter(
                                                    (result: Contact) =>
                                                        result.name !== val.name
                                                )
                                            });
                                        }}
                                    >
                                        Add
                                    </button>
                                </div>
                            );
                        })}
                </div>
            </div>
        );
    }
}

export function multiContactEditor(options: any): Editor<Contact[]> {
    return {
        edit: (value: any, onChange: Function) => {
            value = value || [];

            return (
                <div>
                    <div>
                        <ContactEditorComponent
                            existing={value}
                            onChange={onChange}
                        />
                    </div>
                </div>
            );
        },
        view: (value: any) => {
            value = value || [];
            return (
                <React.Fragment>
                    <ul>
                        {value.map((val) => {
                            return (
                                <li>
                                    {val.name || "No Name"} (
                                    {val.role || "Unspecified Role"},{" "}
                                    {val.organisation || "Unknown Organisation"}
                                    )
                                </li>
                            );
                        })}
                    </ul>
                </React.Fragment>
            );
        }
    };
}
