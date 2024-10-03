const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const axios = require("axios");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded());
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
    return res.status(401).send({ message: "inAuthorized access" });
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
        expiresIn: "1hr",
      });
      res
        .cookie("access to the token", token, {
          httpOnly: true,
          secure: false,
          // sameSite: "none",
        })
        .send({ success: true });
    });

    app.post("/logout", async (req, res) => {
      const user = req.body;
      console.log("logging out", user);
      res
        .clearCookie("access to the token", {
          maxAge: 0,
        })
        .send({ success: true });
    });

    app.get(`/users`, async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
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
        total_amount: paymentInfo.amount,
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
      // return res.json({ success: true, message: 'Operation successful!', redirectUrl: 'http://localhost:5173/predefined-templates' });

      res.redirect("http://localhost:5173/predefined-templates");
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
    app.get(`/predefined-templates`, async (req, res) => {
      const cursor = predefinedTemplatesCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get(`/predefined-templates/:id`, async (req, res) => {
      const id = req.params.id;
      const query = { templateItem: id };
      const result = await predefinedTemplatesCollection.findOne(query);
      res.send(result);
    });

    /*********Customization Resume**********/
    // // Save a customize-resume data in db
    // app.post(`/customize-resume`, async (req, res) => {
    //   const customizeResume = req.body;
    //   const result = await resumeCollection.insertOne(customizeResume);
    //   res.send(result);
    // });

    // // Get a single customize-resume data from db
    // app.get("/customize-resume/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const query = { _id: new ObjectId(id) };
    //   const result = await resumeCollection.findOne(query);
    //   res.send(result);
    // });

    /*********Live URL Generate**********/

    const generateCustomUrl = () => {
      return Math.random().toString(36).substring(2, 15);
    };

    // Middleware to simulate user authentication
    app.use((req, res, next) => {
      // Mock user object for demonstration purposes
      req.user = { _id: "user-id-123" }; // Replace with actual user authentication logic
      next();
    });


    // Endpoint to generate shareable resume link
    app.post("/share-resume", async (req, res) => {
      const userId = req.user._id; // User ID from the authenticated user
      const userData = req.body; // Get the customized resume data from the request body
      const customUrl = generateCustomUrl(); // Generate a unique URL for the resume
      const resumeLink = `https://perfectprofile.com/resume/${customUrl}`;

      // Create a new resume document with both the resumeLink and userData
      const newResume = {
        userId: userId, // Store the user ID
        resumeLink: resumeLink, // Store the generated resume link
        userData: userData, // Store the customized resume data
        createdAt: new Date(), // Optionally add a timestamp
      };

      try {
        // Insert the new resume document into the collection
        await resumeCollection.insertOne(newResume);
        // Respond with success and the shareable link
        res.send({ success: true, shareLink: resumeLink });
      } catch (error) {
        console.error("Error inserting resume link:", error);
        // Respond with an error message
        res
          .status(500)
          .send({ success: false, message: "Failed to generate share link" });
      }
    });

    // Endpoint to view the resume via shareable link
    app.get("/resume/:customUrl", async (req, res) => {
      const { customUrl } = req.params;

      try {
        const resume = await resumeCollection.findOne({
          resumeLink: `https://perfectprofile.com/resume/${customUrl}`,
        });

        if (!resume) {
          return res.status(404).send("Resume not found");
        }

        // Render the resume using the `resumeTemplate`
        res.render("resumeTemplate", { resume });
      } catch (error) {
        res.status(500).send("Server error");
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
