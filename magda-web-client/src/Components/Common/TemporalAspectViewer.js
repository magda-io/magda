import React, { Component } from "react";
class TemporalAspectViewer extends Component {
    renderTable(rows) {
        return (
            <table className="table">
                <tbody>
                    <tr>
                        <th>Start</th>
                        <th>End</th>
                    </tr>
                    {rows.map((r) => (
                        <tr key={r}>
                            <td className="">
                                {r.start && new Date(r.start).toLocaleString()}
                            </td>
                            <td className="" key={"end"}>
                                {r.end && new Date(r.end).toLocaleString()}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    }
    render() {
        const rows = this.props.data ? this.props.data.intervals : [];
        return (
            <div className="temporal-aspect-viewer white-box">
                {rows.length > 0 && this.renderTable(rows)}
                {rows.length === 0 && <div>No data available</div>}
            </div>
        );
    }
}

export default TemporalAspectViewer;
