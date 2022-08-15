import React, { FunctionComponent } from "react";
import { useSelector } from "react-redux";
import "./main.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import { StateType } from "reducers/reducer";
import DatasetList from "../Home/MyDatasetSectionComponents/DatasetList";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import "./DatasetManagementPage.scss";

const DatasetManagementPage: FunctionComponent = () => {
    const userId = useSelector<StateType, string>(
        (state) => state?.userManagement?.user?.id
    );
    const userIdLoading = useSelector<StateType, boolean>(
        (state) => state?.userManagement?.isFetchingWhoAmI
    );
    return (
        <div className="flex-main-container setting-page-main-container">
            <SideNavigation />
            <div className="main-content-container dataset-management-page my-dataset-section-container">
                <Breadcrumb items={[{ title: "Dataset Management" }]} />
                {userIdLoading ? (
                    <Placeholder.Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
                ) : !userId ? (
                    <Message showIcon type="error" header="Error">
                        You need to login in order to access this section.
                    </Message>
                ) : (
                    <DatasetList openInPopUp={false} />
                )}
            </div>
        </div>
    );
};

export default DatasetManagementPage;
