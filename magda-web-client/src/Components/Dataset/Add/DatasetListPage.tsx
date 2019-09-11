import React from "react";
import { Link } from "react-router-dom";

/**
 * Design infers the home page.
 * I made it into a separate page for now.
 * Maybe this can turn into a component that is visible on homepage
 */
class DatasetListPage extends React.Component<any, any> {
    render() {
        const datasets: any[] = [];
        for (const [id, dataset] of Object.entries(localStorage)) {
            if (id.match(/^magda-ds-/)) {
                try {
                    datasets.push({
                        id,
                        dataset: JSON.parse(dataset)
                    });
                } catch (e) {}
            }
        }

        return (
            <div className="container-fluid">
                <div className="row">
                    <div className="col-xs-12">
                        <h1>Your data</h1>
                    </div>
                </div>

                <div className="row">
                    <div className="col-xs-12 col-sm-6 col-lg-4">
                        <Link to="/dataset/add">
                            <a>
                                <h3>Add a dataset to your catalogue</h3>
                            </a>
                        </Link>
                        <p>
                            Get your data off your harddrive and out in the wold
                            where others can find it too by using our quick data
                            publishing tools.
                        </p>
                    </div>
                </div>

                <div className="row">
                    <div className="col-xs-12">
                        <h2>Your draft datasets</h2>
                        <table style={{ width: "100%" }}>
                            <tbody>
                                {datasets.map(dataset => {
                                    return (
                                        <tr>
                                            <td>
                                                <Link
                                                    to={`add/files/${
                                                        dataset.id
                                                    }`}
                                                >
                                                    <a>
                                                        {dataset.dataset &&
                                                        dataset.dataset
                                                            .dataset &&
                                                        dataset.dataset.dataset
                                                            .title
                                                            ? dataset.dataset
                                                                  .dataset.title
                                                            : dataset.id}
                                                    </a>
                                                </Link>
                                            </td>
                                            <td>
                                                Created{" "}
                                                {dataset.dataset._createdDate}
                                            </td>
                                            <td>
                                                Last Modified{" "}
                                                {
                                                    dataset.dataset
                                                        ._lastModifiedDate
                                                }
                                            </td>
                                            <td>
                                                {dataset.dataset.files.length}{" "}
                                                file(s)
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }
}

export default DatasetListPage;
