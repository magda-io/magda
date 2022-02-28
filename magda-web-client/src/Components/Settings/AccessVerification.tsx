import React, { FunctionComponent } from "react";
import { useAsync } from "react-async-hook";
import { config } from "../../config";
import AuthDecisionQueryClient from "@magda/typescript-common/dist/opa/AuthDecisionQueryClient";
import { isTrueEquivalent } from "@magda/typescript-common/dist/opa/AuthDecision";
import Message from "rsuite/Message";

type PropsType = {
    operationUri: string;
};

const authDecisionClient = new AuthDecisionQueryClient(config.authApiUrl);

const AccessVerification: FunctionComponent<PropsType> = (props) => {
    const { operationUri } = props;
    const { result: authDecision, loading: isLoading, error } = useAsync(
        async (operationUri) => {
            return await authDecisionClient.getAuthDecision({
                operationUri
            });
        },
        [operationUri]
    );

    if (isLoading) {
        return null;
    }

    if (error) {
        return (
            <Message
                showIcon
                type="error"
                header="Error"
                closable={true}
                style={{ margin: "5px" }}
            >
                {`Failed to retrieve auth decision: ${error}`}
            </Message>
        );
    }

    if (
        authDecision?.hasResidualRules ||
        isTrueEquivalent(authDecision?.result)
    ) {
        // no matter unconditional true or conditional
        // we should output empty content as the user has certain level access
        return null;
    }

    return (
        <Message
            showIcon
            type="error"
            header="Error"
            closable={true}
            style={{ margin: "5px" }}
        >
            {`You don't have access to this function.`}
        </Message>
    );
};

export default AccessVerification;
