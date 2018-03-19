import React from "react";
import Container from "muicss/lib/react/container";
import { withRouter } from "react-router-dom";
import Header from "../Components/Header/Header";
import SearchBox from "../Components/SearchBox/SearchBox";
import { config } from "../config.js";
import "./HomePage.css";

import TagLine from "./HomePageComponents/TagLine";
import Lozenge from "./HomePageComponents/Lozenge";
import Stories from "./HomePageComponents/Stories";
import {Small, Medium} from '../UI/Responsive';

import MediaQuery from "react-responsive";

const getBgImg=()=>{
    let imageMap = {};
    if(!config.homePageConfig || !config.homePageConfig.backgroundImageUrls) return null;
    const backgroundImageUrls = config.homePageConfig.backgroundImageUrls;
    if(!backgroundImageUrls.length) return null;
    const baseUrl = config.homePageConfig.baseUrl ? config.homePageConfig.baseUrl : "";

    backgroundImageUrls.forEach(item=>{
        let width;
        try{
            width = parseInt(item.replace(/[^\d]/g,""),10);
            if(isNaN(width)) width=0;
        }catch(e){
            width=0;
        }

        imageMap = Object.assign(imageMap, {[width]: baseUrl+item});
    });

    const screenSizes = Object.keys(imageMap);

    function getBackgroundImage(imageUrl){
      return {
              backgroundImage: 'url(' + imageUrl + ')',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: 'cover',
             }
    }
    return (<div>{screenSizes.map((size, i) => <MediaQuery
                  key={size}
                  minWidth={size + 'px'}
                  maxWidth={i === screenSizes.length - 1 ? null : screenSizes[i+1] + 'px'}>
                  <div className='homepage-background-img'
                       style={getBackgroundImage(imageMap[size])}/>
                 </MediaQuery>)}</div>);
};

const getTagLine = ()=>{
  const homePageConfig = config.homePageConfig;
  return {
            desktop: config && homePageConfig.tagLineTextDesktop ? homePageConfig.tagLineTextDesktop : '',
            mobile: config && homePageConfig.tagLineTextMobile ? homePageConfig.tagLineTextMobile : ''
          }
}

const HomePage = withRouter(({ location }) => {
  
    return (
        <div className="homepage-app-container">
            {getBgImg()}
            <Container className="app-container">
                <Header/>
                <Small><TagLine taglineText = {getTagLine().mobile}/></Small>
                <SearchBox />
                <Medium><TagLine taglineText = {getTagLine().desktop}/></Medium>
                <Lozenge />
                <Stories />
            </Container>
        </div>
    );
});

export default HomePage;
