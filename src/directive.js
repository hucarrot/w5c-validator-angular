angular.module("w5c.validator")
    .directive("w5cFormValidate", ['$parse', 'w5cValidator', function ($parse, w5cValidator) {
        return{
            link: function (scope, form, attr) {
                var formElem = form[0],
                    formName = form.attr("name"),
                    formSubmitFn = $parse(attr.w5cSubmit),
                    options = scope.$eval(attr.w5cFormValidate);

                // w5cFormValidate has value,watch it
                if (attr.w5cFormValidate) {
                    scope.$watch(attr.w5cFormValidate, function (newValue) {
                        if (newValue) {
                            options = angular.extend({}, w5cValidator.options, newValue);
                        }
                    }, true)
                }
                options = angular.extend({}, w5cValidator.options, options);

                //初始化验证规则，并时时监控输入值的变话
                for (var i = 0; i < formElem.length; i++) {
                    var elem = formElem[i];
                    var $elem = angular.element(elem);
                    if (w5cValidator.elemTypes.toString().indexOf(elem.type) > -1 && !w5cValidator.isEmpty(elem.name)) {
                        var $viewValueName = formName + "." + elem.name + ".$viewValue";
                        //监控输入框的value值当有变化时移除错误信息
                        //可以修改成当输入框验证通过时才移除错误信息，只要监控$valid属性即可
                        scope.$watch("[" + $viewValueName + "," + i + "]", function (newValue) {
                            var $elem = formElem[newValue[1]];
                            scope[formName].$errors = [];
                            w5cValidator.removeError($elem, options);
                        }, true);

                        //光标移走的时候触发验证信息
                        if (options.blurTrig) {
                            $elem.bind("blur", function () {
                                if (!options.blurTrig) {
                                    return;
                                }
                                var $elem = angular.element(this);
                                if (!scope[formName][this.name].$valid) {
                                    var errorMessages = w5cValidator.getErrorMessages(this, scope[formName][this.name].$error);
                                    w5cValidator.showError($elem, errorMessages, options);
                                } else {
                                    w5cValidator.removeError($elem, options);
                                }
                            });
                        }
                    }
                }

                //触发验证事件
                var doValidate = function () {
                    var errorMessages = [];
                    //循环验证
                    for (var i = 0; i < formElem.length; i++) {
                        var elem = formElem[i];
                        if (w5cValidator.elemTypes.toString().indexOf(elem.type) > -1 && !w5cValidator.isEmpty(elem.name)) {
                            if (scope[formName][elem.name].$valid) {
                                angular.element(elem).removeClass("error").addClass("valid");
                                continue;
                            } else {
                                var elementErrors = w5cValidator.getErrorMessages(elem, scope[formName][elem.name].$error);
                                errorMessages.push(elementErrors[0]);
                                w5cValidator.removeError(elem, options);
                                w5cValidator.showError(elem, elementErrors, options);
                                angular.element(elem).removeClass("valid").addClass("error");
                            }
                        }
                    }
                    if (!w5cValidator.isEmpty(errorMessages) && errorMessages.length > 0) {
                        scope[formName].$errors = errorMessages;
                    } else {
                        scope[formName].$errors = [];
                    }
                    if (!scope.$$phase) {
                        scope.$apply(scope[formName].$errors);
                    }
                };
                scope[formName].doValidate = doValidate;

                //w5cSubmit is function
                if (attr.w5cSubmit && angular.isFunction(formSubmitFn)) {

                    form.bind("submit", function () {
                        doValidate();
                        if (scope[formName].$valid && angular.isFunction(formSubmitFn)) {
                            scope.$apply(function () {
                                formSubmitFn(scope);
                            });
                        }
                    });

                    form.bind("keydown keypress", function (event) {
                        if (event.which === 13) {
                            var currentInput = document.activeElement;
                            if (currentInput.type !== "textarea") {
                                angular.element(this).find("button").focus();
                                currentInput.focus();
                                doValidate();
                                event.preventDefault();
                                if (scope[formName].$valid && angular.isFunction(formSubmitFn)) {
                                    scope.$apply(function () {
                                        formSubmitFn(scope);
                                    });
                                }
                            }
                        }
                    });
                }


            }
        };
    }])
    .directive("w5cFormSubmit", ['$parse', function ($parse) {
        return{
            link: function (scope, element, attr) {
                var validSuccessFn = $parse(attr.w5cFormSubmit);
                var formName = element.parents("form").attr("name");
                var form = scope.$eval(formName);
                if (!form) {
                    throw new Error("w5cFormSubmit form is empty.");
                    return;
                }

                element.bind("click", function () {
                    if (angular.isFunction(form.doValidate)) {
                        form.doValidate();
                    }
                    if (form.$valid && angular.isFunction(validSuccessFn)) {
                        scope.$apply(function () {
                            validSuccessFn(scope);
                        });
                    }
                });

                element.parents("form").bind("keydown keypress", function (event) {
                    if (event.which === 13) {
                        var currentInput = document.activeElement;
                        if (currentInput.type !== "textarea") {
                            this.find("button").focus();
                            currentInput.focus();
                            if (angular.isFunction(form.doValidate)) {
                                form.doValidate();
                            }
                            event.preventDefault();
                            if (form.$valid && angular.isFunction(validSuccessFn)) {
                                scope.$apply(function () {
                                    validSuccessFn(scope);
                                });
                            }
                        }
                    }
                });
            }
        };
    }])
    .directive("w5cRepeat", [function () {
        'use strict';
        return {
            require: "ngModel",
            link: function (scope, elem, attrs, ctrl) {
                var otherInput = elem.inheritedData("$formController")[attrs.w5cRepeat];

                ctrl.$parsers.push(function (value) {
                    if (value === otherInput.$viewValue) {
                        ctrl.$setValidity("repeat", true);
                        return value;
                    }
                    ctrl.$setValidity("repeat", false);
                });

                otherInput.$parsers.push(function (value) {
                    ctrl.$setValidity("repeat", value === ctrl.$viewValue);
                    return value;
                });
            }
        };
    }])
    .directive("w5cUniqueCheck", ['$timeout', '$http', function ($timeout, $http) {
        return{
            require: "ngModel",
            link: function (scope, elem, attrs, ngModel) {
                var doValidate = function () {
                    var attValues = scope.$eval(attrs.w5cUniqueCheck);
                    var url = attValues.url;
                    var isExists = attValues.isExists;//default is true
                    $http.get(url).success(function (result) {
                        if (isExists === false) {
                            ngModel.$setValidity('w5cuniquecheck', result.data);
                        }
                        else {
                            ngModel.$setValidity('w5cuniquecheck', !result.data);
                        }
                    });
                };

                scope.$watch(attrs.ngModel, function (newValue) {
                    if (_.isEmpty(newValue)) {
                    } else if (!scope[elem[0].form.name][elem[0].name].$dirty) {
                        doValidate();
                    }
                });

                elem.bind("blur", function () {
                    $timeout(function () {
                        if (scope[elem[0].form.name][elem[0].name].$invalid) {
                            return;
                        }
                        doValidate();

                    });
                });
                elem.bind("focus", function () {
                    $timeout(function () {
                        ngModel.$setValidity('w5cuniquecheck', true);
                    });
                });
            }
        };
    }]);