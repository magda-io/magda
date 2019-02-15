webpackHotUpdate("static/development/pages/index.js", {
    /***/ "./pages/index.tsx":
        /*!*************************!*\
  !*** ./pages/index.tsx ***!
  \*************************/
        /*! exports provided: default */
        /***/ function(module, __webpack_exports__, __webpack_require__) {
            "use strict";
            __webpack_require__.r(__webpack_exports__);
            /* harmony import */ var _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(
                /*! @babel/runtime-corejs2/regenerator */ "../node_modules/@babel/runtime-corejs2/regenerator/index.js"
            );
            /* harmony import */ var _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/ __webpack_require__.n(
                _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0__
            );
            /* harmony import */ var _babel_runtime_corejs2_helpers_esm_asyncToGenerator__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(
                /*! @babel/runtime-corejs2/helpers/esm/asyncToGenerator */ "../node_modules/@babel/runtime-corejs2/helpers/esm/asyncToGenerator.js"
            );
            /* harmony import */ var _babel_runtime_corejs2_helpers_esm_classCallCheck__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(
                /*! @babel/runtime-corejs2/helpers/esm/classCallCheck */ "../node_modules/@babel/runtime-corejs2/helpers/esm/classCallCheck.js"
            );
            /* harmony import */ var _babel_runtime_corejs2_helpers_esm_createClass__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(
                /*! @babel/runtime-corejs2/helpers/esm/createClass */ "../node_modules/@babel/runtime-corejs2/helpers/esm/createClass.js"
            );
            /* harmony import */ var _babel_runtime_corejs2_helpers_esm_possibleConstructorReturn__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(
                /*! @babel/runtime-corejs2/helpers/esm/possibleConstructorReturn */ "../node_modules/@babel/runtime-corejs2/helpers/esm/possibleConstructorReturn.js"
            );
            /* harmony import */ var _babel_runtime_corejs2_helpers_esm_getPrototypeOf__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(
                /*! @babel/runtime-corejs2/helpers/esm/getPrototypeOf */ "../node_modules/@babel/runtime-corejs2/helpers/esm/getPrototypeOf.js"
            );
            /* harmony import */ var _babel_runtime_corejs2_helpers_esm_inherits__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(
                /*! @babel/runtime-corejs2/helpers/esm/inherits */ "../node_modules/@babel/runtime-corejs2/helpers/esm/inherits.js"
            );
            /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(
                /*! react */ "./node_modules/react/index.js"
            );
            /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_7___default = /*#__PURE__*/ __webpack_require__.n(
                react__WEBPACK_IMPORTED_MODULE_7__
            );
            /* harmony import */ var isomorphic_fetch__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(
                /*! isomorphic-fetch */ "../node_modules/isomorphic-fetch/fetch-npm-browserify.js"
            );
            /* harmony import */ var isomorphic_fetch__WEBPACK_IMPORTED_MODULE_8___default = /*#__PURE__*/ __webpack_require__.n(
                isomorphic_fetch__WEBPACK_IMPORTED_MODULE_8__
            );

            var _jsxFileName =
                "/Users/gil308/projects/magda/magda-metadata/magda-ui-gateway/pages/index.tsx";

            var Home =
                /*#__PURE__*/
                (function(_React$Component) {
                    Object(
                        _babel_runtime_corejs2_helpers_esm_inherits__WEBPACK_IMPORTED_MODULE_6__[
                            "default"
                        ]
                    )(Home, _React$Component);

                    function Home() {
                        Object(
                            _babel_runtime_corejs2_helpers_esm_classCallCheck__WEBPACK_IMPORTED_MODULE_2__[
                                "default"
                            ]
                        )(this, Home);

                        return Object(
                            _babel_runtime_corejs2_helpers_esm_possibleConstructorReturn__WEBPACK_IMPORTED_MODULE_4__[
                                "default"
                            ]
                        )(
                            this,
                            Object(
                                _babel_runtime_corejs2_helpers_esm_getPrototypeOf__WEBPACK_IMPORTED_MODULE_5__[
                                    "default"
                                ]
                            )(Home).apply(this, arguments)
                        );
                    }

                    Object(
                        _babel_runtime_corejs2_helpers_esm_createClass__WEBPACK_IMPORTED_MODULE_3__[
                            "default"
                        ]
                    )(
                        Home,
                        [
                            {
                                key: "render",
                                value: function render() {
                                    return react__WEBPACK_IMPORTED_MODULE_7___default.a.createElement(
                                        "div",
                                        {
                                            __source: {
                                                fileName: _jsxFileName,
                                                lineNumber: 41
                                            },
                                            __self: this
                                        },
                                        this.props.headerText &&
                                            react__WEBPACK_IMPORTED_MODULE_7___default.a.createElement(
                                                "header",
                                                {
                                                    dangerouslySetInnerHTML: {
                                                        __html: this.props
                                                            .headerText
                                                    },
                                                    __source: {
                                                        fileName: _jsxFileName,
                                                        lineNumber: 43
                                                    },
                                                    __self: this
                                                }
                                            ),
                                        react__WEBPACK_IMPORTED_MODULE_7___default.a.createElement(
                                            "div",
                                            {
                                                __source: {
                                                    fileName: _jsxFileName,
                                                    lineNumber: 49
                                                },
                                                __self: this
                                            },
                                            "body"
                                        )
                                    );
                                }
                            }
                        ],
                        [
                            {
                                key: "getInitialProps",
                                // state = {} as {
                                //     headerText?: string;
                                // };
                                value: (function() {
                                    var _getInitialProps = Object(
                                        _babel_runtime_corejs2_helpers_esm_asyncToGenerator__WEBPACK_IMPORTED_MODULE_1__[
                                            "default"
                                        ]
                                    )(
                                        /*#__PURE__*/
                                        _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0___default.a.mark(
                                            function _callee3(ctx) {
                                                var parseHtmlNode,
                                                    _parseHtmlNode,
                                                    parseHtmlBrowser,
                                                    _parseHtmlBrowser,
                                                    response,
                                                    text,
                                                    doc;

                                                return _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0___default.a.wrap(
                                                    function _callee3$(
                                                        _context3
                                                    ) {
                                                        while (1) {
                                                            switch (
                                                                (_context3.prev =
                                                                    _context3.next)
                                                            ) {
                                                                case 0:
                                                                    _parseHtmlBrowser = function _ref5() {
                                                                        _parseHtmlBrowser = Object(
                                                                            _babel_runtime_corejs2_helpers_esm_asyncToGenerator__WEBPACK_IMPORTED_MODULE_1__[
                                                                                "default"
                                                                            ]
                                                                        )(
                                                                            /*#__PURE__*/
                                                                            _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0___default.a.mark(
                                                                                function _callee2(
                                                                                    html
                                                                                ) {
                                                                                    var parser,
                                                                                        doc;
                                                                                    return _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0___default.a.wrap(
                                                                                        function _callee2$(
                                                                                            _context2
                                                                                        ) {
                                                                                            while (
                                                                                                1
                                                                                            ) {
                                                                                                switch (
                                                                                                    (_context2.prev =
                                                                                                        _context2.next)
                                                                                                ) {
                                                                                                    case 0:
                                                                                                        parser = new DOMParser();
                                                                                                        doc = parser.parseFromString(
                                                                                                            html,
                                                                                                            "text/html"
                                                                                                        );
                                                                                                        return _context2.abrupt(
                                                                                                            "return",
                                                                                                            doc
                                                                                                        );

                                                                                                    case 3:
                                                                                                    case "end":
                                                                                                        return _context2.stop();
                                                                                                }
                                                                                            }
                                                                                        },
                                                                                        _callee2,
                                                                                        this
                                                                                    );
                                                                                }
                                                                            )
                                                                        );
                                                                        return _parseHtmlBrowser.apply(
                                                                            this,
                                                                            arguments
                                                                        );
                                                                    };

                                                                    parseHtmlBrowser = function _ref4(
                                                                        _x3
                                                                    ) {
                                                                        return _parseHtmlBrowser.apply(
                                                                            this,
                                                                            arguments
                                                                        );
                                                                    };

                                                                    _parseHtmlNode = function _ref3() {
                                                                        _parseHtmlNode = Object(
                                                                            _babel_runtime_corejs2_helpers_esm_asyncToGenerator__WEBPACK_IMPORTED_MODULE_1__[
                                                                                "default"
                                                                            ]
                                                                        )(
                                                                            /*#__PURE__*/
                                                                            _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0___default.a.mark(
                                                                                function _callee(
                                                                                    html
                                                                                ) {
                                                                                    var _ref,
                                                                                        JSDOM,
                                                                                        doc;

                                                                                    return _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0___default.a.wrap(
                                                                                        function _callee$(
                                                                                            _context
                                                                                        ) {
                                                                                            while (
                                                                                                1
                                                                                            ) {
                                                                                                switch (
                                                                                                    (_context.prev =
                                                                                                        _context.next)
                                                                                                ) {
                                                                                                    case 0:
                                                                                                        _context.next = 2;
                                                                                                        return __webpack_require__
                                                                                                            .e(
                                                                                                                /*! import() */ 1
                                                                                                            )
                                                                                                            .then(
                                                                                                                __webpack_require__.t.bind(
                                                                                                                    null,
                                                                                                                    /*! jsdom */ 2,
                                                                                                                    7
                                                                                                                )
                                                                                                            );

                                                                                                    case 2:
                                                                                                        _ref =
                                                                                                            _context.sent;
                                                                                                        JSDOM =
                                                                                                            _ref.JSDOM;
                                                                                                        doc = new JSDOM(
                                                                                                            html
                                                                                                        )
                                                                                                            .window
                                                                                                            .document;
                                                                                                        return _context.abrupt(
                                                                                                            "return",
                                                                                                            doc
                                                                                                        );

                                                                                                    case 6:
                                                                                                    case "end":
                                                                                                        return _context.stop();
                                                                                                }
                                                                                            }
                                                                                        },
                                                                                        _callee,
                                                                                        this
                                                                                    );
                                                                                }
                                                                            )
                                                                        );
                                                                        return _parseHtmlNode.apply(
                                                                            this,
                                                                            arguments
                                                                        );
                                                                    };

                                                                    parseHtmlNode = function _ref2(
                                                                        _x2
                                                                    ) {
                                                                        return _parseHtmlNode.apply(
                                                                            this,
                                                                            arguments
                                                                        );
                                                                    };

                                                                    _context3.next = 6;
                                                                    return isomorphic_fetch__WEBPACK_IMPORTED_MODULE_8___default()(
                                                                        "http://localhost:3001/header"
                                                                    );

                                                                case 6:
                                                                    response =
                                                                        _context3.sent;
                                                                    _context3.next = 9;
                                                                    return response.text();

                                                                case 9:
                                                                    text =
                                                                        _context3.sent;
                                                                    _context3.next = 12;
                                                                    return typeof window !==
                                                                        "undefined"
                                                                        ? parseHtmlBrowser(
                                                                              text
                                                                          )
                                                                        : parseHtmlNode(
                                                                              text
                                                                          );

                                                                case 12:
                                                                    doc =
                                                                        _context3.sent;
                                                                    return _context3.abrupt(
                                                                        "return",
                                                                        {
                                                                            headerText:
                                                                                doc
                                                                                    .body
                                                                                    .innerHTML
                                                                        }
                                                                    );

                                                                case 14:
                                                                case "end":
                                                                    return _context3.stop();
                                                            }
                                                        }
                                                    },
                                                    _callee3,
                                                    this
                                                );
                                            }
                                        )
                                    );

                                    function getInitialProps(_x) {
                                        return _getInitialProps.apply(
                                            this,
                                            arguments
                                        );
                                    }

                                    return getInitialProps;
                                })()
                            }
                        ]
                    );

                    return Home;
                })(react__WEBPACK_IMPORTED_MODULE_7___default.a.Component);

            /* harmony default export */ __webpack_exports__["default"] = Home;

            /***/
        }
});
//# sourceMappingURL=index.js.36a53d29b6f22717fecb.hot-update.js.map
