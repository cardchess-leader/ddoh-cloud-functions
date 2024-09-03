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
        const { HumorCategoryList, getDateInUTC, addDaysToDate } = require("./util/util");
        const requestedCate = req.query.category; // string
        if (!HumorCategoryList.includes(requestedCate)) {
            logger.info("Invalid category.");
            return res.status(400).json({ error: "Invalid category" });
        }
        // Get today"s date in UTC format (yyyy-mm-dd)
        const todayDate = getDateInUTC(new Date());
        const sevenDaysAgoDate = getDateInUTC(addDaysToDate(new Date(), -7));
        // Push the new message into Firestore using the Firebase Admin SDK.
        const dailySnapshot = await getFirestore()
            .collection("Daily")
            .where("date", ">", sevenDaysAgoDate)  // Start date filter
            .where("date", "<=", todayDate)    // End date filter
            .get();

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
            const subcollectionRef = getFirestore()
                .collection("Daily")
                .doc(dateDocId)
                .collection(requestedCate); // Access requested subcollection

            // Add the subcollection query promise to the array
            promises.push(subcollectionRef.get());
        });

        // Await all subcollection fetches
        const snapshots = await Promise.all(promises);

        // Flatten and collect all documents from the subcollections
        const dailyHumorList = snapshots.flatMap(snapshot =>
            snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            }))
        );
        res.json({ humorList: dailyHumorList });
    } catch (error) {
        logger.error("Error fetching daily humors:", error);
        res.status(500).json({ error: "Could not fetch humors..." });
    }
});
