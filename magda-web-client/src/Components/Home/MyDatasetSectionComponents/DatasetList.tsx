import React, { FunctionComponent, useState } from "react";
import "./DatasetList.scss";
import DatasetGrid, { DatasetTypes } from "./DatasetGrid";
import dismissIcon from "assets/dismiss.svg";
import searchIcon from "assets/search-dark.svg";

type PropsType = {};

type TabNames = DatasetTypes;

const DatasetList: FunctionComponent<PropsType> = (props) => {
    const [activeTab, setActiveTab] = useState<TabNames>("drafts");
    const [searchText, setSearchText] = useState<string>("");
    const [inputText, setInputText] = useState<string>("");

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
                    <div className="search-box-wrapper">
                        <input
                            type="text"
                            placeholder="Search datasets"
                            value={inputText}
                            onChange={(e) => {
                                setInputText(
                                    (e.target as HTMLInputElement).value
                                );
                            }}
                            onKeyUp={(e) => {
                                const selectedString = (e.target as HTMLInputElement).value.trim();
                                if (e.keyCode === 13) {
                                    setSearchText(selectedString);
                                }
                            }}
                        />
                        {searchText ? (
                            <img
                                className="clear-search-icon"
                                src={dismissIcon}
                                onClick={() => {
                                    setInputText("");
                                    setSearchText("");
                                }}
                            />
                        ) : (
                            <img className="search-icon" src={searchIcon} />
                        )}
                    </div>
                </div>
                <div className="dataset-list-body">
                    <DatasetGrid
                        key={`tab:${activeTab}|searchtext:${searchText}`}
                        searchText={searchText}
                        datasetType={activeTab}
                    />
                </div>
            </div>
        </div>
    );
};

export default DatasetList;
