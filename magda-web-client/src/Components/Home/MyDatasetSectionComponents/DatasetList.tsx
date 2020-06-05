import React, { FunctionComponent, useState } from "react";
import "./DatasetList.scss";
import DatasetGrid from "./DatasetGrid";

type PropsType = {};

type TabNames = "drafts" | "published";

const DatasetList: FunctionComponent<PropsType> = props => {
    const [activeTab, setActiveTab] = useState<TabNames>("drafts");
    return (
        <div className="dataset-list-container">
            <div className="dataset-list-inner-container row">
                <div className="dataset-list-header">
                    <div className="dataset-type-tab">
                        <a
                            className={`${
                                activeTab === "drafts" ? "active" : ""
                            }`}
                            onClick={() => setActiveTab("drafts")}
                        >
                            Drafts &nbsp;{" "}
                        </a>
                        <a
                            className={`${
                                activeTab === "published" ? "active" : ""
                            }`}
                            onClick={() => setActiveTab("published")}
                        >
                            Published &nbsp;{" "}
                        </a>
                    </div>
                    <input type="text" placeholder="Search datasets" />
                </div>
                <div className="dataset-list-body">
                    <DatasetGrid />
                </div>
            </div>
        </div>
    );
};

export default DatasetList;
