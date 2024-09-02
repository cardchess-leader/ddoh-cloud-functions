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
// const { onDocumentCreated } = require("firebase-functions/v2/firestore");

// The Firebase Admin SDK to access Firestore.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
initializeApp();

exports.getDailyHumors = onRequest(async (req, res) => {
    try {
        const { HumorCategoryList, getTodayDateUTC } = require("./util/util");
        const requestedCate = req.query.category; // string
        if (!HumorCategoryList.includes(requestedCate)) {
            return res.status(400).json({ error: "Invalid category" });
        }
        // Get today's date in UTC format (yyyy-mm-dd)
        const todayDate = getTodayDateUTC();
        // Push the new message into Firestore using the Firebase Admin SDK.
        const snapshot = await getFirestore()
            .collection("Daily")
            .doc(todayDate) // Assuming 'date' is stored as a field in your documents
            .collection(requestedCate) // Filter by category if applicable
            .get();
        // Send back a message that we've successfully written the message
        const humorList = snapshot.docs.map((doc) => ({
            uuid: doc.id,
            ...doc.data(), uuid: doc.id,
        }));
        res.json({ humorList });
    } catch (error) {
        logger.error("Error fetching daily humors:", error);
        res.status(500).json({ error: "Could not fetch humors..." });
    }
});
