using db from '../db/data-model';

service ProductService{
    
    entity Products as projection on db.Product;

}