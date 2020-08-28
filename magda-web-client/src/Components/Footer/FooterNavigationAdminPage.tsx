import React, { Component } from "react";

import ContentAdminPage from "Components/Admin/ContentAdminPage";
import { withRouter } from "react-router";
import CommonLink from "Components/Common/CommonLink";

class FooterNavigationAdminPage extends Component<any, any> {
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
                <ContentAdminPage
                    title={`${label} Footer Navigation`}
                    itemTitle="Footer Navigation"
                    generateNewId={(id) => `${pathPrefix}/${Date.now()}`}
                    titleFromItem={(item) => item.content.label}
                    pattern={`${pathPrefix}/*`}
                    newContent={{
                        order: 999,
                        label: "Menu Category"
                    }}
                    link={(id) =>
                        `/admin/footer-navigation-links/${size}/${id.substr(
                            id.lastIndexOf("/") + 1
                        )}`
                    }
                    hasOrder={true}
                />
                <p>
                    <CommonLink href={`/admin/footer-navigation/${otherSize}`}>
                        Switch to {otherSizeLabel} Footer Navigation
                    </CommonLink>
                </p>
            </div>
        );
    }
}

export default withRouter(FooterNavigationAdminPage);
