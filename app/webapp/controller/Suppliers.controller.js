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

        _onRouteMatched: function (oEvent) {
            var oArgs = oEvent.getParameter("arguments");
            if (oArgs && oArgs.ID) {
                this._openDetailByID(oArgs.ID);
            }
        },

        /**
         * Finds a row by ID and opens the detail panel.
         */
        _openDetailByID: function (sID) {
            var oTable = this.byId("suppliersTable");
            var oBinding = oTable.getBinding("rows");

            // Wait for data to be available
            oBinding.attachEventOnce("dataReceived", function () {
                var aContexts = oBinding.getContexts();
                var oMatch = aContexts.find(function (oCtx) {
                    return oCtx.getProperty("ID") === sID;
                });

                if (oMatch) {
                    this._showDetail(oMatch);
                }
            }.bind(this));

            // If data is already there, try immediately
            var aContexts = oBinding.getContexts();
            if (aContexts && aContexts.length > 0) {
                var oMatch = aContexts.find(function (oCtx) {
                    return oCtx.getProperty("ID") === sID;
                });
                if (oMatch) {
                    this._showDetail(oMatch);
                }
            }
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

            // Clear search/filters to ensure new row is visible
            var oSearchField = this.byId("suppliersSearch");
            if (oSearchField) { oSearchField.setValue(""); }
            oBinding.filter([]);

            oBinding.create({
                name: "",
                email: "",
                phone: "",
                address: ""
            });
            // Scroll to top
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

            var sMsg;
            if (aIndices.length === 1) {
                var oContext = oTable.getContextByIndex(aIndices[0]);
                var sName = oContext.getProperty("name");
                sMsg = oBundle.getText("deleteConfirmSingle", [sName]);
            } else {
                sMsg = oBundle.getText("deleteConfirmPlural");
            }

            MessageBox.confirm(sMsg, {
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

        /**
         * Client-side CSV export for the suppliers table.
         * Uses RFC 4180 compliant escaping (quoting fields with commas, quotes, or newlines).
         */
        onExportCSV: function () {
            var oBundle = this.getResourceBundle();
            var oBinding = this.byId("suppliersTable").getBinding("rows");
            var aContexts = oBinding.getCurrentContexts();

            if (!aContexts || aContexts.length === 0) {
                MessageToast.show(oBundle.getText("noDataToExport"));
                return;
            }

            // RFC 4180: quote the field if it contains a comma, quote, or newline
            var fnEscape = function (val) {
                var s = (val !== undefined && val !== null) ? String(val) : "";
                if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
                    s = '"' + s.replace(/"/g, '""') + '"';
                }
                return s;
            };

            var aRows = aContexts.map(function (oCtx) {
                var o = oCtx.getObject();
                return [
                    fnEscape(o.name),
                    fnEscape(o.email),
                    fnEscape(o.phone),
                    fnEscape(o.address)
                ].join(",");
            });

            var sCSV = "Name,Email,Phone,Address\n" + aRows.join("\n");
            var oBlob = new Blob(["\uFEFF" + sCSV], { type: "text/csv;charset=utf-8;" });
            var sUrl = URL.createObjectURL(oBlob);
            var oLink = document.createElement("a");
            oLink.href = sUrl;
            oLink.download = "suppliers_export.csv";
            document.body.appendChild(oLink);
            oLink.click();
            document.body.removeChild(oLink);
            URL.revokeObjectURL(sUrl);

            MessageToast.show(oBundle.getText("exportSuccess"));
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
         * Action icon (Grid) press -> select row and open detail
         */
        onOpenDetail: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            this._showDetail(oContext);
            
            // Sync selection in table
            var oTable = this.byId("suppliersTable");
            var aContexts = oTable.getBinding("rows").getContexts();
            var iIndex = aContexts.indexOf(oContext);
            if (iIndex !== -1) {
                oTable.setSelectedIndex(iIndex);
            }
        },

        /**
         * Action icon (Pencil) press -> select row and open detail with toast
         */
        onEditRow: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            this._showDetail(oContext);
            
            // Sync selection in table
            var oTable = this.byId("suppliersTable");
            var aContexts = oTable.getBinding("rows").getContexts();
            var iIndex = aContexts.indexOf(oContext);
            if (iIndex !== -1) {
                oTable.setSelectedIndex(iIndex);
            }
            
            MessageToast.show(this.getResourceBundle().getText("editModeActive") || "Edit mode active");
        },

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

            var sLayout = "TwoColumnsBeginExpanded";
            this.byId("suppliersFCL").setLayout(sLayout);
            this.getModel("appView").setProperty("/layout", sLayout);
        },

        onCloseDetail: function () {
            this._closeDetail();
        },

        _closeDetail: function () {
            var sLayout = "OneColumn";
            this.byId("suppliersFCL").setLayout(sLayout);
            this.getModel("appView").setProperty("/layout", sLayout);
            this.byId("suppliersTable").clearSelection();
        },

        onToggleDetailFullScreen: function () {
            var oFCL = this.byId("suppliersFCL");
            var sLayout = oFCL.getLayout();
            var sNewLayout = sLayout === "MidColumnFullScreen"
                    ? "TwoColumnsBeginExpanded"
                    : "MidColumnFullScreen";
            
            oFCL.setLayout(sNewLayout);
            this.getModel("appView").setProperty("/layout", sNewLayout);
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
            oCSVModel.setProperty("/rowCountText", "");

            var aFiles = oEvent.getParameter("files");
            var oFile = (aFiles && aFiles.length > 0) ? aFiles[0] : null;
            if (!oFile) {
                var oDomRef = oEvent.getSource().getFocusDomRef();
                if (oDomRef && oDomRef.files) { oFile = oDomRef.files[0]; }
            }

            this._oCSVFile = oFile;
            if (!oFile) { return; }

            var oReader = new FileReader();
            oReader.onload = function (e) {
                this._validateCSVClientSide(e.target.result, oFile.name, oCSVModel, ["name", "email"]);
            }.bind(this);
            oReader.readAsText(oFile);
        },

        _validateCSVClientSide: function (sContent, sFileName, oCSVModel, aRequiredCols) {
            var aResults = [];
            var bAllPassed = true;

            // 1. CSV format geçerli mi?
            var aLines = [];
            var bFormatValid = false;
            try {
                aLines = sContent.trim().split(/\r?\n/);
                bFormatValid = aLines.length > 0 && aLines[0].indexOf(",") !== -1;
            } catch (e) { bFormatValid = false; }

            aResults.push({
                name: "CSV format is valid",
                message: bFormatValid ? "" : "File cannot be parsed as CSV",
                type: bFormatValid ? "Success" : "Error"
            });
            if (!bFormatValid) { bAllPassed = false; }

            // 2. Zorunlu kolonlar var mı?
            var aHeaders = bFormatValid
                ? aLines[0].split(",").map(function (h) { return h.trim().toLowerCase(); })
                : [];
            var aDataRows = bFormatValid
                ? aLines.slice(1).filter(function (l) { return l.trim() !== ""; })
                : [];

            var aMissing = aRequiredCols.filter(function (c) { return aHeaders.indexOf(c) === -1; });
            var bColsOk = aMissing.length === 0;
            aResults.push({
                name: "Required columns are present",
                message: bColsOk ? "" : "Missing: " + aMissing.join(", "),
                type: bColsOk ? "Success" : "Error"
            });
            if (!bColsOk) { bAllPassed = false; }

            // 3. Satır verisi geçerli mi? (boş name, geçersiz email vs.)
            var aInvalid = [];
            if (bFormatValid && bColsOk) {
                var iNameIdx = aHeaders.indexOf("name");
                var iEmailIdx = aHeaders.indexOf("email");
                var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                aDataRows.forEach(function (sLine, i) {
                    var aCells = sLine.split(",");
                    if (iNameIdx >= 0 && !(aCells[iNameIdx] || "").trim()) {
                        aInvalid.push("name (row " + (i + 2) + ")");
                    }
                    if (iEmailIdx >= 0) {
                        var sEmail = (aCells[iEmailIdx] || "").trim();
                        if (!sEmail || !EMAIL_RE.test(sEmail)) {
                            aInvalid.push("email (row " + (i + 2) + ")");
                        }
                    }
                });
            }
            var bDataOk = aInvalid.length === 0;
            aResults.push({
                name: "All columns are valid for this entry",
                message: bDataOk ? "" : "Invalid: " + aInvalid.slice(0, 3).join(", ") + (aInvalid.length > 3 ? "..." : ""),
                type: bDataOk ? "Success" : "Error"
            });
            if (!bDataOk) { bAllPassed = false; }

            // 4. En az 1 satır var mı?
            var bHasRows = aDataRows.length > 0;
            aResults.push({
                name: "File contains data rows",
                message: bHasRows ? "" : "No data rows found",
                type: bHasRows ? "Success" : "Error"
            });
            if (!bHasRows) { bAllPassed = false; }

            oCSVModel.setProperty("/rowCountText", sFileName + " (" + aDataRows.length + " rows)");
            oCSVModel.setProperty("/results", aResults);
            oCSVModel.setProperty("/canUpload", bAllPassed);
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
        },

        /* ═══════════════════════════════════════════════
         *  LIVE VALIDATION
         * ═══════════════════════════════════════════════ */

        /**
         * Real-time validation for Name field.
         */
        onNameLiveChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var sValue = oEvent.getParameter("value");
            if (!sValue || sValue.trim() === "") {
                oInput.setValueState("Error");
                oInput.setValueStateText(
                    this.getResourceBundle().getText("nameRequired")
                );
            } else {
                oInput.setValueState("None");
                oInput.setValueStateText("");
            }
        },

        /**
         * Real-time validation for Email field.
         */
        onEmailLiveChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var sValue = oEvent.getParameter("value");
            var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!sValue || sValue.trim() === "") {
                oInput.setValueState("Error");
                oInput.setValueStateText(
                    this.getResourceBundle().getText("emailRequired")
                );
            } else if (!EMAIL_RE.test(sValue)) {
                oInput.setValueState("Error");
                oInput.setValueStateText(
                    this.getResourceBundle().getText("emailInvalid")
                );
            } else {
                oInput.setValueState("None");
                oInput.setValueStateText("");
            }
        }
    });
});
