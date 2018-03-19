import React from 'react';

const DatasetQuality = () =>  {

        return (
            <div>
                <h3> HOW WE MEASURE DATA QUALITY </h3>
                <p>
                    We calculate data quality based on open data best practices. For this, we use <a target = "blank" href = "http://5stardata.info/en/">Tim Berners-Lee's
                    open data scale </a>, which is specific enough to be useful but vague enough to be future-proof. It's
                    adopted by many open data portals around the world.
                </p>
                <p>
                    For each of the following points, we add 20% to the data quality rating. These work like building blocks,
                    for a dataset to get 4 stars, it has to meet the first four steps.
                </p>

                <ol>
                    <li> Is the data available on the web in any format with an open license?</li>
                    <li> Is it available as structured data? For example, Excel instead of image scan of a table</li>
                    <li> Is it available in a non-proprietary format? For example, CSV instead of Excel </li>
                    <li> Does the data have URIs to denote things. so that people can point to your stuff? </li>
                    <li> Do you link your data to other data to provide context? </li>                    
                </ol>
                <p>
                    We will continue to update the data quality rating as research continues. If you have any feedback
                    <a href = "mailto:data@pmc.gov.au"> get in touch </a>, or if you're passionate about data quality, get involved in the <a href = "http://linked.data.gov.au/" target = "blank" >Australian
                    Government Linked Data Working Group. </a>
                </p>
            </div>
        )
    }

    export default DatasetQuality;