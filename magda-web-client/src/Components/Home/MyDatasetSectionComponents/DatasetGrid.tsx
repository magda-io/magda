import React, { FunctionComponent } from "react";
//import { Link } from "react-router-dom";
import editIcon from "assets/edit.svg";
import "./DatasetGrid.scss";

type PropsType = {};

const DatasetGrid: FunctionComponent<PropsType> = props => {
    return (
        <>
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
                                        sadjhsjhgdhsjf jshdgf jsdhf jhsdgf dsjsd
                                    </td>
                                    <td className="date-col">25/02/2020</td>
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
        </>
    );
};

export default DatasetGrid;
