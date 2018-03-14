import React from "react";
import Container from "muicss/lib/react/container";
import { withRouter } from "react-router-dom";
import Header from "../Components/Header/Header";
import SearchBox from "../Components/SearchBox/SearchBox";
import Home from "../Components/Home";
//import { config } from "../../config.js";

const HomePage = withRouter(({ location }) => {
    return (
        <Container className="app-container">
            <Header/>
            <SearchBox />
            <Home location={location} />
        </Container>
    );
});

export default HomePage;
