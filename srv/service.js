const cds = require('@sap/cds');

/**
 * ProductService Implementation
 * - Validation hooks (before CREATE / UPDATE)
 * - CSV upload actions (no external libraries)
 */
module.exports = class ProductService extends cds.ApplicationService {

    init() {
        const { Products, Suppliers } = this.entities;

        // ───────────────────────────────────────────────
        //  VALIDATION HOOKS
        // ───────────────────────────────────────────────

        /**
         * Products — before CREATE & UPDATE
         * Rules:
         *   1. name is required and cannot be empty
         *   2. price must be >= 0 if provided
         *   3. stock must be >= 0 if provided
         */
        this.before(['CREATE', 'UPDATE'], Products, (req) => {
            const { name, price, stock } = req.data;

            if (req.event === 'CREATE' || name !== undefined) {
                if (!name || name.toString().trim() === '') {
                    req.error(400, 'PRODUCT_NAME_REQUIRED', 'name', 'Product name is required.');
                }
            }

            if (price !== undefined && price !== null && price < 0) {
                req.error(400, 'PRODUCT_PRICE_NEGATIVE', 'price', 'Price cannot be negative.');
            }

            if (stock !== undefined && stock !== null && stock < 0) {
                req.error(400, 'PRODUCT_STOCK_NEGATIVE', 'stock', 'Stock cannot be negative.');
            }
        });

        /**
         * Suppliers — before CREATE & UPDATE
         * Rules:
         *   1. name is required and cannot be empty
         *   2. email is required and must match a valid pattern
         */
        this.before(['CREATE', 'UPDATE'], Suppliers, (req) => {
            const { name, email } = req.data;

            if (req.event === 'CREATE' || name !== undefined) {
                if (!name || name.toString().trim() === '') {
                    req.error(400, 'SUPPLIER_NAME_REQUIRED', 'name', 'Supplier name is required.');
                }
            }

            if (req.event === 'CREATE' || email !== undefined) {
                if (!email || email.toString().trim() === '') {
                    req.error(400, 'SUPPLIER_EMAIL_REQUIRED', 'email', 'Supplier email is required.');
                } else {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(email)) {
                        req.error(400, 'SUPPLIER_EMAIL_INVALID', 'email', 'Please provide a valid email address.');
                    }
                }
            }
        });

        // ───────────────────────────────────────────────
        //  CSV UPLOAD ACTIONS
        // ───────────────────────────────────────────────

        this.on('uploadProductsCSV', async (req) => {
            return this._handleCSVUpload(req, Products, 'product');
        });

        this.on('uploadSuppliersCSV', async (req) => {
            return this._handleCSVUpload(req, Suppliers, 'supplier');
        });

        return super.init();
    }

    // ───────────────────────────────────────────────
    //  PRIVATE HELPERS
    // ───────────────────────────────────────────────

    /**
     * Generic CSV upload handler
     * 1. Parse CSV text (no external libraries)
     * 2. Validate each row
     * 3. Insert valid rows, collect errors for invalid ones
     */
    async _handleCSVUpload(req, entity, type) {
        const csvText = req.data.csv;

        if (!csvText || csvText.trim() === '') {
            req.error(400, 'CSV data is empty.');
            return;
        }

        const { headers, rows } = this._parseCSV(csvText);

        if (rows.length === 0) {
            return { success: 0, failed: 0, totalRows: 0, errors: [] };
        }

        // Define expected columns per entity type
        const columnMap = {
            product:  { name: 'name', description: 'description', price: 'price', stock: 'stock' },
            supplier: { name: 'name', email: 'email', phone: 'phone', address: 'address' }
        };

        const expectedCols = columnMap[type];
        const errors = [];
        const validEntries = [];

        for (let i = 0; i < rows.length; i++) {
            const rowNum = i + 1; // 1-based (excluding header)
            const row = rows[i];
            const entry = {};
            const rowErrors = [];

            // Map CSV columns to entity fields
            headers.forEach((header, colIndex) => {
                const normalizedHeader = header.trim().toLowerCase();
                // Find matching field
                for (const [key, field] of Object.entries(expectedCols)) {
                    if (normalizedHeader === key) {
                        entry[field] = row[colIndex] ? row[colIndex].trim() : '';
                        break;
                    }
                }
            });

            // ── Type-specific validation ──
            if (type === 'product') {
                if (!entry.name || entry.name === '') {
                    rowErrors.push({ row: rowNum, column: 'name', message: 'Product name is required.' });
                }
                if (entry.price !== undefined && entry.price !== '') {
                    const priceNum = parseFloat(entry.price);
                    if (isNaN(priceNum)) {
                        rowErrors.push({ row: rowNum, column: 'price', message: 'Price must be a valid number.' });
                    } else if (priceNum < 0) {
                        rowErrors.push({ row: rowNum, column: 'price', message: 'Price cannot be negative.' });
                    } else {
                        entry.price = priceNum;
                    }
                } else {
                    entry.price = null;
                }
                if (entry.stock !== undefined && entry.stock !== '') {
                    const stockNum = parseInt(entry.stock, 10);
                    if (isNaN(stockNum)) {
                        rowErrors.push({ row: rowNum, column: 'stock', message: 'Stock must be a valid integer.' });
                    } else if (stockNum < 0) {
                        rowErrors.push({ row: rowNum, column: 'stock', message: 'Stock cannot be negative.' });
                    } else {
                        entry.stock = stockNum;
                    }
                } else {
                    entry.stock = 0;
                }
            }

            if (type === 'supplier') {
                if (!entry.name || entry.name === '') {
                    rowErrors.push({ row: rowNum, column: 'name', message: 'Supplier name is required.' });
                }
                if (!entry.email || entry.email === '') {
                    rowErrors.push({ row: rowNum, column: 'email', message: 'Supplier email is required.' });
                } else {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(entry.email)) {
                        rowErrors.push({ row: rowNum, column: 'email', message: 'Invalid email format.' });
                    }
                }
            }

            if (rowErrors.length > 0) {
                errors.push(...rowErrors);
            } else {
                validEntries.push(entry);
            }
        }

        // Bulk insert valid entries
        let insertedCount = 0;
        for (const entry of validEntries) {
            try {
                await INSERT.into(entity).entries(entry);
                insertedCount++;
            } catch (err) {
                errors.push({
                    row: rows.indexOf(rows.find((_, idx) => validEntries.indexOf(entry) !== -1)) + 1,
                    column: 'general',
                    message: `Database insert failed: ${err.message}`
                });
            }
        }

        return {
            success:   insertedCount,
            failed:    rows.length - insertedCount,
            totalRows: rows.length,
            errors:    errors
        };
    }

    /**
     * Parse CSV string into headers and row arrays
     * Handles:
     *   - Quoted fields with commas inside: "San Francisco, CA"
     *   - Escaped quotes: ""double""
     *   - Windows (\r\n) and Unix (\n) line endings
     *   - Empty trailing lines
     *
     * NO external libraries used — pure string parsing.
     */
    _parseCSV(csvText) {
        const lines = this._splitCSVLines(csvText);

        if (lines.length === 0) {
            return { headers: [], rows: [] };
        }

        const headers = this._parseCSVLine(lines[0]);
        const rows = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') continue; // skip empty lines
            const fields = this._parseCSVLine(line);
            rows.push(fields);
        }

        return { headers, rows };
    }

    /**
     * Split CSV text into lines, respecting quoted fields that span multiple lines
     */
    _splitCSVLines(text) {
        const lines = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (char === '"') {
                inQuotes = !inQuotes;
                current += char;
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                // Handle \r\n
                if (char === '\r' && text[i + 1] === '\n') {
                    i++;
                }
                lines.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        if (current.trim() !== '') {
            lines.push(current);
        }

        return lines;
    }

    /**
     * Parse a single CSV line into an array of field values
     * Handles quoted fields and escaped quotes ("")
     */
    _parseCSVLine(line) {
        const fields = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (inQuotes) {
                if (char === '"') {
                    // Check for escaped quote ""
                    if (line[i + 1] === '"') {
                        current += '"';
                        i++; // skip next quote
                    } else {
                        inQuotes = false; // closing quote
                    }
                } else {
                    current += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    fields.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
        }

        fields.push(current); // push last field
        return fields;
    }
};
