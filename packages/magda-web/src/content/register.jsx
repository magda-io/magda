import StaticPage from "../Components/StaticPage";
// import About from "./markdown/About";
// import SearchSyntax from "./markdown/SearchSyntax";


const createContent = (path, title, component) => ({path, title, component})

export const staticPageRegister = [
    createContent('about', "About magda", StaticPage),
    createContent('search-syntax', "Search Syntax", StaticPage)
];

