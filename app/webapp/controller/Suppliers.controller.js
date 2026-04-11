sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment"
], function (BaseController, JSONModel, Filter, FilterOperator, Sorter, MessageBox, MessageToast, Fragment) {
    "use strict";

    // Email regex — same pattern used in backend validation
    var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return BaseController.extend("product.management.controller.Suppliers", {

        /* ═══════════════════════════════════════════════
         *  LIFECYCLE
         * ═══════════════════════════════════════════════ */

        onInit: function () {
            // JSON model for advanced filter dialog state
            var oFilterModel = new JSONModel({
                conditions: [
                    { field: "name", operator: "Contains", value: "" }
                ],
                logicIndex: 0   // 0 = AND, 1 = OR
            });
            this.setModel(oFilterModel, "filterModel");

            // JSON model for CSV validation state
            var oCSVModel = new JSONModel({
                rowCountText: "",
                results: [],
                canUpload: false
            });
            this.setModel(oCSVModel, "csvModel");

            // Refresh data when navigating to this page
            this.getRouter()
                .getRoute("suppliers")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            // Table auto-refreshes via OData list binding
        },

        /* ═══════════════════════════════════════════════
         *  CRUD OPERATIONS
         * ═══════════════════════════════════════════════ */

        /**
         * Add a new empty supplier row (transient until batch save).
         */
        onAddSupplier: function () {
            var oTable = this.byId("suppliersTable");
            var oBinding = oTable.getBinding("rows");
            oBinding.create({
                name: "",
                email: "",
                phone: "",
                address: ""
            });
            oTable.setFirstVisibleRow(0);
        },

        /**
         * Delete selected suppliers immediately ($auto group).
         */
        onDeleteSuppliers: function () {
            var oTable = this.byId("suppliersTable");
            var aIndices = oTable.getSelectedIndices();
            var oBundle = this.getResourceBundle();

            if (aIndices.length === 0) {
                MessageToast.show(oBundle.getText("noItemsSelected"));
                return;
            }

            MessageBox.confirm(oBundle.getText("deleteConfirmMessage"), {
                title: oBundle.getText("deleteConfirmTitle"),
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        var aContexts = [];
                        aIndices.forEach(function (iIndex) {
                            var oContext = oTable.getContextByIndex(iIndex);
                            if (oContext) {
                                aContexts.push(oContext);
                            }
                        });

                        aContexts.forEach(function (oContext) {
                            oContext.delete("$auto");
                        });

                        oTable.clearSelection();
                        this._closeDetail();
                        MessageToast.show(oBundle.getText("deleteSuccess"));
                    }
                }.bind(this)
            });
        },

        /**
         * Save pending creates + updates via OData V4 batch.
         * Client-side validation runs FIRST (name required, email format).
         */
        onSaveChanges: function () {
            var oModel = this.getModel();
            var oBundle = this.getResourceBundle();

            // 1. Client-side validation
            var aErrors = this._validateBeforeSave();
            if (aErrors.length > 0) {
                MessageBox.error(aErrors.join("\n"), {
                    title: oBundle.getText("validationError")
                });
                return;
            }

            // 2. Check for actual changes
            if (!oModel.hasPendingChanges("batchUpdate")) {
                MessageToast.show(oBundle.getText("noChanges"));
                return;
            }

            // 3. Submit batch
            oModel.submitBatch("batchUpdate").then(function () {
                if (!oModel.hasPendingChanges("batchUpdate")) {
                    MessageToast.show(oBundle.getText("saveSuccess"));
                } else {
                    MessageBox.error(oBundle.getText("saveError"));
                }
            }.bind(this)).catch(function () {
                MessageBox.error(oBundle.getText("saveError"));
            });
        },

        /**
         * Cancel all pending changes.
         */
        onCancelChanges: function () {
            this.getModel().resetChanges("batchUpdate");
            MessageToast.show(this.getResourceBundle().getText("changesCancelled"));
        },

        /* ═══════════════════════════════════════════════
         *  SEARCH
         * ═══════════════════════════════════════════════ */

        /**
         * Search across name & email columns (OR logic).
         */
        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            var oBinding = this.byId("suppliersTable").getBinding("rows");
            var aFilters = [];

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("name", FilterOperator.Contains, sQuery),
                        new Filter("email", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            oBinding.filter(aFilters);
        },

        /* ═══════════════════════════════════════════════
         *  ADVANCED FILTER DIALOG (Lazy Loaded)
         * ═══════════════════════════════════════════════ */

        onOpenFilterDialog: function () {
            if (!this._pFilterDialog) {
                this._pFilterDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "product.management.view.fragment.SupplierFilterDialog",
                    controller: this
                }).then(function (oDialog) {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                }.bind(this));
            }
            this._pFilterDialog.then(function (oDialog) {
                oDialog.open();
            });
        },

        onAddFilterCondition: function () {
            var oModel = this.getModel("filterModel");
            var aConditions = oModel.getProperty("/conditions");
            aConditions.push({ field: "name", operator: "Contains", value: "" });
            oModel.setProperty("/conditions", aConditions);
        },

        onRemoveFilterCondition: function (oEvent) {
            var oModel = this.getModel("filterModel");
            var aConditions = oModel.getProperty("/conditions");
            var sPath = oEvent.getSource().getBindingContext("filterModel").getPath();
            var iIndex = parseInt(sPath.split("/").pop(), 10);

            if (aConditions.length > 1) {
                aConditions.splice(iIndex, 1);
                oModel.setProperty("/conditions", aConditions);
            }
        },

        onApplyFilters: function () {
            var oFilterModel = this.getModel("filterModel");
            var aConditions = oFilterModel.getProperty("/conditions");
            var bAnd = oFilterModel.getProperty("/logicIndex") === 0;

            var aFilters = [];
            aConditions.forEach(function (oCond) {
                if (oCond.value && oCond.value.trim() !== "") {
                    aFilters.push(new Filter(oCond.field, oCond.operator, oCond.value));
                }
            });

            var oBinding = this.byId("suppliersTable").getBinding("rows");
            if (aFilters.length > 0) {
                oBinding.filter(new Filter({ filters: aFilters, and: bAnd }));
            } else {
                oBinding.filter([]);
            }

            this._pFilterDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        onClearFilters: function () {
            this.getModel("filterModel").setProperty("/conditions", [
                { field: "name", operator: "Contains", value: "" }
            ]);
            this.getModel("filterModel").setProperty("/logicIndex", 0);
            this.byId("suppliersTable").getBinding("rows").filter([]);
            this._pFilterDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        onCloseFilterDialog: function () {
            this._pFilterDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        /* ═══════════════════════════════════════════════
         *  COLUMN SORTING
         * ═══════════════════════════════════════════════ */

        onSort: function (oEvent) {
            oEvent.preventDefault();

            var oColumn = oEvent.getParameter("column");
            var sSortProperty = oColumn.getSortProperty();
            if (!sSortProperty) {
                return;
            }

            var sSortOrder = oEvent.getParameter("sortOrder");
            var bDescending = sSortOrder === "Descending";

            var oTable = this.byId("suppliersTable");
            oTable.getColumns().forEach(function (oCol) {
                if (oCol !== oColumn) {
                    oCol.setSorted(false);
                }
            });

            oColumn.setSorted(true);
            oColumn.setSortOrder(sSortOrder);

            oTable.getBinding("rows").sort(new Sorter(sSortProperty, bDescending));
        },

        /* ═══════════════════════════════════════════════
         *  FLEXIBLE COLUMN LAYOUT — DETAIL VIEW
         * ═══════════════════════════════════════════════ */

        /**
         * Row selected → show supplier detail + products in mid column.
         * Binds with $expand=products to load related products.
         */
        onRowSelectionChange: function () {
            var oTable = this.byId("suppliersTable");
            var iIndex = oTable.getSelectedIndex();

            if (iIndex < 0) {
                this._closeDetail();
                return;
            }

            var oContext = oTable.getContextByIndex(iIndex);
            if (oContext && !oContext.isTransient()) {
                this._showDetail(oContext);
            }
        },

        _showDetail: function (oContext) {
            var oDetailPage = this.byId("supplierDetailPage");

            // Bind detail page with $expand=products to load related products
            oDetailPage.bindElement({
                path: oContext.getPath(),
                parameters: {
                    $expand: "products"
                }
            });

            this.byId("suppliersFCL").setLayout("TwoColumnsMidExpanded");
        },

        onCloseDetail: function () {
            this._closeDetail();
        },

        _closeDetail: function () {
            this.byId("suppliersFCL").setLayout("OneColumn");
            this.byId("suppliersTable").clearSelection();
        },

        onToggleDetailFullScreen: function () {
            var oFCL = this.byId("suppliersFCL");
            var sLayout = oFCL.getLayout();
            oFCL.setLayout(
                sLayout === "MidColumnFullScreen"
                    ? "TwoColumnsMidExpanded"
                    : "MidColumnFullScreen"
            );
        },

        /* ═══════════════════════════════════════════════
         *  CSV UPLOAD DIALOG (Lazy Loaded)
         * ═══════════════════════════════════════════════ */

        onOpenCSVDialog: function () {
            if (!this._pCSVDialog) {
                this._pCSVDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "product.management.view.fragment.SupplierCSVUpload",
                    controller: this
                }).then(function (oDialog) {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                }.bind(this));
            }
            this._pCSVDialog.then(function (oDialog) {
                var oMsgStrip = this.byId("supplierCSVMessage");
                if (oMsgStrip) {
                    oMsgStrip.setVisible(false);
                }
                this._oCSVFile = null;
                oDialog.open();
            }.bind(this));
        },

        onCSVFileChange: function (oEvent) {
            var oCSVModel = this.getModel("csvModel");
            oCSVModel.setProperty("/results", []);
            oCSVModel.setProperty("/canUpload", false);

            var aFiles = oEvent.getParameter("files");
            var oFile = null;
            if (aFiles && aFiles.length > 0) {
                oFile = aFiles[0];
            } else {
                var oFileUploader = oEvent.getSource();
                var oDomRef = oFileUploader.getFocusDomRef();
                if (oDomRef && oDomRef.files) {
                    oFile = oDomRef.files[0];
                }
            }

            this._oCSVFile = oFile;
            if (oFile) {
                oCSVModel.setProperty("/rowCountText", "Selected file: " + oFile.name);
                oCSVModel.setProperty("/canUpload", true);
            } else {
                oCSVModel.setProperty("/rowCountText", "");
            }
        },

        onExecuteSupplierCSVUpload: function () {
            var oBundle = this.getResourceBundle();

            if (!this._oCSVFile) {
                MessageToast.show(oBundle.getText("csvNoFile"));
                return;
            }

            var oReader = new FileReader();
            oReader.onload = function (e) {
                this._callSupplierCSVAction(e.target.result);
            }.bind(this);
            oReader.readAsText(this._oCSVFile);
        },

        /**
         * Call OData V4 unbound action: uploadSuppliersCSV
         */
        _callSupplierCSVAction: function (sCsvContent) {
            var oModel = this.getModel();
            var oBundle = this.getResourceBundle();
            var oCSVModel = this.getModel("csvModel");

            oCSVModel.setProperty("/canUpload", false);

            var oAction = oModel.bindContext("/uploadSuppliersCSV(...)");
            oAction.setParameter("csv", sCsvContent);

            oAction.execute().then(function () {
                var oResult = oAction.getBoundContext().getObject();
                var aResults = [];

                if (oResult.success > 0) {
                    aResults.push({
                        row: "-",
                        name: "Records Inserted",
                        message: oBundle.getText("csvUploadSuccess", [oResult.success]),
                        type: "Success"
                    });
                }

                if (oResult.errors && oResult.errors.length > 0) {
                    oResult.errors.forEach(function (err) {
                        aResults.push({
                            row: err.row.toString(),
                            name: "Column [" + err.column + "]",
                            message: err.message,
                            type: "Error"
                        });
                    });
                } else if (oResult.failed > 0) {
                    aResults.push({
                        row: "-",
                        name: "Import Failed",
                        message: oResult.failed + " records failed to import.",
                        type: "Error"
                    });
                }

                oCSVModel.setProperty("/results", aResults);

                if (oResult.failed === 0) {
                     MessageToast.show(oBundle.getText("csvUploadSuccess", [oResult.success]));
                     this.byId("suppliersTable").getBinding("rows").refresh();
                } else {
                     oCSVModel.setProperty("/canUpload", true);
                }

            }.bind(this)).catch(function (oError) {
                var aResults = [{
                    row: "-",
                    name: "System Error",
                    message: oError.message || oBundle.getText("csvUploadFailed"),
                    type: "Error"
                }];
                oCSVModel.setProperty("/results", aResults);
                oCSVModel.setProperty("/canUpload", true);
            }.bind(this));
        },

        onCloseCSVDialog: function () {
            this._pCSVDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        /* ═══════════════════════════════════════════════
         *  CLIENT-SIDE VALIDATION
         * ═══════════════════════════════════════════════ */

        /**
         * Validate supplier rows before batch submit.
         * Checks: name required, email required + format.
         */
        _validateBeforeSave: function () {
            var oBinding = this.byId("suppliersTable").getBinding("rows");
            var aContexts = oBinding.getCurrentContexts();
            var aErrors = [];
            var oBundle = this.getResourceBundle();

            aContexts.forEach(function (oContext) {
                if (oContext.hasPendingChanges() || oContext.isTransient()) {
                    var sName  = oContext.getProperty("name");
                    var sEmail = oContext.getProperty("email");

                    if (!sName || sName.toString().trim() === "") {
                        aErrors.push(oBundle.getText("nameRequired"));
                    }

                    if (!sEmail || sEmail.toString().trim() === "") {
                        aErrors.push(oBundle.getText("emailRequired"));
                    } else if (!EMAIL_REGEX.test(sEmail)) {
                        aErrors.push(oBundle.getText("emailInvalid"));
                    }
                }
            });

            // Remove duplicate messages
            return aErrors.filter(function (sErr, iIdx, aArr) {
                return aArr.indexOf(sErr) === iIdx;
            });
        }
    });
});
