const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 3000;

//middleware
app.use(cors());
app.use(express.json());

//uri
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.0ocgkty.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

app.get("/", (req, res) => {
    res.send("Welcome to Zap Shift Server");
});


async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const database = client.db(process.env.DB_NAME);
        const parcelsCollection = database.collection('parcels')

        //parcel related api

        //get all parcels api
        app.get('/parcels', async (req, res) => {
            const query = {};
            const {email} = req.query;
            if(email){
                query.senderEmail = email;
            }

            const options = {
                sort: { createdAt: -1 }
            }
            const cursor = parcelsCollection.find(query,options);
            const parcels = await cursor.toArray();
            res.send(parcels);
        })

        //create parcel api
        app.post('/parcels', async (req, res) => {
            const parcel = req.body;
            //add parcel created time
            parcel.createdAt = new Date();
            const result = await parcelsCollection.insertOne(parcel);
            res.send(result);
        })

        //update parcel api
        app.put('/parcels/:id', async (req, res) => {

        })

        //delete parcel api
        app.delete('/parcels/:id', async (req, res) => {

        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Zap Shift server successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Zap Shift is listening on port ${port}`);
});
