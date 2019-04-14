import React, { Component } from "react";

import ContentManagePage from "Components/Common/ContentManagePage";
import { codelistEditor } from "Components/Editing/Editors/codelistEditor";
import { ToggleEditor } from "Components/Editing/ToggleEditor";
import { textEditor } from "Components/Editing/Editors/textEditor";

class StoriesManagePage extends Component {
    render() {
        return (
            <ContentManagePage
                title="Manage Header Navigation"
                itemTitle="Header Navigation"
                generateNewId={id => `header/navigation/${Date.now()}`}
                titleFromItem={item =>
                    (item.content.default && item.content.default.label) ||
                    "[Authentication]"
                }
                pattern="header/navigation/*"
                newContent={{
                    order: 999,
                    default: {
                        label: "Menu Item",
                        href: "http://magda.io"
                    }
                }}
                hasOrder={true}
                edit={this.edit.bind(this)}
            />
        );
    }
    edit(item, onChange) {
        const saveAuth = () => {
            onChange({
                auth: {}
            });
        };
        const saveDefault = () => {
            onChange({
                default: item.content.default || {
                    label: "Menu Item",
                    href: "http://magda.io"
                }
            });
        };
        const save = field => {
            return value => {
                onChange({
                    default: Object.assign({}, item.content.default, {
                        [field]: value
                    })
                });
            };
        };
        const type = Object.keys(item.content).filter(i => i !== "order")[0];
        const value = item.content[type];
        return (
            <div>
                <p>
                    Type:{" "}
                    <ToggleEditor
                        editor={codelistEditor({
                            default: "Regular",
                            auth: "Authentication"
                        })}
                        value={type}
                        onChange={v =>
                            v === "auth" ? saveAuth() : saveDefault()
                        }
                    />
                </p>
                {type === "default" && (
                    <React.Fragment>
                        <p>
                            Label:{" "}
                            <ToggleEditor
                                editor={textEditor}
                                value={value.label}
                                onChange={save("label")}
                            />
                        </p>
                        <p>
                            Link:{" "}
                            <ToggleEditor
                                editor={textEditor}
                                value={value.href}
                                onChange={save("href")}
                            />
                        </p>
                        <p>
                            rel:{" "}
                            <ToggleEditor
                                editor={textEditor}
                                value={value.rel}
                                onChange={save("rel")}
                            />
                        </p>
                        <p>
                            target:{" "}
                            <ToggleEditor
                                editor={textEditor}
                                value={value.target}
                                onChange={save("target")}
                            />
                        </p>
                    </React.Fragment>
                )}
            </div>
        );
    }
}

export default StoriesManagePage;
