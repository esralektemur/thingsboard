/*
 * Copyright © 2016-2017 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import $ from 'jquery';
import 'javascript-detect-element-resize/detect-element-resize';
import Subscription from '../api/subscription';

/* eslint-disable angular/angularelement */

/*@ngInject*/
export default function WidgetController($scope, $timeout, $window, $element, $q, $log, $injector, $filter, $compile, tbRaf, types, utils, timeService,
                                         datasourceService, alarmService, entityService, deviceService, visibleRect, isEdit, stDiff, dashboardTimewindow,
                                         dashboardTimewindowApi, widget, aliasController, stateController, widgetInfo, widgetType) {

    var vm = this;

    $scope.$timeout = $timeout;
    $scope.$q = $q;
    $scope.$injector = $injector;
    $scope.tbRaf = tbRaf;

    $scope.rpcRejection = null;
    $scope.rpcErrorText = null;
    $scope.rpcEnabled = false;
    $scope.executingRpcRequest = false;

    var gridsterItemInited = false;
    var subscriptionInited = false;
    var widgetSizeDetected = false;

    var cafs = {};

    var widgetContext = {
        inited: false,
        $container: null,
        $containerParent: null,
        width: 0,
        height: 0,
        isEdit: isEdit,
        isMobile: false,
        widgetConfig: widget.config,
        settings: widget.config.settings,
        units: widget.config.units || '',
        decimals: angular.isDefined(widget.config.decimals) ? widget.config.decimals : 2,
        subscriptions: {},
        defaultSubscription: null,
        timewindowFunctions: {
            onUpdateTimewindow: function(startTimeMs, endTimeMs) {
                if (widgetContext.defaultSubscription) {
                    widgetContext.defaultSubscription.onUpdateTimewindow(startTimeMs, endTimeMs);
                }
            },
            onResetTimewindow: function() {
                if (widgetContext.defaultSubscription) {
                    widgetContext.defaultSubscription.onResetTimewindow();
                }
            }
        },
        subscriptionApi: {
            createSubscription: function(options, subscribe) {
                return createSubscription(options, subscribe);
            },
            createSubscriptionFromInfo: function (type, subscriptionsInfo, options, useDefaultComponents, subscribe) {
                return createSubscriptionFromInfo(type, subscriptionsInfo, options, useDefaultComponents, subscribe);
            },
            removeSubscription: function(id) {
                var subscription = widgetContext.subscriptions[id];
                if (subscription) {
                    subscription.destroy();
                    delete widgetContext.subscriptions[id];
                }
            }
        },
        controlApi: {
            sendOneWayCommand: function(method, params, timeout) {
                if (widgetContext.defaultSubscription) {
                    return widgetContext.defaultSubscription.sendOneWayCommand(method, params, timeout);
                }
                return null;
            },
            sendTwoWayCommand: function(method, params, timeout) {
                if (widgetContext.defaultSubscription) {
                    return widgetContext.defaultSubscription.sendTwoWayCommand(method, params, timeout);
                }
                return null;
            }
        },
        utils: {
            formatValue: formatValue
        },
        stateController: stateController
    };

    var subscriptionContext = {
        $scope: $scope,
        $q: $q,
        $filter: $filter,
        $timeout: $timeout,
        tbRaf: tbRaf,
        timeService: timeService,
        deviceService: deviceService,
        datasourceService: datasourceService,
        alarmService: alarmService,
        utils: utils,
        widgetUtils: widgetContext.utils,
        dashboardTimewindowApi: dashboardTimewindowApi,
        types: types,
        stDiff: stDiff,
        aliasController: aliasController
    };

    var widgetTypeInstance;

    vm.useCustomDatasources = false;

    try {
        widgetTypeInstance = new widgetType(widgetContext);
    } catch (e) {
        handleWidgetException(e);
        widgetTypeInstance = {};
    }
    if (!widgetTypeInstance.onInit) {
        widgetTypeInstance.onInit = function() {};
    }
    if (!widgetTypeInstance.onDataUpdated) {
        widgetTypeInstance.onDataUpdated = function() {};
    }
    if (!widgetTypeInstance.onResize) {
        widgetTypeInstance.onResize = function() {};
    }
    if (!widgetTypeInstance.onEditModeChanged) {
        widgetTypeInstance.onEditModeChanged = function() {};
    }
    if (!widgetTypeInstance.onMobileModeChanged) {
        widgetTypeInstance.onMobileModeChanged = function() {};
    }
    if (!widgetTypeInstance.onDestroy) {
        widgetTypeInstance.onDestroy = function() {};
    }
    if (widgetTypeInstance.useCustomDatasources) {
        vm.useCustomDatasources = widgetTypeInstance.useCustomDatasources();
    }

    //TODO: widgets visibility

    //var bounds = {top: 0, left: 0, bottom: 0, right: 0};
    /*var visible = false;*/
    /*vm.visibleRectChanged = visibleRectChanged;

    function visibleRectChanged(newVisibleRect) {
        visibleRect = newVisibleRect;
        updateVisibility();
    }*/

    $scope.clearRpcError = function() {
        if (widgetContext.defaultSubscription) {
            widgetContext.defaultSubscription.clearRpcError();
        }
    }

    vm.gridsterItemInitialized = gridsterItemInitialized;

    initialize().then(
        function(){
            onInit();
        }
    );

    function createSubscriptionFromInfo(type, subscriptionsInfo, options, useDefaultComponents, subscribe) {
        var deferred = $q.defer();
        options.type = type;

        if (useDefaultComponents) {
            defaultComponentsOptions(options);
        } else {
            if (!options.timeWindowConfig) {
                options.useDashboardTimewindow = true;
            }
        }

        entityService.createDatasourcesFromSubscriptionsInfo(subscriptionsInfo).then(
            function (datasources) {
                options.datasources = datasources;
                createSubscription(options, subscribe).then(
                    function success(subscription) {
                        if (useDefaultComponents) {
                            defaultSubscriptionOptions(subscription, options);
                        }
                        deferred.resolve(subscription);
                    },
                    function fail() {
                        deferred.reject();
                    }
                );
            }
        );
        return deferred.promise;
    }

    function createSubscription(options, subscribe) {
        var deferred = $q.defer();
        options.dashboardTimewindow = dashboardTimewindow;
        new Subscription(subscriptionContext, options).then(
            function success(subscription) {
                widgetContext.subscriptions[subscription.id] = subscription;
                if (subscribe) {
                    subscription.subscribe();
                }
                deferred.resolve(subscription);
            },
            function fail() {
                deferred.reject();
            }
        );

        return deferred.promise;
    }

    function defaultComponentsOptions(options) {
        options.useDashboardTimewindow = angular.isDefined(widget.config.useDashboardTimewindow)
            ? widget.config.useDashboardTimewindow : true;

        options.timeWindowConfig = options.useDashboardTimewindow ? dashboardTimewindow : widget.config.timewindow;
        options.legendConfig = null;

        if ($scope.displayLegend) {
            options.legendConfig = $scope.legendConfig;
        }
        options.decimals = widgetContext.decimals;
        options.units = widgetContext.units;

        options.callbacks = {
            onDataUpdated: function() {
                widgetTypeInstance.onDataUpdated();
            },
            onDataUpdateError: function(subscription, e) {
                handleWidgetException(e);
            },
            dataLoading: function(subscription) {
                if ($scope.loadingData !== subscription.loadingData) {
                    $scope.loadingData = subscription.loadingData;
                }
            },
            legendDataUpdated: function(subscription, apply) {
                if (apply) {
                    $scope.$digest();
                }
            },
            timeWindowUpdated: function(subscription, timeWindowConfig) {
                widget.config.timewindow = timeWindowConfig;
                $scope.$apply();
            }
        }
    }

    function defaultSubscriptionOptions(subscription, options) {
        if (!options.useDashboardTimewindow) {
            $scope.$watch(function () {
                return widget.config.timewindow;
            }, function (newTimewindow, prevTimewindow) {
                if (!angular.equals(newTimewindow, prevTimewindow)) {
                    subscription.updateTimewindowConfig(widget.config.timewindow);
                }
            });
        }
        if ($scope.displayLegend) {
            $scope.legendData = subscription.legendData;
        }
    }

    function createDefaultSubscription() {
        var options;
        var deferred = $q.defer();
        if (widget.type !== types.widgetType.rpc.value && widget.type !== types.widgetType.static.value) {
            options = {
                type: widget.type
            }
            if (widget.type == types.widgetType.alarm.value) {
                options.alarmSource = angular.copy(widget.config.alarmSource);
            } else {
                options.datasources = angular.copy(widget.config.datasources)
            }

            defaultComponentsOptions(options);

            createSubscription(options).then(
                function success(subscription) {
                    defaultSubscriptionOptions(subscription, options);

                    // backward compatibility

                    widgetContext.datasources = subscription.datasources;
                    widgetContext.data = subscription.data;
                    widgetContext.hiddenData = subscription.hiddenData;
                    widgetContext.timeWindow = subscription.timeWindow;
                    widgetContext.defaultSubscription = subscription;
                    deferred.resolve();
                },
                function fail() {
                    deferred.reject();
                }
            );

        } else if (widget.type === types.widgetType.rpc.value) {
            $scope.loadingData = false;
            options = {
                type: widget.type,
                targetDeviceAliasIds: widget.config.targetDeviceAliasIds
            }
            options.callbacks = {
                rpcStateChanged: function(subscription) {
                    $scope.rpcEnabled = subscription.rpcEnabled;
                    $scope.executingRpcRequest = subscription.executingRpcRequest;
                },
                onRpcSuccess: function(subscription) {
                   $scope.executingRpcRequest = subscription.executingRpcRequest;
                    $scope.rpcErrorText = subscription.rpcErrorText;
                    $scope.rpcRejection = subscription.rpcRejection;
                },
                onRpcFailed: function(subscription) {
                    $scope.executingRpcRequest = subscription.executingRpcRequest;
                    $scope.rpcErrorText = subscription.rpcErrorText;
                    $scope.rpcRejection = subscription.rpcRejection;
                },
                onRpcErrorCleared: function() {
                    $scope.rpcErrorText = null;
                    $scope.rpcRejection = null;
                }
            }
            createSubscription(options).then(
                function success(subscription) {
                    widgetContext.defaultSubscription = subscription;
                    deferred.resolve();
                },
                function fail() {
                    deferred.reject();
                }
            );
        } else if (widget.type === types.widgetType.static.value) {
            $scope.loadingData = false;
            deferred.resolve();
        } else {
            deferred.resolve();
        }
        return deferred.promise;
    }

    function configureWidgetElement() {

        $scope.displayLegend = angular.isDefined(widget.config.showLegend) ?
            widget.config.showLegend : widget.type === types.widgetType.timeseries.value;

        if ($scope.displayLegend) {
            $scope.legendConfig = widget.config.legendConfig ||
                {
                    position: types.position.bottom.value,
                    showMin: false,
                    showMax: false,
                    showAvg: widget.type === types.widgetType.timeseries.value,
                    showTotal: false
                };
            $scope.legendData = {
                keys: [],
                data: []
            };
        }

        var html = '<div class="tb-absolute-fill tb-widget-error" ng-if="widgetErrorData">' +
            '<span>Widget Error: {{ widgetErrorData.name + ": " + widgetErrorData.message}}</span>' +
            '</div>' +
            '<div class="tb-absolute-fill tb-widget-loading" ng-show="loadingData" layout="column" layout-align="center center">' +
            '<md-progress-circular md-mode="indeterminate" ng-disabled="!loadingData" class="md-accent" md-diameter="40"></md-progress-circular>' +
            '</div>';

        var containerHtml = '<div id="container">' + widgetInfo.templateHtml + '</div>';
        if ($scope.displayLegend) {
            var layoutType;
            if ($scope.legendConfig.position === types.position.top.value ||
                $scope.legendConfig.position === types.position.bottom.value) {
                layoutType = 'column';
            } else {
                layoutType = 'row';
            }

            var legendStyle;
            switch($scope.legendConfig.position) {
                case types.position.top.value:
                    legendStyle = 'padding-bottom: 8px;';
                    break;
                case types.position.bottom.value:
                    legendStyle = 'padding-top: 8px;';
                    break;
                case types.position.left.value:
                    legendStyle = 'padding-right: 0px;';
                    break;
                case types.position.right.value:
                    legendStyle = 'padding-left: 0px;';
                    break;
            }

            var legendHtml = '<tb-legend style="'+legendStyle+'" legend-config="legendConfig" legend-data="legendData"></tb-legend>';
            containerHtml = '<div flex id="widget-container">' + containerHtml + '</div>';
            html += '<div class="tb-absolute-fill" layout="'+layoutType+'">';
            if ($scope.legendConfig.position === types.position.top.value ||
                $scope.legendConfig.position === types.position.left.value) {
                html += legendHtml;
                html += containerHtml;
            } else {
                html += containerHtml;
                html += legendHtml;
            }
            html += '</div>';
        } else {
            html += containerHtml;
        }

        //TODO:
        /*if (progressElement) {
         progressScope.$destroy();
         progressScope = null;

         progressElement.remove();
         progressElement = null;
         }*/

        $element.html(html);

        var containerElement = $scope.displayLegend ? angular.element($element[0].querySelector('#widget-container')) : $element;
        widgetContext.$container = $('#container', containerElement);
        widgetContext.$containerParent = $(containerElement);

        if (widgetSizeDetected) {
            widgetContext.$container.css('height', widgetContext.height + 'px');
            widgetContext.$container.css('width', widgetContext.width + 'px');
        }

        widgetContext.$scope = $scope.$new();

        $compile($element.contents())(widgetContext.$scope);

        addResizeListener(widgetContext.$containerParent[0], onResize); // eslint-disable-line no-undef
    }

    function destroyWidgetElement() {
        removeResizeListener(widgetContext.$containerParent[0], onResize); // eslint-disable-line no-undef
        $element.html('');
        if (widgetContext.$scope) {
            widgetContext.$scope.$destroy();
        }
        widgetContext.$container = null;
        widgetContext.$containerParent = null;
    }

    function initialize() {

        $scope.$on('toggleDashboardEditMode', function (event, isEdit) {
            onEditModeChanged(isEdit);
        });

        $scope.$watch(function () {
            return widget.row + ',' + widget.col + ',' + widget.config.mobileOrder;
        }, function () {
            //updateBounds();
            $scope.$emit("widgetPositionChanged", widget);
        });

        $scope.$on('gridster-item-resized', function (event, item) {
            if (!widgetContext.isMobile) {
                widget.sizeX = item.sizeX;
                widget.sizeY = item.sizeY;
            }
        });

        $scope.$on('mobileModeChanged', function (event, newIsMobile) {
            onMobileModeChanged(newIsMobile);
        });

        $scope.$on('entityAliasesChanged', function (event, aliasIds) {
            var subscriptionChanged = false;
            for (var id in widgetContext.subscriptions) {
                var subscription = widgetContext.subscriptions[id];
                subscriptionChanged = subscriptionChanged || subscription.onAliasesChanged(aliasIds);
            }
            if (subscriptionChanged && !vm.useCustomDatasources) {
                reInit();
            }
        });

        $scope.$on("$destroy", function () {
            onDestroy();
        });

        configureWidgetElement();
        var deferred = $q.defer();
        if (!vm.useCustomDatasources) {
            createDefaultSubscription().then(
                function success() {
                    subscriptionInited = true;
                    deferred.resolve();
                },
                function fail() {
                    subscriptionInited = true;
                    deferred.reject();
                }
            );
        } else {
            $scope.loadingData = false;
            subscriptionInited = true;
            deferred.resolve();
        }
        return deferred.promise;
    }

    function reInit() {
        onDestroy();
        configureWidgetElement();
        if (!vm.useCustomDatasources) {
            createDefaultSubscription().then(
                function success() {
                    subscriptionInited = true;
                    onInit();
                },
                function fail() {
                    subscriptionInited = true;
                    onInit();
                }
            );
        } else {
            subscriptionInited = true;
            onInit();
        }
    }

    function handleWidgetException(e) {
        $log.error(e);
        $scope.widgetErrorData = utils.processWidgetException(e);
    }

    function isReady() {
        return subscriptionInited && gridsterItemInited && widgetSizeDetected;
    }

    function onInit(skipSizeCheck) {
        if (!skipSizeCheck) {
            checkSize();
        }
        if (!widgetContext.inited && isReady()) {
            widgetContext.inited = true;
            try {
                widgetTypeInstance.onInit();
            } catch (e) {
                handleWidgetException(e);
            }
            if (!vm.useCustomDatasources && widgetContext.defaultSubscription) {
                widgetContext.defaultSubscription.subscribe();
            }
        }
    }

    function checkSize() {
        var width = widgetContext.$containerParent.width();
        var height = widgetContext.$containerParent.height();
        var sizeChanged = false;

        if (!widgetContext.width || widgetContext.width != width || !widgetContext.height || widgetContext.height != height) {
            if (width > 0 && height > 0) {
                widgetContext.$container.css('height', height + 'px');
                widgetContext.$container.css('width', width + 'px');
                widgetContext.width = width;
                widgetContext.height = height;
                sizeChanged = true;
                widgetSizeDetected = true;
            }
        }
        return sizeChanged;
    }

    function onResize() {
        if (checkSize()) {
            if (widgetContext.inited) {
                if (cafs['resize']) {
                    cafs['resize']();
                    cafs['resize'] = null;
                }
                cafs['resize'] = tbRaf(function() {
                    try {
                        widgetTypeInstance.onResize();
                    } catch (e) {
                        handleWidgetException(e);
                    }
                });
            } else {
                onInit(true);
            }
        }
    }

    function gridsterItemInitialized(item) {
        if (item && item.gridster) {
            widgetContext.isMobile = item.gridster.isMobile;
            gridsterItemInited = true;
            onInit();
            // gridsterItemElement = $(item.$element);
            //updateVisibility();
        }
    }

    function onEditModeChanged(isEdit) {
        if (widgetContext.isEdit != isEdit) {
            widgetContext.isEdit = isEdit;
            if (widgetContext.inited) {
                if (cafs['editMode']) {
                    cafs['editMode']();
                    cafs['editMode'] = null;
                }
                cafs['editMode'] = tbRaf(function() {
                    try {
                        widgetTypeInstance.onEditModeChanged();
                    } catch (e) {
                        handleWidgetException(e);
                    }
                });
            }
        }
    }

    function onMobileModeChanged(isMobile) {
        if (widgetContext.isMobile != isMobile) {
            widgetContext.isMobile = isMobile;
            if (widgetContext.inited) {
                if (cafs['mobileMode']) {
                    cafs['mobileMode']();
                    cafs['mobileMode'] = null;
                }
                cafs['mobileMode'] = tbRaf(function() {
                    try {
                        widgetTypeInstance.onMobileModeChanged();
                    } catch (e) {
                        handleWidgetException(e);
                    }
                });
            }
        }
    }

    function isNumeric(val) {
        return (val - parseFloat( val ) + 1) >= 0;
    }

    function formatValue(value, dec, units) {
        if (angular.isDefined(value) &&
            value !== null && isNumeric(value)) {
            var formatted = value;
            if (angular.isDefined(dec)) {
                formatted = formatted.toFixed(dec);
            }
            formatted = (formatted * 1).toString();
            if (angular.isDefined(units) && units.length > 0) {
                formatted += ' ' + units;
            }
            return formatted;
        } else {
            return '';
        }
    }

    function onDestroy() {
        for (var id in widgetContext.subscriptions) {
            var subscription = widgetContext.subscriptions[id];
            subscription.destroy();
        }
        subscriptionInited = false;
        widgetContext.subscriptions = [];
        if (widgetContext.inited) {
            widgetContext.inited = false;
            for (var cafId in cafs) {
                if (cafs[cafId]) {
                    cafs[cafId]();
                    cafs[cafId] = null;
                }
            }
            try {
                widgetTypeInstance.onDestroy();
            } catch (e) {
                handleWidgetException(e);
            }
        }
        destroyWidgetElement();
    }

    //TODO: widgets visibility
    /*function updateVisibility(forceRedraw) {
        if (visibleRect) {
            forceRedraw = forceRedraw || visibleRect.containerResized;
            var newVisible = false;
            if (visibleRect.isMobile && gridsterItemElement) {
                var topPx = gridsterItemElement.position().top;
                var bottomPx = topPx + widget.sizeY * visibleRect.curRowHeight;
                newVisible = !(topPx > visibleRect.bottomPx ||
                bottomPx < visibleRect.topPx);
            } else {
                newVisible = !(bounds.left > visibleRect.right ||
                bounds.right < visibleRect.left ||
                bounds.top > visibleRect.bottom ||
                bounds.bottom < visibleRect.top);
            }
            if (visible != newVisible) {
                visible = newVisible;
                if (visible) {
                    onRedraw(50);
                }
            } else if (forceRedraw && visible) {
                onRedraw(50);
            }
        }
    }*/

/*    function updateBounds() {
        bounds = {
            top: widget.row,
            left: widget.col,
            bottom: widget.row + widget.sizeY,
            right: widget.col + widget.sizeX
        };
        updateVisibility(true);
        onRedraw();
    }*/

}

/* eslint-enable angular/angularelement */