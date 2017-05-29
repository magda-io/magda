// @flow
import React, { Component } from 'react';
import { Link } from 'react-router';
import './Statistics.css';



export default function Statistics(props: Object){
  return (
    <div className="white-box statistics">
      <div className="inner">
  
          <ul className="list-unstyled">
              <li>
                  <strong><span title="49,911">49.9k</span></strong>
                  discoverable datasets
              </li>
              <li>
                  <strong><span title="9,052">9k</span></strong>
                  API enabled resources
              </li>
              <li>
                  <strong><span title="36,926">36.9k</span></strong>
                  openly licenced datasets
              </li>
              <li>
                  <strong><span>25</span></strong>
                  unpublished datasets
              </li>
          </ul>
      </div>
  </div>
  )
}
