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
import TooltipWrapper from "Components/Common/TooltipWrapper";
import helpIcon from "assets/help.svg";
import getAccessLevelDesc from "./getAccessLevelDesc";
import Toggle from "rsuite/Toggle";

type PropsType = {
    accessLevel?: string;
    orgUnitId?: string;
    custodianOrgUnitId?: string;
    managingOrgUnitId?: string;
    constraintExemption: boolean;
    editAccessLevel: (newValue: any) => void;
    editOrgUnitId: (newValue: any) => void;
    editConstraintExemption: (newValue: boolean) => void;
};

const DatasetAccessSettings: FunctionComponent<PropsType> = (props) => {
    const userOrgUnit = useSelector<any, OrgUnit | undefined>(
        (state) => state?.userManagement?.user?.orgUnit
    );
    const {
        constraintExemption,
        custodianOrgUnitId,
        managingOrgUnitId,
        editAccessLevel,
        editOrgUnitId,
        editConstraintExemption
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

    const options: Record<string, any> = {};

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
            <div style={{ position: "relative" }}>
                <Placeholder.Paragraph rows={8} />
                <Loader center content="loading" />
            </div>
        );
    } else {
        return (
            <div className="question-who-can-see-dataset">
                <h4 className="with-icon">
                    <span>
                        Who can see the dataset once it is published? (*)
                    </span>
                </h4>
                <div className="input-area">
                    <AlwaysEditor
                        value={props?.accessLevel}
                        onChange={(value) => {
                            editAccessLevel(value);
                            if (value === "custodian") {
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
                <h4>
                    <span>Mark your dataset as a "public" dataset? (*)</span>

                    <span className="tooltip-container">
                        <TooltipWrapper
                            className="tooltip no-print"
                            launcher={() => (
                                <div className="tooltip-launcher-icon help-icon">
                                    <img
                                        src={helpIcon}
                                        alt="More information on this option, click for more information"
                                    />
                                </div>
                            )}
                            innerElementClassName="inner"
                            innerElementStyles={{
                                textAlign: "left",
                                zIndex: 1000
                            }}
                        >
                            {() => (
                                <>
                                    Please note: <br />
                                    <br />
                                    This option will publish your dataset as a
                                    "public" dataset. <br />
                                    <br />
                                    i.e. everyone has "published dataset read"
                                    permission (with/without any constraints)
                                    will be able to see your dataset. <br />
                                    <br />
                                    e.g. People who are only allowed to see
                                    datasets within their own organization can
                                    now see your dataset even if your dataset
                                    doesn't belong to their organization.
                                    <br />
                                    <br />
                                    The system administrator can still restrict
                                    the access to the "public" dataset for
                                    people with certain roles (e.g. anonymous
                                    users) by explicitly setting
                                    "allow_exemption" field of the "published
                                    dataset read" permission to `false` to
                                    prevent any constraints from being exempted.
                                    <br />
                                    <br />
                                    In this way, people who are only allowed to
                                    see datasets within their own organization
                                    won't be able to see your "public" dataset
                                    unless the "public" dataset does belong to
                                    their organization.
                                </>
                            )}
                        </TooltipWrapper>
                    </span>
                </h4>
                <div className="input-area">
                    <ToolTip>
                        We recommend you mark your data as a "public" dataset to
                        help prevent data silos.
                    </ToolTip>
                    <div>
                        <Toggle
                            size="lg"
                            checkedChildren="Public dataset"
                            unCheckedChildren="Non-public dataset"
                            checked={constraintExemption}
                            onChange={editConstraintExemption}
                        />
                    </div>
                </div>
            </div>
        );
    }
};

export default DatasetAccessSettings;
