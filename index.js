const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djzcyyl.mongodb.net/`;
const client = new MongoClient(uri, {serverApi: {version: ServerApiVersion.v1,strict: true, deprecationErrors: true,},});

async function run() {
  try {
    const usersCollection = client.db("creativeDb").collection("users");
    const classCollection = client.db("creativeDb").collection("classes");
    const enrollCollection = client.db("creativeDb").collection("enrolls");
    const paymentCollection = client.db("creativeDb").collection("payments");
    const blogCollection = client.db("creativeDb").collection("blog");

    app.post("/jwt", (req, res) => {
      const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "30d",
      });
      res.send({ token });
    });

    const verifyAdmin = async (req, res, next) => {
      const user = await usersCollection.findOne({ email: req.decoded.email });
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = user?.role || "student";
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/all-users", verifyJWT, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.patch("/users/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.updateOne({ _id: new ObjectId(req.params.id) },
       {$set: {role: req.body.role},});
      res.send(result);
    });

    app.delete("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.get("/all-classes", async (req, res) => {
      const result = await classCollection.find().sort({ total_student: -1 }).toArray();
      res.send(result);
    });
    
    app.post("/add-classes", verifyJWT, async (req, res) => {
      const newItem = req.body;
      newItem.status = newItem?.status || "pending";
      const result = await classCollection.insertOne(newItem);
      res.send(result);
    });

    app.patch("/update-classes/:id",verifyJWT, async (req, res) => {
      const result = await classCollection.updateOne({ _id: new ObjectId(req.params.id) }, {
      $set: { status:  req.body.status}});
      res.send(result);
    });

    app.patch("/send-feedback/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await classCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { feedback: req.body.feedback, },});
      res.send(result);
    });

    app.delete("/classes/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await classCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    app.get("/class-by-instructor", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const result = await classCollection.find({ instructor_email: email }).toArray();
      res.send(result);
    });

    app.get("/all-instructors", async (req, res) => {
      const result = await usersCollection.find({ role: "instructor" }).sort({totalClasses : -1 }).toArray();
      res.send(result);
    });

    app.get("/enrolls", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      if (email !== req.decoded.email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const result = await enrollCollection.find({ email: email }).toArray();
      res.send(result);
    });

    app.get("/enroll-by-id/:id", async (req, res) => {
      const result = await enrollCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    app.post("/enrolls", async (req, res) => {
      const result = await enrollCollection.insertOne(req.body);
      res.send(result);
    });

    app.delete("/enrolls/:id", async (req, res) => {
      const result = await enrollCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    app.get("/all-blogs", async (req, res) => {
      const result = await blogCollection.find().toArray();
      res.send(result);
    });

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const insertResult = await paymentCollection.insertOne(req.body);
      const deleteResult = await enrollCollection.deleteOne({
        _id: new ObjectId(req.body.enrollId),
      });
      const updateResult = await classCollection.updateOne(
        { _id: new ObjectId(req.body.classId) },
        {
          $inc: {
            available_seats: -1,
            total_student: 1,
          },
        }
      );
      res.send({ insertResult, deleteResult, updateResult });
    });

    app.get("/payment-history", verifyJWT, async(req,res)=>{
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      if (email !== req.decoded.email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const result = await paymentCollection.find({ email: email }).sort({date : -1 }).toArray();
      res.send(result)
   
     })
   
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server running....");
});

app.listen(port, () => {
  console.log(`server running.... on port ${port}`);
});
