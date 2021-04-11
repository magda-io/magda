import React, { FunctionComponent, useState } from "react";
import "./DatasetList.scss";
import DatasetGrid from "./DatasetGrid";
import { DatasetTypes } from "api-clients/RegistryApis";
import { ReactComponent as DismissIcon } from "assets/dismiss.svg";
import { ReactComponent as SearchIcon } from "assets/search-dark.svg";
import useDatasetCount from "./useDatasetCount";

type PropsType = {
    userId: string;
};

type TabNames = DatasetTypes;

/* eslint-disable jsx-a11y/anchor-is-valid */
const DatasetList: FunctionComponent<PropsType> = (props) => {
    const [activeTab, setActiveTab] = useState<TabNames>("drafts");
    const [searchText, setSearchText] = useState<string>("");
    const [inputText, setInputText] = useState<string>("");

    const {
        result: draftCount,
        loading: draftCountIsLoading,
        error: draftCountError
    } = useDatasetCount("drafts", searchText, props.userId);

    const {
        result: publishedCount,
        loading: publishedCountIsLoading,
        error: publishedCountError
    } = useDatasetCount("published", searchText, props.userId);

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
                            Drafts &nbsp;
                            <span className="dataset-count-info">
                                {!draftCountIsLoading && !draftCountError
                                    ? draftCount
                                    : null}
                            </span>
                        </a>
                        <a
                            className={`${
                                activeTab === "published" ? "active" : ""
                            }`}
                            onClick={() => setActiveTab("published")}
                        >
                            Published &nbsp;
                            <span className="dataset-count-info">
                                {!publishedCountIsLoading &&
                                !publishedCountError
                                    ? publishedCount
                                    : null}
                            </span>
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
                            <DismissIcon
                                aria-label="reset search text"
                                className="clear-search-icon"
                                onClick={() => {
                                    setInputText("");
                                    setSearchText("");
                                }}
                            />
                        ) : (
                            <SearchIcon
                                className="search-icon"
                                aria-label="search icon"
                            />
                        )}
                    </div>
                </div>
                <div className="dataset-list-body">
                    <DatasetGrid
                        key={`tab:${activeTab}|searchtext:${searchText}`}
                        searchText={searchText}
                        datasetType={activeTab}
                        userId={props.userId}
                        datasetCount={
                            activeTab === "drafts" ? draftCount : publishedCount
                        }
                        datasetCountIsLoading={
                            activeTab === "drafts"
                                ? draftCountIsLoading
                                : publishedCountIsLoading
                        }
                        datasetCountError={
                            activeTab === "drafts"
                                ? draftCountError
                                : publishedCountError
                        }
                    />
                </div>
            </div>
        </div>
    );
};
/* eslint-enable jsx-a11y/anchor-is-valid */

export default DatasetList;
