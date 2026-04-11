sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History"
], function (Controller, History) {
    "use strict";

    /**
     * BaseController — shared methods for all controllers
     * Every controller extends this instead of sap.ui.core.mvc.Controller directly.
     */
    return Controller.extend("product.management.controller.BaseController", {

        /**
         * Get the Router instance
         * @returns {sap.m.routing.Router}
         */
        getRouter: function () {
            return this.getOwnerComponent().getRouter();
        },

        /**
         * Get a named model or the default model
         * @param {string} [sName] Model name
         * @returns {sap.ui.model.Model}
         */
        getModel: function (sName) {
            return this.getView().getModel(sName);
        },

        /**
         * Set a model on the view
         * @param {sap.ui.model.Model} oModel
         * @param {string} [sName]
         */
        setModel: function (oModel, sName) {
            this.getView().setModel(oModel, sName);
            return this;
        },

        /**
         * Get the i18n resource bundle for translations
         * @returns {sap.base.i18n.ResourceBundle}
         */
        getResourceBundle: function () {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle();
        },

        /**
         * Navigate to a route
         * @param {string} sRoute Route name
         * @param {object} [oParams] Route parameters
         * @param {boolean} [bReplace] Replace history entry
         */
        navTo: function (sRoute, oParams, bReplace) {
            this.getRouter().navTo(sRoute, oParams, bReplace);
        },

        /**
         * Navigate back — go to previous page or fallback to home
         */
        onNavBack: function () {
            var sPreviousHash = History.getInstance().getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.navTo("home", {}, true);
            }
        }
    });
});
