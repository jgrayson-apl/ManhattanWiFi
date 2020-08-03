/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.​
*/

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/number",
  "dojo/date/locale",
  "dojo/on",
  "dojo/query",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "esri/identity/IdentityManager",
  "esri/request",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/layers/Layer",
  "esri/layers/GraphicsLayer",
  "esri/geometry/Point",
  "esri/geometry/Extent",
  "esri/geometry/geometryEngine",
  "esri/geometry/support/geodesicUtils",
  "esri/Graphic",
  "esri/symbols/support/symbolUtils",
  "esri/widgets/Home",
  "esri/tasks/RouteTask",
  "esri/tasks/support/RouteParameters",
  "esri/tasks/support/FeatureSet",
  "esri/widgets/LineOfSight",
  "esri/widgets/LineOfSight/LineOfSightViewModel",
  "esri/widgets/Legend",
  "esri/widgets/Slider",
  "esri/widgets/Expand"
], function(calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
            Color, colors, number, locale, on, query, dom, domClass, domConstruct,
            IdentityManager, esriRequest, Evented, watchUtils, promiseUtils, Portal,
            Layer, GraphicsLayer, Point, Extent, geometryEngine, geodesicUtils,
            Graphic, symbolUtils, Home, RouteTask, RouteParameters, FeatureSet,
            LineOfSight, LineOfSightViewModel, Legend, Slider, Expand){

  return declare([Evented], {

    /**
     *
     */
    constructor: function(){
      // BASE //
      this.base = null;
      // CALCITE WEB //
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function(base){
      if(!base){
        console.error("ApplicationBase is not defined");
        return;
      }
      this.base = base;

      domHelper.setPageLocale(this.base.locale);
      domHelper.setPageDirection(this.base.direction);

      const webMapItems = this.base.results.webMapItems;
      const webSceneItems = this.base.results.webSceneItems;
      const validItems = webMapItems.concat(webSceneItems).map(response => {
        return response.value;
      });
      const firstItem = (validItems && validItems.length) ? validItems[0] : null;
      if(!firstItem){
        console.error("Could not load an item to display");
        return;
      }

      this.base.config.title = (this.base.config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(this.base.config.title);

      const viewProperties = itemUtils.getConfigViewProperties(this.base.config);
      viewProperties.container = "view-container";
      viewProperties.constraints = { snapToZoom: false };
      viewProperties.highlightOptions = {
        color: Color.named.limegreen,
        haloOpacity: 0.9,
        fillOpacity: 0.2
      };

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({ item: firstItem, appProxies: appProxies }).then(map => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then(view => {
          view.when(() => {
            this.viewReady(this.base.config, firstItem, view).then(() => {
              /* ... */
            });
          });
        });
      });
    },

    /**
     *
     * @param config
     * @param item
     * @param view
     */
    viewReady: function(config, item, view){

      // TITLE //
      dom.byId("app-title-node").innerHTML = config.title;

      // USER SIGN IN //
      return this.initializeUserSignIn(view).always(() => {

        // HOME //
        const home = new Home({ view: view });
        view.ui.add(home, { position: "top-left", index: 0 });

        // APPLICATION READY //
        this.applicationReady(view);

      });

    },

    /**
     *
     * @returns {*}
     */
    initializeUserSignIn: function(view){

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn);
      };
      IdentityManager.on("credential-create", checkSignInStatus);
      IdentityManager.on("credential-destroy", checkSignInStatus);

      // SIGN IN NODE //
      const signInNode = dom.byId("sign-in-node");
      const userNode = dom.byId("user-node");

      // UPDATE UI //
      const updateSignInUI = () => {
        if(this.base.portal.user){
          dom.byId("user-firstname-node").innerHTML = this.base.portal.user.fullName.split(" ")[0];
          dom.byId("user-fullname-node").innerHTML = this.base.portal.user.fullName;
          dom.byId("username-node").innerHTML = this.base.portal.user.username;
          dom.byId("user-thumb-node").src = this.base.portal.user.thumbnailUrl;
          domClass.add(signInNode, "hide");
          domClass.remove(userNode, "hide");
        } else {
          domClass.remove(signInNode, "hide");
          domClass.add(userNode, "hide");
        }
        return promiseUtils.resolve();
      };

      // SIGN IN //
      const userSignIn = () => {
        this.base.portal = new Portal({ url: this.base.config.portalUrl, authMode: "immediate" });
        return this.base.portal.load().then(() => {
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);
      };

      // SIGN OUT //
      const userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.base.portal = new Portal({});
        this.base.portal.load().then(() => {
          this.base.portal.user = null;
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);

      };

      // USER SIGN IN //
      on(signInNode, "click", userSignIn);

      // SIGN OUT NODE //
      const signOutNode = dom.byId("sign-out-node");
      if(signOutNode){
        on(signOutNode, "click", userSignOut);
      }

      return checkSignInStatus();
    },

    /**
     * APPLICATION READY
     *
     * @param view
     */
    applicationReady: function(view){

      this.initializeElevationSampler(view);

      this.initializeWiFiLocations(view).then(() => {

        //this.initializeInteractiveLOS(view);

        this.initializeManhattanCounty(view).then(manhattanCountyArea => {

          this.initializeRoute(view, manhattanCountyArea);

          this.initializeRouteTour(view);

          if(this.base.config.kiosk){
            watchUtils.whenNotOnce(view, "updating", () => {
              this.addRandomStop();
              this.addRandomStop();
            });
          }
        });
      });

    },

    /**
     *
     * @param view
     */
    initializeInteractiveLOS: function(view){

      const losWidget = new LineOfSight({
        container: "los-button",
        view: view
      });
      losWidget.viewModel.watch("state", state => {
        if(state === "creating"){
          this.emit("los-creating", { vm: losWidget.viewModel });
        }
      });
      this.on("los-creating", evt => {
        if(evt.vm !== losWidget.viewModel){
          losWidget.viewModel.clear();
        }
      });

    },

    /**
     *
     * @param view
     * @returns {Promise<Polygon>}
     */
    initializeManhattanCounty: function(view){

      const countiesLayer = view.map.layers.find(layer => {
        return (layer.title === "USA Counties");
      });
      return countiesLayer.load().then(() => {
        return view.whenLayerView(countiesLayer).then(countiesLayerView => {
          return watchUtils.whenNotOnce(countiesLayerView, "updating").then(() => {
            return countiesLayerView.queryFeatures().then(countiesFS => {
              return countiesFS.features[0].geometry;
            });
          });
        });
      });

    },

    /**
     *
     * @param view
     */
    initializeElevationSampler: function(view){

      this.getElevation = location => {
        return view.groundView.elevationSampler.queryElevation(location.clone()).z;
      };

      this.setPointZOffset = (location, zOffset) => {
        const locationZ = view.groundView.elevationSampler.queryElevation(location);
        locationZ.z += zOffset;
        return locationZ;
      };

    },

    /**
     *
     * @param view
     * @param manhattanCountyArea
     */
    initializeRoute: function(view, manhattanCountyArea){

      const verticalOffset = {
        screenLength: 80,
        maxWorldLength: 1500,
        minWorldLength: 50
      };

      const callout = (color) => {
        return {
          type: "line",
          size: 1.5,
          color: Color.named.white,
          border: {
            color: color
          }
        };
      };

      const textSymbolLayer = (color, text) => {
        return {
          type: "text",
          text: text,
          material: { color: color },
          halo: { color: Color.named.white, size: 2.0 },
          size: 25
        };
      };

      const sizeSettings = { width: 15, height: 200, };
      const startFeature = new Graphic({
        symbol: {
          type: "point-3d",
          verticalOffset: verticalOffset,
          callout: callout(Color.named.limegreen),
          symbolLayers: [
            textSymbolLayer(Color.named.limegreen, "start")
            /*{
              type: "object",
              ...sizeSettings,
              resource: { primitive: "cylinder" },
              material: { color: Color.named.lime }
            }*/
          ]
        },
        attributes: {
          name: "Start Location"
        }
      });
      const endFeature = new Graphic({
        symbol: {
          type: "point-3d",
          verticalOffset: verticalOffset,
          callout: callout(Color.named.darkred),
          symbolLayers: [
            textSymbolLayer(Color.named.darkred, "end")
            /*{
              type: "object",
              ...sizeSettings,
              resource: { primitive: "cylinder" },
              material: { color: Color.named.red }
            }*/
          ]
        },
        attributes: {
          name: "End Location"
        }
      });
      const routeFeature = new Graphic({
        symbol: {
          type: "line-3d",
          symbolLayers: [
            {
              type: "line",
              size: 5,
              material: { color: "#eadb69" },
              cap: "round",
              join: "round"
            }/*,
                {
                  type: "path",
                  cap: "square",
                  profile: "quad",
                  profileRotation: "heading",
                  castShadows: true,
                  width: 15, height: 1.0,
                  material: { color: "#eadb69" }
                }*/
          ]
        }
      });

      const routeLayer = new GraphicsLayer({ graphics: [startFeature, endFeature, routeFeature] });
      view.map.add(routeLayer);


      //const travelModeSelect = dom.byId("travel-mode-select");
      //const travelModeLabel = dom.byId("travel-mode-label");
      const travelModeInput = dom.byId("travel-mode-switch");
      const travelModeDriveLabel = dom.byId("travel-mode-drive-label");
      const travelModeWalkLabel = dom.byId("travel-mode-walk-label");

      const routeTask = new RouteTask({
        url: "https://utility.arcgis.com/usrsvcs/appservices/KT1q6dPgISfGSXFb/rest/services/World/Route/NAServer/Route_World"
      });
      esriRequest(`${routeTask.url}/retrieveTravelModes`, { query: { f: "json" } }).then(getTravelModesResponse => {

        const travelModesInfos = getTravelModesResponse.data.supportedTravelModes;

        travelModesInfos.forEach(travelModeInfo => {
          /*const groupId = `travel-mode-option-${travelModeInfo.type}`;
          let group = dom.byId(groupId);
          if(!group){
            group = domConstruct.create("optgroup", { id: groupId, label: travelModeInfo.type }, travelModeSelect);
          }
          domConstruct.create("option", { value: travelModeInfo.name, innerHTML: travelModeInfo.name, }, group);*/
          if(travelModeInfo.name === "Driving Time"){
            travelModeDriveLabel.setAttribute("aria-label", travelModeInfo.description);
          }
          if(travelModeInfo.name === "Walking Time"){
            travelModeWalkLabel.setAttribute("aria-label", travelModeInfo.description);
          }
        });

        const getTravelMode = () => {
          const travelMode = (travelModeInput.checked) ? "Driving Time" : "Walking Time";
          return travelModesInfos.find(travelModeInfo => {
            return (travelModeInfo.name === travelMode);
          });
        };

        /*
        travelModeLabel.setAttribute("aria-label", getTravelMode().description);
        on(travelModeSelect, "change", () => {
          travelModeLabel.setAttribute("aria-label", getTravelMode().description);
        });
        domClass.remove(travelModeSelect, "btn-disabled");
        */


        const routeParams = new RouteParameters({
          stops: new FeatureSet(),
          startTimeIsUTC: true,
          preserveFirstStop: true,
          preserveLastStop: true,
          returnStops: true,
          returnDirections: false,
          outputLines: "true-shape-with-measure",
          outSpatialReference: { wkid: 3857 }
        });

        const addStop = (evt) => {
          switch(routeParams.stops.features.length){
            case 0:
              this.emit("route-cleared", {});
              routeFeature.geometry = null;
              endFeature.geometry = null;
              startFeature.geometry = evt.mapPoint;
              routeParams.stops.features.push(startFeature);
              break;
            case 1:
              endFeature.geometry = evt.mapPoint;
              routeParams.stops.features.push(endFeature);
              routeParams.startTime = Date.now();
              routeParams.travelMode = getTravelMode();
              routeTask.solve(routeParams).then(showRoute);
              break;
            case 2:
              this.emit("route-cleared", {});
              startFeature.geometry = endFeature.geometry;
              endFeature.geometry = evt.mapPoint;
              routeParams.startTime = Date.now();
              routeParams.travelMode = getTravelMode();
              routeTask.solve(routeParams).then(showRoute);
          }
        };


        const showRoute = (data) => {
          const routeResult = data.routeResults[0].route;
          routeFeature.geometry = routeResult.geometry;

          const first = routeFeature.geometry.getPoint(0, 0);
          const last = routeFeature.geometry.getPoint(0, routeFeature.geometry.paths[0].length - 1);
          const pathHeading = this.getHeading(first, last) - 90.0;  // PERPENDICULAR TO PATH //

          view.goTo({ target: routeFeature.geometry, scale: 8500, tilt: 55.0, heading: pathHeading }).then(() => {
            this.emit("route-solved", routeResult);
          });

        };

        const getRandomLocation = (searchArea) => {

          const extent = searchArea.extent;
          let locationInSearchArea = null;

          do {
            locationInSearchArea = new Point({
              spatialReference: view.spatialReference,
              x: (extent.xmin + (Math.random() * (extent.xmax - extent.xmin))),
              y: (extent.ymin + (Math.random() * (extent.ymax - extent.ymin)))
            });
          } while(!searchArea.contains(locationInSearchArea));

          return locationInSearchArea;
        };

        this.addRandomStop = () => {
          const searchArea = geometryEngine.clip(manhattanCountyArea, view.extent);
          addStop({ mapPoint: getRandomLocation(searchArea) });
        };

        view.container.style.cursor = "wait";
        watchUtils.whenTrueOnce(view, "updating", () => {
          watchUtils.whenFalseOnce(view, "updating", () => {
            view.container.style.cursor = "crosshair";
            view.on("click", addStop);
          });
        });

      });

    },

    /**
     *
     * @param view
     */
    initializeWiFiLocations: function(view){

      const wifiList = dom.byId("wifi-list");
      const wifiCountNode = dom.byId("wifi-count");
      const wifiSelectedCountNode = dom.byId("wifi-selected-count");

      const displayWiFiDetails = (wifiFeature) => {

        const wifiNode = domConstruct.create("div", { className: "wifi-node side-nav-link" }, wifiList);
        //const wifiSymbolNode = domConstruct.create("span", { className: "wifi-symbol margin-right-half left" }, wifiNode);
        domConstruct.create("div", { className: "font-size-0", innerHTML: wifiFeature.attributes.NAME }, wifiNode);
        domConstruct.create("div", { className: "font-size--3 avenir-italic text-right", innerHTML: wifiFeature.attributes.ADDRESS }, wifiNode);

        /*symbolUtils.getDisplayedSymbol(wifiFeature, {}).then(symbol => {
          symbolUtils.renderPreviewHTML(symbol, { node: wifiSymbolNode });
        });*/

        return wifiNode;
      };

      const losTargetsLayerTitles = ["WiFi Locations", "private transmission towers"]; //"VBCPS School Facilities",
      const wifiLayer = view.map.layers.find(layer => {
        return (losTargetsLayerTitles.includes(layer.title));
      });
      return wifiLayer.load().then(() => {
        wifiLayer.outFields = ["*"];

        wifiLayer.renderer.uniqueValueInfos.forEach(uvInfo => {
          uvInfo.symbol.symbolLayers.unshift({  // unshift vs push
            type: "icon",
            size: 18,
            anchor: "relative",
            anchorPosition: { x: 0, y: 0.35 },
            resource: { primitive: "circle" },
            material: { color: Color.named.white }
          });
        });

        // const legend = new Legend({view:view,layerInfos:[{layer:wifiLayer}]});
        // view.ui.add(legend,"top-right");

        return view.whenLayerView(wifiLayer).then(wifiLayerView => {
          return watchUtils.whenNotOnce(wifiLayerView, "updating", () => {

            let wifiLocationTargetInfos = { features: [], targets: [], nodes: [], selected: [] };

            //
            // LINE-OF-SIGHT //
            //
            const losViewModel = new LineOfSightViewModel({ view: view });
            /*losViewModel.watch("state", state => {
              if(state === "creating"){
                this.emit("los-creating", { vm: losViewModel });
              }
            });
            this.on("los-creating", evt => {
              if(evt.vm !== losViewModel){
                losViewModel.clear();
              }
            });*/

            let losObserverWGS84 = null;

            this.losClear = () => {
              losViewModel.clear();
            };

            losViewModel.targets.on("change", changeEvt => {
              let visibleIdx = [];
              changeEvt.added.forEach((target, targetIdx) => {
                target.watch("visible", visible => {
                  if(losObserverWGS84 != null){
                    if(visible && !visibleIdx.includes(targetIdx)){

                      const losTargetWGS84 = new Point({
                        spatialReference: { wkid: 4326 },
                        longitude: target.location.longitude,
                        latitude: target.location.latitude,
                      });
                      const distanceInfo = geodesicUtils.geodesicDistance(losObserverWGS84, losTargetWGS84);
                      if(distanceInfo.distance < this.analysisSearchDistanceMeters){

                        visibleIdx.push(targetIdx);

                        const wifiNode = wifiLocationTargetInfos.nodes[targetIdx];
                        domClass.add(wifiNode, "visible");

                        const wifiFeature = wifiLocationTargetInfos.features[targetIdx];
                        wifiLocationTargetInfos.selected.push(wifiFeature);

                        wifiSelectedCountNode.innerHTML = wifiLocationTargetInfos.selected.length;

                        highlight && highlight.remove();
                        highlight = wifiLayerView.highlight(wifiLocationTargetInfos.selected);
                      } else {
                        target.visible = false;
                      }
                    }
                  }
                })
              });
            });

            this.losSetTargets = searchArea => {

              wifiLayerView.filter = { geometry: searchArea };

              const wifiQuery = wifiLayerView.createQuery();
              wifiQuery.set({ geometry: searchArea });
              return wifiLayerView.queryFeatures(wifiQuery).then(wifiFS => {

                wifiList.innerHTML = "";
                wifiSelectedCountNode.innerHTML = "0";
                wifiCountNode.innerHTML = wifiFS.features.length;

                wifiLocationTargetInfos = wifiFS.features.reduce((infos, wifiFeature) => {

                  infos.features.push(wifiFeature);
                  infos.nodes.push(displayWiFiDetails(wifiFeature));
                  infos.targets.push({ location: this.setPointZOffset(wifiFeature.geometry, 6.0) });

                  return infos;
                }, { features: [], targets: [], nodes: [], selected: [] });

                losViewModel.targets = wifiLocationTargetInfos.targets;
                losViewModel.start();
              });
            };

            let highlight = null;
            this.on("route-cleared", () => {
              wifiLayerView.filter = null;
              losViewModel.clear();
              wifiList.innerHTML = "";
              wifiSelectedCountNode.innerHTML = "0";
              wifiCountNode.innerHTML = "0";
              highlight && highlight.remove();
            });

            this.updateLOSAnalysis = (location, searchArea) => {

              losViewModel.observer = location;
              losViewModel.stop();

              losObserverWGS84 = new Point({
                spatialReference: { wkid: 4326 },
                longitude: location.longitude,
                latitude: location.latitude,
              });

              //view.goTo({ target: location, position: view.camera.position });

            };

          });
        });
      });

    },

    /**
     *
     * @param view
     */
    initializeRouteTour: function(view){

      const locationFeature = new Graphic({
        symbol: {
          type: "point-3d",
          symbolLayers: [{
            type: "object",
            width: 10, height: 50,
            resource: { primitive: "inverted-cone" },
            material: { color: Color.named.dodgerblue }
          }]
        }
      });
      const distanceFeature = new Graphic({
        symbol: {
          type: "polygon-3d",
          symbolLayers: [{
            type: "fill",
            material: { color: Color.named.transparent },
            outline: {
              color: Color.named.dodgerblue,
              size: 5.0
            }
          }]
        }
      });
      const locationsLayer = new GraphicsLayer({ graphics: [locationFeature, distanceFeature] });
      view.map.add(locationsLayer);


      this.analysisSearchDistanceMeters = 100;

      const playbackSwitch = dom.byId("playback-switch");
      const getPlaybackRate = () => {
        // 1 faster than 10...  is 60 realtime? //
        return playbackSwitch.checked ? 10.0 : 200.0;
      };

      let alongLocation = null;
      const updateAnalysis = () => {
        if(alongLocation){
          distanceFeature.geometry = geometryEngine.geodesicBuffer(alongLocation, this.analysisSearchDistanceMeters, "meters");
          locationFeature.geometry = this.setPointZOffset(alongLocation, 3.0);
          this.updateLOSAnalysis(locationFeature.geometry, distanceFeature.geometry);
        }
      };

      const routeAlongLabel = dom.byId("route-along-label");
      this.getDuration = (alongMinutes) => {
        const minutes = Math.floor(alongMinutes);
        const seconds = Math.floor((alongMinutes - minutes) * 60);
        return (minutes > 0) ? `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `00:${String(seconds).padStart(2, "0")}`;
      };

      let _animating = false;
      let _routePolyline = null;
      let _totalTimeMinutes = null;
      let _alongTimeMinutes = null;

      const _updateAlongLocation = () => {
        if(!_alongTimeMinutes) _alongTimeMinutes = 0.0;

        routeAlongLabel.innerHTML = this.getDuration(_alongTimeMinutes);

        if(_alongTimeMinutes <= _totalTimeMinutes){
          if(_animating){

            alongLocation = this.findLocationAlong(_routePolyline, _alongTimeMinutes);
            requestAnimationFrame(updateAnalysis);

            _alongTimeMinutes += (60 / (1000 * getPlaybackRate()));
            requestAnimationFrame(_updateAlongLocation);

          } else {
            stopAnimation();
          }
        } else {
          stopAnimation();
          domClass.add(animateBtn, "btn-disabled");
          this.losClear();
          _alongTimeMinutes = 0.0;
          alongLocation = null;
          distanceFeature.geometry = null;
          locationFeature.geometry = null;

          if(this.base.config.kiosk){
            setTimeout(() => {
              this.addRandomStop();
            }, 3000);
          }

        }
      };

      const startAnimation = () => {
        domClass.remove(animateBtn, "icon-ui-play");
        domClass.add(animateBtn, "icon-ui-pause");
        _animating = true;
        requestAnimationFrame(_updateAlongLocation);
      };

      const stopAnimation = () => {
        domClass.add(animateBtn, "icon-ui-play");
        domClass.remove(animateBtn, "icon-ui-pause");
        _animating = false;
      };

      const animateBtn = dom.byId("animate-btn");
      on(animateBtn, "click", () => {
        if(_animating){
          stopAnimation();
        } else {
          startAnimation();
        }
      });

      this.on("route-cleared", () => {
        alongLocation = null;
        distanceFeature.geometry = null;
        locationFeature.geometry = null;
      });

      const routeTotalLabel = dom.byId("route-total-label");

      this.on("route-solved", routeResult => {

        _routePolyline = routeResult.geometry.clone();
        _totalTimeMinutes = routeResult.attributes.Total_TravelTime || routeResult.attributes.Total_WalkTime;
        _alongTimeMinutes = 0.0;

        routeTotalLabel.innerHTML = this.getDuration(_totalTimeMinutes);

        const searchArea = geometryEngine.geodesicBuffer(_routePolyline, this.analysisSearchDistanceMeters, "meters");
        this.losSetTargets(searchArea).then(() => {

          setTimeout(() => {
            startAnimation();
          }, 1500);

        });

        domClass.remove(animateBtn, "btn-disabled");
      });

    },

    /**
     *
     * @param polyline
     * @param measureAlong
     * @returns {Point}
     */
    findLocationAlong: function(polyline, measureAlong){

      let locationAlong = polyline.getPoint(0, 0);

      polyline.paths.every((part, partIdx) => {
        const lastIdx = (part.length - 1);
        return part.every((coords, coordsIdx) => {
          const location = polyline.getPoint(partIdx, coordsIdx);
          if(location.m < measureAlong){
            return true;
          } else {
            if(coordsIdx === 0){
              if(partIdx > 0){
                const lastPointOfPreviousPart = polyline.getPoint(partIdx - 1, polyline.paths[partIdx - 1].length - 1);
                locationAlong = this._interpolateBetween(lastPointOfPreviousPart, location, measureAlong);
              } else {
                locationAlong = location;
              }
            } else {
              if(coordsIdx < lastIdx){
                locationAlong = this._interpolateBetween(polyline.getPoint(partIdx, coordsIdx - 1), location, measureAlong);
              } else {
                locationAlong = location;
              }
            }
            return false;
          }
        });
      });

      return locationAlong;
    },

    /**
     *
     * @param pointA
     * @param pointB
     * @param measure
     * @returns {esri/geometry/Point}
     * @private
     */
    _interpolateBetween: function(pointA, pointB, measure){
      const betweenPercent = (pointA.m - measure) / (pointA.m - pointB.m);

      const zInfo = pointA.hasZ ? { z: pointA.z + ((pointB.z - pointA.z) * betweenPercent) } : {};

      return new Point({
        spatialReference: pointA.spatialReference,
        x: pointA.x + ((pointB.x - pointA.x) * betweenPercent),
        y: pointA.y + ((pointB.y - pointA.y) * betweenPercent),
        ...zInfo,
        m: measure
      });
    },

    /**
     *
     * @param pntA {Point}
     * @param pntB {Point}
     */
    getHeading: function(pntA, pntB){
      let heading = Math.atan2(pntB.y - pntA.y, pntB.x - pntA.x) * 180.0 / Math.PI;
      if(heading < 0.0){ heading += 360.0; }
      heading = (-heading + 90.0);
      return heading;
    }

  });
});
