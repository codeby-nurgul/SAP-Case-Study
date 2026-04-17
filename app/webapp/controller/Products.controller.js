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

            // Filter state for additive search
            this._aAdvancedFilters = [];
            this._oSearchFilter = null;
            this._sSearchQuery = "";
            this._bFilterLogicIsAnd = true;

            // JSON model for CSV validation state
            var oCSVModel = new JSONModel({
                rowCountText: "",
                results: [],
                canUpload: false
            });
            this.setModel(oCSVModel, "csvModel");

            // Refresh data when navigating to this page
            this.getRouter()
                .getRoute("products")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        /**
         * Route matched — reload supplier dropdown data and handle deep-linking.
         */
        _onRouteMatched: function (oEvent) {
            this._loadSuppliers();

            var oArgs = oEvent.getParameter("arguments");
            if (oArgs && oArgs.ID) {
                this._openDetailByID(oArgs.ID);
            }
        },

        /**
         * Finds a row by ID and opens the detail panel.
         */
        _openDetailByID: function (sID) {
            var oTable = this.byId("productsTable");
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
            
            // Clear search/filters to ensure new row is visible
            var oSearchField = this.byId("productsSearch");
            if (oSearchField) { oSearchField.setValue(""); }
            oBinding.filter([]);

            oBinding.create({
                name: "",
                description: "",
                price: 0.00,
                stock: 0,
                currency: "TRY"
            });
            // Scroll to top
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

        /**
         * Client-side CSV export for the products table.
         * Uses RFC 4180 compliant escaping (quoting fields with commas, quotes, or newlines).
         */
        onExportCSV: function () {
            var oBundle = this.getResourceBundle();
            var oBinding = this.byId("productsTable").getBinding("rows");
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
                    fnEscape(o.description),
                    '="' + (o.price || "") + '"', // Force Excel to treat as Text to avoid date conversion (e.g., 29.99 -> 29 Sep)
                    fnEscape(o.currency),
                    fnEscape(o.stock)
                ].join(",");
            });

            var sCSV = "sep=,\nName,Description,Price,Currency,Stock\n" + aRows.join("\n");
            var oBlob = new Blob(["\uFEFF" + sCSV], { type: "text/csv;charset=utf-8;" });
            var sUrl = URL.createObjectURL(oBlob);
            var oLink = document.createElement("a");
            oLink.href = sUrl;
            oLink.download = "products_export.csv";
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
         * Live search across name & description columns (OR logic).
         */
        /**
         * Live search across name & description columns (OR logic).
         * Now additive to advanced filters.
         */
        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            this._sSearchQuery = sQuery;

            this._oSearchFilter = null;
            if (sQuery) {
                this._oSearchFilter = new Filter({
                    filters: [
                        new Filter("name", FilterOperator.Contains, sQuery),
                        new Filter("description", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                });
            }

            this._applyCombinedFilters("productsTable");
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
         * Now additive to search.
         */
        onApplyFilters: function () {
            var oFilterModel = this.getModel("filterModel");
            var aConditions = oFilterModel.getProperty("/conditions");
            var bAnd = oFilterModel.getProperty("/logicIndex") === 0;

            var aNumericFields = ["price", "stock"];
            var aFilters = [];

            aConditions.forEach(function (oCond) {
                if (oCond.value && oCond.value.trim() !== "") {
                    var sOp = oCond.operator;
                    var vValue = oCond.value;
                    if (aNumericFields.indexOf(oCond.field) !== -1) {
                        if (sOp === "Contains") { sOp = "EQ"; }
                        vValue = parseFloat(oCond.value);
                    }
                    aFilters.push(new Filter(oCond.field, sOp, vValue));
                }
            });

            this._aAdvancedFilters = aFilters;
            this._bFilterLogicIsAnd = bAnd;

            this._applyCombinedFilters("productsTable");

            this._pFilterDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        /** Reset all filters AND search bar */
        onClearFilters: function () {
            // 1) Clear Model
            this.getModel("filterModel").setProperty("/conditions", [
                { field: "name", operator: "Contains", value: "" }
            ]);
            this.getModel("filterModel").setProperty("/logicIndex", 0);

            // 2) Clear Internal State
            this._aAdvancedFilters = [];
            this._oSearchFilter = null;
            this._sSearchQuery = "";

            // 3) Clear Search Field UI
            var oSearchField = this.byId("productsSearch");
            if (oSearchField) { oSearchField.setValue(""); }

            // 4) Apply
            this._applyCombinedFilters("productsTable");

            this._pFilterDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        /**
         * Merges Search and Advanced Filters with AND logic.
         * Updates the visual filter status indicator.
         */
        _applyCombinedFilters: function (sTableId) {
            var aOverallFilters = [];
            var oBundle = this.getResourceBundle();
            var sStatusText = "";

            // 1) Add Advanced Filters
            if (this._aAdvancedFilters && this._aAdvancedFilters.length > 0) {
                aOverallFilters.push(new Filter({
                    filters: this._aAdvancedFilters,
                    and: this._bFilterLogicIsAnd
                }));
                sStatusText = oBundle.getText("activeFiltersInfo", [this._aAdvancedFilters.length]);
            }

            // 2) Add Search Filter
            if (this._oSearchFilter) {
                aOverallFilters.push(this._oSearchFilter);
                if (sStatusText) {
                    sStatusText = oBundle.getText("filterCombined", [this._aAdvancedFilters.length]);
                } else {
                    sStatusText = oBundle.getText("searchInfo", [this._sSearchQuery]);
                }
            }

            // 3) Apply to Table
            var oBinding = this.byId(sTableId).getBinding("rows");
            if (aOverallFilters.length > 0) {
                oBinding.filter(new Filter({ filters: aOverallFilters, and: true }));
            } else {
                oBinding.filter([]);
            }

            // 4) Update Visual Indicator
            var oInfoToolbar = this.byId("filterInfoToolbar");
            var oInfoText = this.byId("filterInfoText");
            if (oInfoToolbar && oInfoText) {
                if (sStatusText) {
                    oInfoText.setText(oBundle.getText("filterStatus", [sStatusText]));
                    oInfoToolbar.setVisible(true);
                } else {
                    oInfoToolbar.setVisible(false);
                }
            }
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
         * Open detail panel when clicking the Grid icon in a table row.
         */
        onOpenDetail: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            this._showDetail(oContext);

            // Layout: sol tablo geniş, sağ detay dar
            this.getOwnerComponent().getModel("appView")
                .setProperty("/layout", "TwoColumnsBeginExpanded");

            // Sync selection in table
            var oTable = this.byId("productsTable");
            var aContexts = oTable.getBinding("rows").getContexts();
            var iIndex = aContexts.indexOf(oContext);
            if (iIndex !== -1) {
                oTable.setSelectedIndex(iIndex);
            }
        },

        /**
         * Edit butonu (kalem): satırı vurgular + checkbox'ı işaretler + ilk Input'a focus verir.
         * Detay paneli AÇMAZ.
         */
        onEditRow: function (oEvent) {
            var oButton  = oEvent.getSource();
            var oContext = oButton.getBindingContext();
            var oTable   = this.byId("productsTable");

            // 1) Önceki highlight'ı temizle
            oTable.$().find("tr.sapUiTableTr.editHighlightRow").removeClass("editHighlightRow");

            // 2) Bu satıra highlight class'ı ekle
            var $row = oButton.$().closest("tr.sapUiTableTr");
            if ($row.length) {
                $row.addClass("editHighlightRow");
            }

            // 3) Checkbox'ı işaretle (UI5 selection API)
            // Detay panelinin açılmasını önlemek için flag'i önce set et
            this._bSkipSelectionDetail = true;
            
            var aContexts = oTable.getBinding("rows").getContexts();
            var iIndex    = aContexts.indexOf(oContext);
            if (iIndex !== -1) {
                // Diğer seçimleri koru, sadece bu satırı ekle
                oTable.addSelectionInterval(iIndex, iIndex);
            }

            // 4) İlk Input'a focus + select
            setTimeout(function () {
                if ($row.length) {
                    var $firstInput = $row.find("input.sapMInputBaseInner").first();
                    if ($firstInput.length) {
                        $firstInput.trigger("focus").trigger("select");
                    }
                }
                // Flag'i sıfırla — sonraki kullanıcı seçimleri normal çalışsın
                this._bSkipSelectionDetail = false;
            }.bind(this), 0);

            MessageToast.show(
                this.getResourceBundle().getText("editModeActive") || "Düzenleme modu aktif"
            );
        },

        /**
         * Row selected → show product detail in FCL mid-column.
         * Only opens detail for persisted rows (not transient/new).
         * Edit butonundan tetiklenen selection'da detail açma.
         */
        onRowSelectionChange: function () {
            // Edit butonundan tetiklenen selection'da detail açma
            if (this._bSkipSelectionDetail) {
                return;
            }

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
            var sLayout = "TwoColumnsBeginExpanded";
            this.byId("productsFCL").setLayout(sLayout);
            this.getModel("appView").setProperty("/layout", sLayout);
        },

        /** Collapse FCL back to single column and clear selection */
        onCloseDetail: function () {
            this._closeDetail();
        },

        _closeDetail: function () {
            var sLayout = "OneColumn";
            this.byId("productsFCL").setLayout(sLayout);
            this.getModel("appView").setProperty("/layout", sLayout);
            this.byId("productsTable").clearSelection();
        },

        /** Toggle detail panel between normal and full-screen */
        onToggleDetailFullScreen: function () {
            var oFCL = this.byId("productsFCL");
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

        /** Store selected file reference when user picks a CSV and update UI state */
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
                this._validateCSVClientSide(e.target.result, oFile.name, oCSVModel, ["name"]);
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
            var oCSVModel = this.getModel("csvModel");

            // Temporary set loading state (optional, just disable button)
            oCSVModel.setProperty("/canUpload", false);

            var oAction = oModel.bindContext("/uploadProductsCSV(...)");
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

                // If fully successful, could close or let user see. Disabling upload button to prevent double submit
                if (oResult.failed === 0) {
                    MessageToast.show(oBundle.getText("csvUploadSuccess", [oResult.success]));
                    // Refresh table to show newly imported rows
                    this.byId("productsTable").getBinding("rows").refresh();

                    // ⭐ Success durumunda dialog'u kapat
                    setTimeout(function () {
                        this.onCloseCSVDialog();
                    }.bind(this), 1500);
                } else {
                    oCSVModel.setProperty("/canUpload", true); // Let them try again if there were errors
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
                    var sName = oContext.getProperty("name");
                    var nPrice = oContext.getProperty("price");
                    var nStock = oContext.getProperty("stock");

                    var sCurrency = oContext.getProperty("currency");

                    if (!sName || sName.toString().trim() === "") {
                        aErrors.push(oBundle.getText("nameRequired"));
                    }
                    if (!sCurrency || sCurrency.toString().trim() === "") {
                        aErrors.push(oBundle.getText("currencyRequired"));
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
        },

        /* ═══════════════════════════════════════════════
         *  LIVE VALIDATION
         * ═══════════════════════════════════════════════ */

        /**
         * Real-time validation for Name field as user types.
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
        }
    });
});
