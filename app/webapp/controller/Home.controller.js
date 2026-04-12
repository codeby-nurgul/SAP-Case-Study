sap.ui.define([
    "./BaseController"
], function (BaseController) {
    "use strict";

    return BaseController.extend("product.management.controller.Home", {

        onInit: function () {
            // Home page init — data loads automatically via OData list binding in the view
        },

        /**
         * Navigate to Products page
         */
        onNavToProducts: function () {
            this.navTo("products");
        },

        /**
         * Navigate to Suppliers page
         */
        onNavToSuppliers: function () {
            this.navTo("suppliers");
        }
    });
});
