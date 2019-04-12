import React, { Component } from "react";

import ContentManagePage from "Components/Common/ContentManagePage";

class StoriesManagePage extends Component {
    render() {
        return (
            <ContentManagePage
                title="Manage Stories"
                itemTitle="Story"
                generateNewId={id => `home/stories/${Date.now()}`}
                titleFromItem={item => item.content.title}
                pattern="home/stories/*"
                link={page => page.substr("home/".length)}
                newContent={{
                    title: "New Story Title",
                    order: 999,
                    content: "New Story Content",
                    titleUrl: "http://magda.io"
                }}
                hasOrder={true}
            />
        );
    }
}

export default StoriesManagePage;
