import React, { FunctionComponent, useState } from "react";
import "./DatasetList.scss";
import DatasetGrid from "./DatasetGrid";
import { DatasetTypes } from "api-clients/RegistryApis";
import { ReactComponent as DismissIcon } from "assets/dismiss.svg";
import { ReactComponent as SearchIcon } from "assets/search-dark.svg";
import "../../../rsuite.scss";
import ConfirmDialog from "../../Settings/ConfirmDialog";
import Button from "rsuite/Button";
import { BsPlusCircleFill } from "react-icons/bs";
import openWindow from "helpers/openWindow";
import { useHistory } from "react-router-dom";

type PropsType = {
    openInPopUp?: boolean;
};

type TabNames = DatasetTypes;

/* eslint-disable jsx-a11y/anchor-is-valid */
const DatasetList: FunctionComponent<PropsType> = (props) => {
    const [activeTab, setActiveTab] = useState<TabNames>("drafts");
    const [searchText, setSearchText] = useState<string>("");
    const [inputText, setInputText] = useState<string>("");
    const { openInPopUp } = props;
    const history = useHistory();

    return (
        <div className="dataset-list-container">
            <ConfirmDialog />
            <Button
                className="create-new-dataset-button"
                appearance="primary"
                onClick={() => {
                    if (openInPopUp) {
                        openWindow("/dataset/add/metadata?popup=true");
                    } else {
                        history.push("/dataset/add/metadata");
                    }
                }}
            >
                <BsPlusCircleFill /> Create new dataset
            </Button>
            <div className="dataset-list-inner-container row">
                <div className="dataset-list-header">
                    <div className="dataset-type-tab">
                        <a
                            aria-label="draft dataset"
                            className={`${
                                activeTab === "drafts" ? "active" : ""
                            }`}
                            onClick={() => setActiveTab("drafts")}
                        >
                            Drafts
                        </a>
                        <a
                            aria-label="published dataset"
                            className={`${
                                activeTab === "published" ? "active" : ""
                            }`}
                            onClick={() => setActiveTab("published")}
                        >
                            Published
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
                        openInPopUp={props.openInPopUp}
                    />
                </div>
            </div>
        </div>
    );
};
/* eslint-enable jsx-a11y/anchor-is-valid */

export default DatasetList;
