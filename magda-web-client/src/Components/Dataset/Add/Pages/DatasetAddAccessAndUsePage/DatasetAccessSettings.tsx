import React, { FunctionComponent } from "react";
import { useSelector } from "react-redux";
import { useAsync } from "react-async-hook";
import ToolTip from "Components/Dataset/Add/ToolTip";
import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { codelistRadioEditor } from "Components/Editing/Editors/codelistEditor";
import "./DatasetAccessSettings.scss";
import { OrgUnit } from "reducers/userManagementReducer";
import { getOrgUnitById } from "api-clients/OrgUnitApis";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import OrgUnitDropDown from "../../OrgUnitDropDown";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import getAccessLevelDesc from "./getAccessLevelDesc";

const Paragraph = Placeholder.Paragraph;

type PropsType = {
    accessLevel?: string;
    orgUnitId?: string;
    custodianOrgUnitId?: string;
    managingOrgUnitId?: string;
    editAccessLevel: (newValue: any) => void;
    editOrgUnitId: (newValue: any) => void;
};

const DatasetAccessSettings: FunctionComponent<PropsType> = (props) => {
    const userOrgUnit = useSelector<any, OrgUnit | undefined>(
        (state) => state?.userManagement?.user?.orgUnit
    );
    const {
        custodianOrgUnitId,
        managingOrgUnitId,
        editAccessLevel,
        editOrgUnitId
    } = props;

    const { result, loading, error } = useAsync(
        async (custodianOrgUnitId?: string, managingOrgUnitId?: string) => {
            try {
                const custodianOrgUnit = custodianOrgUnitId
                    ? await getOrgUnitById(custodianOrgUnitId)
                    : undefined;
                const managingOrgUnit = managingOrgUnitId
                    ? await getOrgUnitById(managingOrgUnitId)
                    : undefined;

                return { custodianOrgUnit, managingOrgUnit };
            } catch (e) {
                toaster.push(
                    <Notification
                        type={"error"}
                        closable={true}
                        header="Error"
                    >{`Failed to retrieve org unit info: ${e}`}</Notification>,
                    {
                        placement: "topEnd"
                    }
                );
                throw e;
            }
        },
        [custodianOrgUnitId, managingOrgUnitId]
    );

    const { custodianOrgUnit, managingOrgUnit } = (result ? result : {}) as any;

    const options: Record<string, any> = {
        organization: getAccessLevelDesc("organization")
    };

    if (custodianOrgUnit?.id) {
        options["custodian"] = getAccessLevelDesc(
            "custodian",
            custodianOrgUnit?.name
        );
    }

    if (managingOrgUnit?.id) {
        options["team"] = getAccessLevelDesc("team", managingOrgUnit?.name);
    }

    if (userOrgUnit?.id) {
        options["creatorOrgUnit"] = getAccessLevelDesc(
            "creatorOrgUnit",
            userOrgUnit?.name
        );
    }

    options["selectedOrgUnit"] = getAccessLevelDesc("selectedOrgUnit");

    if (loading) {
        return (
            <Paragraph rows={8}>
                <Loader center content="loading" />
            </Paragraph>
        );
    } else {
        return (
            <div className="question-who-can-see-dataset">
                <h4 className="with-icon">
                    <span>Who can see the dataset once it is published?</span>
                </h4>
                <div className="input-area">
                    <ToolTip>
                        We recommend you publish your data to everyone in your
                        organisation to help prevent data silos.
                    </ToolTip>
                    <div>
                        <AlwaysEditor
                            value={props?.accessLevel}
                            onChange={(value) => {
                                editAccessLevel(value);
                                if (value === "organization") {
                                    editOrgUnitId(undefined);
                                } else if (value === "custodian") {
                                    editOrgUnitId(custodianOrgUnitId);
                                } else if (value === "team") {
                                    editOrgUnitId(managingOrgUnitId);
                                } else if (value === "creatorOrgUnit") {
                                    editOrgUnitId(userOrgUnit?.id);
                                }
                            }}
                            editor={codelistRadioEditor(
                                "dataset-publishing-access-level",
                                options,
                                false
                            )}
                        />
                    </div>
                </div>
                {props?.accessLevel === "selectedOrgUnit" ? (
                    <>
                        <h4 className="with-icon">
                            <span>
                                Please select the organizational unit that you
                                wish to share:{" "}
                            </span>
                        </h4>
                        <OrgUnitDropDown
                            orgUnitId={props.orgUnitId}
                            onChange={editOrgUnitId}
                        />
                    </>
                ) : null}
            </div>
        );
    }
};

export default DatasetAccessSettings;
