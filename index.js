require("dotenv").config();
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");

const serviceAccount = require("./zap-shift-firebase-adminsdk.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const crypto = require("crypto");

function generateTrackingId() {
    const prefix = "PRCL";
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const random = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `${prefix}-${date}-${random}`;
}

//middleware
app.use(cors());
app.use(express.json());

const verifyFBToken = async (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).send({ error: true, message: "Unauthorized access" });
    }

    try {
        const idToken = token.split(" ")[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        // console.log("decoded token", decoded);
        req.decoded_email = decoded.email;

        next();
    } catch (err) {
        return res.status(401).send({ error: true, message: "Unauthorized access" });
    }
};

//uri
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.0ocgkty.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

app.get("/", (req, res) => {
    res.send("Welcome to Zap Shift Server");
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const database = client.db(process.env.DB_NAME);
        const parcelsCollection = database.collection("parcels");
        const paymentCollection = database.collection("payments");

        // Create unique index for transactionId to prevent double entry
        await paymentCollection.createIndex({ transactionId: 1 }, { unique: true });

        //parcel related api

        //get all parcels api
        app.get("/parcels", async (req, res) => {
            const query = {};
            const { email } = req.query;
            if (email) {
                query.senderEmail = email;
            }

            const options = {
                sort: { createdAt: -1 },
            };
            const cursor = parcelsCollection.find(query, options);
            const parcels = await cursor.toArray();
            res.send(parcels);
        });

        //get single parcel api
        app.get("/parcels/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const parcel = await parcelsCollection.findOne(query);
            res.send(parcel);
        });

        //create parcel api
        app.post("/parcels", async (req, res) => {
            const parcel = req.body;
            //add parcel created time
            parcel.createdAt = new Date();
            const result = await parcelsCollection.insertOne(parcel);
            res.send(result);
        });

        //update parcel api
        app.put("/parcels/:id", async (req, res) => {});

        //delete parcel api
        app.delete("/parcels/:id", async (req, res) => {
            const id = req.params.id;
            console.log(typeof id);
            const query = { _id: new ObjectId(id) };
            const result = await parcelsCollection.deleteOne(query);
            res.send(result);
        });

        //payment related api

        //create checkout session api
        app.post("/create-checkout-session", async (req, res) => {
            const paymentInfo = req.body;
            const amount = parseInt(paymentInfo.cost) * 100;

            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: "USD",
                            unit_amount: amount,
                            product_data: {
                                name: paymentInfo.parcelName,
                            },
                        },
                        quantity: 1,
                    },
                ],
                customer_email: paymentInfo.senderEmail,
                mode: "payment",
                metadata: {
                    parcelId: paymentInfo.parcelId,
                    parcelName: paymentInfo.parcelName,
                },
                success_url: `${process.env.PAYMENT_SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.PAYMENT_SITE_DOMAIN}/dashboard/payment-cancelled`,
            });

            // console.log(session);
            res.send({ url: session.url });
        });

        //payment success api
        app.patch("/payment-success", async (req, res) => {
            const sessionId = req.query.session_id;
            // console.log('session id', sessionId);
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            // console.log(session);

            //to prevent double sava in the database
            const transactionId = session.payment_intent;
            const query = { transactionId: transactionId };
            const paymentExist = await paymentCollection.findOne(query);

            console.log("payment exist", paymentExist);

            if (paymentExist) {
                return res.send({ message: "Payment already processed", transactionId, trackingId: paymentExist.trackingId });
            }

            const trackingId = generateTrackingId();

            if (session.payment_status === "paid") {
                const id = session.metadata.parcelId;
                const query = { _id: new ObjectId(id) };
                const update = {
                    $set: {
                        paymentStatus: "paid",
                        trackingId: trackingId,
                    },
                };
                const result = await parcelsCollection.updateOne(query, update);

                const payment = {
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    customerEmail: session.customer_email,
                    parcelId: session.metadata.parcelId,
                    parcelName: session.metadata.parcelName,
                    transactionId: session.payment_intent,
                    paymentStatus: session.payment_status,
                    trackingId: trackingId,
                    paidAt: new Date(),
                };

                const resultPayment = await paymentCollection.insertOne(payment);
                res.send({ success: true, modifyParcel: result, trackingId: trackingId, transactionId: session.payment_intent, paymentInfo: resultPayment });
                return;
            }

            res.send({ success: false });
        });

        //all payments get api
        app.get("/payments", verifyFBToken, async (req, res) => {
            const email = req.query.email;
            const query = {};

            // console.log("headers", req.headers);

            if (email) {
                query.customerEmail = email;

                //check email address
                if (email !== req.decoded_email) {
                    return res.status(403).send({ error: true, message: "Forbidden access" });
                }
            }
            const cursor = paymentCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

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
