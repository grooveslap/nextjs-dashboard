// import { sql } from "@vercel/postgres";
import { ObjectId } from "mongodb";
import {
	CustomerField,
	CustomersTableType,
	InvoiceForm,
	InvoicesTable,
	LatestInvoiceRaw,
	Revenue,
} from "./definitions";
import clientPromise from "./mongodb";

import { formatCurrency } from "./utils";

export async function fetchRevenue() {
  // console.log('fetchRevenue...');

	try {
		const client = await clientPromise;
		const collection = client.db("dashboard").collection("revenues");

    // Artificially delay a response for demo purposes.
    // Don't do this in production :)
    await new Promise((resolve) => setTimeout(resolve, 4000));

		const data = await collection.find({}).toArray();
    // console.log('data: ', data);
    
		return data;
	} catch (error) {
		console.error("Database Error:", error);
		throw new Error("Failed to fetch revenue data.");
	}
}

export async function fetchLatestInvoices() {
	try {
		const client = await clientPromise;
		const invoiceCollection = client.db("dashboard").collection("invoices");
		const invoices = await invoiceCollection.find({},{limit:5, sort: {_id: -1}}).toArray()

    // const customerIds = invoices.map((invoices) => {
    //   return invoices.customer_id
    // });

    // const customersQuery = {
    //   id: {
    //     $in: customerIds
    //   }
    // }

    // const customersCollection = client.db("dashboard").collection("customers");
		// const customers = await customersCollection.find(customersQuery, {
    //   limit:5, 
    //   sort: 
    //     { _id: -1 }
    // }).toArray()

		const data = await invoiceCollection
			.aggregate([
				{ $sort: { date : 1 } },
				{
					$lookup: {
						from: "customers",
						localField: "customer_id",
						foreignField: "id",
						as: "customer_info",
					},
				},
				{ $unwind: "$customer_info" },
				{
					$project: {
						amount: 1,
						name: "$customer_info.name",
						email: "$customer_info.email",
						image_url: "$customer_info.image_url",
					},
				},
				{ $limit: 5 },
			])
			.toArray();
			
		// await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log('data: ', data);

		const latestInvoices = data.map((invoice) => ({
			...invoice,
			amount: formatCurrency(invoice.amount),
		}));
		return latestInvoices;
	} catch (error) {
		console.error("Database Error:", error);
		throw new Error("Failed to fetch the latest invoices.");
	}
}

export async function fetchCardData() {
	try {
		// You can probably combine these into a single SQL query
		// However, we are intentionally splitting them to demonstrate
		// how to initialize multiple queries in parallel with JS.
		const client = await clientPromise;
		const collection = {
			invoices: client.db("dashboard").collection("invoices"),
			customers: client.db("dashboard").collection("customers"),
		};

		const invoiceCountPromise = collection.invoices.countDocuments();
		const customerCountPromise = collection.customers.countDocuments();
		const invoiceStatusPromise = collection.invoices
			.aggregate([
				{
					$group: {
						_id: null,
						paid: {
							$sum: {
								$cond: [{ $eq: ["$status", "paid"] }, "$amount", 0],
							},
						},
						pending: {
							$sum: {
								$cond: [{ $eq: ["$status", "pending"] }, "$amount", 0],
							},
						},
					},
				},
			])
			.toArray();

		const [numberOfInvoices, numberOfCustomers, sumInvoiceValues] =
			await Promise.all([
				invoiceCountPromise,
				customerCountPromise,
				invoiceStatusPromise,
			]);

		const totalPaidInvoices = formatCurrency(sumInvoiceValues[0].paid ?? "0");
		const totalPendingInvoices = formatCurrency(sumInvoiceValues[0].pending ?? "0");

		return {
			numberOfCustomers,
			numberOfInvoices,
			totalPaidInvoices,
			totalPendingInvoices,
		};
	} catch (error) {
		console.error("Database Error:", error);
		throw new Error("Failed to fetch card data.");
	}
}

const ITEMS_PER_PAGE = 6;

export async function fetchFilteredInvoices(
	query: string,
	currentPage: number
) {
	const client = await clientPromise;
	const db = client.db("dashboard");
	const collection = {
		invoices: db.collection("invoices"),
		customers: db.collection("customers"),
	};
	const offset = (currentPage - 1) * ITEMS_PER_PAGE;

	const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  console.log('safeQuery: ', safeQuery);

	try {
		const invoices = await collection.invoices.aggregate([
			{
				$lookup: {
					from: "customers",
					localField: "customer_id",
					foreignField: "id",
					as: "customer",
				},
			},
			{
				$unwind: "$customer",
			},
			{
				$match: {
					$or: [
						{ "customer.name": { $regex: safeQuery, $options: "i" } },
						{ "customer.email": { $regex: safeQuery, $options: "i" } },
						{ amount: { $regex: safeQuery, $options: "i" } },
						{ date: { $regex: safeQuery, $options: "i" } },
						{ status: { $regex: safeQuery, $options: "i" } },
					],
				},
			},
			{
				$project: {
					amount: 1,
					date: 1,
					status: 1,
					// "customer.name": 1,
					// "customer.email": 1,
					// "customer.image_url": 1,
          name: "$customer.name",
          email: "$customer.email",
          image_url: "$customer.image_url",
        },
			},
      {
				$sort: { _id: -1 },
			},
			{
				$skip: offset,
			},
			{
				$limit: ITEMS_PER_PAGE,
			},
		]);
    // console.log('invoices.toArray(): ', await invoices.toArray());

		return invoices.toArray();
	} catch (error) {
		console.error("Database Error:", error);
		throw new Error("Failed to fetch invoices.");
	}
}

export async function fetchInvoicesPages(query: string) {
	const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const client = await clientPromise;
	const collection = {
		invoices: client.db("dashboard").collection("invoices"),
		customers: client.db("dashboard").collection("customers"),
	};

	try {
		const count = await collection.invoices
			.aggregate([
				{
					$lookup: {
						from: "customers",
						localField: "customer_id",
						foreignField: "id",
						as: "customer",
					},
				},
				{
					$unwind: "$customer",
				},
				{
					$match: {
						$or: [
							{ "customer.email": { $regex: safeQuery, $options: "i" } },
							{ "customer.name": { $regex: safeQuery, $options: "i" } },
							{ amount: { $regex: safeQuery, $options: "i" } },
							{ status: { $regex: safeQuery, $options: "i" } },
							{ date: { $regex: safeQuery, $options: "i" } },
						],
					},
				},
				{
					$count: "total",
				},
			])
			.toArray();
			
		const totalPages = count[0]
			? Math.ceil(Number(count[0].total) / ITEMS_PER_PAGE)
			: 0;
		return totalPages;
	} catch (error) {
		console.error("Database Error:", error);
		throw new Error("Failed to fetch total number of invoices.");
	}
}

export async function fetchInvoiceById(id: string) {
	try {
		const client = await clientPromise;
		const collection = client
			.db("dashboard")
			.collection("invoices");

		const data = await collection.findOne({ _id: new ObjectId(id) });
		const invoice = data
			? {
					...data,
					amount: data.amount / 100,
			  }
			: {};
		return invoice;
	} catch (error) {
		console.error("Database Error:", error);
		throw new Error("Failed to fetch invoice.");
	}
}

export async function fetchCustomers() {
	try {
		const client = await clientPromise;
		const collection = client
			.db("dashboard")
			.collection("customers");
		const data = collection
			.find({})
			.project({ _id: 1, name: 1 })
			.sort({ name: 1 });

		const customers = await data.toArray();
		return customers;
	} catch (err) {
		console.error("Database Error:", err);
		throw new Error("Failed to fetch all customers.");
	}
}

export async function fetchFilteredCustomers(query: string) {
	try {
		const data = await sql<CustomersTableType>`
		SELECT
		  customers.id,
		  customers.name,
		  customers.email,
		  customers.image_url,
		  COUNT(invoices.id) AS total_invoices,
		  SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
		  SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
		FROM customers
		LEFT JOIN invoices ON customers.id = invoices.customer_id
		WHERE
		  customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
		GROUP BY customers.id, customers.name, customers.email, customers.image_url
		ORDER BY customers.name ASC
	  `;

		const customers = data.rows.map((customer) => ({
			...customer,
			total_pending: formatCurrency(customer.total_pending),
			total_paid: formatCurrency(customer.total_paid),
		}));

		return customers;
	} catch (err) {
		console.error("Database Error:", err);
		throw new Error("Failed to fetch customer table.");
	}
}
