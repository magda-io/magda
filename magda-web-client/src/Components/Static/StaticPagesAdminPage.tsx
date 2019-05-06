import React, { Component } from "react";

import ContentAdminPage from "Components/Admin/ContentAdminPage";

export default class ManageStaticPagesPage extends Component {
    render() {
        return (
            <ContentAdminPage
                title="Pages"
                itemTitle="Page"
                newIdInput={true}
                generateNewId={id => `page/${id}`}
                titleFromItem={item => item.id.substr("page/".length)}
                pattern="page/*"
                link={page => `/${page}`}
                newContent={{
                    title: "New Page Title",
                    content: "New Page Content"
                }}
            />
        );
    }
}
