import bcrypt from "bcrypt";
// import mongodb from "@/app/lib/mongodb";
import clientPromise from '@/app/lib/mongodb';

import { invoices, customers, revenue, users } from "@/app/lib/placeholder-data";

async function seedUsers() {
	const insertedUsers = await Promise.all(users.map(async user => {
    const hashedPassword = await bcrypt.hash(user.password, 10);

    const client = await clientPromise;
    const collection = client.db('test').collection('users');
  
    return await collection.insertOne({
			name: user.name,
			email: user.email,
			password: hashedPassword,
		})
  }))
	return insertedUsers;
}

async function seedCustomers() {
  const client = await clientPromise;
  const collection = client.db('test').collection('customers');

  const insertedCustomers = await collection.insertMany(customers);
	return insertedCustomers;
}

async function seedInvoices() {
  const client = await clientPromise;
  const collection = client.db('test').collection('invoices');

  const insertedInvoices = await collection.insertMany(invoices);
	return insertedInvoices;
}

async function seedRevenue() {
  const client = await clientPromise;
  const collection = client.db('test').collection('revenues');

  const insertedRevenue = await collection.insertMany(revenue);
	return insertedRevenue;
}

export async function GET() {
	try {
		await seedUsers();
		await seedCustomers();
		await seedInvoices();
		await seedRevenue();
		return Response.json({ message: "Database seeded successfully" });
	} catch (e) {
		console.error(e);
		return Response.json({ e }, { status: 500 });
	}
}
