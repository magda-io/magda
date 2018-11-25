//@flow
import React from "react";
import "./AppContainer.css";
import { requestWhoAmI } from "./actions/userManagementActions";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import Account from "./Components/Account/Account";
import SignInRedirect from "./Components/Account/SignInRedirect";
import Connectors from "./Components/Connectors/Connectors";
import ConnectorConfig from "./Components/Connectors/ConnectorConfig";
import SelectDataset from "./Components/Connectors/SelectDataset";
import MagdaDocumentTitle from "./Components/Meta/MagdaDocumentTitle";

import { Route, Link, Switch } from "react-router-dom";

class AppContainer extends React.Component {
    componentWillMount() {
        this.props.requestWhoAmI();
    }
    render() {
        return (
            <MagdaDocumentTitle>
                <div>
                    <ul>
                        <li>
                            <Link to="/">Account</Link>
                        </li>
                        <li>
                            <Link to="/connectors">Connectors</Link>
                        </li>
                    </ul>
                    <main>
                        <Switch>
                            <Route exact path="/account" component={Account} />
                            <Route
                                exact
                                path="/sign-in-redirect"
                                component={SignInRedirect}
                            />
                            <Route
                                exact
                                path="/connectors"
                                component={Connectors}
                            />
                            <Route
                                path="/connectors/:connectorId/:datasetId"
                                component={ConnectorConfig}
                            />
                            <Route
                                path="/connectors/:connectorId"
                                component={SelectDataset}
                            />
                            <Route exact path="/" component={Account} />
                        </Switch>
                    </main>
                </div>
            </MagdaDocumentTitle>
        );
    }
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
    return bindActionCreators(
        {
            requestWhoAmI
        },
        dispatch
    );
};

export default connect(
    null,
    mapDispatchToProps
)(AppContainer);
