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
      "https://perfectprofile-ebde4.web.app",
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

// verify jwt middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies.token;
  // console.log('token', token);
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
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
    const userTrendsCollection = client
      .db("PerfectProfile")
      .collection("userTrends");
    const predefinedTemplatesCollection = client
      .db("PerfectProfile")
      .collection("predefinedTemplates");
    const paymentCollection = client.db("PerfectProfile").collection("payment");
    const resumeCollection = client
      .db("PerfectProfile")
      .collection("customizeResume");
    const favoriteCollection = client
      .db("PerfectProfile")
      .collection("favorite");
    const feedbackCollection = client
      .db("PerfectProfile")
      .collection("feedback");

    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      // console.log("hello");
      const user = req.user;
      const query = { email: user?.email };
      const result = await usersCollection.findOne(query);
      // console.log("User Email", user);
      // console.log("Admin Result Role", result);
      if (!result || result?.role !== "admin")
        return res.status(401).send({ message: "unauthorized access!!" });

      next();
    };

    /*****************Start*********************************/

    /*********auth related system**********/
    // jwt token generate route
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      // console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          // secure: false,
          secure: process.env.NODE_ENV === "production" ? true : false,
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
      // console.log("jwt token", token);
    });

    app.post("/logout", async (req, res) => {
      const user = req.body;
      // console.log("logging out", user);
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production" ? true : false,
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          maxAge: 0,
        })
        .send({ success: true });
    });

    app.post("/protected", (req, res) => {
      return res.json({ user: { id: req.userId, role: req.userRole } });
    });

    // app.post("/logout", async (req, res) => {
    //   const user = req.body;
    //   // console.log("logging out", user);
    //   res
    //     .clearCookie("access_token", {
    //       httpOnly: true,
    //       secure: process.env.NODE_ENV === "production" ? true : false,
    //       sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    //       maxAge: 0,
    //     })
    //     .send({ success: true });
    // });

    // user related work
    // app.post("/users", async (req, res) => {
    //   const user = req.body;
    //   const query = { email: user.email };
    //   const existingUser = await usersCollection.findOne(query);
    //   if (existingUser) {
    //     return res.send({ message: "user already exists" });
    //   }
    //   const result = await usersCollection.insertOne(user);
    //   res.send(result);
    // });

    app.post("/users", async (req, res) => {
      const user = {
        ...req.body,
        isActive: true,
        createdAt: new Date(),
      };

      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // User Trends
    app.post("/user-trends", async (req, res) => {
      const { date, new_users, active_users } = req.body;

      try {
        const newTrendData = { date, new_users, active_users };
        const result = await userTrendsCollection.insertOne(newTrendData);
        res
          .status(201)
          .send({ message: "User trends saved successfully!", result });
      } catch (error) {
        console.error("Error saving user trends:", error);
        res.status(500).send({ message: "Error saving user trends." });
      }
    });

    app.get("/user-trends", async (req, res) => {
      try {
        const trends = await userTrendsCollection.find().toArray();
        res.send(trends);
      } catch (error) {
        console.error("Error fetching user trends:", error);
        res.status(500).send({ message: "Error fetching user trends." });
      }
    });

    // delete favorite templates
    app.delete("/user/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    // get all the user
    app.get(`/user`, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.patch("/updateProfile/:email", async (req, res) => {
      const { email } = req.params;
      const { name, image } = req.body; // Only take the `name` field for update

      const filter = { email: email };
      const update = { $set: { name: name, image: image } }; // Only update `name`

      try {
        const result = await usersCollection.updateOne(filter, update);

        if (result.matchedCount > 0 && result.modifiedCount > 0) {
          res
            .status(200)
            .send({ message: "Name updated successfully", result });
        } else if (result.matchedCount > 0) {
          res
            .status(200)
            .send({ message: "Name is already up to date", result });
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        res.status(500).send({ message: "Failed to update profile", error });
      }
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

      // let query = {
      //   name: { $regex: search, $options: "i" },
      // };
      let query = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
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
      // let query = {
      //   name: { $regex: search, $options: "i" },
      // };
      let query = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
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
    // update user info for after payment
    app.put(`/user/:email`, async (req, res) => {
      try {
        const filter = { email: req.params.email };
        const user = req.body;
        console.log(filter, user);

        let productName = user.productName;
        const currentDate = new Date();
        const subscriptionDate = new Date(user.createdAt || currentDate);

        if (productName === "standard") {
          const oneMonthLater = new Date(subscriptionDate);
          oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
          if (currentDate >= oneMonthLater) {
            productName = "free";
          }
        } else if (productName === "premium") {
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
            isRead: user.isRead,
          },
        };

        const result = await usersCollection.updateOne(filter, updatedDoc);

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "User not found or no changes made" });
        }

        console.log(result);
        res.send(result);
      } catch (error) {
        console.error("Error updating user:", error);
        res
          .status(500)
          .send({ message: "An error occurred while updating the user." });
      }
    });

    // update user info after request to be a consultant
    app.put(`/consultant-info/user/:email`, async (req, res) => {
      const filter = { email: req.params.email };
      const user = req.body;
      const updatedDoc = {
        $set: {
          name: user.name,
          email: user.email,
          number: user.number,
          experience: user.experience,
          resume: user.resume,
          expertise: user.expertise,
          requestedAt: user.requestedAt,
          request: user.request,
        },
      };
      console.log(updatedDoc);

      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // update consultant info after editing profile
    app.patch(`/consultant-info-update/user/:email`, async (req, res) => {
      const filter = { email: req.params.email };
      const user = req.body;
      const updatedDoc = {
        $set: {
          name: user.name,
          email: user.email,
          number: user.number,
          experience: user.experience,
          address: user.address,
          expertise: user.expertise,
          about: user.about,
          facebook: user.facebook,
          twitter: user.twitter,
          linkdin: user.linkdin,
          image: user.image,
        },
      };
      console.log(updatedDoc);
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    // update user info after booking
    app.put(`/booking-info/user/:email`, async (req, res) => {
      const filter = { email: req.params.email };
      const user = req.body;
      const updatedDoc = {
        $set: {
          name: user.name,
          email: user.email,
          number: user.number,
          resume: user.resume,
          resumeType: user.resumeType,
          consultant: user.consultant,
          bookingRequestedAt: user.bookingRequestedAt,
          bookingRequest: user.bookingRequest,
        },
      };
      console.log(updatedDoc);

      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // update user info after accepting session by consultant
    app.patch(`/accept-session/user/:id`, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          bookingRequest: "accepted",
        },
      };
      console.log(updatedDoc);

      const result = await usersCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    // update user info after booking rejected by consultant
    app.patch(`/user/declined-session/:id`, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          bookingRequest: "rejected",
        },
      };
      console.log(updatedDoc);

      const result = await usersCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // update user by id if rejected to be a consultant by admin
    app.patch(`/user/:id`, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      try {
        const updatedDoc = {
          $set: {
            request: "rejected",
          },
        };

        const result = await usersCollection.updateOne(query, updatedDoc);

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "User not found or request field not present." });
        }

        res.send({ message: "Request field removed successfully", result });
      } catch (error) {
        console.error("Error removing request field:", error);
        res.status(500).send({
          message: "An error occurred while removing the request field.",
        });
      }
    });

    // make consultant by admin
    app.patch(`/make-consultant/user/:id`, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      try {
        const updatedDoc = {
          $set: {
            role: "consultant",
            request: "accepted",
          },
        };

        const result = await usersCollection.updateOne(query, updatedDoc);

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "User not found or request field not present." });
        }

        res.send({ message: "Request field removed successfully", result });
      } catch (error) {
        console.error("Error removing request field:", error);
        res.status(500).send({
          message: "An error occurred while removing the request field.",
        });
      }
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
        success_url: `${process.env.VITE_BACKEND_API_URL}/success-payment`,
        fail_url: `${process.env.VITE_BACKEND_API_URL}/fail`,
        cancel_url: `${process.env.VITE_BACKEND_API_URL}/cancel`,
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
    // get payment history

    app.get("/payment-transaction/:email", async (req, res) => {
      const email = req.params.email;
      // console.log(email);
      const query = { cus_email: email };
      try {
        const result = await paymentCollection.find(query).toArray();
        // console.log(result);
        if (result.length === 0) {
          return res
            .status(404)
            .send({ message: "No transaction found for this email" });
        }
        res.send(result);
      } catch (err) {
        res
          .status(500)
          .send({ message: "Error retrieving transaction", error: err });
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

      res.redirect(`${process.env.VITE_FRONTEND_API_URL}/predefined-templates`);
    });

    // fail payment
    app.post("/fail", async (req, res) => {
      res.redirect(`${process.env.VITE_FRONTEND_API_URL}/pricing`);
      throw new error("Please try again");
    });

    // cancel payment
    app.post("/cancel", async (req, res) => {
      res.redirect(`${process.env.VITE_FRONTEND_API_URL}`);
    });

    // Route to get total amount and all documents
    app.get("/payments", async (req, res) => {
      try {
        // Query parameters from the client
        const { page = 1, limit = 10 } = req.query;
        const pageNumber = parseInt(page, 10); // Convert to a number
        const limitNumber = parseInt(limit, 10); // Convert to a number

        const payments = await paymentCollection
          .find()
          .limit(limitNumber) // Limit the results to 'limit'
          .skip((pageNumber - 1) * limitNumber)
          .toArray(); // Skip items for previous pages

        // Calculate total amount
        let totalAmount = 0;
        payments.forEach((payment) => {
          totalAmount += parseFloat(payment.amount); // Ensure amount is a float
        });

        // Get total number of documents for pagination info
        const total = await paymentCollection.countDocuments();

        res.json({
          totalAmount: totalAmount.toFixed(2), // Two decimal places for totalAmount
          payments,
          totalPages: Math.ceil(total / limitNumber), // Total number of pages
          currentPage: pageNumber,
        });
      } catch (err) {
        console.error("Server Error: ", err.message);
        res.status(500).json({ message: "Server Error", error: err.message });
      }
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
      if (filter) query.package = filter;
      const result = await predefinedTemplatesCollection
        .find(query)
        // .find()
        .skip(size * page)
        .limit(size)
        .toArray();
      res.send(result);
    });

    // Route to get total amount and all documents
    app.get("/payments", async (req, res) => {
      try {
        // Query parameters from the client
        const { page = 1, limit = 10 } = req.query;
        const pageNumber = parseInt(page, 10); // Convert to a number
        const limitNumber = parseInt(limit, 10); // Convert to a number

        const payments = await paymentCollection
          .find()
          .limit(limitNumber) // Limit the results to 'limit'
          .skip((pageNumber - 1) * limitNumber)
          .toArray(); // Skip items for previous pages

        // Calculate total amount
        let totalAmount = 0;
        payments.forEach((payment) => {
          totalAmount += parseFloat(payment.amount / 100); // Ensure amount is a float
        });

        // Get total number of documents for pagination info
        const total = await paymentCollection.countDocuments();

        res.json({
          totalAmount: totalAmount.toFixed(2), // Two decimal places for totalAmount
          payments,
          totalPages: Math.ceil(total / limitNumber), // Total number of pages
          currentPage: pageNumber,
        });
      } catch (err) {
        console.error("Server Error: ", err.message);
        res.status(500).json({ message: "Server Error", error: err.message });
      }
    });

    //update Predefined Template Data from DB
    // app.patch(`/templates/email/:id`, async (req, res) => {
    //   const id = req.params.id;
    //   const query = { templateItem: id };
    //   const updatedDoc = {
    //     $set : {
    //       isFavorite : true

    //     }
    //   }
    //   const result = await predefinedTemplatesCollection.findOne(query, updatedDoc);
    //   res.send(result);
    // });

    // get all the template count from db

    app.get(`/templates-count`, async (req, res) => {
      const filter = req.query.filter;
      console.log(filter);
      let query = {};
      if (filter) query.package = filter;
      const count = await predefinedTemplatesCollection.countDocuments(query);
      res.send({ count });
    });

    // post add to favorite from user
    app.post("/my-favorites", async (req, res) => {
      const { email, templateId, image, templatePackage } = req.body; // Add user email, image, and other necessary fields

      // Check if the template is already in favorites
      const existingFavorite = await favoriteCollection.findOne({
        email,
        templateId,
      });

      if (!existingFavorite) {
        const favoriteData = {
          email,
          templateId,
          image,
          package: templatePackage,
        }; // Store user email and template info
        const result = await favoriteCollection.insertOne(favoriteData); // Insert into DB
        res.send(result);
      } else {
        res.status(400).send({ message: "Template already in favorites" });
      }
    });
    // get favorite templates from user
    app.get("/my-favorites/:email", async (req, res) => {
      const query = { email: req.params.email };
      const result = await favoriteCollection.find(query).toArray();
      res.send(result);
    });

    // delete favorite templates
    app.delete("/my-favorites/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await favoriteCollection.deleteOne(query);
      res.send(result);
    });

    /*********Customization Resume**********/

    const generateCustomUrl = () => {
      return Math.random().toString(36).substring(2, 15);
    };

    // Save and Update Customization Resume data in db
    app.put("/customize-resume", async (req, res) => {
      const resume = req.body;
      const id = resume?.resumeId;

      // console.log("Resume ID:", id);

      const customUrl = generateCustomUrl();
      const resumeLink = `${process.env.VITE_FRONTEND_API_URL}/resume/${customUrl}`;
      const query = { _id: new ObjectId(id) };

      try {
        const isExist = await resumeCollection.findOne(query);

        if (isExist) {
          const { _id, resumeLink, ...resumeUpdate } = resume;

          const result = await resumeCollection.updateOne(query, {
            $set: {
              ...resumeUpdate,
            },
          });

          if (result.modifiedCount > 0) {
            const sendInfo = {
              templateID: id,
              userData: resume,
            };
            return res.send({
              success: true,
              message: "Resume updated successfully",
              shareLink: resumeLink,
              sendInfo,
            });
          } else {
            return res
              .status(400)
              .send({ success: false, message: "Failed to update resume" });
          }
        } else {
          const newResume = {
            resumeLink: resumeLink,
            ...resume,
            timestamp: Date.now(),
          };

          const insertResult = await resumeCollection.insertOne(newResume);
          if (insertResult.insertedId) {
            const sendInfo = {
              templateID: insertResult.insertedId,
              userData: resume,
            };
            return res.send({
              success: true,
              shareLink: resumeLink,
              sendInfo,
            });
          } else {
            return res
              .status(500)
              .send({ success: false, message: "Failed to insert new resume" });
          }
        }
      } catch (error) {
        console.error("Error handling resume data:", error);
        return res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    //update a img of Template in DB
    app.put(`/share-resume/:id`, async (req, res) => {
      const id = req.params.id;
      const query = { templateItem: id };
      // const filter = {}
      const profile = req.body;
      const updatedDoc = {
        $set: {
          image: profile?.image,
        },
      };

      const result = await resumeCollection.updateOne(query, updatedDoc);
      res.send(result);
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

    //update a img of Template in DB
    app.put(`/share-resume/:id`, async (req, res) => {
      const id = req.params.id;
      const query = { templateItem: id };
      // const filter = {}
      const profile = req.body;

      const updatedDoc = {
        $set: {
          image: profile?.image,
        },
      };

      const result = await resumeCollection.updateOne(query, updatedDoc);
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
        const resumeLink = `${process.env.VITE_FRONTEND_API_URL}/resume/${req.params.link}`;
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

    /*********Version Contorting**********/
    // delete a resume data
    app.delete(`/my-resume/:id`, async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await resumeCollection.deleteOne(query);
      res.send(result);
    });

    // Get resume by user email
    app.get("/my-resume/:email", async (req, res) => {
      const email = req.params.email;
      // console.log(email);
      const query = { user_email: email };
      try {
        const result = await resumeCollection.find(query).toArray();
        // console.log(result);
        if (result.length === 0) {
          return res
            .status(404)
            .send({ message: "No resume found for this email" });
        }
        res.send(result);
      } catch (err) {
        res
          .status(500)
          .send({ message: "Error retrieving resume", error: err });
      }
    });

    // Get a single resume data from db using user id
    app.get("/my-resume/edit/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await resumeCollection.findOne(query);
      res.send(result);
    });

    // Update a Resume Data in db
    app.put(`/my-resume/:id`, async (req, res) => {
      const id = req.params.id;
      const resume = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateResume = {
        $set: {
          ...resume,
        },
      };
      const result = await resumeCollection.updateOne(
        query,
        updateResume,
        options
      );
      res.send(result);
    });

    // Customer Feedback related APIs Start

    // POST /feedback
    app.post("/feedback", async (req, res) => {
      const { feedback, rating, email, name, photo } = req.body;

      // Insert feedback into the database
      try {
        await feedbackCollection.insertOne({
          feedback,
          rating,
          email,
          name,
          photo,
          createdAt: new Date(), // Optional: timestamp for the feedback
        });
        return res
          .status(201)
          .json({ message: "Feedback submitted successfully!" });
      } catch (error) {
        console.error("Error submitting feedback:", error);
        return res.status(500).json({ error: "Error submitting feedback" });
      }
    });

    // GET API route to retrieve feedback
    app.get("/feedback", async (req, res) => {
      try {
        const feedbackList = await feedbackCollection.find().toArray(); // Fetch all feedback
        res.status(200).json(feedbackList); // Return the feedback as JSON
      } catch (error) {
        console.error("Error in /feedback route:", error);
        res.status(500).json({ error: "Failed to retrieve feedback" });
      }
    });

    // GET /check-feedback
    app.get("/check-feedback", async (req, res) => {
      const email = req.query.email; // Get email from query parameters

      try {
        const feedback = await feedbackCollection.findOne({ email }); // Check for feedback entry
        if (feedback) {
          return res.status(200).json({ hasSubmitted: true });
        } else {
          return res.status(200).json({ hasSubmitted: false });
        }
      } catch (error) {
        console.error("Error checking feedback submission:", error);
        return res
          .status(500)
          .json({ error: "Error checking feedback submission" });
      }
    });

    // Customer Feedback related APIs End

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
