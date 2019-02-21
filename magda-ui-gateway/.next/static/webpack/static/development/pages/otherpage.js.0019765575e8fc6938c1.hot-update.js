webpackHotUpdate("static/development/pages/otherpage.js", {
    /***/ "./src/get-micro-frontend.ts":
        /*!***********************************!*\
  !*** ./src/get-micro-frontend.ts ***!
  \***********************************/
        /*! exports provided: default */
        /***/ function(module, __webpack_exports__, __webpack_require__) {
            "use strict";
            __webpack_require__.r(__webpack_exports__);
            /* harmony export (binding) */ __webpack_require__.d(
                __webpack_exports__,
                "default",
                function() {
                    return getMicroFrontend;
                }
            );
            /* harmony import */ var _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(
                /*! @babel/runtime-corejs2/regenerator */ "../node_modules/@babel/runtime-corejs2/regenerator/index.js"
            );
            /* harmony import */ var _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/ __webpack_require__.n(
                _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0__
            );
            /* harmony import */ var _babel_runtime_corejs2_helpers_esm_asyncToGenerator__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(
                /*! @babel/runtime-corejs2/helpers/esm/asyncToGenerator */ "../node_modules/@babel/runtime-corejs2/helpers/esm/asyncToGenerator.js"
            );
            /* harmony import */ var isomorphic_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(
                /*! isomorphic-fetch */ "../node_modules/isomorphic-fetch/fetch-npm-browserify.js"
            );
            /* harmony import */ var isomorphic_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/ __webpack_require__.n(
                isomorphic_fetch__WEBPACK_IMPORTED_MODULE_2__
            );

            function getMicroFrontend(_x) {
                return _getMicroFrontend.apply(this, arguments);
            }

            function _getMicroFrontend() {
                _getMicroFrontend = Object(
                    _babel_runtime_corejs2_helpers_esm_asyncToGenerator__WEBPACK_IMPORTED_MODULE_1__[
                        "default"
                    ]
                )(
                    /*#__PURE__*/
                    _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0___default.a.mark(
                        function _callee3(sourceUrl) {
                            var isClient,
                                parseHtmlNode,
                                _parseHtmlNode,
                                parseHtmlBrowser,
                                _parseHtmlBrowser,
                                response,
                                text,
                                doc;

                            return _babel_runtime_corejs2_regenerator__WEBPACK_IMPORTED_MODULE_0___default.a.wrap(
                                function _callee3$(_context3) {
                                    while (1) {
                                        switch (
                                            (_context3.prev = _context3.next)
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
                                                                var parser, doc;
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

                                                isClient =
                                                    typeof window !==
                                                    "undefined";
                                                _context3.next = 7;
                                                return isomorphic_fetch__WEBPACK_IMPORTED_MODULE_2___default()(
                                                    sourceUrl +
                                                        (isClient
                                                            ? "&render=true"
                                                            : "&render=true")
                                                );

                                            case 7:
                                                response = _context3.sent;
                                                _context3.next = 10;
                                                return response.text();

                                            case 10:
                                                text = _context3.sent;
                                                _context3.next = 13;
                                                return typeof window !==
                                                    "undefined"
                                                    ? parseHtmlBrowser(text)
                                                    : parseHtmlNode(text);

                                            case 13:
                                                doc = _context3.sent;
                                                return _context3.abrupt(
                                                    "return",
                                                    {
                                                        html: doc.body.innerHTML // scripts
                                                    }
                                                );

                                            case 15:
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
                return _getMicroFrontend.apply(this, arguments);
            }

            /***/
        }
});
//# sourceMappingURL=otherpage.js.0019765575e8fc6938c1.hot-update.js.map
