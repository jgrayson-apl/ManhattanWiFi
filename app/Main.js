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
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/layers/Layer",
  "esri/layers/GraphicsLayer",
  "esri/geometry/Point",
  "esri/geometry/Extent",
  "esri/geometry/geometryEngine",
  "esri/Graphic",
  "esri/widgets/Home",
  "esri/tasks/RouteTask",
  "esri/tasks/support/RouteParameters",
  "esri/tasks/support/FeatureSet",
  "esri/widgets/LineOfSight/LineOfSightViewModel",
  "esri/widgets/Slider",
  "esri/widgets/Expand"
], function(calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
            Color, colors, number, locale, on, query, dom, domClass, domConstruct,
            IdentityManager, Evented, watchUtils, promiseUtils, Portal,
            Layer, GraphicsLayer, Point, Extent, geometryEngine,
            Graphic, Home, RouteTask, RouteParameters, FeatureSet,
            LineOfSightViewModel, Slider, Expand){

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

      this.initializeLOS(view).then(() => {
        this.initializeRoute(view);
        this.initializeRouteTour(view);
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
     */
    initializeRoute: function(view){

      const routeTask = new RouteTask({
        url: "https://utility.arcgis.com/usrsvcs/appservices/KT1q6dPgISfGSXFb/rest/services/World/Route/NAServer/Route_World"
      });

      const routeParams = new RouteParameters({
        stops: new FeatureSet(),
        startTimeIsUTC: true,
        startTime: Date.now(),
        outputLines: "true-shape-with-measure",
        outSpatialReference: { wkid: 3857 }
      });

      const sizeSettings = { width: 15, height: 200, };
      const startFeature = new Graphic({
        symbol: {
          type: "point-3d",
          symbolLayers: [{
            type: "object",
            ...sizeSettings,
            resource: { primitive: "cylinder" },
            material: { color: Color.named.lime }
          }]
        },
        attributes: {
          name: "Start Location"
        }
      });
      const endFeature = new Graphic({
        symbol: {
          type: "point-3d",
          symbolLayers: [{
            type: "object",
            ...sizeSettings,
            resource: { primitive: "cylinder" },
            material: { color: Color.named.red }
          }]
        },
        attributes: {
          name: "End Location"
        }
      });
      const routeFeature = new Graphic({
        symbol: {
          type: "line-3d",
          symbolLayers: [{
            type: "path",
            cap: "square",
            profile: "quad",
            profileRotation: "heading",
            castShadows: true,
            width: 10, height: 2,
            material: { color: "#eadb69" }
          }]
        }
      });

      const routeLayer = new GraphicsLayer({ graphics: [startFeature, endFeature, routeFeature] }); // ,routeFeature
      view.map.add(routeLayer);

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
            routeTask.solve(routeParams).then(showRoute);
            break;
          case 2:
            this.emit("route-cleared", {});
            startFeature.geometry = endFeature.geometry;
            endFeature.geometry = evt.mapPoint;
            routeParams.startTime = Date.now();
            routeTask.solve(routeParams).then(showRoute);
        }
      };

      const showRoute = (data) => {
        const routeResult = data.routeResults[0].route;
        routeFeature.geometry = routeResult.geometry;

        view.goTo({ target: routeFeature.geometry, scale: 7500, tilt: 55.0 }).then(() => {
          this.emit("route-solved", routeResult);
        });

        // setTimeout(() => {
        //   this.emit("route-solved", routeResult);
        // }, 1000);

      };

      view.container.style.cursor = "crosshair";
      view.on("click", addStop);

    },

    /**
     *
     * @param view
     */
    initializeLOS: function(view){

      const freeList = dom.byId("wifi-free-list");
      const freeCountNode = dom.byId("wifi-free-count");
      const feeList = dom.byId("wifi-fee-list");
      const feeCountNode = dom.byId("wifi-fee-count");

      const updateWiFiDetails = wifiFeatures => {

        freeList.innerHTML = "";
        feeList.innerHTML = "";
        let freeCount = 0;
        let feeCount = 0;

        wifiFeatures.forEach(wifiFeature => {
          const isFree = (wifiFeature.attributes.TYPE === "Free");
          isFree ? freeCount++ : feeCount++;

          const wifiNode = domConstruct.create("div", { className: "side-nav-link" }, (isFree ? freeList : feeList));
          domConstruct.create("div", { className: "font-size-0", innerHTML: wifiFeature.attributes.NAME }, wifiNode);
          domConstruct.create("div", { className: "font-size--3 avenir-italic text-right", innerHTML: wifiFeature.attributes.ADDRESS }, wifiNode);
        });

        freeCountNode.innerHTML = freeCount;
        feeCountNode.innerHTML = feeCount;
      };


      const wifiLayer = view.map.layers.find(layer => {
        return (layer.title === "WiFi Locations");
      });
      return wifiLayer.load().then(() => {
        wifiLayer.outFields = ["*"];

        return view.whenLayerView(wifiLayer).then(wifiLayerView => {
          return watchUtils.whenNotOnce(wifiLayerView, "updating", () => {


            const losViewModel = new LineOfSightViewModel({ view: view });
            this.doLOSAnalysis = (observer, targets) => {
              losViewModel.start();
              losViewModel.observer = observer;
              losViewModel.targets = targets;
              losViewModel.stop();
            };


            let highlight = null;
            this.on("route-cleared", () => {
              freeList.innerHTML = "";
              feeList.innerHTML = "";
              freeCountNode.innerHTML = "0";
              feeCountNode.innerHTML = "0";
              highlight && highlight.remove();
            });

            this.doAnalysis = (location, searchArea) => {

              const wifiQuery = wifiLayerView.createQuery();
              wifiQuery.set({ geometry: searchArea });
              wifiLayerView.queryFeatures(wifiQuery).then(wifiFS => {

                updateWiFiDetails(wifiFS.features);

                highlight && highlight.remove();
                highlight = wifiLayerView.highlight(wifiFS.features);

                const targets = wifiFS.features.map(wifiFeature => {
                  return { location: this.setPointZOffset(wifiFeature.geometry, 0.0) }
                });

                requestAnimationFrame(() => {
                  this.doLOSAnalysis(location, targets);
                });

              });
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


      // wifi range = 100 to 300 meters //
      const distanceSlider = new Slider({
        container: "search-distance-slider",
        min: 1,
        max: 600,
        values: [400],
        steps: 1,
        snapOnClickEnabled: true,
        labelsVisible: true,
        rangeLabelsVisible: true
      });
      distanceSlider.watch("values", values => {
        updateAnalysis();
      });

      const realTimePlaybackRate = (1000 * 60);
      const simulationPlaybackRate = 1000;

      let alongLocation = null;
      const updateAnalysis = () => {
        if(alongLocation){
          distanceFeature.geometry = geometryEngine.geodesicBuffer(alongLocation, distanceSlider.values[0], "feet");
          locationFeature.geometry = this.setPointZOffset(alongLocation, 2.0);
          this.doAnalysis(locationFeature.geometry, distanceFeature.geometry);
        }
      };

      this.on("route-cleared", () => {
        alongLocation = null;
        distanceFeature.geometry = null;
        locationFeature.geometry = null;
      });

      this.on("route-solved", routeResult => {

        const routePolyline = routeResult.geometry.clone();
        const totalTimeMinutes = routeResult.attributes.Total_TravelTime;

        let _animating = true;
        let start = null;

        const updateAlongLocation = (ts) => {
          if(!start) start = ts;
          const progress = (ts - start);

          const alongTimeMinutes = (progress / simulationPlaybackRate);
          if(_animating && (alongTimeMinutes <= totalTimeMinutes)){

            alongLocation = this.findLocationAlong(routePolyline, alongTimeMinutes);

            requestAnimationFrame(updateAnalysis);
            requestAnimationFrame(updateAlongLocation);

          }
        };

        requestAnimationFrame(updateAlongLocation);
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
