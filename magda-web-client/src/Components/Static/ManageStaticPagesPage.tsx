import React, { Component } from "react";

import ContentManagePage from "Components/Common/ContentManagePage";

class ManageStaticPagesPage extends Component {
    render() {
        return (
            <ContentManagePage
                title="Manage Pages"
                itemTitle="Page"
                newIdInput={true}
                generateNewId={id => `page/${id}`}
                titleFromItem={item => item.id.substr("page/".length)}
                pattern="page/*"
                link={page => page}
                newContent={{
                    title: "New Page Title",
                    content: "New Page Content"
                }}
            />
        );
    }
}

export default ManageStaticPagesPage;
