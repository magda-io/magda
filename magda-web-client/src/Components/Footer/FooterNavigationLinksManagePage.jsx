import React, { Component } from "react";

import ContentManagePage from "Components/Common/ContentManagePage";
import { ToggleEditor } from "Components/Editing/ToggleEditor";
import { textEditor } from "Components/Editing/Editors/textEditor";
import { withRouter } from "react-router";

import { readContent, updateContent } from "actions/contentActions";

class StoriesManagePage extends Component {
    state = {
        category: null
    };

    updateState(update: any) {
        this.setState((state, props) => Object.assign({}, state, update));
    }
    componentDidMount() {
        const { category, size } = this.props.match.params;
        const categoryPathPrefix = `footer/navigation/${size}/category/${category}`;
        readContent(categoryPathPrefix).then(category =>
            this.updateState({ category })
        );
    }
    render() {
        const { category, size } = this.props.match.params;
        const pathPrefix = `footer/navigation/${size}/category-links/${category}`;
        const categoryLabel = this.state.category
            ? this.state.category.label
            : "Loading...";
        const categoryPathPrefix = `footer/navigation/${size}/category/${category}`;
        const saveCategoryLabel = value => {
            updateContent(categoryPathPrefix, {
                label: value
            });
        };
        return (
            <div>
                <ContentManagePage
                    title={
                        <ToggleEditor
                            editor={textEditor}
                            value={categoryLabel}
                            onChange={saveCategoryLabel}
                        />
                    }
                    itemTitle="Link"
                    generateNewId={id => `${pathPrefix}/${Date.now()}`}
                    titleFromItem={item => item.content.label}
                    pattern={`${pathPrefix}/*`}
                    newContent={{
                        order: 999,
                        label: "Link",
                        href: "http://magda.io"
                    }}
                    hasOrder={true}
                    edit={this.edit.bind(this)}
                />
                <p>
                    <a href={`/footer/navigation/${size}`}>Back to Menus</a>
                </p>
            </div>
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
            </div>
        );
    }
}

export default withRouter(StoriesManagePage);
