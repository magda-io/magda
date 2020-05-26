import React from "react";
import ReactJsonTree from "react-json-tree";
import ReactTable from "react-table";
import { config } from "../config";
class ApiViewer extends React.Component {
    constructor(props) {
        super(props);
        this.state = { data: null, hitCount: 0 };
    }
    componentDidMount() {
        fetch(this.props.url, config.credentialsFetchOptions)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                return false;
            })

            .then(json => {
                if (this.props.type === "table") {
                    this.setState({
                        data: json.options,
                        hitCount: json.hitCount
                    });
                } else {
                    this.setState({
                        data: json
                    });
                }
            });
    }

    render() {
        if (this.props.type === "table") {
            const columns = [
                {
                    Header: "Name",
                    accessor: "value"
                },
                {
                    Header: "hitCount",
                    accessor: "hitCount"
                }
            ];
            return (
                <div>
                    {this.state.data && this.state.data.length > 0 && (
                        <ReactTable
                            filterable
                            data={this.state.data}
                            columns={columns}
                            defaultPageSize={this.state.hitCount}
                            defaultSorted={[
                                {
                                    id: "hitCount",
                                    desc: true
                                }
                            ]}
                            className="-striped -highlight"
                        />
                    )}
                </div>
            );
        } else {
            const theme = {
                scheme: "monokai",
                author: "wimer hazenberg (http://www.monokai.nl)",
                base00: "#272822",
                base01: "#383830",
                base02: "#49483e",
                base03: "#75715e",
                base04: "#a59f85",
                base05: "#f8f8f2",
                base06: "#f5f4f1",
                base07: "#f9f8f5",
                base08: "#f92672",
                base09: "#fd971f",
                base0A: "#f4bf75",
                base0B: "#a6e22e",
                base0C: "#a1efe4",
                base0D: "#66d9ef",
                base0E: "#ae81ff",
                base0F: "#cc6633"
            };
            return (
                <ReactJsonTree
                    data={this.state.data}
                    theme={theme}
                    invertTheme={true}
                />
            );
        }
    }
}

export default ApiViewer;
