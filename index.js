const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const puppeteer = require("puppeteer");
const axios = require("axios");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;


// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://perfect-profile-resume.netlify.app",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// const uri = `mongodb://localhost:27017`;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2xcjib6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// const logger = async (req, res, next) => {
//   console.log("called:", req.host, req.originalUrl);
//   next();
// };
const verifyToken = async (req, res, next) => {
  const token = req.cookie?.token;
  console.log("value of token in middleware", token);
  if (!token) {
    return res.status(401).send({ message: "unAuthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unAuthorized access" });
    }
    console.log("value in the token", decoded);
    req.user = decoded;
    next();
  });
};
async function run() {
  try {
    // await client.connect();

    const usersCollection = client.db("PerfectProfile").collection("users");
    const predefinedTemplatesCollection = client
      .db("PerfectProfile")
      .collection("predefinedTemplates");
    const paymentCollection = client.db("PerfectProfile").collection("payment");
    const resumeCollection = client
      .db("PerfectProfile")
      .collection("customizeResume");

    /*****************Start*********************************/

    /*********auth related system**********/
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("access to the token", token, {
          httpOnly: true,
          // secure: false,
          secure: process.env.NODE_ENV === "production" ? true : false,
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    app.post("/logout", async (req, res) => {
      const user = req.body;
      // console.log("logging out", user);
      res
        .clearCookie("access to the token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production" ? true : false,
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          maxAge: 0,
        })
        .send({ success: true });
    });

    // user related work
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // get a user info by email from db
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const user = await usersCollection.findOne({ email: email });

        if (user) {
          res.status(200).json(user);
        } else {
          res.status(404).json({ message: "User not found" }); 
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Get all users data from db for pagination, filtering and searching.
    app.get("/users", async (req, res) => {
      const size = parseInt(req.query.size) || 10;
      const page = parseInt(req.query.page) - 1 || 0;
      const filter = req.query.filter;
      const search = req.query.search || "";

      let query = {
        name: { $regex: search, $options: "i" },
      };
      if (filter) query.productName = filter;

      try {
        const totalUsers = await usersCollection.countDocuments(query);
        const users = await usersCollection
          .find(query)
          .skip(page * size)
          .limit(size)
          .toArray();

        const allUsers = await usersCollection.find().toArray();
        res.json({
          users,
          totalUsers,
          allUsers,
          totalPages: Math.ceil(totalUsers / size),
          currentPage: page + 1,
        });
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // Get all users data count page from db
    app.get("/users-count", async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search || "";
      let query = {
        name: { $regex: search, $options: "i" },
      };
      if (filter) query.productName = filter;

      // console.log("Current Filter:", filter);
      // console.log("Current Search:", search);

      try {
        const count = await usersCollection.countDocuments(query);
        res.send({ count });
      } catch (error) {
        console.error("Error fetching user count:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });
    // update user info
    app.put(`/user/:email`, async (req, res) => {
      const filter = { email: req.params.email };
      const user = req.body;

      const existingUser = await usersCollection.findOne(filter);
      if (!existingUser) {
        return res.status(404).send({ message: "User not found" });
      }

      const currentDate = new Date();
      const subscriptionDate = new Date(existingUser.createdAt);
      let productName = user.productName;

      // standard free after 1 month
      if (existingUser.productName === "standard") {
        const oneMonthLater = new Date(subscriptionDate);
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
        if (currentDate >= oneMonthLater) {
          productName = "free";
        }
      }

      // premium free after 1 year
      if (existingUser.productName === "premium") {
        const oneYearLater = new Date(subscriptionDate);
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
        if (currentDate >= oneYearLater) {
          productName = "free";
        }
      }

      const updatedDoc = {
        $set: {
          productName: productName,
          amount: user.amount,
        },
      };

      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    /*********Payment System**********/

    // Payment intent
    app.post("/create-payment", async (req, res) => {
      const paymentInfo = req.body;
      console.log(paymentInfo);

      const initialData = {
        store_id: "perfe66fa8d4bbb129",
        store_passwd: "perfe66fa8d4bbb129@ssl",
        total_amount: paymentInfo.amount * 100,
        currency: paymentInfo.currency,
        tran_id: paymentInfo.tran_id,
        success_url: "http://localhost:5000/success-payment",
        fail_url: "http://localhost:5000/fail",
        cancel_url: "http://localhost:5000/cancel",
        cus_name: paymentInfo.userName,
        cus_email: paymentInfo.email,
        cus_add1: "Dhaka",
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone: paymentInfo.phone,
        cus_fax: "01711111111",
        shipping_method: "NO",
        product_name: paymentInfo.productName,
        product_category: paymentInfo.productName,
        product_profile: "general",
        multi_card_name: "mastercard,visacard,amexcard",
      };

      try {
        const response = await axios({
          method: "POST",
          url: "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
          data: initialData,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        });

        const saveData = {
          amount: paymentInfo.amount,
          cus_name: paymentInfo.userName,
          cus_email: paymentInfo.email,
          product_name: paymentInfo.productName,
          tran_id: paymentInfo.tran_id,
          status: "pending",
        };

        console.log(saveData);
        const paymentData = await paymentCollection.insertOne(saveData);

        if (paymentData.insertedId) {
          res.send({ paymentUrl: response.data.GatewayPageURL });
        } else {
          res.status(500).send({ message: "Failed to save payment data" });
        }
      } catch (error) {
        console.error("Error during payment process:", error);
        res
          .status(500)
          .send({ message: "An error occurred during the payment process" });
      }
    });

    // Success payment
    app.post("/success-payment", async (req, res) => {
      const successData = req.body;
      console.log(successData);
      if (successData.status !== "VALID") {
        throw new error("Unauthorized payment");
      }

      // update db
      const query = { tran_id: successData.tran_id };
      const update = {
        $set: {
          status: "Success",
        },
      };
      const updateData = await paymentCollection.updateOne(query, update);
      console.log("success data", successData);
      console.log("update data", updateData);
      // return res.json({ success: true, message: 'Operation successful!', redirectUrl: 'https://perfect-profile-resume.netlify.app/predefined-templates' });

      res.redirect(
        "https://perfect-profile-resume.netlify.app/predefined-templates"
      );
    });

    // fail payment
    app.post("/fail", async (req, res) => {
      res.redirect("http://localhost:5173/pricing");
      throw new error("Please try again");
    });

    // cancel payment
    app.post("/cancel", async (req, res) => {
      res.redirect("http://localhost:5173");
    });

    /*********Predefined Templates**********/
    //Get all Predefined Templates Data from DB
    app.get(`/predefined-templates`, async (req, res) => {
      const cursor = predefinedTemplatesCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    //Get a single Predefined Template Data from DB
    app.get(`/predefined-templates/:id`, async (req, res) => {
      const id = req.params.id;
      const query = { templateItem: id };
      const result = await predefinedTemplatesCollection.findOne(query);
      res.send(result);
    });

    // get all templates for pagination
    app.get(`/templates`, async (req, res) => {
      const size = parseInt(req.query.size);
      const page = Math.max(0, parseInt(req.query.page) - 1);
      const filter = req.query.filter;
      console.log(size, page);
      let query = {};

      if (filter === "free") {
        query.package = "free";
      } else if (filter === "premium") {
        query.package = "premium";
      } else if (filter === "all") {
        query.package = { $in: ["free", "premium"] };
      }

      const result = await predefinedTemplatesCollection
        .find(query)
        .skip(size * page)
        .limit(size)
        .toArray();
      res.send(result);
    });

    // get all the template count from db
    app.get(`/templates-count`, async (req, res) => {
      const filter = req.query.filter;
      console.log(filter);
      let query = {};
      if (filter === "free") {
        query.package = "free";
      } else if (filter === "premium") {
        query.package = "premium";
      } else if (filter === "all") {
        query.package = { $in: ["free", "premium"] };
      }
      const count = await predefinedTemplatesCollection.countDocuments(query);
      res.send({ count });
    });

    /*********Customization Resume**********/

    const generateCustomUrl = () => {
      return Math.random().toString(36).substring(2, 15);
    };

    // sava Customization Resume data in db
    app.post("/share-resume", async (req, res) => {
      // const userId = req.user._id;
      const userData = req.body;
      const customUrl = generateCustomUrl();
      const resumeLink = `https://perfect-profile-resume.netlify.app/resume/${customUrl}`;

      const newResume = {
        // userId: userId,
        resumeLink: resumeLink,
        userData: userData,
        createdAt: new Date(),
      };

      try {
        const result = await resumeCollection.insertOne(newResume);
        const sendInfo = {
          templateID: result.insertedId,
          userData: userData,
        };
        res.send({
          success: true,
          shareLink: resumeLink,
          sendInfo,
        });
      } catch (error) {
        console.error("Error inserting resume link:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to generate share link" });
      }
    });

    // get a single customize resume data from  db
    app.get("/share-resume", async (req, res) => {
      const result = await resumeCollection.find().toArray();
      res.send(result);
    });
    app.get("/share-resume/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await resumeCollection.findOne(query);
      res.send(result);
    });

    /*********Live URL Generate**********/

    // Middleware to simulate user authentication
    app.use((req, res, next) => {
      req.user = { _id: "user-id-123" };
      next();
    });

    // Get a single resume data from db for View Resume via live URL
    app.get("/resume/:link", async (req, res) => {
      try {
        const resumeLink = `https://perfect-profile-resume.netlify.app/resume/${req.params.link}`;
        const resumeData = await resumeCollection.findOne({
          resumeLink: resumeLink,
        });

        if (!resumeData) {
          return res.status(404).json({ error: "Resume not found" });
        }

        res.status(200).json(resumeData);
      } catch (error) {
        res.status(500).json({ error: "Server Error" });
      }
    });

    /*******************End************************** */

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensure that the client will close when you finish/error
    // Uncomment if you want to close the connection when done
    // await client.close();
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("PerfectProfile Server is running");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
