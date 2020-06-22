import React, { FunctionComponent } from "react";

import "./SupercedeSelectionBox.scss";
import { Distribution } from "Components/Dataset/Add/DatasetAddCommon";

import DatasetFile from "Components/Dataset/Add/DatasetFile";
import { Draggable, Droppable } from "react-drag-and-drop";
import { ReactComponent as DismissIcon } from "assets/dismiss.svg";

type PropsType = {
    existingDistributions: Distribution[];
    newDistributions: Distribution[];
    deleteDistributionHandler: (dist: string) => () => Promise<void>;
    editDistributionHandler: (
        distId: string
    ) => (updater: (distribution: Distribution) => Distribution) => void;
};

const SupercedeSelectionBox: FunctionComponent<PropsType> = (props) => {
    const { existingDistributions, newDistributions } = props;
    const assignedDistributions = newDistributions.filter(
        (item) => item.replaceDistId
    );
    const unassignedDistributions = newDistributions.filter(
        (item) => !item.replaceDistId
    );

    return (
        <div className="distribution-supercede-selection-box">
            <table>
                <thead>
                    <tr>
                        <th>Existing content</th>
                        <th>Replacement content</th>
                    </tr>
                </thead>
                <tbody>
                    {existingDistributions.map((item, idx) => {
                        const assignedDist = assignedDistributions.find(
                            (item) => item.id === item.id
                        );
                        return (
                            <tr key={idx}>
                                <td>
                                    <DatasetFile file={item} />
                                </td>
                                <td>
                                    {assignedDist ? (
                                        <div className="assigned-distribution">
                                            <DatasetFile file={assignedDist} />
                                            <DismissIcon
                                                onClick={() => {
                                                    props.editDistributionHandler(
                                                        assignedDist.id!
                                                    )((dist) => ({
                                                        ...dist,
                                                        replaceDistId: undefined
                                                    }));
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <Droppable
                                            types={["distribution"]}
                                            onDrop={({
                                                distribution: distId
                                            }) => {
                                                props.editDistributionHandler(
                                                    distId
                                                )((dist) => ({
                                                    ...dist,
                                                    replaceDistId: item.id
                                                }));
                                            }}
                                        >
                                            <div className="dropable-area"></div>
                                        </Droppable>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <div className="new-files-area">
                <div className="heading">Your new content:</div>
                <Droppable
                    types={["distribution"]}
                    onDrop={({ distribution: distId }) => {
                        props.editDistributionHandler(distId)((dist) => ({
                            ...dist,
                            replaceDistId: undefined
                        }));
                    }}
                >
                    <div className="new-file-items-area row">
                        {unassignedDistributions.map((item, idx) => (
                            <div
                                className="col-xs-6 dataset-add-files-fileListItem"
                                key={idx}
                            >
                                <Draggable type="distribution" data={item.id}>
                                    <DatasetFile file={item} />
                                </Draggable>
                            </div>
                        ))}
                    </div>
                </Droppable>
            </div>
        </div>
    );
};

export default SupercedeSelectionBox;
