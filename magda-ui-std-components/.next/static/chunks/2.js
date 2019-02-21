(window["stdComponents"] = window["stdComponents"] || []).push([
    [2],
    {
        /***/ "./src/header.tsx":
            /*!************************!*\
  !*** ./src/header.tsx ***!
  \************************/
            /*! exports provided: default */
            /***/ function(module, __webpack_exports__, __webpack_require__) {
                "use strict";
                __webpack_require__.r(__webpack_exports__);
                /* harmony export (binding) */ __webpack_require__.d(
                    __webpack_exports__,
                    "default",
                    function() {
                        return Header;
                    }
                );
                /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(
                    /*! react */ "./node_modules/react/index.js"
                );
                /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/ __webpack_require__.n(
                    react__WEBPACK_IMPORTED_MODULE_0__
                );

                function Header() {
                    return react__WEBPACK_IMPORTED_MODULE_0___default.a.createElement(
                        "div",
                        null,
                        "This is a header",
                        " ",
                        react__WEBPACK_IMPORTED_MODULE_0___default.a.createElement(
                            "button",
                            {
                                onClick: function onClick() {
                                    return alert("hello");
                                }
                            },
                            "Click me"
                        )
                    );
                }

                /***/
            }
    }
]);
//# sourceMappingURL=2.js.map
