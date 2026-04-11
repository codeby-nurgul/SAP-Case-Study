sap.ui.define([
    "./BaseController",
    "sap/m/MessageBox"
], function (BaseController, MessageBox) {
    "use strict";

    return BaseController.extend("product.management.controller.App", {

        onInit: function () {
            // Listen to route changes to sync the side navigation selected key
            this.getRouter().attachRouteMatched(this._onRouteMatched, this);
        },

        /**
         * Sync the SideNavigation selected key with the current route.
         * This ensures the correct menu item is highlighted
         * even when the user navigates via browser back/forward.
         */
        _onRouteMatched: function (oEvent) {
            var sRouteName = oEvent.getParameter("name");
            var oSideNav = this.byId("sideNav");
            if (oSideNav) {
                oSideNav.setSelectedKey(sRouteName);
            }
        },

        /**
         * Toggle the side navigation panel (expand / collapse)
         */
        onToggleSideNav: function () {
            var oModel = this.getModel("appView");
            var bExpanded = oModel.getProperty("/sideExpanded");
            oModel.setProperty("/sideExpanded", !bExpanded);
        },

        /**
         * Handle navigation item selection.
         * ROUTING GUARD: If OData model has pending (unsaved) changes,
         * warn the user before navigating away.
         */
        onNavSelect: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            var oModel = this.getModel();  // default OData V4 model

            if (oModel && oModel.hasPendingChanges()) {
                // Unsaved changes exist → ask user for confirmation
                var oBundle = this.getResourceBundle();
                MessageBox.confirm(oBundle.getText("unsavedChangesMessage"), {
                    title: oBundle.getText("unsavedChangesTitle"),
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            // Discard all pending changes and navigate
                            oModel.resetChanges();
                            this.navTo(sKey);
                        }
                        // If CANCEL → do nothing, stay on current page
                    }.bind(this)
                });
            } else {
                // No pending changes → navigate directly
                this.navTo(sKey);
            }
        }
    });
});
