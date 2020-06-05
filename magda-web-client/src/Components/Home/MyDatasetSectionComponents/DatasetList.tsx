import React, { FunctionComponent } from "react";
import "./DatasetList.scss";
import editIcon from "assets/edit.svg";

type PropsType = {};

const DatasetList: FunctionComponent<PropsType> = props => {
    return (
        <div className="dataset-list-container">
            <div className="dataset-list-inner-container row">
                <div className="dataset-list-header">
                    <div className="dataset-type-tab">
                        <a className="active">Drafts &nbsp; </a>
                        <a>Published &nbsp; </a>
                    </div>
                    <input type="text" placeholder="Search datasets" />
                </div>
                <div className="dataset-list-body">
                    <table>
                        <thead>
                            <tr>
                                <th>Dataset title</th>
                                <th className="date-col">Update Date</th>
                                <th className="edit-button-col">&nbsp;</th>
                            </tr>
                        </thead>

                        <tbody>
                            {Array(10)
                                .fill(0)
                                .map(item => {
                                    return (
                                        <tr>
                                            <td>
                                                sadjhsjhgdhsjf jshdgf jsdhf
                                                jhsdgf dsjsd
                                            </td>
                                            <td className="date-col">
                                                25/02/2020
                                            </td>
                                            <td className="edit-button-col">
                                                <button className="edit-button">
                                                    <img src={editIcon} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                    <hr className="grid-bottom-divider" />
                    <div className="paging-area">
                        <button className="next-page-button">Next page</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DatasetList;
