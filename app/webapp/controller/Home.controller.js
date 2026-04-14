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
        },

        /**
         * Navigates to Products page and requests opening a specific product detail.
         */
        onNavToProductDetail: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sID = oContext.getProperty("ID");
            this.navTo("products", {
                ID: sID
            });
        },

        /**
         * Navigates to Suppliers page and requests opening a specific supplier detail.
         */
        onNavToSupplierDetail: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sID = oContext.getProperty("ID");
            this.navTo("suppliers", {
                ID: sID
            });
        }
    });
});
