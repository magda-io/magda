import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './DataPreviewMapOpenInNationalMapButton.css';

class DataPreviewMapOpenInNationalMapButton extends Component {

    constructor(props){
        super(props);
        this.state = {
            isInitLoading : true,
            isMapPreviewAvailable : false,
            selectedDistribution : null
        }
        this.onPostMessageReceived = this.onPostMessageReceived.bind(this);
        this.winRef = null;
    }
    
    componentWillUnmount(){
        if(this.winRef){
            this.winRef.removeEventListener("message", this.onPostMessageReceived);
            this.winRef = null;
        }
    }

    createCatalogItemFromDistribution(){
        return {
            "initSources": [
                {
                    "catalog": [
                        {
                            "name": this.props.distribution.title,
                            "type": "magda-item",
                            "url": "http://magda-dev.terria.io/",
                            "distributionId": this.state.selectedDistribution.identifier,
                            "isEnabled": true,
                            "zoomOnEnable": true
                        }
                    ],
                    "baseMapName": "Positron (Light)"
                }
            ]
        };
    }

    onButtonClick(){
        if(!this.props.distribution) alert("");
        console.log(this.props.distribution);
        const newWinRef = window.open("https://nationalmap.gov.au/","National Map Australia");
        if(!newWinRef) {
            alert("The popup is blocked by popup blocker. Please chaneg your browser settings and try again.");
            return;
        }
        if(this.winRef){
            this.winRef.removeEventListener("message", this.onPostMessageReceived);
        }
        this.winRef=newWinRef;
        this.winRef.addEventListener("message", this.onPostMessageReceived);

    }

    onPostMessageReceived(e){
        if(this.winRef !== e.source || e.data !== 'ready') return;
        this.winRef.postMessage(this.createCatalogItemFromDistribution(),"*");
    }

    render(){
        return (
            <div style={this.props.style}>
                <button className="open-in-national-map-button" onClick={()=>this.onButtonClick()}>
                    <div className="rectangle-2"></div>
                    <div className="rectangle-1"></div>
                    <div className="open-national-map-button-text">Open In National Map</div>
                </button>
            </div>
        );
    }
}

DataPreviewMapOpenInNationalMapButton.propTypes = {
    distribution: PropTypes.object.isRequired
};

DataPreviewMapOpenInNationalMapButton.defaultProps = {
    distribution: null
};

export default DataPreviewMapOpenInNationalMapButton;