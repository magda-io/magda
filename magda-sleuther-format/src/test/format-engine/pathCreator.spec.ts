import {} from 'mocha';
import getPathsAsJson, * as path from "../../format-engine/pathCreator";
import { expect } from 'chai';
import * as sinon from 'sinon';
import { getPathsHelper } from '../../format-engine/pathCreator';

describe("pathCreator", function(this: Mocha.ISuiteCallbackContext){
   
    before(() => {
        sinon.stub(path, "unduplicated").callsFake(function(edges: Edge[]) {
            return edges;
        });
    });
    //unit tests
    describe("buildHierarchyPaths", function() {
        it("returns the correct amount of edges", function() {
            // the amount of edges should be:    n    where n is the total amount of formats in both levels
            //                                     C
            //                                      2
            let edges: Edge[] = path.buildHierarchyPaths(getHierarchyStub()[0], getHierarchyStub()[1]);
            expect(edges.length).to.eql(combinations(7, 2));
        });
    });

    describe("buildFlatPaths", function() {
        it("returns the correct amount of edges", function() {
            let edges: Edge[] = path.buildFlatPaths([
                "html",
                "htm",
                "staticml",
                "staticm"
            ], 1);
    
            expect(edges.length).to.eql(combinations(4, 2));
        });
        
    });

    describe("buildDifferentCategoryPaths", function() {
        it("returns the correct amount of edges", function() {
            let cat1: Edge[] = getDifferentCategoryStub()[1];
            let cat2: Edge[] = getDifferentCategoryStub()[2];

            let combined: Edge[] = path.buildDifferentCategoryPaths(cat1, cat2);
            expect(combined.length).to.eql(combinations(7, 2));
        });

    });

    describe("unduplicated", function() {

    });

    describe("overwriteEdge", function() {

    });

    describe("getPaths", function() {

    });

    describe("getPathsHelper", function() {
        it("passes a basic symmetrical, 1 level hierarchy", function() {
            let edges: Edge[] = getPathsHelper(getPathsHelperStub(), 0);
            edges;
        });
    });

    describe("getPathsAsJson", function() {
        it("it gets a correct json format", function() {
            let test = getPathsAsJson(getPathsStub());
            test;
        });
    });

    // integration tests
    // ...

    
});

// stub functions
    /**
     *webpage
     *  | -> html
     *  | -> htm
     *  | -> staticml
     *  | -> staticm
     * -> dynamic
     *  | -> jsp
     *  | -> aspx
     *  | -> cshtml
     */
    function getHierarchyStub(): Edge[][] {
        let staticEdges: Edge[] = [
            ["html", "htm", 1, 1],
            ["html", "staticml", 1, 1],
            ["html", "staticm", 1, 1],
            ["htm", "staticml", 1, 1],
            ["htm", "staticm", 1, 1],
            ["staticml", "staticm", 1, 1]
        ];

        let dynamicEdges: Edge[] = [
            ["jsp", "aspx", 1, 1],
            ["jsp", "cshtml", 1, 1],
            ["aspx", "cshtml", 1, 1]
        ];

        return [staticEdges, dynamicEdges];
    }

    /**
     * webpage
     * -> general1
     * -> general2
     * -> general3
     * -> general4
     * -> static
     * --> html
     * --> htm
     * --> staticml
     * --> staticm
     * -> dynamic
     * --> jsp
     * --> aspx
     * --> cshtml
     */
    function getDifferentCategoryStub(): Edge[][] {
        let staticEdges: Edge[] = [
            ["html", "htm", 1, 2],
            ["html", "staticml", 1, 2],
            ["html", "staticm", 1, 2],
            ["htm", "staticml", 1, 2],
            ["htm", "staticm", 1, 2],
            ["staticml", "staticm", 1, 2]
        ];

        let dynamicEdges: Edge[] = [
            ["jsp", "aspx", 1, 2],
            ["jsp", "cshtml", 1, 2],
            ["aspx", "cshtml", 1, 2],
        ];

        let upperEdges: Edge[] = [
            ["general1", "general2", 1, 1],
            ["general1", "general3", 1, 1],
            ["general1", "general4", 1, 1],
            ["general2", "general3", 1, 1],
            ["general2", "general4", 1, 1],
            ["general3", "general4", 1, 1]
        ]

        return [upperEdges, staticEdges, dynamicEdges];
    }

    function getPathsHelperStub() {
        return {
            "title": "webpage",
            "formats":[{
                    "title": "webpage-static",
                    "formats":[{
                       "name":"DTD",
                       "description":"Document Type Definition (standard), MUST be public and free",
                       "index": "0" },{
                       "name":"HTML",
                       "description":"(.html, .htm)",
                       "index": "0" },{
                       "name":"XHTML",
                       "description":"HyperText Markup Language",
                       "index": "0" },{
                       "name":"MHTML",
                       "description":"(.xhtml, .xht)",
                       "index": "0" }, { "name": "htm"}
                   ]},{
               "title": "webpage-dynamic",
               "formats": [{
                       "name":"ASP",
                       "description":"Microsoft Active Server Page",
                       "index": "0" },{
                       "name":"ASPX",
                       "description":"Microsoft Active Server Page. NET",
                       "index": "0" },{
                       "name":"ADP",
                       "description":"AOLserver Dynamic Page",
                       "index": "0" },{
                       "name":"CFM",
                       "description":"Better Markup Language (templating)",
                       "index": "0" },{
                       "name":"ColdFusion",
                       "description":" (.cfm)",
                       "index": "0" },{
                       "name":"CGI",
                       "description":" (.cgi)",
                       "index": "0" },{
                       "name":"iHTML",
                       "description":" (.ihtml)",
                       "index": "0" },{
                       "name":"JSP",
                       "description":"Inline HTML",
                       "index": "0" },{
                       "name":"Lasso",
                       "description":" (.jsp) JavaServer Pages",
                       "index": "0" },{
                       "name":"PL",
                       "description":" (.las, .lasso, .lassoapp)",
                       "index": "0" },{
                       "name":"Perl",
                       "description":"A file created or served with the Lasso Programming Language",
                       "index": "0" },{
                       "name":"PHP",
                       "description":"? is version number (previously abbreviated Personal Home Page, later changed to PHP: Hypertext Preprocessor)",
                       "index": "0" },{
                       "name":"SSI",
                       "description":"Real Native Application File (short alternative)",
                       "index": "0" },{
                       "name":"SSI",
                       "description":"RNX[permanent dead link]",
                       "index": "0" }
                   ]}
               ]}
    }

    function getPathsStub() {
        return {"categories":[{
            "title": "webpage",
            "formats":[{
                    "title": "webpage-static",
                    "formats":[{
                       "name":"DTD",
                       "description":"Document Type Definition (standard), MUST be public and free",
                       "index": "0" },{
                       "name":"HTML",
                       "description":"(.html, .htm)",
                       "index": "0" },{
                       "name":"XHTML",
                       "description":"HyperText Markup Language",
                       "index": "0" },{
                       "name":"MHTML",
                       "description":"(.xhtml, .xht)",
                       "index": "0" }, { "name": "htm"}
                   ]},{
               "title": "webpage-dynamic",
               "formats": [{
                       "name":"ASP",
                       "description":"Microsoft Active Server Page",
                       "index": "0" },{
                       "name":"ASPX",
                       "description":"Microsoft Active Server Page. NET",
                       "index": "0" },{
                       "name":"ADP",
                       "description":"AOLserver Dynamic Page",
                       "index": "0" },{
                       "name":"CFM",
                       "description":"Better Markup Language (templating)",
                       "index": "0" },{
                       "name":"ColdFusion",
                       "description":" (.cfm)",
                       "index": "0" },{
                       "name":"CGI",
                       "description":" (.cgi)",
                       "index": "0" },{
                       "name":"iHTML",
                       "description":" (.ihtml)",
                       "index": "0" },{
                       "name":"JSP",
                       "description":"Inline HTML",
                       "index": "0" },{
                       "name":"Lasso",
                       "description":" (.jsp) JavaServer Pages",
                       "index": "0" },{
                       "name":"PL",
                       "description":" (.las, .lasso, .lassoapp)",
                       "index": "0" },{
                       "name":"Perl",
                       "description":"A file created or served with the Lasso Programming Language",
                       "index": "0" },{
                       "name":"PHP",
                       "description":"? is version number (previously abbreviated Personal Home Page, later changed to PHP: Hypertext Preprocessor)",
                       "index": "0" },{
                       "name":"SSI",
                       "description":"Real Native Application File (short alternative)",
                       "index": "0" },{
                       "name":"SSI",
                       "description":"RNX[permanent dead link]",
                       "index": "0" }
                   ]}
               ]}
        ]}
    }

    // helper functions
    function product_Range(a: number, b: number): number {
        var prd = a,i = a;
       
        while (i++< b) {
          prd*=i;
        }
        return prd;
      }
      
      
      function combinations(n: number, r: number): number 
      {
        if (n==r) 
        {
          return 1;
        } 
        else 
        {
          r=(r < n-r) ? n-r : r;
          return product_Range(r+1, n)/product_Range(1,n-r);
        }
      }

      type Edge = path.Edge;