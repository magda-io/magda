import React, { FunctionComponent, useEffect, useState } from "react";
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
import { useHistory, Link, useLocation } from "react-router-dom";
import { Location } from "history";
import urijs from "urijs";
import { getUrlWithPopUpQueryString } from "helpers/popupUtils";

type PropsType = {
    openInPopUp?: boolean;
};

type TabNames = DatasetTypes;

const DEFAULT_TAB_NAME = "drafts";

/* eslint-disable jsx-a11y/anchor-is-valid */
const DatasetList: FunctionComponent<PropsType> = (props) => {
    function getTabName(loc: Location) {
        const uri = urijs(loc.pathname);
        const segments = uri.segmentCoded();
        if (!segments?.length) {
            return DEFAULT_TAB_NAME;
        }
        const lastSegment = segments.pop();
        if (lastSegment === "published") {
            return "published";
        } else {
            return DEFAULT_TAB_NAME;
        }
    }

    const history = useHistory();
    const location = useLocation();
    const [activeTab, setActiveTab] = useState<TabNames>(getTabName(location));
    const [searchText, setSearchText] = useState<string>("");
    const [inputText, setInputText] = useState<string>("");
    const { openInPopUp } = props;

    useEffect(() => {
        const unregister = history.listen((loc) => {
            const tabName = getTabName(loc);
            setActiveTab(tabName);
        });
        return unregister;
    });

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
                        <Link
                            aria-label="draft dataset"
                            className={`${
                                activeTab === "drafts" ? "active" : ""
                            }`}
                            to={getUrlWithPopUpQueryString(
                                "/settings/datasets/draft"
                            )}
                        >
                            Drafts
                        </Link>
                        <Link
                            aria-label="published dataset"
                            className={`${
                                activeTab === "published" ? "active" : ""
                            }`}
                            to={getUrlWithPopUpQueryString(
                                "/settings/datasets/published"
                            )}
                        >
                            Published
                        </Link>
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
