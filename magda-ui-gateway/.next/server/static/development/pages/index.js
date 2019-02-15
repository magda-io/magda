module.exports = /******/ (function(modules) {
    // webpackBootstrap
    /******/ // The module cache
    /******/ var installedModules = require("../../../ssr-module-cache.js"); // object to store loaded chunks // "0" means "already loaded"
    /******/
    /******/ /******/ /******/ var installedChunks = {
        /******/ "static/development/pages/index.js": 0
        /******/
    }; // The require function
    /******/
    /******/ /******/ function __webpack_require__(moduleId) {
        /******/
        /******/ // Check if module is in cache
        /******/ if (installedModules[moduleId]) {
            /******/ return installedModules[moduleId].exports;
            /******/
        } // Create a new module (and put it into the cache)
        /******/ /******/ var module = (installedModules[moduleId] = {
            /******/ i: moduleId,
            /******/ l: false,
            /******/ exports: {}
            /******/
        }); // Execute the module function
        /******/
        /******/ /******/ var threw = true;
        /******/ try {
            /******/ modules[moduleId].call(
                module.exports,
                module,
                module.exports,
                __webpack_require__
            );
            /******/ threw = false;
            /******/
        } finally {
            /******/ if (threw) delete installedModules[moduleId];
            /******/
        } // Flag the module as loaded
        /******/
        /******/ /******/ module.l = true; // Return the exports of the module
        /******/
        /******/ /******/ return module.exports;
        /******/
    } // expose the modules object (__webpack_modules__)
    /******/
    /******/
    /******/ /******/ __webpack_require__.m = modules; // expose the module cache
    /******/
    /******/ /******/ __webpack_require__.c = installedModules; // define getter function for harmony exports
    /******/
    /******/ /******/ __webpack_require__.d = function(exports, name, getter) {
        /******/ if (!__webpack_require__.o(exports, name)) {
            /******/ Object.defineProperty(exports, name, {
                enumerable: true,
                get: getter
            });
            /******/
        }
        /******/
    }; // define __esModule on exports
    /******/
    /******/ /******/ __webpack_require__.r = function(exports) {
        /******/ if (typeof Symbol !== "undefined" && Symbol.toStringTag) {
            /******/ Object.defineProperty(exports, Symbol.toStringTag, {
                value: "Module"
            });
            /******/
        }
        /******/ Object.defineProperty(exports, "__esModule", { value: true });
        /******/
    }; // create a fake namespace object // mode & 1: value is a module id, require it // mode & 2: merge all properties of value into the ns // mode & 4: return value when already ns object // mode & 8|1: behave like require
    /******/
    /******/ /******/ /******/ /******/ /******/ /******/ __webpack_require__.t = function(
        value,
        mode
    ) {
        /******/ if (mode & 1) value = __webpack_require__(value);
        /******/ if (mode & 8) return value;
        /******/ if (
            mode & 4 &&
            typeof value === "object" &&
            value &&
            value.__esModule
        )
            return value;
        /******/ var ns = Object.create(null);
        /******/ __webpack_require__.r(ns);
        /******/ Object.defineProperty(ns, "default", {
            enumerable: true,
            value: value
        });
        /******/ if (mode & 2 && typeof value != "string")
            for (var key in value)
                __webpack_require__.d(
                    ns,
                    key,
                    function(key) {
                        return value[key];
                    }.bind(null, key)
                );
        /******/ return ns;
        /******/
    }; // getDefaultExport function for compatibility with non-harmony modules
    /******/
    /******/ /******/ __webpack_require__.n = function(module) {
        /******/ var getter =
            module && module.__esModule
                ? /******/ function getDefault() {
                      return module["default"];
                  }
                : /******/ function getModuleExports() {
                      return module;
                  };
        /******/ __webpack_require__.d(getter, "a", getter);
        /******/ return getter;
        /******/
    }; // Object.prototype.hasOwnProperty.call
    /******/
    /******/ /******/ __webpack_require__.o = function(object, property) {
        return Object.prototype.hasOwnProperty.call(object, property);
    }; // __webpack_public_path__
    /******/
    /******/ /******/ __webpack_require__.p = ""; // uncaught error handler for webpack runtime
    /******/
    /******/ /******/ __webpack_require__.oe = function(err) {
        /******/ process.nextTick(function() {
            /******/ throw err; // catch this error by using import().catch()
            /******/
        });
        /******/
    }; // Load entry module and return exports
    /******/
    /******/
    /******/ /******/ return __webpack_require__((__webpack_require__.s = 3));
    /******/
})(
    /************************************************************************/
    /******/ {
        /***/ "../node_modules/@babel/runtime-corejs2/core-js/object/create.js":
            /*!***********************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/core-js/object/create.js ***!
  \***********************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! core-js/library/fn/object/create */ "core-js/library/fn/object/create"
                );

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/core-js/object/define-property.js":
            /*!********************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/core-js/object/define-property.js ***!
  \********************************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! core-js/library/fn/object/define-property */ "core-js/library/fn/object/define-property"
                );

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/core-js/object/get-prototype-of.js":
            /*!*********************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/core-js/object/get-prototype-of.js ***!
  \*********************************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! core-js/library/fn/object/get-prototype-of */ "core-js/library/fn/object/get-prototype-of"
                );

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/core-js/object/set-prototype-of.js":
            /*!*********************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/core-js/object/set-prototype-of.js ***!
  \*********************************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! core-js/library/fn/object/set-prototype-of */ "core-js/library/fn/object/set-prototype-of"
                );

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/core-js/promise.js":
            /*!*****************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/core-js/promise.js ***!
  \*****************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! core-js/library/fn/promise */ "core-js/library/fn/promise"
                );

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/core-js/symbol.js":
            /*!****************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/core-js/symbol.js ***!
  \****************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! core-js/library/fn/symbol */ "core-js/library/fn/symbol"
                );

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/core-js/symbol/iterator.js":
            /*!*************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/core-js/symbol/iterator.js ***!
  \*************************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! core-js/library/fn/symbol/iterator */ "core-js/library/fn/symbol/iterator"
                );

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/esm/assertThisInitialized.js":
            /*!***********************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/esm/assertThisInitialized.js ***!
  \***********************************************************************************/
            /*! exports provided: default */
            /***/ function(module, __webpack_exports__, __webpack_require__) {
                "use strict";
                __webpack_require__.r(__webpack_exports__);
                /* harmony export (binding) */ __webpack_require__.d(
                    __webpack_exports__,
                    "default",
                    function() {
                        return _assertThisInitialized;
                    }
                );
                function _assertThisInitialized(self) {
                    if (self === void 0) {
                        throw new ReferenceError(
                            "this hasn't been initialised - super() hasn't been called"
                        );
                    }

                    return self;
                }

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/esm/asyncToGenerator.js":
            /*!******************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/esm/asyncToGenerator.js ***!
  \******************************************************************************/
            /*! exports provided: default */
            /***/ function(module, __webpack_exports__, __webpack_require__) {
                "use strict";
                __webpack_require__.r(__webpack_exports__);
                /* harmony export (binding) */ __webpack_require__.d(
                    __webpack_exports__,
                    "default",
                    function() {
                        return _asyncToGenerator;
                    }
                );
                /* harmony import */ var _core_js_promise__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(
                    /*! ../../core-js/promise */ "../node_modules/@babel/runtime-corejs2/core-js/promise.js"
                );
                /* harmony import */ var _core_js_promise__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/ __webpack_require__.n(
                    _core_js_promise__WEBPACK_IMPORTED_MODULE_0__
                );

                function asyncGeneratorStep(
                    gen,
                    resolve,
                    reject,
                    _next,
                    _throw,
                    key,
                    arg
                ) {
                    try {
                        var info = gen[key](arg);
                        var value = info.value;
                    } catch (error) {
                        reject(error);
                        return;
                    }

                    if (info.done) {
                        resolve(value);
                    } else {
                        _core_js_promise__WEBPACK_IMPORTED_MODULE_0___default.a
                            .resolve(value)
                            .then(_next, _throw);
                    }
                }

                function _asyncToGenerator(fn) {
                    return function() {
                        var self = this,
                            args = arguments;
                        return new _core_js_promise__WEBPACK_IMPORTED_MODULE_0___default.a(
                            function(resolve, reject) {
                                var gen = fn.apply(self, args);

                                function _next(value) {
                                    asyncGeneratorStep(
                                        gen,
                                        resolve,
                                        reject,
                                        _next,
                                        _throw,
                                        "next",
                                        value
                                    );
                                }

                                function _throw(err) {
                                    asyncGeneratorStep(
                                        gen,
                                        resolve,
                                        reject,
                                        _next,
                                        _throw,
                                        "throw",
                                        err
                                    );
                                }

                                _next(undefined);
                            }
                        );
                    };
                }

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/esm/classCallCheck.js":
            /*!****************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/esm/classCallCheck.js ***!
  \****************************************************************************/
            /*! exports provided: default */
            /***/ function(module, __webpack_exports__, __webpack_require__) {
                "use strict";
                __webpack_require__.r(__webpack_exports__);
                /* harmony export (binding) */ __webpack_require__.d(
                    __webpack_exports__,
                    "default",
                    function() {
                        return _classCallCheck;
                    }
                );
                function _classCallCheck(instance, Constructor) {
                    if (!(instance instanceof Constructor)) {
                        throw new TypeError(
                            "Cannot call a class as a function"
                        );
                    }
                }

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/esm/createClass.js":
            /*!*************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/esm/createClass.js ***!
  \*************************************************************************/
            /*! exports provided: default */
            /***/ function(module, __webpack_exports__, __webpack_require__) {
                "use strict";
                __webpack_require__.r(__webpack_exports__);
                /* harmony export (binding) */ __webpack_require__.d(
                    __webpack_exports__,
                    "default",
                    function() {
                        return _createClass;
                    }
                );
                /* harmony import */ var _core_js_object_define_property__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(
                    /*! ../../core-js/object/define-property */ "../node_modules/@babel/runtime-corejs2/core-js/object/define-property.js"
                );
                /* harmony import */ var _core_js_object_define_property__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/ __webpack_require__.n(
                    _core_js_object_define_property__WEBPACK_IMPORTED_MODULE_0__
                );

                function _defineProperties(target, props) {
                    for (var i = 0; i < props.length; i++) {
                        var descriptor = props[i];
                        descriptor.enumerable = descriptor.enumerable || false;
                        descriptor.configurable = true;
                        if ("value" in descriptor) descriptor.writable = true;

                        _core_js_object_define_property__WEBPACK_IMPORTED_MODULE_0___default()(
                            target,
                            descriptor.key,
                            descriptor
                        );
                    }
                }

                function _createClass(Constructor, protoProps, staticProps) {
                    if (protoProps)
                        _defineProperties(Constructor.prototype, protoProps);
                    if (staticProps)
                        _defineProperties(Constructor, staticProps);
                    return Constructor;
                }

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/esm/getPrototypeOf.js":
            /*!****************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/esm/getPrototypeOf.js ***!
  \****************************************************************************/
            /*! exports provided: default */
            /***/ function(module, __webpack_exports__, __webpack_require__) {
                "use strict";
                __webpack_require__.r(__webpack_exports__);
                /* harmony export (binding) */ __webpack_require__.d(
                    __webpack_exports__,
                    "default",
                    function() {
                        return _getPrototypeOf;
                    }
                );
                /* harmony import */ var _core_js_object_get_prototype_of__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(
                    /*! ../../core-js/object/get-prototype-of */ "../node_modules/@babel/runtime-corejs2/core-js/object/get-prototype-of.js"
                );
                /* harmony import */ var _core_js_object_get_prototype_of__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/ __webpack_require__.n(
                    _core_js_object_get_prototype_of__WEBPACK_IMPORTED_MODULE_0__
                );
                /* harmony import */ var _core_js_object_set_prototype_of__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(
                    /*! ../../core-js/object/set-prototype-of */ "../node_modules/@babel/runtime-corejs2/core-js/object/set-prototype-of.js"
                );
                /* harmony import */ var _core_js_object_set_prototype_of__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/ __webpack_require__.n(
                    _core_js_object_set_prototype_of__WEBPACK_IMPORTED_MODULE_1__
                );

                function _getPrototypeOf(o) {
                    _getPrototypeOf = _core_js_object_set_prototype_of__WEBPACK_IMPORTED_MODULE_1___default.a
                        ? _core_js_object_get_prototype_of__WEBPACK_IMPORTED_MODULE_0___default.a
                        : function _getPrototypeOf(o) {
                              return (
                                  o.__proto__ ||
                                  _core_js_object_get_prototype_of__WEBPACK_IMPORTED_MODULE_0___default()(
                                      o
                                  )
                              );
                          };
                    return _getPrototypeOf(o);
                }

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/esm/inherits.js":
            /*!**********************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/esm/inherits.js ***!
  \**********************************************************************/
            /*! exports provided: default */
            /***/ function(module, __webpack_exports__, __webpack_require__) {
                "use strict";
                __webpack_require__.r(__webpack_exports__);
                /* harmony export (binding) */ __webpack_require__.d(
                    __webpack_exports__,
                    "default",
                    function() {
                        return _inherits;
                    }
                );
                /* harmony import */ var _core_js_object_create__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(
                    /*! ../../core-js/object/create */ "../node_modules/@babel/runtime-corejs2/core-js/object/create.js"
                );
                /* harmony import */ var _core_js_object_create__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/ __webpack_require__.n(
                    _core_js_object_create__WEBPACK_IMPORTED_MODULE_0__
                );
                /* harmony import */ var _setPrototypeOf__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(
                    /*! ./setPrototypeOf */ "../node_modules/@babel/runtime-corejs2/helpers/esm/setPrototypeOf.js"
                );

                function _inherits(subClass, superClass) {
                    if (
                        typeof superClass !== "function" &&
                        superClass !== null
                    ) {
                        throw new TypeError(
                            "Super expression must either be null or a function"
                        );
                    }

                    subClass.prototype = _core_js_object_create__WEBPACK_IMPORTED_MODULE_0___default()(
                        superClass && superClass.prototype,
                        {
                            constructor: {
                                value: subClass,
                                writable: true,
                                configurable: true
                            }
                        }
                    );
                    if (superClass)
                        Object(
                            _setPrototypeOf__WEBPACK_IMPORTED_MODULE_1__[
                                "default"
                            ]
                        )(subClass, superClass);
                }

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/esm/possibleConstructorReturn.js":
            /*!***************************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/esm/possibleConstructorReturn.js ***!
  \***************************************************************************************/
            /*! exports provided: default */
            /***/ function(module, __webpack_exports__, __webpack_require__) {
                "use strict";
                __webpack_require__.r(__webpack_exports__);
                /* harmony export (binding) */ __webpack_require__.d(
                    __webpack_exports__,
                    "default",
                    function() {
                        return _possibleConstructorReturn;
                    }
                );
                /* harmony import */ var _helpers_esm_typeof__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(
                    /*! ../../helpers/esm/typeof */ "../node_modules/@babel/runtime-corejs2/helpers/esm/typeof.js"
                );
                /* harmony import */ var _assertThisInitialized__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(
                    /*! ./assertThisInitialized */ "../node_modules/@babel/runtime-corejs2/helpers/esm/assertThisInitialized.js"
                );

                function _possibleConstructorReturn(self, call) {
                    if (
                        call &&
                        (Object(
                            _helpers_esm_typeof__WEBPACK_IMPORTED_MODULE_0__[
                                "default"
                            ]
                        )(call) === "object" ||
                            typeof call === "function")
                    ) {
                        return call;
                    }

                    return Object(
                        _assertThisInitialized__WEBPACK_IMPORTED_MODULE_1__[
                            "default"
                        ]
                    )(self);
                }

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/esm/setPrototypeOf.js":
            /*!****************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/esm/setPrototypeOf.js ***!
  \****************************************************************************/
            /*! exports provided: default */
            /***/ function(module, __webpack_exports__, __webpack_require__) {
                "use strict";
                __webpack_require__.r(__webpack_exports__);
                /* harmony export (binding) */ __webpack_require__.d(
                    __webpack_exports__,
                    "default",
                    function() {
                        return _setPrototypeOf;
                    }
                );
                /* harmony import */ var _core_js_object_set_prototype_of__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(
                    /*! ../../core-js/object/set-prototype-of */ "../node_modules/@babel/runtime-corejs2/core-js/object/set-prototype-of.js"
                );
                /* harmony import */ var _core_js_object_set_prototype_of__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/ __webpack_require__.n(
                    _core_js_object_set_prototype_of__WEBPACK_IMPORTED_MODULE_0__
                );

                function _setPrototypeOf(o, p) {
                    _setPrototypeOf =
                        _core_js_object_set_prototype_of__WEBPACK_IMPORTED_MODULE_0___default.a ||
                        function _setPrototypeOf(o, p) {
                            o.__proto__ = p;
                            return o;
                        };

                    return _setPrototypeOf(o, p);
                }

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/esm/typeof.js":
            /*!********************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/esm/typeof.js ***!
  \********************************************************************/
            /*! exports provided: default */
            /***/ function(module, __webpack_exports__, __webpack_require__) {
                "use strict";
                __webpack_require__.r(__webpack_exports__);
                /* harmony export (binding) */ __webpack_require__.d(
                    __webpack_exports__,
                    "default",
                    function() {
                        return _typeof;
                    }
                );
                /* harmony import */ var _core_js_symbol_iterator__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(
                    /*! ../../core-js/symbol/iterator */ "../node_modules/@babel/runtime-corejs2/core-js/symbol/iterator.js"
                );
                /* harmony import */ var _core_js_symbol_iterator__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/ __webpack_require__.n(
                    _core_js_symbol_iterator__WEBPACK_IMPORTED_MODULE_0__
                );
                /* harmony import */ var _core_js_symbol__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(
                    /*! ../../core-js/symbol */ "../node_modules/@babel/runtime-corejs2/core-js/symbol.js"
                );
                /* harmony import */ var _core_js_symbol__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/ __webpack_require__.n(
                    _core_js_symbol__WEBPACK_IMPORTED_MODULE_1__
                );

                function _typeof2(obj) {
                    if (
                        typeof _core_js_symbol__WEBPACK_IMPORTED_MODULE_1___default.a ===
                            "function" &&
                        typeof _core_js_symbol_iterator__WEBPACK_IMPORTED_MODULE_0___default.a ===
                            "symbol"
                    ) {
                        _typeof2 = function _typeof2(obj) {
                            return typeof obj;
                        };
                    } else {
                        _typeof2 = function _typeof2(obj) {
                            return obj &&
                                typeof _core_js_symbol__WEBPACK_IMPORTED_MODULE_1___default.a ===
                                    "function" &&
                                obj.constructor ===
                                    _core_js_symbol__WEBPACK_IMPORTED_MODULE_1___default.a &&
                                obj !==
                                    _core_js_symbol__WEBPACK_IMPORTED_MODULE_1___default
                                        .a.prototype
                                ? "symbol"
                                : typeof obj;
                        };
                    }
                    return _typeof2(obj);
                }

                function _typeof(obj) {
                    if (
                        typeof _core_js_symbol__WEBPACK_IMPORTED_MODULE_1___default.a ===
                            "function" &&
                        _typeof2(
                            _core_js_symbol_iterator__WEBPACK_IMPORTED_MODULE_0___default.a
                        ) === "symbol"
                    ) {
                        _typeof = function _typeof(obj) {
                            return _typeof2(obj);
                        };
                    } else {
                        _typeof = function _typeof(obj) {
                            return obj &&
                                typeof _core_js_symbol__WEBPACK_IMPORTED_MODULE_1___default.a ===
                                    "function" &&
                                obj.constructor ===
                                    _core_js_symbol__WEBPACK_IMPORTED_MODULE_1___default.a &&
                                obj !==
                                    _core_js_symbol__WEBPACK_IMPORTED_MODULE_1___default
                                        .a.prototype
                                ? "symbol"
                                : _typeof2(obj);
                        };
                    }

                    return _typeof(obj);
                }

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/regenerator/index.js":
            /*!*******************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/regenerator/index.js ***!
  \*******************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! regenerator-runtime */ "regenerator-runtime"
                );

                /***/
            },

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
                    /*! react */ "react"
                );
                /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_7___default = /*#__PURE__*/ __webpack_require__.n(
                    react__WEBPACK_IMPORTED_MODULE_7__
                );
                /* harmony import */ var isomorphic_fetch__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(
                    /*! isomorphic-fetch */ "isomorphic-fetch"
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
                                                                                                            return Promise.resolve(/*! import() */).then(
                                                                                                                __webpack_require__.t.bind(
                                                                                                                    null,
                                                                                                                    /*! jsdom */ "jsdom",
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

                /* harmony default export */ __webpack_exports__[
                    "default"
                ] = Home;

                /***/
            },

        /***/ 3:
            /*!*******************************!*\
  !*** multi ./pages/index.tsx ***!
  \*******************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! /Users/gil308/projects/magda/magda-metadata/magda-ui-gateway/pages/index.tsx */ "./pages/index.tsx"
                );

                /***/
            },

        /***/ "core-js/library/fn/object/create":
            /*!***************************************************!*\
  !*** external "core-js/library/fn/object/create" ***!
  \***************************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("core-js/library/fn/object/create");

                /***/
            },

        /***/ "core-js/library/fn/object/define-property":
            /*!************************************************************!*\
  !*** external "core-js/library/fn/object/define-property" ***!
  \************************************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("core-js/library/fn/object/define-property");

                /***/
            },

        /***/ "core-js/library/fn/object/get-prototype-of":
            /*!*************************************************************!*\
  !*** external "core-js/library/fn/object/get-prototype-of" ***!
  \*************************************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("core-js/library/fn/object/get-prototype-of");

                /***/
            },

        /***/ "core-js/library/fn/object/set-prototype-of":
            /*!*************************************************************!*\
  !*** external "core-js/library/fn/object/set-prototype-of" ***!
  \*************************************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("core-js/library/fn/object/set-prototype-of");

                /***/
            },

        /***/ "core-js/library/fn/promise":
            /*!*********************************************!*\
  !*** external "core-js/library/fn/promise" ***!
  \*********************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("core-js/library/fn/promise");

                /***/
            },

        /***/ "core-js/library/fn/symbol":
            /*!********************************************!*\
  !*** external "core-js/library/fn/symbol" ***!
  \********************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("core-js/library/fn/symbol");

                /***/
            },

        /***/ "core-js/library/fn/symbol/iterator":
            /*!*****************************************************!*\
  !*** external "core-js/library/fn/symbol/iterator" ***!
  \*****************************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("core-js/library/fn/symbol/iterator");

                /***/
            },

        /***/ "isomorphic-fetch":
            /*!***********************************!*\
  !*** external "isomorphic-fetch" ***!
  \***********************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("isomorphic-fetch");

                /***/
            },

        /***/ jsdom:
            /*!************************!*\
  !*** external "jsdom" ***!
  \************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("jsdom");

                /***/
            },

        /***/ react:
            /*!************************!*\
  !*** external "react" ***!
  \************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("react");

                /***/
            },

        /***/ "regenerator-runtime":
            /*!**************************************!*\
  !*** external "regenerator-runtime" ***!
  \**************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("regenerator-runtime");

                /***/
            }

        /******/
    }
);
//# sourceMappingURL=index.js.map
