import React, { Component } from "react";
// eslint-disable-next-line
import brace from "brace";
// eslint-disable-next-line
import AceEditor from "react-ace";
import LazyJsonTree from "../Components/LazyJsonTree";
import { config } from "../config.js";

import "brace/mode/javascript";
import "brace/theme/github";
import "./AspectBuilder.css";

export default class AspectBuilder extends Component {
    constructor(props) {
        super(props);
        this.state = {
            editor: null,
            code: "",
            activeTab: "json"
        };
        this.onChange = this.onChange.bind(this);
        this.onRunCode = this.onRunCode.bind(this);
        this.onSaveCode = this.onSaveCode.bind(this);
        this.toggleTab = this.toggleTab.bind(this);
    }

    onChange(newValue) {
        this.setState({ code: newValue });
    }

    getEditor() {
        return import("react-ace").then(module => module.default);
    }

    componentWillMount() {
        if (!this.state.editor) {
            this.getEditor().then(editor => {
                this.setState({
                    editor: editor,
                    code: this.props.aspectConfig.builderFunctionString
                });
            });
        }
    }

    onRunCode() {
        this.props.createTransformer(this.state.code);
    }

    onSaveCode() {}

    renderSchema(config) {
        const schema = config.aspectDefinition.jsonSchema;
        return (
            <div>
                <table className="table table-striped">
                    <caption>{schema.description}</caption>
                    <tbody>
                        <tr>
                            <th>Title</th>
                            <th>Description</th>
                            <th>Type</th>
                        </tr>
                        <tr>
                            <td />
                            <td>{schema.title}</td>
                            <td className="code">{schema.type}</td>
                        </tr>
                        {schema.properties &&
                            Object.keys(schema.properties).map(key => (
                                <tr key={key}>
                                    <td>{key}</td>
                                    <td>{schema.properties[key].title}</td>
                                    <td className="code">
                                        {schema.properties[key].type}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        );
    }

    renderResult(dataset, datasetJson) {
        switch (this.state.activeTab) {
            case "json":
                return (
                    <LazyJsonTree
                        data={{ data: dataset }}
                        getComponent={this.props.getComponent}
                    />
                );
            case "ui":
                const datasetJsonEncoded = encodeURIComponent(datasetJson);
                return (
                    <iframe
                        src={`${
                            config.baseUrl
                        }preview/dataset/${datasetJsonEncoded}`}
                        width="100%"
                        height="500px"
                        title="preview-dataset"
                    />
                );
            case "schema":
                return this.renderSchema(this.props.aspectConfig);
            case "doc":
                return "some documentation";
            default:
                return null;
        }
    }

    toggleTab(tabName) {
        this.setState({
            activeTab: tabName
        });
    }

    render() {
        const that = this;
        function getTabClass(tabName) {
            if (tabName === that.state.activeTab) {
                return "active";
            }
        }
        const Editor = that.state.editor;
        return (
            <div className="aspect-builder">
                <div className="actions">
                    <button
                        className="btn btn-primary"
                        onClick={this.onRunCode}
                    >
                        Run
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={this.onSaveCode}
                    >
                        Save
                    </button>
                </div>
                <h3>{this.props.aspectConfig.aspectDefinition.name}</h3>
                {Editor && (
                    <Editor
                        mode="javascript"
                        theme="github"
                        onChange={this.onChange}
                        value={this.state.code}
                        width={"100%"}
                        editorProps={{ $blockScrolling: true }}
                    />
                )}

                <div>
                    <ul className="nav nav-tabs">
                        <li data-toggle="tab" className={getTabClass("json")}>
                            <a onClick={this.toggleTab.bind(this, "json")}>
                                Output
                            </a>
                        </li>
                        <li className={getTabClass("ui")}>
                            <a onClick={this.toggleTab.bind(this, "ui")}>UI</a>
                        </li>
                        <li className={getTabClass("schema")}>
                            <a onClick={this.toggleTab.bind(this, "schema")}>
                                Schema
                            </a>
                        </li>
                        <li className={getTabClass("doc")}>
                            <a onClick={this.toggleTab.bind(this, "doc")}>
                                Documentation
                            </a>
                        </li>
                    </ul>
                    <div className="tab-content">
                        <div id="output" className="tab-pane fade in active">
                            {this.renderResult(
                                this.props.result,
                                this.props.datasetJson
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
