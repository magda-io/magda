import AuthDecisionQueryClient, {
    AuthDecisionReqConfig
} from "../opa/AuthDecisionQueryClient";
import AuthDecision from "../opa/AuthDecision";
import sinon from "sinon";

type AuthDecisionRequestHandler = (
    config: AuthDecisionReqConfig,
    jwtToken?: string
) => Promise<AuthDecision>;

export type MockAuthDecisionClientConfig =
    | AuthDecision
    | AuthDecisionRequestHandler;

function createMockAuthDecisionQueryClient(
    authDecisionOrHandler: MockAuthDecisionClientConfig
): AuthDecisionQueryClient {
    const authClient = sinon.createStubInstance(AuthDecisionQueryClient);
    if (typeof authDecisionOrHandler === "function") {
        authClient.getAuthDecision.callsFake(authDecisionOrHandler);
    } else {
        authClient.getAuthDecision.returns(authDecisionOrHandler);
    }
    return authClient;
}

export default createMockAuthDecisionQueryClient;
