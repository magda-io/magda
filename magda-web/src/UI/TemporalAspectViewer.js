import React, { Component } from 'react';
class TemporalAspectViewer extends Component {
    renderTable(rows){
        return  (<table className='table'>
                    <tbody>
                            <tr>
                                <th>End</th>
                                <th>Start</th>
                            </tr>
                    {
                        rows.map((r)=>
                        <tr key={r}>
                            <td className='' >{new Date(r.end).toLocaleString()}</td>
                            <td className='' key={'start'}>{new Date(r.start).toLocaleString()}</td></tr>
                        )
                    }
                    </tbody>
                </table>)
    }
    render(){
        const rows = this.props.data ? this.props.data.intervals : [];
        return (<div className='temporal-aspect-viewer white-box'>
                    {rows.length > 0 && this.renderTable(rows)}
                    {rows.length === 0 && <div>No data available</div>}
                </div>)
    }
}


export default TemporalAspectViewer;
