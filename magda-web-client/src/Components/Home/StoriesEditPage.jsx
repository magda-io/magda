import React, { Component } from "react";
import MagdaDocumentTitle from "Components/i18n/MagdaDocumentTitle";

import ContentEditPage from "Components/Common/ContentEditPage";
import ContentImageEditor from "Components/Common/ContentImageEditor";

import { ToggleEditor } from "Components/Editing/ToggleEditor";
import { textEditor } from "Components/Editing/Editors/textEditor";
import { markdownEditor } from "Components/Editing/Editors/markdownEditor";

class StoriesEditPage extends Component {
    render() {
        return (
            <ContentEditPage
                render={renderItem}
                itemIdPrefix="home/stories/"
                manageText="Manage Stories"
                manageLink="/stories"
            />
        );
    }
}

function renderItem(itemId, item, hasEditPermissions, save) {
    return (
        <MagdaDocumentTitle prefixes={[item.title]}>
            <div>
                <h1>
                    <ToggleEditor
                        enabled={hasEditPermissions}
                        value={item.title}
                        onChange={save("title")}
                        editor={textEditor}
                    />
                </h1>
                <p>
                    <ContentImageEditor
                        imageItemId={itemId.replace("stories", "story-images")}
                        hasEditPermissions={hasEditPermissions}
                        accept="image/*"
                    />
                </p>
                <p>
                    Linked to:{" "}
                    <ToggleEditor
                        enabled={hasEditPermissions}
                        value={item.titleUrl}
                        onChange={save("titleUrl")}
                        editor={textEditor}
                    />
                </p>

                <ToggleEditor
                    enabled={hasEditPermissions}
                    value={item.content}
                    onChange={save("content")}
                    editor={markdownEditor}
                />
            </div>
        </MagdaDocumentTitle>
    );
}

export default StoriesEditPage;
