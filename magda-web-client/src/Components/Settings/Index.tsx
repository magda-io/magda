import React, { FunctionComponent } from "react";
import "./main.scss";
import SideNavigation from "./SideNavigation";

const Index: FunctionComponent = () => {
    return (
        <div className="flex-main-container setting-page-main-container">
            <SideNavigation />
            <div className="setting-page-content-container">sdsds</div>
        </div>
    );
};

export default Index;
