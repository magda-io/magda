import React, { FunctionComponent } from "react";
import "./MyDatasetSection.scss";
import SideNavigation from "./MyDatasetSectionComponents/SideNavigation";
import DatasetList from "./MyDatasetSectionComponents/DatasetList";

type PropsType = {
    userId: string;
};

const MyDatasetSection: FunctionComponent<PropsType> = (props) => {
    return (
        <div className="my-dataset-section-container">
            <SideNavigation />
            <DatasetList userId={props.userId} />
        </div>
    );
};

export default MyDatasetSection;
