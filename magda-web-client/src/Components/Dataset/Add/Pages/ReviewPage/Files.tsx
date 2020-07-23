import React, { FunctionComponent } from "react";
import CollapseBox from "./CollapseBox";
import CollapseItem from "./CollapseItem";

import { State } from "../../DatasetAddCommon";

import { getFormatIcon } from "../../../View/DistributionIcon";

import humanFileSize from "helpers/humanFileSize";
import * as codelists from "constants/DatasetConstants";

import flatMap from "lodash/flatMap";
import moment from "moment";

import "./Files.scss";

type PropsType = {
    stateData: State;
};

const Files: FunctionComponent<PropsType> = (props) => {
    const { distributions } = props.stateData;

    return (
        <CollapseBox
            heading="Dataset files and services"
            stepNum={0}
            className="dataset-files-and-services"
        >
            <div className="row">
                <div className="col-sm-3">
                    <div className="title-box">Files:</div>
                    <div className="description-box">
                        This dataset is comprised of the following files or
                        URLs:
                    </div>
                </div>
                <div className="col-sm-9 content-box">
                    {distributions?.length
                        ? flatMap(distributions, (item) => [
                              <CollapseItem
                                  key={`collapsed-item-${item.id}`}
                                  showWhenCollapse={true}
                                  className="row distribution-item"
                              >
                                  <div className="col-sm-8 file-title">
                                      <img
                                          alt="format icon"
                                          className="file-icon"
                                          src={getFormatIcon(item)}
                                      />
                                      <div>
                                          {item.title} (
                                          {item?.byteSize
                                              ? humanFileSize(
                                                    item.byteSize,
                                                    true
                                                )
                                              : codelists.NO_VALUE_LABEL}
                                          )
                                      </div>
                                  </div>
                                  <div className="col-sm-4">{item.format}</div>
                              </CollapseItem>,
                              <CollapseItem
                                  className="row distribution-item"
                                  key={`uncollapsed-item-${item.id}`}
                              >
                                  <div className="col-sm-12">
                                      <div className="file-title">
                                          {item.title}
                                      </div>
                                      <div className="file-format">
                                          Format(*): {item.format}
                                      </div>
                                      <div className="file-format">
                                          Size:{" "}
                                          {item?.byteSize
                                              ? humanFileSize(
                                                    item.byteSize,
                                                    true
                                                )
                                              : codelists.NO_VALUE_LABEL}
                                      </div>
                                      <div className="file-last-modifed">
                                          Last Modified:{" "}
                                          {item?.modified
                                              ? moment(item.modified).format(
                                                    "DD/MM/YYYY"
                                                )
                                              : codelists.NO_VALUE_LABEL}
                                      </div>
                                      <div className="file-description">
                                          File description:{" "}
                                          {item?.description
                                              ? item.description
                                              : codelists.NO_VALUE_LABEL}
                                      </div>
                                  </div>
                              </CollapseItem>
                          ]).filter((item) => item)
                        : "No files are included."}
                </div>
            </div>
        </CollapseBox>
    );
};

export default Files;
