sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, Filter, FilterOperator) {
    "use strict";

    return BaseController.extend("product.management.controller.Home", {

        onInit: function () {
            // KPI model — sayılar buraya yazılır, view bu model'e bind olur
            var oKpiModel = new JSONModel({
                totalProducts:  "-",
                totalSuppliers: "-",
                lowStockCount:  "-"
            });
            this.setModel(oKpiModel, "kpiModel");

            // Sayfa her gösterildiğinde KPI'ları tazele
            this.getRouter()
                .getRoute("home")
                .attachPatternMatched(this._loadKPIs, this);
        },

        /**
         * Loads KPI data from OData V4 service
         */
        _loadKPIs: function () {
            var oModel    = this.getOwnerComponent().getModel();
            var oKpiModel = this.getModel("kpiModel");

            // 1. Total Products
            var oProdBinding = oModel.bindList("/Products", null, null, null, {
                $count: true
            });
            oProdBinding.requestContexts(0, 0).then(function () {
                oKpiModel.setProperty("/totalProducts", oProdBinding.getLength() || 0);
            });

            // 2. Total Suppliers
            var oSupBinding = oModel.bindList("/Suppliers", null, null, null, {
                $count: true
            });
            oSupBinding.requestContexts(0, 0).then(function () {
                oKpiModel.setProperty("/totalSuppliers", oSupBinding.getLength() || 0);
            });

            // 3. Low Stock (stock < 10)
            var oLowStockBinding = oModel.bindList("/Products", null, null,
                [new Filter("stock", FilterOperator.LT, 10)],
                { $count: true }
            );
            oLowStockBinding.requestContexts(0, 9999).then(function (aContexts) {
                oKpiModel.setProperty("/lowStockCount", aContexts.length);
            });
        },

        onNavToProducts: function () {
            this.navTo("products");
        },

        onNavToSuppliers: function () {
            this.navTo("suppliers");
        },

        onNavToProductDetail: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sID = oContext.getProperty("ID");
            this.navTo("products", { ID: sID });
        },

        onNavToSupplierDetail: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sID = oContext.getProperty("ID");
            this.navTo("suppliers", { ID: sID });
        }
    });
});
