using db from '../db/schema';

/**
 * ProductService — OData V4 Service
 * Exposes Products and Suppliers as projections
 * Defines two unbound actions for CSV bulk upload
 */
service ProductService @(path: '/product') {

    entity Products   as projection on db.Products;
    entity Suppliers  as projection on db.Suppliers;

    /**
     * CSV Upload Actions (unbound — service-level)
     * - csv: Base64 or plain-text CSV string sent from frontend
     * - returns: Upload result with success/error details per row
     */
    type CSVRowError {
        row    : Integer;     // 1-based row number (excluding header)
        column : String;      // Column name where error occurred
        message: String;      // Human-readable error description
    }

    type CSVUploadResult {
        success      : Integer;       // Number of successfully inserted rows
        failed       : Integer;       // Number of failed rows
        totalRows    : Integer;       // Total rows processed (excluding header)
        errors       : array of CSVRowError;
    }

    action uploadProductsCSV(csv : String)  returns CSVUploadResult;
    action uploadSuppliersCSV(csv : String) returns CSVUploadResult;
}