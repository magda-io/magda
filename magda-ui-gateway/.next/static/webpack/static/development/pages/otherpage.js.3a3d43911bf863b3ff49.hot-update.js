webpackHotUpdate("static/development/pages/otherpage.js", {
    /***/ "./pages/otherpage.tsx":
        /*!*****************************!*\
  !*** ./pages/otherpage.tsx ***!
  \*****************************/
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
            /* harmony import */ var _babel_runtime_corejs2_helpers_esm_assertThisInitialized__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(
                /*! @babel/runtime-corejs2/helpers/esm/assertThisInitialized */ "../node_modules/@babel/runtime-corejs2/helpers/esm/assertThisInitialized.js"
            );
            /* harmony import */ var _babel_runtime_corejs2_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(
                /*! @babel/runtime-corejs2/helpers/esm/defineProperty */ "../node_modules/@babel/runtime-corejs2/helpers/esm/defineProperty.js"
            );
            /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(
                /*! react */ "./node_modules/react/index.js"
            );
            /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_9___default = /*#__PURE__*/ __webpack_require__.n(
                react__WEBPACK_IMPORTED_MODULE_9__
            );
            /* harmony import */ var next_link__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(
                /*! next/link */ "./node_modules/next/link.js"
            );
            /* harmony import */ var next_link__WEBPACK_IMPORTED_MODULE_10___default = /*#__PURE__*/ __webpack_require__.n(
                next_link__WEBPACK_IMPORTED_MODULE_10__
            );
            /* harmony import */ var _src_get_micro_frontend__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(
                /*! ../src/get-micro-frontend */ "./src/get-micro-frontend.ts"
            );

            var _jsxFileName =
                "/Users/gil308/projects/magda/magda-metadata/magda-ui-gateway/pages/otherpage.tsx";

            var SOURCE_URL = "http://localhost:3001/?component=header"; // const SOURCE_URL = "https://nationalmap.gov.au";

            var Home =
                /*#__PURE__*/
                (function(_React$Component) {
                    Object(
                        _babel_runtime_corejs2_helpers_esm_inherits__WEBPACK_IMPORTED_MODULE_6__[
                            "default"
                        ]
                    )(Home, _React$Component);

                    function Home() {
                        var _getPrototypeOf2;

                        var _this;

                        Object(
                            _babel_runtime_corejs2_helpers_esm_classCallCheck__WEBPACK_IMPORTED_MODULE_2__[
                                "default"
                            ]
                        )(this, Home);

                        for (
                            var _len = arguments.length,
                                args = new Array(_len),
                                _key = 0;
                            _key < _len;
                            _key++
                        ) {
                            args[_key] = arguments[_key];
                        }

                        _this = Object(
                            _babel_runtime_corejs2_helpers_esm_possibleConstructorReturn__WEBPACK_IMPORTED_MODULE_4__[
                                "default"
                            ]
                        )(
                            this,
                            (_getPrototypeOf2 = Object(
                                _babel_runtime_corejs2_helpers_esm_getPrototypeOf__WEBPACK_IMPORTED_MODULE_5__[
                                    "default"
                                ]
                            )(Home)).call.apply(
                                _getPrototypeOf2,
                                [this].concat(args)
                            )
                        );

                        Object(
                            _babel_runtime_corejs2_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_8__[
                                "default"
                            ]
                        )(
                            Object(
                                _babel_runtime_corejs2_helpers_esm_assertThisInitialized__WEBPACK_IMPORTED_MODULE_7__[
                                    "default"
                                ]
                            )(
                                Object(
                                    _babel_runtime_corejs2_helpers_esm_assertThisInitialized__WEBPACK_IMPORTED_MODULE_7__[
                                        "default"
                                    ]
                                )(_this)
                            ),
                            "onRefAdded",
                            function(element) {
                                if (element) {
                                    var _scripts = element.querySelectorAll(
                                        "script"
                                    );

                                    _scripts.forEach(function(script) {
                                        var newScript = document.createElement(
                                            "script"
                                        );
                                        newScript.innerHTML = script.innerHTML;

                                        for (
                                            var i =
                                                script.attributes.length - 1;
                                            i >= 0;
                                            i--
                                        ) {
                                            newScript.setAttribute(
                                                script.attributes[i].name,
                                                script.attributes[i].value
                                            );
                                        }

                                        script.parentNode.replaceChild(
                                            newScript,
                                            script
                                        );
                                        console.log(
                                            "replaced ".concat(newScript.src)
                                        );
                                    });
                                }
                            }
                        );

                        return _this;
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
                                    return react__WEBPACK_IMPORTED_MODULE_9___default.a.createElement(
                                        "div",
                                        {
                                            __source: {
                                                fileName: _jsxFileName,
                                                lineNumber: 50
                                            },
                                            __self: this
                                        },
                                        react__WEBPACK_IMPORTED_MODULE_9___default.a.createElement(
                                            "div",
                                            {
                                                __source: {
                                                    fileName: _jsxFileName,
                                                    lineNumber: 51
                                                },
                                                __self: this
                                            },
                                            react__WEBPACK_IMPORTED_MODULE_9___default.a.createElement(
                                                "button",
                                                {
                                                    onClick: function onClick() {
                                                        return alert("hello");
                                                    },
                                                    __source: {
                                                        fileName: _jsxFileName,
                                                        lineNumber: 52
                                                    },
                                                    __self: this
                                                },
                                                "hello"
                                            ),
                                            "body 1",
                                            react__WEBPACK_IMPORTED_MODULE_9___default.a.createElement(
                                                next_link__WEBPACK_IMPORTED_MODULE_10___default.a,
                                                {
                                                    href: "/",
                                                    __source: {
                                                        fileName: _jsxFileName,
                                                        lineNumber: 54
                                                    },
                                                    __self: this
                                                },
                                                react__WEBPACK_IMPORTED_MODULE_9___default.a.createElement(
                                                    "a",
                                                    {
                                                        __source: {
                                                            fileName: _jsxFileName,
                                                            lineNumber: 55
                                                        },
                                                        __self: this
                                                    },
                                                    "Go to other page"
                                                )
                                            )
                                        ),
                                        react__WEBPACK_IMPORTED_MODULE_9___default.a.createElement(
                                            "div",
                                            {
                                                ref: this.onRefAdded,
                                                dangerouslySetInnerHTML: {
                                                    __html: this.props.html
                                                },
                                                __source: {
                                                    fileName: _jsxFileName,
                                                    lineNumber: 58
                                                },
                                                __self: this
                                            }
                                        )
                                    );
                                }
                            }
                        ],
                        [
                            {
                                key: "getInitialProps",
                                value: (function() {
                                    var _getInitialProps = Object(
                                        _babel_runtime_corejs2_helpers_esm_asyncToGenerator__WEBPACK_IMPORTED_MODULE_1__[
                                            "default"
                                        ]
                                    )(
                                        /*#__PURE__*/
                                        _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0___default.a.mark(
                                            function _callee(ctx) {
                                                var _ref, _html;

                                                return _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0___default.a.wrap(
                                                    function _callee$(
                                                        _context
                                                    ) {
                                                        while (1) {
                                                            switch (
                                                                (_context.prev =
                                                                    _context.next)
                                                            ) {
                                                                case 0:
                                                                    _context.prev = 0;
                                                                    _context.next = 3;
                                                                    return Object(
                                                                        _src_get_micro_frontend__WEBPACK_IMPORTED_MODULE_11__[
                                                                            "default"
                                                                        ]
                                                                    )(
                                                                        SOURCE_URL
                                                                    );

                                                                case 3:
                                                                    _ref =
                                                                        _context.sent;
                                                                    _html =
                                                                        _ref.html;
                                                                    return _context.abrupt(
                                                                        "return",
                                                                        {
                                                                            html: _html
                                                                        }
                                                                    );

                                                                case 8:
                                                                    _context.prev = 8;
                                                                    _context.t0 = _context[
                                                                        "catch"
                                                                    ](0);
                                                                    console.error(
                                                                        _context.t0
                                                                    );
                                                                    return _context.abrupt(
                                                                        "return",
                                                                        {
                                                                            html:
                                                                                "fail"
                                                                        }
                                                                    );

                                                                case 12:
                                                                case "end":
                                                                    return _context.stop();
                                                            }
                                                        }
                                                    },
                                                    _callee,
                                                    this,
                                                    [[0, 8]]
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
                })(react__WEBPACK_IMPORTED_MODULE_9___default.a.Component);

            /* harmony default export */ __webpack_exports__["default"] = Home;

            /***/
        }
});
//# sourceMappingURL=otherpage.js.3a3d43911bf863b3ff49.hot-update.js.map
