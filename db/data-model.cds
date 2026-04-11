namespace db;

entity Product{
    key ID: Integer;
    Name: String;
    Description: String;
    Price: Decimal(10,2);
    Stock: Integer;
}