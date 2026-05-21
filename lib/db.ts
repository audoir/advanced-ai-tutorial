import Database from "better-sqlite3";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // In-memory SQLite database
  db = new Database(":memory:");

  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  // Create inventory table
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit_price REAL NOT NULL,
      stock_quantity INTEGER NOT NULL,
      supplier TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create customers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      city TEXT NOT NULL,
      joined_date TEXT NOT NULL
    )
  `);

  // Create sales table with FKs to inventory and customers
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      quantity_sold INTEGER NOT NULL,
      sale_price REAL NOT NULL,
      sale_date TEXT NOT NULL,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  // Seed inventory data
  const insertInventory = db.prepare(`
    INSERT INTO inventory (product_name, category, unit_price, stock_quantity, supplier)
    VALUES (?, ?, ?, ?, ?)
  `);

  const inventoryItems: [string, string, number, number, string][] = [
    ["Wireless Keyboard", "Electronics", 49.99, 150, "TechSupply Co."],
    ["USB-C Hub", "Electronics", 34.99, 200, "TechSupply Co."],
    ["Ergonomic Mouse", "Electronics", 59.99, 120, "PeripheralsPro"],
    ["Standing Desk Mat", "Office Furniture", 39.99, 75, "ComfortOffice Ltd."],
    ["Noise-Cancelling Headphones", "Electronics", 129.99, 60, "AudioWorld"],
    ["Mechanical Pencil Set", "Stationery", 12.99, 500, "WriteRight Inc."],
    ["Whiteboard Markers (12-pack)", "Stationery", 8.99, 300, "WriteRight Inc."],
    ["Laptop Stand", "Electronics", 44.99, 90, "TechSupply Co."],
    ["Office Chair", "Office Furniture", 249.99, 30, "ComfortOffice Ltd."],
    ["Desk Lamp", "Office Furniture", 29.99, 110, "BrightSpace"],
  ];

  const insertInventoryMany = db.transaction(
    (items: typeof inventoryItems) => {
      for (const item of items) insertInventory.run(...item);
    }
  );
  insertInventoryMany(inventoryItems);

  // Seed customers data
  const insertCustomer = db.prepare(`
    INSERT INTO customers (first_name, last_name, email, city, joined_date)
    VALUES (?, ?, ?, ?, ?)
  `);

  const customersData: [string, string, string, string, string][] = [
    ["Alice", "Johnson", "alice.johnson@email.com", "San Francisco", "2024-01-15"],
    ["Bob", "Smith", "bob.smith@email.com", "New York", "2024-02-20"],
    ["Carol", "White", "carol.white@email.com", "Chicago", "2024-03-05"],
    ["David", "Brown", "david.brown@email.com", "Austin", "2024-03-18"],
    ["Eve", "Davis", "eve.davis@email.com", "Seattle", "2024-04-02"],
    ["Frank", "Miller", "frank.miller@email.com", "Denver", "2024-05-10"],
    ["Grace", "Wilson", "grace.wilson@email.com", "Boston", "2024-06-22"],
    ["Henry", "Moore", "henry.moore@email.com", "Miami", "2024-07-14"],
  ];

  const insertCustomersMany = db.transaction(
    (items: typeof customersData) => {
      for (const item of items) insertCustomer.run(...item);
    }
  );
  insertCustomersMany(customersData);

  // Create chat sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create chat messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
    )
  `);

  // Seed sales data
  const insertSale = db.prepare(`
    INSERT INTO sales (inventory_id, customer_id, quantity_sold, sale_price, sale_date)
    VALUES (?, ?, ?, ?, ?)
  `);

  const salesData: [number, number, number, number, string][] = [
    [1, 1, 2, 49.99, "2026-01-05"],
    [2, 2, 5, 34.99, "2026-01-08"],
    [3, 3, 1, 59.99, "2026-01-12"],
    [5, 4, 3, 119.99, "2026-01-15"],
    [8, 1, 1, 44.99, "2026-01-20"],
    [6, 5, 10, 12.99, "2026-02-03"],
    [9, 6, 2, 239.99, "2026-02-07"],
    [4, 7, 3, 39.99, "2026-02-14"],
    [10, 8, 6, 29.99, "2026-02-18"],
    [2, 1, 2, 34.99, "2026-02-25"],
    [7, 2, 8, 8.99, "2026-03-01"],
    [3, 4, 2, 59.99, "2026-03-05"],
    [5, 5, 1, 129.99, "2026-03-10"],
    [1, 3, 3, 49.99, "2026-03-15"],
    [8, 6, 2, 44.99, "2026-03-20"],
    [10, 2, 1, 29.99, "2026-03-25"],
    [6, 7, 5, 12.99, "2026-04-02"],
    [9, 8, 1, 249.99, "2026-04-08"],
    [1, 5, 1, 49.99, "2026-04-12"],
    [4, 1, 2, 39.99, "2026-04-18"],
  ];

  const insertSalesMany = db.transaction((items: typeof salesData) => {
    for (const item of items) insertSale.run(...item);
  });
  insertSalesMany(salesData);

  return db;
}
