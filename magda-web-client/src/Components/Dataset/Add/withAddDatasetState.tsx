import React, { useEffect, useState } from "react";
import { RouterProps, withRouter } from "react-router-dom";

import { loadState, State } from "./DatasetAddCommon";

type Props = { initialState: State } & RouterProps;

export default <T extends Props>(Component: React.ComponentType<T>) =>
    withRouter((props: T) => {
        const [state, updateData] = useState<State | undefined>(undefined);

        useEffect(() => {
            loadState(props.match.params.dataset).then(state => {
                updateData(state);
            });
        }, []);

        if (state) {
            return <Component {...props} initialState={state} />;
        } else {
            return <div>Loading</div>;
        }
    });
