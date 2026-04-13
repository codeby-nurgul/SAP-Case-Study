namespace db;

using { cuid, managed } from '@sap/cds/common';

/**
 * Products Entity
 * - cuid  : Generates a UUID-based primary key (key ID : UUID)
 * - managed : Adds createdAt, createdBy, modifiedAt, modifiedBy fields automatically
 */
entity Products : cuid, managed {
    name        : String(100)  @mandatory;
    description : String(500);
    price       : Decimal(10,2);
    stock       : Integer default 0;
    currency    : String(3) default 'TRY';
    supplier    : Association to Suppliers;
}

/**
 * Suppliers Entity
 * - Backlink association: one supplier can have many products
 */
entity Suppliers : cuid, managed {
    name     : String(100) @mandatory;
    email    : String(100) @mandatory;
    phone    : String(20);
    address  : String(200);
    products : Association to many Products on products.supplier = $self;
}
