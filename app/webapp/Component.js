sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
    "use strict";

    return UIComponent.extend("product.management.Component", {

        metadata: {
            manifest: "json",
            interfaces: ["sap.ui.core.IAsyncContentCreation"]
        },

        /**
         * Component lifecycle — called once on startup.
         * Initializes router and device model.
         */
        init: function () {
            // Call parent init (creates models, creates rootView, initializes router)
            UIComponent.prototype.init.apply(this, arguments);

            // Device model for responsive design
            var oDeviceModel = new JSONModel(sap.ui.Device);
            oDeviceModel.setDefaultBindingMode("OneWay");
            this.setModel(oDeviceModel, "device");

            // Initialize the router — starts hash-based routing
            this.getRouter().initialize();
        }
    });
});
