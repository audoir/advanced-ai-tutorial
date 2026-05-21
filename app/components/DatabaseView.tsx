"use client";

import { useEffect, useState } from "react";
import type {
  InventoryItem,
  CustomerItem,
  SaleItem,
  DatabaseData,
  ActiveTable,
} from "@/lib/types";

function SqlQueryDisplay({ activeTable }: { activeTable: ActiveTable }) {
  const sqlQueries: Record<ActiveTable, React.ReactNode> = {
    inventory: (
      <span>
        <span className="text-blue-400">SELECT</span> *{" "}
        <span className="text-blue-400">FROM</span>{" "}
        <span className="text-yellow-300">inventory</span>{" "}
        <span className="text-blue-400">ORDER BY</span> id;
      </span>
    ),
    customers: (
      <span>
        <span className="text-blue-400">SELECT</span> *{" "}
        <span className="text-blue-400">FROM</span>{" "}
        <span className="text-yellow-300">customers</span>{" "}
        <span className="text-blue-400">ORDER BY</span> id;
      </span>
    ),
    sales: (
      <span>
        <span className="text-blue-400">SELECT</span> s.id, i.product_name, c.first_name{" "}
        <span className="text-purple-400">||</span>{" "}
        <span className="text-orange-300">&apos; &apos;</span>{" "}
        <span className="text-purple-400">||</span> c.last_name{" "}
        <span className="text-blue-400">AS</span> customer_name,
        s.quantity_sold, s.sale_price, s.sale_date{" "}
        <span className="text-blue-400">FROM</span>{" "}
        <span className="text-yellow-300">sales</span> s{" "}
        <span className="text-blue-400">JOIN</span>{" "}
        <span className="text-yellow-300">inventory</span> i{" "}
        <span className="text-blue-400">ON</span> s.inventory_id = i.id{" "}
        <span className="text-blue-400">JOIN</span>{" "}
        <span className="text-yellow-300">customers</span> c{" "}
        <span className="text-blue-400">ON</span> s.customer_id = c.id{" "}
        <span className="text-blue-400">ORDER BY</span> s.id;
      </span>
    ),
  };

  return (
    <div className="bg-zinc-900 dark:bg-zinc-950 rounded-lg p-4 mb-6 font-mono text-sm text-green-400 overflow-x-auto whitespace-nowrap">
      {sqlQueries[activeTable]}
    </div>
  );
}

function InventoryTable({ data }: { data: InventoryItem[] }) {
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">inventory</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400">{data.length} rows</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-zinc-700/50">
            <tr>
              {["id", "product_name", "category", "unit_price", "stock_quantity", "supplier", "created_at"].map((col) => (
                <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-zinc-700">
            {data.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-zinc-700/30 transition-colors">
                <td className="px-4 py-3 text-gray-500 dark:text-zinc-400 font-mono">{item.id}</td>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.product_name}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">{item.category}</span>
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-zinc-300 font-mono">${item.unit_price.toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-zinc-300 font-mono">{item.stock_quantity}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-zinc-400">{item.supplier}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-zinc-500 font-mono text-xs">{item.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomersTable({ customers, sales }: { customers: CustomerItem[]; sales: SaleItem[] }) {
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">customers</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400">{customers.length} rows</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-zinc-700/50">
            <tr>
              {["id", "first_name", "last_name", "email", "city", "joined_date"].map((col) => (
                <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-zinc-700">
            {customers.map((customer) => {
              const purchaseCount = sales.filter((s) => s.customer_id === customer.id).length;
              return (
                <tr key={customer.id} className="hover:bg-gray-50 dark:hover:bg-zinc-700/30 transition-colors">
                  <td className="px-4 py-3 text-gray-500 dark:text-zinc-400 font-mono">{customer.id}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{customer.first_name}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{customer.last_name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-zinc-400">{customer.email}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-zinc-400">{customer.city}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-zinc-500 font-mono text-xs">
                    <div className="flex items-center gap-3">
                      <span>{customer.joined_date}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300">
                        {purchaseCount} purchase{purchaseCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SalesTable({ data }: { data: SaleItem[] }) {
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">sales</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400">
          {data.length} rows · joined with{" "}
          <span className="font-mono text-blue-500">inventory</span> and{" "}
          <span className="font-mono text-blue-500">customers</span>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-zinc-700/50">
            <tr>
              {["id", "inventory_id", "product_name", "customer_id", "customer_name", "qty_sold", "sale_price", "sale_date"].map((col) => (
                <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-zinc-700">
            {data.map((sale) => (
              <tr key={sale.id} className="hover:bg-gray-50 dark:hover:bg-zinc-700/30 transition-colors">
                <td className="px-4 py-3 text-gray-500 dark:text-zinc-400 font-mono">{sale.id}</td>
                <td className="px-4 py-3 text-blue-600 dark:text-blue-400 font-mono">{sale.inventory_id}</td>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{sale.product_name}</td>
                <td className="px-4 py-3 text-purple-600 dark:text-purple-400 font-mono">{sale.customer_id}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-zinc-300">{sale.customer_name}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-zinc-300 font-mono">{sale.quantity_sold}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-zinc-300 font-mono">${sale.sale_price.toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-zinc-500 font-mono text-xs">{sale.sale_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DatabaseView() {
  const [data, setData] = useState<DatabaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTable, setActiveTable] = useState<ActiveTable>("inventory");

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/database");
      if (!res.ok) throw new Error("Failed to fetch data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  const tables: { key: ActiveTable; label: string; count: number | undefined }[] = [
    { key: "inventory", label: "inventory", count: data?.inventory.length },
    { key: "customers", label: "customers", count: data?.customers.length },
    { key: "sales", label: "sales", count: data?.sales.length },
  ];

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500 dark:text-zinc-400 text-lg">Loading database...</div>
        </div>
      )}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400">
          Error: {error}
        </div>
      )}
      {data && !loading && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            {tables.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setActiveTable(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTable === key
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700"
                }`}
              >
                {label}
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${activeTable === key ? "bg-blue-500 text-white" : "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"}`}>
                  {count}
                </span>
              </button>
            ))}
            <button
              onClick={fetchData}
              disabled={loading}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
          <SqlQueryDisplay activeTable={activeTable} />
          {activeTable === "inventory" && <InventoryTable data={data.inventory} />}
          {activeTable === "customers" && <CustomersTable customers={data.customers} sales={data.sales} />}
          {activeTable === "sales" && <SalesTable data={data.sales} />}
        </div>
      )}
    </main>
  );
}
