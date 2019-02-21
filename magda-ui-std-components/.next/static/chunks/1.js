(window["stdComponents"] = window["stdComponents"] || []).push([
    [1],
    {
        /***/ "./src/footer.tsx":
            /*!************************!*\
  !*** ./src/footer.tsx ***!
  \************************/
            /*! exports provided: default */
            /***/ function(module, __webpack_exports__, __webpack_require__) {
                "use strict";
                __webpack_require__.r(__webpack_exports__);
                /* harmony export (binding) */ __webpack_require__.d(
                    __webpack_exports__,
                    "default",
                    function() {
                        return Footer;
                    }
                );
                /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(
                    /*! react */ "./node_modules/react/index.js"
                );
                /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/ __webpack_require__.n(
                    react__WEBPACK_IMPORTED_MODULE_0__
                );

                function Footer() {
                    return react__WEBPACK_IMPORTED_MODULE_0___default.a.createElement(
                        "div",
                        null,
                        "This is a footer",
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
//# sourceMappingURL=1.js.map
