import React, { Component } from "react";

import ContentManagePage from "Components/Common/ContentManagePage";
import { withRouter } from "react-router";

class StoriesManagePage extends Component {
    render() {
        const size = this.props.match.params.size;
        const label = { medium: "Desktop", small: "Mobile" }[size];
        const otherSize = size === "small" ? "medium" : "small";
        const otherSizeLabel = { medium: "Desktop", small: "Mobile" }[
            otherSize
        ];
        const pathPrefix = `footer/navigation/${size}/category`;
        return (
            <div>
                <ContentManagePage
                    title={`Manage ${label} Footer Navigation`}
                    itemTitle="Footer Navigation"
                    generateNewId={id => `${pathPrefix}/${Date.now()}`}
                    titleFromItem={item => item.content.label}
                    pattern={`${pathPrefix}/*`}
                    newContent={{
                        order: 999,
                        label: "Menu Category"
                    }}
                    link={id =>
                        `/footer/navigation-links/${size}/${id.substr(
                            id.lastIndexOf("/") + 1
                        )}`
                    }
                    hasOrder={true}
                />
                <p>
                    <a href={`/footer/navigation/${otherSize}`}>
                        Switch to {otherSizeLabel} Footer Navigation
                    </a>
                </p>
            </div>
        );
    }
}

export default withRouter(StoriesManagePage);
