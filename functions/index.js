/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const { logger } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getFirestore } = require("firebase-admin/firestore");
const cors = require("cors");
const { HumorCategoryList, CorsOriginList, getDateInUTC, addDaysToDate, validateRequestBody, validateUserSubmitBody } = require("./util/util");
initializeApp();

const varifyAdminPassword = async (passwordHash) => {
    const bcrypt = require("bcrypt");
    const db = getDatabase();
    const ref = db.ref("password")
    const snapshot = await ref.once("value");
    const password = snapshot.val();
    return await bcrypt.compare(password, passwordHash);
}

// Configure CORS to allow requests from multiple origins
const corsHandler = cors({
    origin: CorsOriginList, // Specify allowed origins
    methods: ["GET", "POST", "OPTIONS"], // Allowed HTTP methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
    credentials: true, // Allow credentials if needed
});

exports.addDailyHumors = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const { passwordHash, ...payload } = req.body;
            if (!await varifyAdminPassword(passwordHash)) {
                return res.status(401).json("Wrong password!");
            }
            const validatePayload = validateRequestBody(payload);
            if (validatePayload.statusCode === 400) {
                return res.status(400).json(validatePayload);
            }

            const db = getFirestore();
            const dateDocRef = db.collection("Daily").doc(payload.date);

            // Set the "date" field on the document, creating it if it doesn't exist
            await dateDocRef.set({ date: payload.date }, { merge: true });

            const docRef = dateDocRef.collection(payload.category).doc(payload.uuid);

            // Add or set the document in the subcollection
            await docRef.set(payload);

            // Send a success response
            res.status(200).json({ message: "Document added successfully." });
        } catch (error) {
            console.error("Error adding document:", error);
            res.status(500).json({ error: "Could not add the document." });
        }
    });
});

exports.updateDailyHumors = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const { passwordHash, ...payload } = req.body;
            if (!await varifyAdminPassword(passwordHash)) {
                return res.status(401).json("Wrong password!");
            }
            const validatePayload = validateRequestBody(payload);
            if (validatePayload.statusCode === 400) {
                return res.status(400).json(validatePayload);
            }
            const db = getFirestore();
            const docRef = db.collection("Daily").doc(payload.date).collection(payload.category).doc(payload.uuid);

            // Check if document exists
            const docSnapshot = await docRef.get();
            if (!docSnapshot.exists) {
                return res.status(404).json({ error: "Document does not exist." });
            }

            // Update specific fields in the document
            await docRef.update(payload);

            // Send a success response
            res.status(200).json({ message: "Document updated successfully." });
        } catch (error) {
            console.error("Error updating document:", error);
            res.status(500).json({ error: "Could not update the document." });
        }
    });
});

exports.getDailyHumors = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const requestedCate = req.query.category; // string

            // Category validation
            if (requestedCate && !HumorCategoryList.includes(requestedCate)) {
                logger.info("Invalid category.");
                return res.status(400).json({ error: "Invalid category" });
            }

            let dailySnapshot;
            if (req.query.date) {
                dailySnapshot = await getFirestore()
                    .collection("Daily")
                    .where("date", "=", req.query.date)
                    .get();
            } else {
                // Get today's date in UTC format (yyyy-mm-dd)
                const todayDate = getDateInUTC(new Date());
                const sevenDaysAgoDate = getDateInUTC(addDaysToDate(new Date(), -7));
                // Push the new message into Firestore using the Firebase Admin SDK.
                dailySnapshot = await getFirestore()
                    .collection("Daily")
                    .where("date", ">", sevenDaysAgoDate)  // Start date filter
                    .where("date", "<=", todayDate)    // End date filter
                    .get();
            }

            // Check if there are any matching date documents
            if (dailySnapshot.empty) {
                logger.info("No matching date documents found.");
                return res.json({ humorList: [] });
            }

            // Prepare to fetch subcollections
            const promises = [];

            // Iterate over each date document to access the subcollection (e.g., DAD_JOKES)
            dailySnapshot.forEach(doc => {
                const dateDocId = doc.id; // ID of the date document
                if (requestedCate == null) {
                    HumorCategoryList.forEach(cate => {
                        const subcollectionRef = getFirestore()
                            .collection("Daily")
                            .doc(dateDocId)
                            .collection(cate)
                            .where("index", ">=", 0)
                            .orderBy("index");
                        promises.push(subcollectionRef.get());
                    });
                } else {
                    const subcollectionRef = getFirestore()
                        .collection("Daily")
                        .doc(dateDocId)
                        .collection(requestedCate)
                        .where("index", ">=", 0)
                        .orderBy("index");
                    promises.push(subcollectionRef.get());
                }
            });

            // Await all subcollection fetches
            const snapshots = await Promise.all(promises);

            // Flatten and collect all documents from the subcollections
            const dailyHumorList = snapshots.flatMap(snapshot =>
                snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    is_new: doc.date === getDateInUTC(new Date()),
                }))
            );
            res.json({ humorList: dailyHumorList });
        } catch (error) {
            logger.error("Error fetching daily humors:", error);
            res.status(500).json({ error: "Could not fetch humors..." });
        }
    });
});

exports.userSubmitDailyHumors = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const payload = req.body;
            const validatePayload = validateUserSubmitBody(payload);
            if (validatePayload.statusCode === 400) {
                return res.status(400).json(validatePayload);
            }

            const db = getFirestore();
            const dateDocRef = db.collection("User_Submit").doc(payload.humor_uuid);

            // Set the "date" field on the document, creating it if it doesn't exist
            await dateDocRef.set({...payload, date: getDateInUTC(new Date())});

            // Send a success response
            res.status(200).json({ message: "Humor submission successful." });
        } catch (error) {
            console.error("Error adding document:", error);
            res.status(500).json({ error: "Unexpected error. Please try again later." });
        }
    });
});