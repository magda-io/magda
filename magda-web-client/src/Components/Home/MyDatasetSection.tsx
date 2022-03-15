import React, { FunctionComponent } from "react";
import "./MyDatasetSection.scss";
import SideNavigation from "./MyDatasetSectionComponents/SideNavigation";
import DatasetList from "./MyDatasetSectionComponents/DatasetList";
import { User } from "reducers/userManagementReducer";

type PropsType = {
    userId: string;
    user: User;
};

const MyDatasetSection: FunctionComponent<PropsType> = (props) => {
    return (
        <div className="my-dataset-section-container">
            <SideNavigation user={props.user} />
            <DatasetList userId={props.userId} />
        </div>
    );
};

export default MyDatasetSection;
