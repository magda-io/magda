import React, { FunctionComponent } from "react";
import SideNavigation from "../SideNavigation";
import Breadcrumb, { BreadcrumbItem } from "../Breadcrumb";
import "../main.scss";
import "./ContentSettings.scss";

type PropsType = {
    className?: string;
    breadcrumbs: BreadcrumbItem[];
    children?: React.ReactNode;
};

const ContentSettingsLayout: FunctionComponent<PropsType> = ({
    className,
    breadcrumbs,
    children
}) => (
    <div
        className={`flex-main-container setting-page-main-container content-settings-page ${
            className ? className : ""
        }`}
    >
        <SideNavigation />
        <div className="main-content-container">
            <Breadcrumb
                items={[{ title: "Content Management" }, ...breadcrumbs]}
            />
            {children}
        </div>
    </div>
);

export default ContentSettingsLayout;
