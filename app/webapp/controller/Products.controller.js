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

    return BaseController.extend("product.management.controller.Products", {

        /* ═══════════════════════════════════════════════
         *  LIFECYCLE
         * ═══════════════════════════════════════════════ */

        onInit: function () {
            // JSON model for Supplier dropdown items
            var oSuppliersModel = new JSONModel({ items: [] });
            this.setModel(oSuppliersModel, "suppliersList");

            // JSON model for advanced filter dialog state
            var oFilterModel = new JSONModel({
                conditions: [
                    { field: "name", operator: "Contains", value: "" }
                ],
                logicIndex: 0   // 0 = AND, 1 = OR
            });
            this.setModel(oFilterModel, "filterModel");

            // Refresh data when navigating to this page
            this.getRouter()
                .getRoute("products")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        /**
         * Route matched — reload supplier dropdown data.
         * Product table refreshes automatically via OData list binding.
         */
        _onRouteMatched: function () {
            this._loadSuppliers();
        },

        /**
         * Load all suppliers into a JSON model.
         * Used by the Supplier dropdown (Select) inside the table column.
         */
        _loadSuppliers: function () {
            var oModel = this.getModel();
            var oListBinding = oModel.bindList("/Suppliers");
            oListBinding.requestContexts(0, 9999).then(function (aContexts) {
                var aSuppliers = aContexts.map(function (oCtx) {
                    return oCtx.getObject();
                });
                this.getModel("suppliersList").setProperty("/items", aSuppliers);
            }.bind(this));
        },

        /* ═══════════════════════════════════════════════
         *  CRUD OPERATIONS
         * ═══════════════════════════════════════════════ */

        /**
         * Add a new empty product row.
         * The row is "transient" until submitBatch is called.
         * Multiple clicks = multiple new rows.
         */
        onAddProduct: function () {
            var oTable = this.byId("productsTable");
            var oBinding = oTable.getBinding("rows");
            oBinding.create({
                name: "",
                description: "",
                price: "0",
                stock: 0
            });
            // Scroll to top so the user sees the new row
            oTable.setFirstVisibleRow(0);
        },

        /**
         * Delete selected products.
         * Uses $auto group → immediate server delete after user confirmation.
         */
        onDeleteProducts: function () {
            var oTable = this.byId("productsTable");
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
                        // Collect contexts first (indices shift during deletion)
                        var aContexts = [];
                        aIndices.forEach(function (iIndex) {
                            var oContext = oTable.getContextByIndex(iIndex);
                            if (oContext) {
                                aContexts.push(oContext);
                            }
                        });

                        // Delete each context — $auto sends immediately
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
         * Save all pending changes (creates + updates) via OData V4 batch.
         * Validates on client-side BEFORE sending to server.
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

            // 2. Check if there are actual changes
            if (!oModel.hasPendingChanges("batchUpdate")) {
                MessageToast.show(oBundle.getText("noChanges"));
                return;
            }

            // 3. Submit all pending changes as a single batch
            oModel.submitBatch("batchUpdate").then(function () {
                if (!oModel.hasPendingChanges("batchUpdate")) {
                    MessageToast.show(oBundle.getText("saveSuccess"));
                    this._loadSuppliers();
                } else {
                    // Server rejected some changes
                    MessageBox.error(oBundle.getText("saveError"));
                }
            }.bind(this)).catch(function () {
                MessageBox.error(oBundle.getText("saveError"));
            });
        },

        /**
         * Cancel all pending changes — resets model to last saved state.
         */
        onCancelChanges: function () {
            this.getModel().resetChanges("batchUpdate");
            MessageToast.show(this.getResourceBundle().getText("changesCancelled"));
        },

        /* ═══════════════════════════════════════════════
         *  SEARCH
         * ═══════════════════════════════════════════════ */

        /**
         * Live search across name & description columns (OR logic).
         */
        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            var oBinding = this.byId("productsTable").getBinding("rows");
            var aFilters = [];

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("name", FilterOperator.Contains, sQuery),
                        new Filter("description", FilterOperator.Contains, sQuery)
                    ],
                    and: false   // OR — match either name or description
                }));
            }

            oBinding.filter(aFilters);
        },

        /* ═══════════════════════════════════════════════
         *  ADVANCED FILTER DIALOG (Lazy Loaded)
         * ═══════════════════════════════════════════════ */

        /**
         * Open advanced filter dialog.
         * Fragment is loaded only once (lazy), then cached.
         */
        onOpenFilterDialog: function () {
            if (!this._pFilterDialog) {
                this._pFilterDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "product.management.view.fragment.ProductFilterDialog",
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

        /** Add a new filter condition row */
        onAddFilterCondition: function () {
            var oModel = this.getModel("filterModel");
            var aConditions = oModel.getProperty("/conditions");
            aConditions.push({ field: "name", operator: "Contains", value: "" });
            oModel.setProperty("/conditions", aConditions);
        },

        /** Remove a filter condition row (minimum 1 must remain) */
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

        /**
         * Build OData V4 filters from dialog conditions and apply.
         * Supports dynamic AND/OR logic between conditions.
         */
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

            var oBinding = this.byId("productsTable").getBinding("rows");
            if (aFilters.length > 0) {
                oBinding.filter(new Filter({ filters: aFilters, and: bAnd }));
            } else {
                oBinding.filter([]);
            }

            this._pFilterDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        /** Reset all filters and close dialog */
        onClearFilters: function () {
            this.getModel("filterModel").setProperty("/conditions", [
                { field: "name", operator: "Contains", value: "" }
            ]);
            this.getModel("filterModel").setProperty("/logicIndex", 0);
            this.byId("productsTable").getBinding("rows").filter([]);
            this._pFilterDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        /** Close filter dialog without applying */
        onCloseFilterDialog: function () {
            this._pFilterDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        /* ═══════════════════════════════════════════════
         *  COLUMN SORTING
         * ═══════════════════════════════════════════════ */

        /**
         * Handle column header sort click.
         * Prevents default table sort and uses OData V4 $orderby instead.
         */
        onSort: function (oEvent) {
            oEvent.preventDefault();

            var oColumn = oEvent.getParameter("column");
            var sSortProperty = oColumn.getSortProperty();
            if (!sSortProperty) {
                return;
            }

            var sSortOrder = oEvent.getParameter("sortOrder");
            var bDescending = sSortOrder === "Descending";

            // Reset sort indicators on all other columns
            var oTable = this.byId("productsTable");
            oTable.getColumns().forEach(function (oCol) {
                if (oCol !== oColumn) {
                    oCol.setSorted(false);
                }
            });

            // Set current column sort state
            oColumn.setSorted(true);
            oColumn.setSortOrder(sSortOrder);

            // Apply OData V4 sorter → server-side $orderby
            oTable.getBinding("rows").sort(new Sorter(sSortProperty, bDescending));
        },

        /* ═══════════════════════════════════════════════
         *  FLEXIBLE COLUMN LAYOUT — DETAIL VIEW
         * ═══════════════════════════════════════════════ */

        /**
         * Row selected → show product detail in FCL mid-column.
         * Only opens detail for persisted rows (not transient/new).
         */
        onRowSelectionChange: function () {
            var oTable = this.byId("productsTable");
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

        /** Bind detail page to the selected row's context and expand FCL */
        _showDetail: function (oContext) {
            this.byId("productDetailPage").setBindingContext(oContext);
            this.byId("productsFCL").setLayout("TwoColumnsMidExpanded");
        },

        /** Collapse FCL back to single column and clear selection */
        onCloseDetail: function () {
            this._closeDetail();
        },

        _closeDetail: function () {
            this.byId("productsFCL").setLayout("OneColumn");
            this.byId("productsTable").clearSelection();
        },

        /** Toggle detail panel between normal and full-screen */
        onToggleDetailFullScreen: function () {
            var oFCL = this.byId("productsFCL");
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

        /** Open CSV upload dialog — fragment loaded once, then cached */
        onOpenCSVDialog: function () {
            if (!this._pCSVDialog) {
                this._pCSVDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "product.management.view.fragment.ProductCSVUpload",
                    controller: this
                }).then(function (oDialog) {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                }.bind(this));
            }
            this._pCSVDialog.then(function (oDialog) {
                // Reset state on each open
                var oMsgStrip = this.byId("productCSVMessage");
                if (oMsgStrip) {
                    oMsgStrip.setVisible(false);
                }
                this._oCSVFile = null;
                oDialog.open();
            }.bind(this));
        },

        /** Store selected file reference when user picks a CSV */
        onCSVFileChange: function (oEvent) {
            var aFiles = oEvent.getParameter("files");
            if (aFiles && aFiles.length > 0) {
                this._oCSVFile = aFiles[0];
            } else {
                // Fallback: access file via DOM
                var oFileUploader = oEvent.getSource();
                var oDomRef = oFileUploader.getFocusDomRef();
                if (oDomRef && oDomRef.files) {
                    this._oCSVFile = oDomRef.files[0];
                }
            }
        },

        /** Read CSV file content and call the OData upload action */
        onExecuteProductCSVUpload: function () {
            var oBundle = this.getResourceBundle();

            if (!this._oCSVFile) {
                MessageToast.show(oBundle.getText("csvNoFile"));
                return;
            }

            var oReader = new FileReader();
            oReader.onload = function (e) {
                this._callProductCSVAction(e.target.result);
            }.bind(this);
            oReader.readAsText(this._oCSVFile);
        },

        /**
         * Call the unbound OData action: uploadProductsCSV
         * Uses OData V4 action binding (NOT fetch/ajax).
         */
        _callProductCSVAction: function (sCsvContent) {
            var oModel = this.getModel();
            var oBundle = this.getResourceBundle();
            var oMsgStrip = this.byId("productCSVMessage");

            var oAction = oModel.bindContext("/uploadProductsCSV(...)");
            oAction.setParameter("csv", sCsvContent);

            oAction.execute().then(function () {
                var oResult = oAction.getBoundContext().getObject();

                if (oResult.failed === 0) {
                    oMsgStrip.setText(
                        oBundle.getText("csvUploadSuccess", [oResult.success])
                    );
                    oMsgStrip.setType("Success");
                } else {
                    var sMsg = oBundle.getText("csvUploadPartial", [
                        oResult.success, oResult.totalRows, oResult.failed
                    ]);
                    if (oResult.errors && oResult.errors.length > 0) {
                        sMsg += "\n" + oResult.errors.map(function (err) {
                            return oBundle.getText("csvRowError", [err.row, err.column, err.message]);
                        }).join("\n");
                    }
                    oMsgStrip.setText(sMsg);
                    oMsgStrip.setType("Warning");
                }
                oMsgStrip.setVisible(true);

                // Refresh table to show newly imported rows
                this.byId("productsTable").getBinding("rows").refresh();
            }.bind(this)).catch(function (oError) {
                oMsgStrip.setText(
                    oBundle.getText("csvUploadFailed") + ": " + oError.message
                );
                oMsgStrip.setType("Error");
                oMsgStrip.setVisible(true);
            });
        },

        /** Close the CSV upload dialog */
        onCloseCSVDialog: function () {
            this._pCSVDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        /* ═══════════════════════════════════════════════
         *  CLIENT-SIDE VALIDATION
         * ═══════════════════════════════════════════════ */

        /**
         * Validate all rows with pending changes before batch submit.
         * Returns an array of error messages. Empty array = valid.
         */
        _validateBeforeSave: function () {
            var oBinding = this.byId("productsTable").getBinding("rows");
            var aContexts = oBinding.getCurrentContexts();
            var aErrors = [];
            var oBundle = this.getResourceBundle();

            aContexts.forEach(function (oContext) {
                if (oContext.hasPendingChanges() || oContext.isTransient()) {
                    var sName  = oContext.getProperty("name");
                    var nPrice = oContext.getProperty("price");
                    var nStock = oContext.getProperty("stock");

                    if (!sName || sName.toString().trim() === "") {
                        aErrors.push(oBundle.getText("nameRequired"));
                    }
                    if (nPrice !== null && nPrice !== undefined && parseFloat(nPrice) < 0) {
                        aErrors.push(oBundle.getText("priceNegative"));
                    }
                    if (nStock !== null && nStock !== undefined && parseInt(nStock, 10) < 0) {
                        aErrors.push(oBundle.getText("stockNegative"));
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
