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
const { HumorCategoryList, getDateInUTC, addDaysToDate } = require("./util/util");
initializeApp();

exports.updateDailyHumors = onRequest(async (req, res) => {
    try {
        const payload = req.body;
        // created_date should match the yyyy-mm-dd format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (typeof payload.date !== "string" || !dateRegex.test(payload.created_date)) {
            return res.status(400).json({ error: "Invalid type for query date. Expected format 'yyyy-mm-dd'." });
        }
        // author is nullable field
        if ((typeof payload.author !== "string" || payload.author.trim() === "") && payload.author !== null) {
            return res.status(400).json({ error: "Invalid type for author. Expected non-empty string." });
        }

        if (!HumorCategoryList.includes(payload.category)) {
            return res.status(400).json({ error: "Invalid type for category. Expected one of the HumorCategory values." });
        }

        if (typeof payload.context !== "string" || payload.context.trim() === "") {
            return res.status(400).json({ error: "Invalid type for context. Expected non-empty string." });
        }

        // context_list should be an array of strings
        // context_list is nullable field
        if ((!Array.isArray(payload.context_list) || !payload.context_list.every(item => typeof item === "string")) && payload.context_list !== null) {
            return res.status(400).json({ error: "Invalid type for context_list. Expected an array of strings." });
        }

        // created_date should match the yyyy-mm-dd format
        if (typeof payload.created_date !== "string" || !dateRegex.test(payload.created_date)) {
            return res.status(400).json({ error: "Invalid type for created_date. Expected format 'yyyy-mm-dd'." });
        }

        if (typeof payload.index !== "number" || !Number.isInteger(payload.index)) {
            return res.status(400).json({ error: "Invalid type for index. Expected an integer." });
        }

        if ((typeof payload.punchline !== "string" || payload.punchline.trim() === "") && payload.punchline !== null) {
            return res.status(400).json({ error: "Invalid type for punchline. Expected non-empty string." });
        }

        if (typeof payload.sender !== "string" || payload.sender.trim() === "") {
            return res.status(400).json({ error: "Invalid type for sender. Expected non-empty string." });
        }

        if (typeof payload.source !== "string" || payload.source.trim() === "") {
            return res.status(400).json({ error: "Invalid type for source. Expected non-empty string." });
        }

        if (typeof payload.uuid !== "string" || payload.uuid.trim() === "") {
            return res.status(400).json({ error: "Invalid type for uuid. Expected non-empty string." });
        }
        const db = getFirestore();
        const docRef = db.collection("Daily").doc(payload.date).collection(payload.category).doc(payload.uuid);

        // Check if document exists
        const docSnapshot = await docRef.get();
        if (!docSnapshot.exists) {
            return res.status(404).json({ error: "Document does not exist." });
        }

        // Update specific fields in the document
        await docRef.update({
            author: payload.author,
            context: payload.context,
            punchline: payload.punchline,
            context_list: payload.context_list,
            created_date: payload.created_date,
            index: payload.index,
            sender: payload.sender,
            source: payload.source,
        });

        // Example: Update specific fields in the document
        await docRef.update({
            author: payload.author,
            context: payload.context,
            punchline: payload.punchline,
            context_list: payload.context_list,
            created_date: payload.created_date,
            index: payload.index,
            sender: payload.sender,
            source: payload.source,
        });

        // Send a success response
        res.status(200).json({ message: "Document updated successfully." });
    } catch (error) {
        console.error("Error updating document:", error);
        res.status(500).json({ error: "Could not update the document." });
    }
});

exports.getDailyHumors = onRequest(async (req, res) => {
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
                        .collection(cate);
                    promises.push(subcollectionRef.get());
                });
            } else {
                const subcollectionRef = getFirestore()
                    .collection("Daily")
                    .doc(dateDocId)
                    .collection(requestedCate);
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
            }))
        );
        res.json({ humorList: dailyHumorList });
    } catch (error) {
        logger.error("Error fetching daily humors:", error);
        res.status(500).json({ error: "Could not fetch humors..." });
    }
});
