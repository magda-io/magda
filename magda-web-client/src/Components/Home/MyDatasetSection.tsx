import React, { FunctionComponent } from "react";
import "./MyDatasetSection.scss";
import SideNavigation from "./MyDatasetSectionComponents/SideNavigation";
import DatasetList from "./MyDatasetSectionComponents/DatasetList";

type PropsType = {};

const MyDatasetSection: FunctionComponent<PropsType> = props => {
    return (
        <div className="my-dataset-section-container">
            <SideNavigation />
            <DatasetList />
        </div>
    );
};

export default MyDatasetSection;
