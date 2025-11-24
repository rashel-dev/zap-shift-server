require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.0ocgkty.mongodb.net/?appName=Cluster0`;

console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASSWORD length:", process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : 0);
console.log("URI starts with:", uri.substring(0, 20));

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        console.log("Attempting to connect...");
        await client.connect();
        console.log("Connected successfully!");
        await client.db("admin").command({ ping: 1 });
        console.log("Ping successful!");
    } catch (err) {
        console.error("Connection failed:", err);
    } finally {
        await client.close();
    }
}

run();
