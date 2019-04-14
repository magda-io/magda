import React, { Component } from "react";

import ContentManagePage from "Components/Common/ContentManagePage";
import { ToggleEditor } from "Components/Editing/ToggleEditor";
import { textEditor } from "Components/Editing/Editors/textEditor";
import { base64ImageEditor } from "Components/Editing/Editors/imageEditor";
import { withRouter } from "react-router";

class StoriesManagePage extends Component {
    render() {
        const pathPrefix = `footer/copyright`;
        return (
            <ContentManagePage
                title="Manage Footer Copyright"
                itemTitle="Copyright"
                generateNewId={id => `${pathPrefix}/${Date.now()}`}
                titleFromItem={item =>
                    item.content.logoAlt || item.content.htmlContent
                }
                pattern={`${pathPrefix}/*`}
                newContent={{
                    order: 999,
                    label: "Link",
                    href: "http://magda.io"
                }}
                hasOrder={true}
                edit={this.edit.bind(this)}
            />
        );
    }
    edit(item, onChange) {
        const save = field => {
            return value => {
                onChange(
                    Object.assign({}, item.content, {
                        [field]: value
                    })
                );
            };
        };
        const value = item.content;
        return (
            <div>
                <p>
                    Prefix:{" "}
                    <ToggleEditor
                        editor={textEditor}
                        value={value.htmlContent}
                        onChange={save("htmlContent")}
                    />
                </p>
                <p style={{ backgroundColor: "grey" }}>
                    Image:{" "}
                    <ToggleEditor
                        editor={base64ImageEditor}
                        value={value.logoSrc}
                        onChange={save("logoSrc")}
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
                    Hover Text:{" "}
                    <ToggleEditor
                        editor={textEditor}
                        value={value.logoAlt}
                        onChange={save("logoAlt")}
                    />
                </p>
            </div>
        );
    }
}

export default withRouter(StoriesManagePage);
