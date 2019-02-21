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
        /***/ "../node_modules/@babel/runtime-corejs2/core-js/json/stringify.js":
            /*!************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/core-js/json/stringify.js ***!
  \************************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! core-js/library/fn/json/stringify */ "core-js/library/fn/json/stringify"
                );

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/core-js/object/assign.js":
            /*!***********************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/core-js/object/assign.js ***!
  \***********************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! core-js/library/fn/object/assign */ "core-js/library/fn/object/assign"
                );

                /***/
            },

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

        /***/ "../node_modules/@babel/runtime-corejs2/core-js/reflect/construct.js":
            /*!***************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/core-js/reflect/construct.js ***!
  \***************************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! core-js/library/fn/reflect/construct */ "core-js/library/fn/reflect/construct"
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

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/assertThisInitialized.js":
            /*!*******************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/assertThisInitialized.js ***!
  \*******************************************************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                function _assertThisInitialized(self) {
                    if (self === void 0) {
                        throw new ReferenceError(
                            "this hasn't been initialised - super() hasn't been called"
                        );
                    }

                    return self;
                }

                module.exports = _assertThisInitialized;

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/classCallCheck.js":
            /*!************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/classCallCheck.js ***!
  \************************************************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                function _classCallCheck(instance, Constructor) {
                    if (!(instance instanceof Constructor)) {
                        throw new TypeError(
                            "Cannot call a class as a function"
                        );
                    }
                }

                module.exports = _classCallCheck;

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/construct.js":
            /*!*******************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/construct.js ***!
  \*******************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                var _Reflect$construct = __webpack_require__(
                    /*! ../core-js/reflect/construct */ "../node_modules/@babel/runtime-corejs2/core-js/reflect/construct.js"
                );

                var setPrototypeOf = __webpack_require__(
                    /*! ./setPrototypeOf */ "../node_modules/@babel/runtime-corejs2/helpers/setPrototypeOf.js"
                );

                function isNativeReflectConstruct() {
                    if (typeof Reflect === "undefined" || !_Reflect$construct)
                        return false;
                    if (_Reflect$construct.sham) return false;
                    if (typeof Proxy === "function") return true;

                    try {
                        Date.prototype.toString.call(
                            _Reflect$construct(Date, [], function() {})
                        );
                        return true;
                    } catch (e) {
                        return false;
                    }
                }

                function _construct(Parent, args, Class) {
                    if (isNativeReflectConstruct()) {
                        module.exports = _construct = _Reflect$construct;
                    } else {
                        module.exports = _construct = function _construct(
                            Parent,
                            args,
                            Class
                        ) {
                            var a = [null];
                            a.push.apply(a, args);
                            var Constructor = Function.bind.apply(Parent, a);
                            var instance = new Constructor();
                            if (Class)
                                setPrototypeOf(instance, Class.prototype);
                            return instance;
                        };
                    }

                    return _construct.apply(null, arguments);
                }

                module.exports = _construct;

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/createClass.js":
            /*!*********************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/createClass.js ***!
  \*********************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                var _Object$defineProperty = __webpack_require__(
                    /*! ../core-js/object/define-property */ "../node_modules/@babel/runtime-corejs2/core-js/object/define-property.js"
                );

                function _defineProperties(target, props) {
                    for (var i = 0; i < props.length; i++) {
                        var descriptor = props[i];
                        descriptor.enumerable = descriptor.enumerable || false;
                        descriptor.configurable = true;
                        if ("value" in descriptor) descriptor.writable = true;

                        _Object$defineProperty(
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

                module.exports = _createClass;

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

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/esm/defineProperty.js":
            /*!****************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/esm/defineProperty.js ***!
  \****************************************************************************/
            /*! exports provided: default */
            /***/ function(module, __webpack_exports__, __webpack_require__) {
                "use strict";
                __webpack_require__.r(__webpack_exports__);
                /* harmony export (binding) */ __webpack_require__.d(
                    __webpack_exports__,
                    "default",
                    function() {
                        return _defineProperty;
                    }
                );
                /* harmony import */ var _core_js_object_define_property__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(
                    /*! ../../core-js/object/define-property */ "../node_modules/@babel/runtime-corejs2/core-js/object/define-property.js"
                );
                /* harmony import */ var _core_js_object_define_property__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/ __webpack_require__.n(
                    _core_js_object_define_property__WEBPACK_IMPORTED_MODULE_0__
                );

                function _defineProperty(obj, key, value) {
                    if (key in obj) {
                        _core_js_object_define_property__WEBPACK_IMPORTED_MODULE_0___default()(
                            obj,
                            key,
                            {
                                value: value,
                                enumerable: true,
                                configurable: true,
                                writable: true
                            }
                        );
                    } else {
                        obj[key] = value;
                    }

                    return obj;
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

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/getPrototypeOf.js":
            /*!************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/getPrototypeOf.js ***!
  \************************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                var _Object$getPrototypeOf = __webpack_require__(
                    /*! ../core-js/object/get-prototype-of */ "../node_modules/@babel/runtime-corejs2/core-js/object/get-prototype-of.js"
                );

                var _Object$setPrototypeOf = __webpack_require__(
                    /*! ../core-js/object/set-prototype-of */ "../node_modules/@babel/runtime-corejs2/core-js/object/set-prototype-of.js"
                );

                function _getPrototypeOf(o) {
                    module.exports = _getPrototypeOf = _Object$setPrototypeOf
                        ? _Object$getPrototypeOf
                        : function _getPrototypeOf(o) {
                              return o.__proto__ || _Object$getPrototypeOf(o);
                          };
                    return _getPrototypeOf(o);
                }

                module.exports = _getPrototypeOf;

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/inherits.js":
            /*!******************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/inherits.js ***!
  \******************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                var _Object$create = __webpack_require__(
                    /*! ../core-js/object/create */ "../node_modules/@babel/runtime-corejs2/core-js/object/create.js"
                );

                var setPrototypeOf = __webpack_require__(
                    /*! ./setPrototypeOf */ "../node_modules/@babel/runtime-corejs2/helpers/setPrototypeOf.js"
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

                    subClass.prototype = _Object$create(
                        superClass && superClass.prototype,
                        {
                            constructor: {
                                value: subClass,
                                writable: true,
                                configurable: true
                            }
                        }
                    );
                    if (superClass) setPrototypeOf(subClass, superClass);
                }

                module.exports = _inherits;

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/interopRequireDefault.js":
            /*!*******************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/interopRequireDefault.js ***!
  \*******************************************************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                function _interopRequireDefault(obj) {
                    return obj && obj.__esModule
                        ? obj
                        : {
                              default: obj
                          };
                }

                module.exports = _interopRequireDefault;

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/possibleConstructorReturn.js":
            /*!***********************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/possibleConstructorReturn.js ***!
  \***********************************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                var _typeof = __webpack_require__(
                    /*! ../helpers/typeof */ "../node_modules/@babel/runtime-corejs2/helpers/typeof.js"
                );

                var assertThisInitialized = __webpack_require__(
                    /*! ./assertThisInitialized */ "../node_modules/@babel/runtime-corejs2/helpers/assertThisInitialized.js"
                );

                function _possibleConstructorReturn(self, call) {
                    if (
                        call &&
                        (_typeof(call) === "object" ||
                            typeof call === "function")
                    ) {
                        return call;
                    }

                    return assertThisInitialized(self);
                }

                module.exports = _possibleConstructorReturn;

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/setPrototypeOf.js":
            /*!************************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/setPrototypeOf.js ***!
  \************************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                var _Object$setPrototypeOf = __webpack_require__(
                    /*! ../core-js/object/set-prototype-of */ "../node_modules/@babel/runtime-corejs2/core-js/object/set-prototype-of.js"
                );

                function _setPrototypeOf(o, p) {
                    module.exports = _setPrototypeOf =
                        _Object$setPrototypeOf ||
                        function _setPrototypeOf(o, p) {
                            o.__proto__ = p;
                            return o;
                        };

                    return _setPrototypeOf(o, p);
                }

                module.exports = _setPrototypeOf;

                /***/
            },

        /***/ "../node_modules/@babel/runtime-corejs2/helpers/typeof.js":
            /*!****************************************************************!*\
  !*** ../node_modules/@babel/runtime-corejs2/helpers/typeof.js ***!
  \****************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                var _Symbol$iterator = __webpack_require__(
                    /*! ../core-js/symbol/iterator */ "../node_modules/@babel/runtime-corejs2/core-js/symbol/iterator.js"
                );

                var _Symbol = __webpack_require__(
                    /*! ../core-js/symbol */ "../node_modules/@babel/runtime-corejs2/core-js/symbol.js"
                );

                function _typeof2(obj) {
                    if (
                        typeof _Symbol === "function" &&
                        typeof _Symbol$iterator === "symbol"
                    ) {
                        _typeof2 = function _typeof2(obj) {
                            return typeof obj;
                        };
                    } else {
                        _typeof2 = function _typeof2(obj) {
                            return obj &&
                                typeof _Symbol === "function" &&
                                obj.constructor === _Symbol &&
                                obj !== _Symbol.prototype
                                ? "symbol"
                                : typeof obj;
                        };
                    }
                    return _typeof2(obj);
                }

                function _typeof(obj) {
                    if (
                        typeof _Symbol === "function" &&
                        _typeof2(_Symbol$iterator) === "symbol"
                    ) {
                        module.exports = _typeof = function _typeof(obj) {
                            return _typeof2(obj);
                        };
                    } else {
                        module.exports = _typeof = function _typeof(obj) {
                            return obj &&
                                typeof _Symbol === "function" &&
                                obj.constructor === _Symbol &&
                                obj !== _Symbol.prototype
                                ? "symbol"
                                : _typeof2(obj);
                        };
                    }

                    return _typeof(obj);
                }

                module.exports = _typeof;

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

        /***/ "./node_modules/hoist-non-react-statics/dist/hoist-non-react-statics.cjs.js":
            /*!**********************************************************************************!*\
  !*** ./node_modules/hoist-non-react-statics/dist/hoist-non-react-statics.cjs.js ***!
  \**********************************************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                "use strict";

                /**
                 * Copyright 2015, Yahoo! Inc.
                 * Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
                 */
                var ReactIs = __webpack_require__(/*! react-is */ "react-is");
                var REACT_STATICS = {
                    childContextTypes: true,
                    contextType: true,
                    contextTypes: true,
                    defaultProps: true,
                    displayName: true,
                    getDefaultProps: true,
                    getDerivedStateFromError: true,
                    getDerivedStateFromProps: true,
                    mixins: true,
                    propTypes: true,
                    type: true
                };

                var KNOWN_STATICS = {
                    name: true,
                    length: true,
                    prototype: true,
                    caller: true,
                    callee: true,
                    arguments: true,
                    arity: true
                };

                var FORWARD_REF_STATICS = {
                    $$typeof: true,
                    render: true
                };

                var TYPE_STATICS = {};
                TYPE_STATICS[ReactIs.ForwardRef] = FORWARD_REF_STATICS;

                var defineProperty = Object.defineProperty;
                var getOwnPropertyNames = Object.getOwnPropertyNames;
                var getOwnPropertySymbols = Object.getOwnPropertySymbols;
                var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
                var getPrototypeOf = Object.getPrototypeOf;
                var objectPrototype = Object.prototype;

                function hoistNonReactStatics(
                    targetComponent,
                    sourceComponent,
                    blacklist
                ) {
                    if (typeof sourceComponent !== "string") {
                        // don't hoist over string (html) components

                        if (objectPrototype) {
                            var inheritedComponent = getPrototypeOf(
                                sourceComponent
                            );
                            if (
                                inheritedComponent &&
                                inheritedComponent !== objectPrototype
                            ) {
                                hoistNonReactStatics(
                                    targetComponent,
                                    inheritedComponent,
                                    blacklist
                                );
                            }
                        }

                        var keys = getOwnPropertyNames(sourceComponent);

                        if (getOwnPropertySymbols) {
                            keys = keys.concat(
                                getOwnPropertySymbols(sourceComponent)
                            );
                        }

                        var targetStatics =
                            TYPE_STATICS[targetComponent["$$typeof"]] ||
                            REACT_STATICS;
                        var sourceStatics =
                            TYPE_STATICS[sourceComponent["$$typeof"]] ||
                            REACT_STATICS;

                        for (var i = 0; i < keys.length; ++i) {
                            var key = keys[i];
                            if (
                                !KNOWN_STATICS[key] &&
                                !(blacklist && blacklist[key]) &&
                                !(sourceStatics && sourceStatics[key]) &&
                                !(targetStatics && targetStatics[key])
                            ) {
                                var descriptor = getOwnPropertyDescriptor(
                                    sourceComponent,
                                    key
                                );
                                try {
                                    // Avoid failures from read-only properties
                                    defineProperty(
                                        targetComponent,
                                        key,
                                        descriptor
                                    );
                                } catch (e) {}
                            }
                        }

                        return targetComponent;
                    }

                    return targetComponent;
                }

                module.exports = hoistNonReactStatics;

                /***/
            },

        /***/ "./node_modules/next/dist/client/link.js":
            /*!***********************************************!*\
  !*** ./node_modules/next/dist/client/link.js ***!
  \***********************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                "use strict";

                /* global __NEXT_DATA__ */

                var _interopRequireDefault = __webpack_require__(
                    /*! @babel/runtime-corejs2/helpers/interopRequireDefault */ "../node_modules/@babel/runtime-corejs2/helpers/interopRequireDefault.js"
                );

                var _stringify = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/core-js/json/stringify */ "../node_modules/@babel/runtime-corejs2/core-js/json/stringify.js"
                    )
                );

                var _typeof2 = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/helpers/typeof */ "../node_modules/@babel/runtime-corejs2/helpers/typeof.js"
                    )
                );

                var _classCallCheck2 = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/helpers/classCallCheck */ "../node_modules/@babel/runtime-corejs2/helpers/classCallCheck.js"
                    )
                );

                var _createClass2 = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/helpers/createClass */ "../node_modules/@babel/runtime-corejs2/helpers/createClass.js"
                    )
                );

                var _possibleConstructorReturn2 = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/helpers/possibleConstructorReturn */ "../node_modules/@babel/runtime-corejs2/helpers/possibleConstructorReturn.js"
                    )
                );

                var _getPrototypeOf2 = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/helpers/getPrototypeOf */ "../node_modules/@babel/runtime-corejs2/helpers/getPrototypeOf.js"
                    )
                );

                var _inherits2 = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/helpers/inherits */ "../node_modules/@babel/runtime-corejs2/helpers/inherits.js"
                    )
                );

                var __importStar =
                    (void 0 && (void 0).__importStar) ||
                    function(mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod) {
                                if (Object.hasOwnProperty.call(mod, k))
                                    result[k] = mod[k];
                            }
                        result["default"] = mod;
                        return result;
                    };

                var __importDefault =
                    (void 0 && (void 0).__importDefault) ||
                    function(mod) {
                        return mod && mod.__esModule
                            ? mod
                            : {
                                  default: mod
                              };
                    };

                Object.defineProperty(exports, "__esModule", {
                    value: true
                });

                var url_1 = __webpack_require__(/*! url */ "url");

                var react_1 = __importStar(
                    __webpack_require__(/*! react */ "react")
                );

                var prop_types_1 = __importDefault(
                    __webpack_require__(/*! prop-types */ "prop-types")
                );

                var router_1 = __importStar(
                    __webpack_require__(
                        /*! next/router */ "./node_modules/next/router.js"
                    )
                );

                var utils_1 = __webpack_require__(
                    /*! next-server/dist/lib/utils */ "next-server/dist/lib/utils"
                );

                function isLocal(href) {
                    var url = url_1.parse(href, false, true);
                    var origin = url_1.parse(
                        utils_1.getLocationOrigin(),
                        false,
                        true
                    );
                    return (
                        !url.host ||
                        (url.protocol === origin.protocol &&
                            url.host === origin.host)
                    );
                }

                function memoizedFormatUrl(formatUrl) {
                    var lastHref = null;
                    var lastAs = null;
                    var lastResult = null;
                    return function(href, as) {
                        if (href === lastHref && as === lastAs) {
                            return lastResult;
                        }

                        var result = formatUrl(href, as);
                        lastHref = href;
                        lastAs = as;
                        lastResult = result;
                        return result;
                    };
                }

                var Link =
                    /*#__PURE__*/
                    (function(_react_1$Component) {
                        (0, _inherits2.default)(Link, _react_1$Component);

                        function Link() {
                            var _this;

                            (0, _classCallCheck2.default)(this, Link);
                            _this = (0, _possibleConstructorReturn2.default)(
                                this,
                                (0, _getPrototypeOf2.default)(Link).apply(
                                    this,
                                    arguments
                                )
                            ); // The function is memoized so that no extra lifecycles are needed
                            // as per https://reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html

                            _this.formatUrls = memoizedFormatUrl(function(
                                href,
                                asHref
                            ) {
                                return {
                                    href:
                                        href &&
                                        (0, _typeof2.default)(href) === "object"
                                            ? url_1.format(href)
                                            : href,
                                    as:
                                        asHref &&
                                        (0, _typeof2.default)(asHref) ===
                                            "object"
                                            ? url_1.format(asHref)
                                            : asHref
                                };
                            });

                            _this.linkClicked = function(e) {
                                var _e$currentTarget = e.currentTarget,
                                    nodeName = _e$currentTarget.nodeName,
                                    target = _e$currentTarget.target;

                                if (
                                    nodeName === "A" &&
                                    ((target && target !== "_self") ||
                                        e.metaKey ||
                                        e.ctrlKey ||
                                        e.shiftKey ||
                                        (e.nativeEvent &&
                                            e.nativeEvent.which === 2))
                                ) {
                                    // ignore click for new tab / new window behavior
                                    return;
                                }

                                var _this$formatUrls = _this.formatUrls(
                                        _this.props.href,
                                        _this.props.as
                                    ),
                                    href = _this$formatUrls.href,
                                    as = _this$formatUrls.as;

                                if (!isLocal(href)) {
                                    // ignore click if it's outside our scope
                                    return;
                                }

                                var pathname = window.location.pathname;
                                href = url_1.resolve(pathname, href);
                                as = as ? url_1.resolve(pathname, as) : href;
                                e.preventDefault(); //  avoid scroll for urls with anchor refs

                                var scroll = _this.props.scroll;

                                if (scroll == null) {
                                    scroll = as.indexOf("#") < 0;
                                } // replace state instead of push if prop is present

                                router_1.default[
                                    _this.props.replace ? "replace" : "push"
                                ](href, as, {
                                    shallow: _this.props.shallow
                                })
                                    .then(function(success) {
                                        if (!success) return;

                                        if (scroll) {
                                            window.scrollTo(0, 0);
                                            document.body.focus();
                                        }
                                    })
                                    .catch(function(err) {
                                        if (_this.props.onError)
                                            _this.props.onError(err);
                                    });
                            };

                            return _this;
                        }

                        (0, _createClass2.default)(Link, [
                            {
                                key: "componentDidMount",
                                value: function componentDidMount() {
                                    this.prefetch();
                                }
                            },
                            {
                                key: "componentDidUpdate",
                                value: function componentDidUpdate(prevProps) {
                                    if (
                                        (0, _stringify.default)(
                                            this.props.href
                                        ) !==
                                        (0, _stringify.default)(prevProps.href)
                                    ) {
                                        this.prefetch();
                                    }
                                }
                            },
                            {
                                key: "prefetch",
                                value: function prefetch() {
                                    if (!this.props.prefetch) return;
                                    if (typeof window === "undefined") return; // Prefetch the JSON page if asked (only in the client)

                                    var pathname = window.location.pathname;

                                    var _this$formatUrls2 = this.formatUrls(
                                            this.props.href,
                                            this.props.as
                                        ),
                                        parsedHref = _this$formatUrls2.href;

                                    var href = url_1.resolve(
                                        pathname,
                                        parsedHref
                                    );
                                    router_1.default.prefetch(href);
                                }
                            },
                            {
                                key: "render",
                                value: function render() {
                                    var _this2 = this;

                                    var children = this.props.children;

                                    var _this$formatUrls3 = this.formatUrls(
                                            this.props.href,
                                            this.props.as
                                        ),
                                        href = _this$formatUrls3.href,
                                        as = _this$formatUrls3.as; // Deprecated. Warning shown by propType check. If the childen provided is a string (<Link>example</Link>) we wrap it in an <a> tag

                                    if (typeof children === "string") {
                                        children = react_1.default.createElement(
                                            "a",
                                            null,
                                            children
                                        );
                                    } // This will return the first child, if multiple are provided it will throw an error

                                    var child = react_1.Children.only(children);
                                    var props = {
                                        onClick: function onClick(e) {
                                            if (
                                                child.props &&
                                                typeof child.props.onClick ===
                                                    "function"
                                            ) {
                                                child.props.onClick(e);
                                            }

                                            if (!e.defaultPrevented) {
                                                _this2.linkClicked(e);
                                            }
                                        }
                                    }; // If child is an <a> tag and doesn't have a href attribute, or if the 'passHref' property is
                                    // defined, we specify the current 'href', so that repetition is not needed by the user

                                    if (
                                        this.props.passHref ||
                                        (child.type === "a" &&
                                            !("href" in child.props))
                                    ) {
                                        props.href = as || href;
                                    } // Add the ending slash to the paths. So, we can serve the
                                    // "<page>/index.html" directly.

                                    if (
                                        props.href &&
                                        typeof __NEXT_DATA__ !== "undefined" &&
                                        __NEXT_DATA__.nextExport
                                    ) {
                                        props.href = router_1.Router._rewriteUrlForNextExport(
                                            props.href
                                        );
                                    }

                                    return react_1.default.cloneElement(
                                        child,
                                        props
                                    );
                                }
                            }
                        ]);
                        return Link;
                    })(react_1.Component);

                if (true) {
                    var warn = utils_1.execOnce(console.error); // This module gets removed by webpack.IgnorePlugin

                    var exact = __webpack_require__(
                        /*! prop-types-exact */ "prop-types-exact"
                    );

                    Link.propTypes = exact({
                        href: prop_types_1.default.oneOfType([
                            prop_types_1.default.string,
                            prop_types_1.default.object
                        ]).isRequired,
                        as: prop_types_1.default.oneOfType([
                            prop_types_1.default.string,
                            prop_types_1.default.object
                        ]),
                        prefetch: prop_types_1.default.bool,
                        replace: prop_types_1.default.bool,
                        shallow: prop_types_1.default.bool,
                        passHref: prop_types_1.default.bool,
                        scroll: prop_types_1.default.bool,
                        children: prop_types_1.default.oneOfType([
                            prop_types_1.default.element,
                            function(props, propName) {
                                var value = props[propName];

                                if (typeof value === "string") {
                                    warn(
                                        "Warning: You're using a string directly inside <Link>. This usage has been deprecated. Please add an <a> tag as child of <Link>"
                                    );
                                }

                                return null;
                            }
                        ]).isRequired
                    });
                }

                exports.default = Link;

                /***/
            },

        /***/ "./node_modules/next/dist/client/router.js":
            /*!*************************************************!*\
  !*** ./node_modules/next/dist/client/router.js ***!
  \*************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                "use strict";

                var _interopRequireDefault = __webpack_require__(
                    /*! @babel/runtime-corejs2/helpers/interopRequireDefault */ "../node_modules/@babel/runtime-corejs2/helpers/interopRequireDefault.js"
                );

                var _assign = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/core-js/object/assign */ "../node_modules/@babel/runtime-corejs2/core-js/object/assign.js"
                    )
                );

                var _typeof2 = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/helpers/typeof */ "../node_modules/@babel/runtime-corejs2/helpers/typeof.js"
                    )
                );

                var _construct2 = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/helpers/construct */ "../node_modules/@babel/runtime-corejs2/helpers/construct.js"
                    )
                );

                var _defineProperty = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/core-js/object/define-property */ "../node_modules/@babel/runtime-corejs2/core-js/object/define-property.js"
                    )
                );

                var __importDefault =
                    (void 0 && (void 0).__importDefault) ||
                    function(mod) {
                        return mod && mod.__esModule
                            ? mod
                            : {
                                  default: mod
                              };
                    };

                Object.defineProperty(exports, "__esModule", {
                    value: true
                });
                /* global window */

                var router_1 = __importDefault(
                    __webpack_require__(
                        /*! next-server/dist/lib/router/router */ "next-server/dist/lib/router/router"
                    )
                );

                var SingletonRouter = {
                    router: null,
                    readyCallbacks: [],
                    ready: function ready(cb) {
                        if (this.router) return cb();

                        if (typeof window !== "undefined") {
                            this.readyCallbacks.push(cb);
                        }
                    }
                }; // Create public properties and methods of the router in the SingletonRouter

                var urlPropertyFields = [
                    "pathname",
                    "route",
                    "query",
                    "asPath"
                ];
                var propertyFields = ["components"];
                var routerEvents = [
                    "routeChangeStart",
                    "beforeHistoryChange",
                    "routeChangeComplete",
                    "routeChangeError",
                    "hashChangeStart",
                    "hashChangeComplete"
                ];
                var coreMethodFields = [
                    "push",
                    "replace",
                    "reload",
                    "back",
                    "prefetch",
                    "beforePopState"
                ]; // Events is a static property on the router, the router doesn't have to be initialized to use it

                Object.defineProperty(SingletonRouter, "events", {
                    get: function get() {
                        return router_1.default.events;
                    }
                });
                propertyFields
                    .concat(urlPropertyFields)
                    .forEach(function(field) {
                        // Here we need to use Object.defineProperty because, we need to return
                        // the property assigned to the actual router
                        // The value might get changed as we change routes and this is the
                        // proper way to access it
                        (0, _defineProperty.default)(SingletonRouter, field, {
                            get: function get() {
                                throwIfNoRouter();
                                return SingletonRouter.router[field];
                            }
                        });
                    });
                coreMethodFields.forEach(function(field) {
                    SingletonRouter[field] = function() {
                        var _SingletonRouter$rout;

                        throwIfNoRouter();
                        return (_SingletonRouter$rout = SingletonRouter.router)[
                            field
                        ].apply(_SingletonRouter$rout, arguments);
                    };
                });
                routerEvents.forEach(function(event) {
                    SingletonRouter.ready(function() {
                        router_1.default.events.on(event, function() {
                            var eventField = "on"
                                .concat(event.charAt(0).toUpperCase())
                                .concat(event.substring(1));

                            if (SingletonRouter[eventField]) {
                                try {
                                    SingletonRouter[eventField].apply(
                                        SingletonRouter,
                                        arguments
                                    );
                                } catch (err) {
                                    console.error(
                                        "Error when running the Router event: ".concat(
                                            eventField
                                        )
                                    );
                                    console.error(
                                        ""
                                            .concat(err.message, "\n")
                                            .concat(err.stack)
                                    );
                                }
                            }
                        });
                    });
                });

                function throwIfNoRouter() {
                    if (!SingletonRouter.router) {
                        var message =
                            "No router instance found.\n" +
                            'You should only use "next/router" inside the client side of your app.\n';
                        throw new Error(message);
                    }
                } // Export the SingletonRouter and this is the public API.

                exports.default = SingletonRouter; // Reexport the withRoute HOC

                var with_router_1 = __webpack_require__(
                    /*! ./with-router */ "./node_modules/next/dist/client/with-router.js"
                );

                exports.withRouter = with_router_1.default; // INTERNAL APIS
                // -------------
                // (do not use following exports inside the app)
                // Create a router and assign it as the singleton instance.
                // This is used in client side when we are initilizing the app.
                // This should **not** use inside the server.

                exports.createRouter = function() {
                    for (
                        var _len = arguments.length,
                            args = new Array(_len),
                            _key = 0;
                        _key < _len;
                        _key++
                    ) {
                        args[_key] = arguments[_key];
                    }

                    SingletonRouter.router = (0, _construct2.default)(
                        router_1.default,
                        args
                    );
                    SingletonRouter.readyCallbacks.forEach(function(cb) {
                        return cb();
                    });
                    SingletonRouter.readyCallbacks = [];
                    return SingletonRouter.router;
                }; // Export the actual Router class, which is usually used inside the server

                exports.Router = router_1.default; // This function is used to create the `withRouter` router instance

                function makePublicRouterInstance(router) {
                    var instance = {};

                    for (var _i = 0; _i < urlPropertyFields.length; _i++) {
                        var property = urlPropertyFields[_i];

                        if (
                            (0, _typeof2.default)(router[property]) === "object"
                        ) {
                            instance[property] = (0, _assign.default)(
                                {},
                                router[property]
                            ); // makes sure query is not stateful

                            continue;
                        }

                        instance[property] = router[property];
                    } // Events is a static property on the router, the router doesn't have to be initialized to use it

                    instance.events = router_1.default.events;
                    propertyFields.forEach(function(field) {
                        // Here we need to use Object.defineProperty because, we need to return
                        // the property assigned to the actual router
                        // The value might get changed as we change routes and this is the
                        // proper way to access it
                        (0, _defineProperty.default)(instance, field, {
                            get: function get() {
                                return router[field];
                            }
                        });
                    });
                    coreMethodFields.forEach(function(field) {
                        instance[field] = function() {
                            return router[field].apply(router, arguments);
                        };
                    });
                    return instance;
                }

                exports.makePublicRouterInstance = makePublicRouterInstance;

                /***/
            },

        /***/ "./node_modules/next/dist/client/with-router.js":
            /*!******************************************************!*\
  !*** ./node_modules/next/dist/client/with-router.js ***!
  \******************************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                "use strict";

                var _interopRequireDefault = __webpack_require__(
                    /*! @babel/runtime-corejs2/helpers/interopRequireDefault */ "../node_modules/@babel/runtime-corejs2/helpers/interopRequireDefault.js"
                );

                var _assign = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/core-js/object/assign */ "../node_modules/@babel/runtime-corejs2/core-js/object/assign.js"
                    )
                );

                var _classCallCheck2 = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/helpers/classCallCheck */ "../node_modules/@babel/runtime-corejs2/helpers/classCallCheck.js"
                    )
                );

                var _createClass2 = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/helpers/createClass */ "../node_modules/@babel/runtime-corejs2/helpers/createClass.js"
                    )
                );

                var _possibleConstructorReturn2 = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/helpers/possibleConstructorReturn */ "../node_modules/@babel/runtime-corejs2/helpers/possibleConstructorReturn.js"
                    )
                );

                var _getPrototypeOf2 = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/helpers/getPrototypeOf */ "../node_modules/@babel/runtime-corejs2/helpers/getPrototypeOf.js"
                    )
                );

                var _inherits2 = _interopRequireDefault(
                    __webpack_require__(
                        /*! @babel/runtime-corejs2/helpers/inherits */ "../node_modules/@babel/runtime-corejs2/helpers/inherits.js"
                    )
                );

                var __importStar =
                    (void 0 && (void 0).__importStar) ||
                    function(mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod) {
                                if (Object.hasOwnProperty.call(mod, k))
                                    result[k] = mod[k];
                            }
                        result["default"] = mod;
                        return result;
                    };

                var __importDefault =
                    (void 0 && (void 0).__importDefault) ||
                    function(mod) {
                        return mod && mod.__esModule
                            ? mod
                            : {
                                  default: mod
                              };
                    };

                Object.defineProperty(exports, "__esModule", {
                    value: true
                });

                var react_1 = __importStar(
                    __webpack_require__(/*! react */ "react")
                );

                var prop_types_1 = __importDefault(
                    __webpack_require__(/*! prop-types */ "prop-types")
                );

                var hoist_non_react_statics_1 = __importDefault(
                    __webpack_require__(
                        /*! hoist-non-react-statics */ "./node_modules/hoist-non-react-statics/dist/hoist-non-react-statics.cjs.js"
                    )
                );

                var utils_1 = __webpack_require__(
                    /*! next-server/dist/lib/utils */ "next-server/dist/lib/utils"
                );

                function withRouter(ComposedComponent) {
                    var displayName = utils_1.getDisplayName(ComposedComponent);

                    var WithRouteWrapper =
                        /*#__PURE__*/
                        (function(_react_1$Component) {
                            (0, _inherits2.default)(
                                WithRouteWrapper,
                                _react_1$Component
                            );

                            function WithRouteWrapper() {
                                (0, _classCallCheck2.default)(
                                    this,
                                    WithRouteWrapper
                                );
                                return (0, _possibleConstructorReturn2.default)(
                                    this,
                                    (0, _getPrototypeOf2.default)(
                                        WithRouteWrapper
                                    ).apply(this, arguments)
                                );
                            }

                            (0, _createClass2.default)(WithRouteWrapper, [
                                {
                                    key: "render",
                                    value: function render() {
                                        return react_1.default.createElement(
                                            ComposedComponent,
                                            (0, _assign.default)(
                                                {
                                                    router: this.context.router
                                                },
                                                this.props
                                            )
                                        );
                                    }
                                }
                            ]);
                            return WithRouteWrapper;
                        })(react_1.Component);

                    WithRouteWrapper.contextTypes = {
                        router: prop_types_1.default.object
                    };
                    WithRouteWrapper.displayName = "withRouter(".concat(
                        displayName,
                        ")"
                    );
                    return hoist_non_react_statics_1.default(
                        WithRouteWrapper,
                        ComposedComponent
                    );
                }

                exports.default = withRouter;

                /***/
            },

        /***/ "./node_modules/next/link.js":
            /*!***********************************!*\
  !*** ./node_modules/next/link.js ***!
  \***********************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! ./dist/client/link */ "./node_modules/next/dist/client/link.js"
                );

                /***/
            },

        /***/ "./node_modules/next/router.js":
            /*!*************************************!*\
  !*** ./node_modules/next/router.js ***!
  \*************************************/
            /*! no static exports found */
            /***/ function(module, exports, __webpack_require__) {
                module.exports = __webpack_require__(
                    /*! ./dist/client/router */ "./node_modules/next/dist/client/router.js"
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
                /* harmony import */ var _babel_runtime_corejs2_helpers_esm_assertThisInitialized__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(
                    /*! @babel/runtime-corejs2/helpers/esm/assertThisInitialized */ "../node_modules/@babel/runtime-corejs2/helpers/esm/assertThisInitialized.js"
                );
                /* harmony import */ var _babel_runtime_corejs2_helpers_esm_defineProperty__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(
                    /*! @babel/runtime-corejs2/helpers/esm/defineProperty */ "../node_modules/@babel/runtime-corejs2/helpers/esm/defineProperty.js"
                );
                /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(
                    /*! react */ "react"
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
                    "/Users/gil308/projects/magda/magda-metadata/magda-ui-gateway/pages/index.tsx";

                var SOURCE_URL = "http://localhost:3001/?component=footer"; // const SOURCE_URL = "https://nationalmap.gov.au";

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
                                            newScript.innerHTML =
                                                script.innerHTML;

                                            for (
                                                var i =
                                                    script.attributes.length -
                                                    1;
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
                                                "replaced ".concat(
                                                    newScript.src
                                                )
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
                                                    lineNumber: 42
                                                },
                                                __self: this
                                            },
                                            react__WEBPACK_IMPORTED_MODULE_9___default.a.createElement(
                                                "div",
                                                {
                                                    ref: this.onRefAdded,
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
                                            react__WEBPACK_IMPORTED_MODULE_9___default.a.createElement(
                                                "div",
                                                {
                                                    __source: {
                                                        fileName: _jsxFileName,
                                                        lineNumber: 49
                                                    },
                                                    __self: this
                                                },
                                                react__WEBPACK_IMPORTED_MODULE_9___default.a.createElement(
                                                    "button",
                                                    {
                                                        onClick: function onClick() {
                                                            return alert(
                                                                "hello"
                                                            );
                                                        },
                                                        __source: {
                                                            fileName: _jsxFileName,
                                                            lineNumber: 50
                                                        },
                                                        __self: this
                                                    },
                                                    "hello"
                                                ),
                                                "body 2",
                                                react__WEBPACK_IMPORTED_MODULE_9___default.a.createElement(
                                                    next_link__WEBPACK_IMPORTED_MODULE_10___default.a,
                                                    {
                                                        href: "/otherpage",
                                                        __source: {
                                                            fileName: _jsxFileName,
                                                            lineNumber: 52
                                                        },
                                                        __self: this
                                                    },
                                                    react__WEBPACK_IMPORTED_MODULE_9___default.a.createElement(
                                                        "a",
                                                        {
                                                            __source: {
                                                                fileName: _jsxFileName,
                                                                lineNumber: 53
                                                            },
                                                            __self: this
                                                        },
                                                        "Go to other page"
                                                    )
                                                )
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
                                                    var _ref, html;

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
                                                                        _context.next = 2;
                                                                        return Object(
                                                                            _src_get_micro_frontend__WEBPACK_IMPORTED_MODULE_11__[
                                                                                "default"
                                                                            ]
                                                                        )(
                                                                            SOURCE_URL
                                                                        );

                                                                    case 2:
                                                                        _ref =
                                                                            _context.sent;
                                                                        html =
                                                                            _ref.html;
                                                                        return _context.abrupt(
                                                                            "return",
                                                                            {
                                                                                headerText: html
                                                                            }
                                                                        );

                                                                    case 5:
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
                    })(react__WEBPACK_IMPORTED_MODULE_9___default.a.Component); // if (typeof window !== "undefined") {
                //     class Component extends HTMLElement {
                //         connectedCallback() {
                //             // this.attachShadow({ mode: "open" });
                //             const html = this.innerHTML;
                //             // this.innerHTML = "";
                //             // this.shadowRoot.innerHTML = html;
                //             // this.innerHTML = html;
                //             const scriptsJson = this.attributes["scripts"].nodeValue;
                //             console.log(scriptsJson);
                //             const scripts = JSON.parse(scriptsJson);
                //             scripts.forEach(script => {
                //                 const scriptElement = document.createElement("script");
                //                 Object.keys(script).forEach(attrKey => {
                //                     scriptElement[attrKey] = script[attrKey];
                //                 });
                //                 // scriptElement.innerHTML = "alert('hello');";
                //                 // this.shadowRoot.appendChild(scriptElement);
                //                 this.appendChild(scriptElement);
                //             });
                //             // this.moveSlots();
                //             // this.shadowRoot.appendChild(this);
                //         }
                //         moveSlots() {
                //             let slots = this.querySelectorAll("slot");
                //             Array.from(slots).forEach(slot => {
                //                 // Move the slot's children back to their place in the light DOM.
                //                 Array.from(slot.childNodes).forEach(el => {
                //                     this.appendChild(el);
                //                 });
                //             });
                //         }
                //     }
                //     customElements.define("x-heyo", Component);
                // }

                /* harmony default export */ __webpack_exports__[
                    "default"
                ] = Home;

                /***/
            },

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
                    /*! isomorphic-fetch */ "isomorphic-fetch"
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

                                                    isClient =
                                                        typeof window !==
                                                        "undefined";
                                                    _context3.next = 7;
                                                    return isomorphic_fetch__WEBPACK_IMPORTED_MODULE_2___default()(
                                                        sourceUrl +
                                                            (isClient
                                                                ? "&render=false"
                                                                : "&render=false")
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
                                                            html:
                                                                doc.body
                                                                    .innerHTML // scripts
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

        /***/ "core-js/library/fn/json/stringify":
            /*!****************************************************!*\
  !*** external "core-js/library/fn/json/stringify" ***!
  \****************************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("core-js/library/fn/json/stringify");

                /***/
            },

        /***/ "core-js/library/fn/object/assign":
            /*!***************************************************!*\
  !*** external "core-js/library/fn/object/assign" ***!
  \***************************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("core-js/library/fn/object/assign");

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

        /***/ "core-js/library/fn/reflect/construct":
            /*!*******************************************************!*\
  !*** external "core-js/library/fn/reflect/construct" ***!
  \*******************************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("core-js/library/fn/reflect/construct");

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

        /***/ "next-server/dist/lib/router/router":
            /*!*****************************************************!*\
  !*** external "next-server/dist/lib/router/router" ***!
  \*****************************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("next-server/dist/lib/router/router");

                /***/
            },

        /***/ "next-server/dist/lib/utils":
            /*!*********************************************!*\
  !*** external "next-server/dist/lib/utils" ***!
  \*********************************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("next-server/dist/lib/utils");

                /***/
            },

        /***/ "prop-types":
            /*!*****************************!*\
  !*** external "prop-types" ***!
  \*****************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("prop-types");

                /***/
            },

        /***/ "prop-types-exact":
            /*!***********************************!*\
  !*** external "prop-types-exact" ***!
  \***********************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("prop-types-exact");

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

        /***/ "react-is":
            /*!***************************!*\
  !*** external "react-is" ***!
  \***************************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("react-is");

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
            },

        /***/ url:
            /*!**********************!*\
  !*** external "url" ***!
  \**********************/
            /*! no static exports found */
            /***/ function(module, exports) {
                module.exports = require("url");

                /***/
            }

        /******/
    }
);
//# sourceMappingURL=index.js.map
