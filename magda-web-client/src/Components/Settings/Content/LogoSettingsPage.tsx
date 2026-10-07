import React, { FunctionComponent } from "react";
import Message from "rsuite/Message";
import ContentSettingsLayout from "./ContentSettingsLayout";
import ImageSettingCard from "./ImageSettingCard";

const LogoSettingsPage: FunctionComponent = () => (
    <ContentSettingsLayout
        className="logo-settings-page"
        breadcrumbs={[{ to: "/settings/content/logos", title: "Logos" }]}
    >
        <p className="page-intro">
            Manage the site logos shown in the header and the website icon
            (favicon) shown in browser tabs.
        </p>
        <Message showIcon type="info" className="logo-cache-note">
            Due to caching, a new logo or icon may take up to 60 seconds to show
            on the site, and a browser may keep showing the old website icon for
            longer.
        </Message>
        <div className="image-setting-cards">
            <ImageSettingCard
                contentId="header/logo"
                title="Desktop logo"
                description="Shown in the header on larger screens. PNG, GIF, JPEG, WebP or SVG."
            />
            <ImageSettingCard
                contentId="header/logo-mobile"
                title="Mobile logo"
                description="Shown in the header on small screens. PNG, GIF, JPEG, WebP or SVG."
            />
            <ImageSettingCard
                contentId="favicon.ico"
                title="Website icon (favicon)"
                description="Shown in browser tabs & bookmarks. An icon (.ico) file."
                isFavicon={true}
            />
        </div>
    </ContentSettingsLayout>
);

export default LogoSettingsPage;
