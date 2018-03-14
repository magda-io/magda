import React from "react";
import Container from "muicss/lib/react/container";
import { withRouter } from "react-router-dom";
import Header from "../Components/Header/Header";
import SearchBox from "../Components/SearchBox/SearchBox";
import Home from "../Components/Home";
import { config } from "../config.js";
import "./HomePage.css";

import TagLine from "./HomePageComponents/TagLine";
import Lozenge from "./HomePageComponents/TagLine";
import Stories from "./HomePageComponents/Stories";

const getBgImg=()=>{
    if(!config.homePageConfig || !config.homePageConfig.backgroundImageUrls) return null;
    const backgroundImageUrls = config.homePageConfig.backgroundImageUrls;
    if(!backgroundImageUrls.length) return null;
    const baseUrl = config.homePageConfig.baseUrl ? config.homePageConfig.baseUrl : "";
    const imgInfoItems = backgroundImageUrls.map(item=>{
        let width;
        try{
            width = parseInt(item.replace(/[^\d]/g,""),10);
            if(isNaN(width)) width=0;
        }catch(e){
            width=0;
        }
        return {
            url : baseUrl+item,
            width
        }
    });
    const srcset = imgInfoItems.filter(item=>item.width).map(item=>`${item.url} ${item.width}w`).join(", ");
    let sizes;
    if(imgInfoItems.length<=1) sizes = `${imgInfoItems[0].width}px`;
    else sizes = imgInfoItems.slice(1).filter(item=>item.width).map(item=>`(min-width: ${item.width}px) ${item.width}px`).join(", ")+`, ${imgInfoItems[0].width}px`;
    return <img alt="background" className="homepage-background-img" src={imgInfoItems[0].url} sizes={sizes} srcSet={srcset} />;
};

const HomePage = withRouter(({ location }) => {
    return (
        <div className="homepage-app-container">
            {getBgImg()}
            <Container className="app-container">
                <Header/>
                <SearchBox />
                <TagLine />
                <Lozenge />
                <Stories />
                <Home location={location} />
            </Container>
        </div>
    );
});

export default HomePage;
