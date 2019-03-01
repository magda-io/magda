import React from "react";
import AsyncComponent from "../../AsyncComponent";

const innerModule = () => import("./NewDataset").then(module => module.default);

export default class NewDatasetLoader extends React.Component {
    render() {
        return (
            <AsyncComponent importComponent={innerModule}>
                {Inner => {
                    if (Inner) {
                        return <Inner />;
                    } else {
                        return "Loading...";
                    }
                }}
            </AsyncComponent>
        );
    }
}
