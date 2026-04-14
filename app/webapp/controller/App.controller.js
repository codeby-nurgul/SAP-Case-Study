sap.ui.define([
    "./BaseController",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/Fragment"
], function (BaseController, MessageBox, JSONModel, Filter, FilterOperator, Fragment) {
    "use strict";

    return BaseController.extend("product.management.controller.App", {

        onInit: function () {
            // Initialize theme from localStorage
            var sSavedTheme = localStorage.getItem("appTheme") || "sap_horizon";
            sap.ui.getCore().applyTheme(sSavedTheme);
            
            // Set theme state in appView model
            var oAppViewModel = this.getOwnerComponent().getModel("appView");
            oAppViewModel.setProperty("/isDarkMode", sSavedTheme === "sap_horizon_dark");
            oAppViewModel.setProperty("/layout", "OneColumn");
            oAppViewModel.setProperty("/lowStockCount", 0);
            oAppViewModel.setProperty("/lowStockBadge", "");

            // stockAlerts JSON model
            var oAlertsModel = new JSONModel({ items: [] });
            this.getOwnerComponent().setModel(oAlertsModel, "stockAlerts");

            // Load stock alerts
            this._loadStockAlerts();

            // Listen to route changes to sync the side navigation selected key
            this.getRouter().attachRouteMatched(this._onRouteMatched, this);
        },

        /**
         * Fetches products with stock < 10 and updates the alert model/badge.
         */
        _loadStockAlerts: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oAppViewModel = this.getOwnerComponent().getModel("appView");
            var oAlertsModel = this.getOwnerComponent().getModel("stockAlerts");

            var oBinding = oModel.bindList(
                "/Products",
                null,
                null,
                [new Filter("stock", FilterOperator.LT, 10)]
            );

            oBinding.requestContexts(0, 9999).then(function (aContexts) {
                var aItems = aContexts.map(function (oCtx) {
                    return oCtx.getObject();
                });

                oAlertsModel.setProperty("/items", aItems);

                var iCount = aItems.length;
                oAppViewModel.setProperty("/lowStockCount", iCount);
                // Badge is hidden if string is empty
                oAppViewModel.setProperty(
                    "/lowStockBadge",
                    iCount > 0 ? String(iCount) : ""
                );
            });
        },

        /**
         * Opens the stock alert popover fragment.
         */
        /**
         * Opens the stock alert dialog fragment.
         */
        onOpenStockAlerts: function (oEvent) {
            if (!this._pStockAlertPopover) {
                this._pStockAlertPopover = Fragment.load({
                    name: "product.management.view.fragment.StockAlertPopover",
                    controller: this
                }).then(function (oPopover) {
                    this.getView().addDependent(oPopover);
                    return oPopover;
                }.bind(this));
            }

            this._pStockAlertPopover.then(function (oPopover) {
                oPopover.open();
            });
        },

        /**
         * Closes the stock alert dialog.
         */
        onCloseStockAlerts: function () {
            if (this._pStockAlertPopover) {
                this._pStockAlertPopover.then(function (oPopover) {
                    oPopover.close();
                });
            }
        },

        /**
         * Called when a product in the stock alert dialog is pressed.
         * Navigates to the product detail page.
         */
        onStockAlertItemPress: function (oEvent) {
            var oItem = oEvent.getSource();
            var oCtx = oItem.getBindingContext("stockAlerts");
            var sID = oCtx.getProperty("ID");

            // 1. Close the dialog
            this.onCloseStockAlerts();

            // 2. Navigate to Products page with ID
            this.getRouter().navTo("products", {
                ID: sID
            });
        },

        /**
         * Toggle between light and dark themes
         */
        onThemeToggle: function () {
            var oAppViewModel = this.getModel("appView");
            var bIsDarkMode = oAppViewModel.getProperty("/isDarkMode");
            var sNewTheme = bIsDarkMode ? "sap_horizon" : "sap_horizon_dark";
            
            sap.ui.getCore().applyTheme(sNewTheme);
            oAppViewModel.setProperty("/isDarkMode", !bIsDarkMode);
            localStorage.setItem("appTheme", sNewTheme);
        },

        /**
         * Sync the SideNavigation selected key with the current route.
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
         * Handle navigation item selection with ROUTING GUARD for unsaved changes.
         */
        onNavSelect: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            var oModel = this.getModel();  // default OData V4 model

            if (oModel && oModel.hasPendingChanges()) {
                var oBundle = this.getResourceBundle();
                MessageBox.confirm(oBundle.getText("unsavedChangesMessage"), {
                    title: oBundle.getText("unsavedChangesTitle"),
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            oModel.resetChanges();
                            this.navTo(sKey);
                        }
                    }.bind(this)
                });
            } else {
                this.navTo(sKey);
            }
        }
    });
});
