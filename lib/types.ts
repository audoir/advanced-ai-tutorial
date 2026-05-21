export interface InventoryItem {
  id: number;
  product_name: string;
  category: string;
  unit_price: number;
  stock_quantity: number;
  supplier: string;
  created_at: string;
}

export interface CustomerItem {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  city: string;
  joined_date: string;
}

export interface SaleItem {
  id: number;
  inventory_id: number;
  product_name: string;
  customer_id: number;
  customer_name: string;
  quantity_sold: number;
  sale_price: number;
  sale_date: string;
}

export interface DatabaseData {
  inventory: InventoryItem[];
  customers: CustomerItem[];
  sales: SaleItem[];
}

export type ActiveTable = "inventory" | "customers" | "sales";
