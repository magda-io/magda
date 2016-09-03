import Filter from './Filter';
import React from 'react'
import L from 'leaflet';
import ozStates from '../dummyData/ozStates';
import '../../node_modules/leaflet/dist/leaflet.css';
import JurisdictionMap from './JurisdictionMap';

class FilterJurisdiction extends Filter {
    constructor(props) {
        super(props);
        this.map = undefined;
        this.layer = undefined;
        this.closePopUp = this.closePopUp.bind(this);
        this.state={
            popUpIsOpen: false
        }
    }

    componentDidMount(){
        let that = this;
        let statesData = ozStates()[this.props.location.query.jurisdiction];

        this.map = L.map(this._c);
        this.map.setView([-27, 133], 3);

        L.tileLayer('http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(this.map);

        this.map.doubleClickZoom.disable();
        this.map.scrollWheelZoom.disable();
        this.map.boxZoom.disable();
        this.map.touchZoom.disable();
        this.map.keyboard.disable();
        this.map.dragging.disable();
        this.layer = L.geoJson(statesData).addTo(this.map);

        // temp
        this.map.on('click', function(e) {
            that.setState({
                popUpIsOpen: true
            });
        });
    }

    closePopUp(){
        this.setState({
                popUpIsOpen: false
        });
    }

    resetFilter(){
        super.resetFilter();
        this.map.removeLayer(this.layer);
    }

    componentWillReceiveProps(){
        // could check if update is required
        this.map.removeLayer(this.layer);
        let statesData = ozStates()[this.props.location.query.jurisdiction];
        this.layer = L.geoJson(statesData).addTo(this.map);
    }

    componentWillUnmount(){
        this.map.remove();
    }

    render(){
        return (
            <div className='filter jurisdiction'>
              <div className='clearfix filter-header'>
                <h4 className='filter-title'>{this.props.title}</h4>
                <button type='button' className='btn btn-reset' onClick={this.resetFilter} >Reset</button>
              </div>
              <div className='map' ref={(c) => this._c = c}/>
              {this.state.popUpIsOpen && <JurisdictionMap title='jurisdiction'
                                             id='jurisdiction'
                                             location={this.props.location}
                                             updateQuery={this.props.updateQuery}
                                             closePopUp={this.closePopUp}/>}
            </div>
      );
    }
}

export default FilterJurisdiction;
