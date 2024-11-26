const { logger } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getFirestore } = require("firebase-admin/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const cors = require("cors");
const _busboy = require("busboy");
const { IS_PRODUCTION, HumorCategoryList, CorsOriginList, getDateInUTC, addDaysToDate, validateRequestBody, validateUserSubmitBody } = require("./util/util");
initializeApp();
const bucket = admin.storage().bucket();

const verifyAdminPassword = async (passwordHash) => {
    if (!IS_PRODUCTION) {
        return true;
    }
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

// For admin app use
exports.addDailyHumors = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate request method
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed. Use POST." });
            }

            const { passwordHash, ...payload } = req.body;

            // Validate admin password
            if (!passwordHash || !(await verifyAdminPassword(passwordHash))) {
                return res.status(401).json({ error: "Unauthorized: Invalid password." });
            }

            // Validate request body
            const validatePayload = validateRequestBody(payload);
            if (validatePayload.statusCode === 400) {
                return res.status(400).json({ error: validatePayload.error });
            }

            const db = getFirestore();

            // Reference the document to update or create
            const docRef = db.collection("Humors").doc(payload.uuid);

            // Save humor data to Firestore
            await docRef.set(payload);

            // Respond with success
            return res.status(200).json({ message: "Humor added successfully." });
        } catch (error) {
            console.error("Error adding humor:", error);

            // Send a consistent error response
            return res.status(500).json({ error: "Internal server error. Could not add the humor." });
        }
    });
});

exports.updateDailyHumors = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate HTTP method
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed. Use POST." });
            }

            const { passwordHash, ...payload } = req.body;

            // Validate admin password
            if (!passwordHash || !(await verifyAdminPassword(passwordHash))) {
                return res.status(401).json({ error: "Unauthorized: Invalid password." });
            }

            // Validate request body
            const validatePayload = validateRequestBody(payload);
            if (validatePayload.statusCode === 400) {
                return res.status(400).json({ error: validatePayload.error });
            }

            const db = getFirestore();

            // Reference the document to update
            const docRef = db.collection("Humors").doc(payload.uuid);

            // Check if the document exists
            const docSnapshot = await docRef.get();
            if (!docSnapshot.exists) {
                return res.status(404).json({ error: "Humor not found." });
            }

            // Update the document with new data
            await docRef.update(payload);

            // Respond with success
            return res.status(200).json({ message: "Humor updated successfully." });
        } catch (error) {
            console.error("Error updating humor:", error);

            // Send a consistent error response
            return res.status(500).json({ error: "Internal server error. Could not update the humor." });
        }
    });
});

// For both admin & flutter app use
exports.getDailyHumors = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate the request method
            if (req.method !== "GET") {
                return res.status(405).json({ error: "Method not allowed. Use GET." });
            }

            // Extract and validate the requested category
            const requestedCate = req.query.category;
            if (!requestedCate || !HumorCategoryList.includes(requestedCate)) {
                logger.info("Invalid humor category:", { category: requestedCate });
                return res.status(400).json({ error: "Invalid humor category." });
            }

            const db = getFirestore();
            let humorQuery = db
                .collection("Humors")
                .where("source", "==", "Daily Dose of Humors")
                .where("active", "==", true)
                .where("category", "==", requestedCate);

            // Define date range: last 7 days
            const todayDate = getDateInUTC(new Date());
            const sevenDaysAgoDate = getDateInUTC(addDaysToDate(new Date(), -7));

            // Apply date filters to the query
            humorQuery = humorQuery
                .where("release_date", ">", sevenDaysAgoDate)
                .where("release_date", "<=", todayDate)
                .orderBy("release_date", "desc")
                .orderBy("index", "asc");

            // Fetch documents
            const docsSnapshot = await humorQuery.get();

            // Transform the snapshot into a humor list
            const dailyHumorList = docsSnapshot.docs.map((doc) => {
                const humorData = doc.data();
                return {
                    ...humorData,
                    is_new: humorData.release_date === todayDate,
                };
            });

            // Send the humor list as a response
            return res.status(200).json({ humorList: dailyHumorList });
        } catch (error) {
            logger.error("Error fetching daily humors:", error);
            return res.status(500).json({ error: "Internal server error. Could not fetch daily humors." });
        }
    });
});

// For both admin & flutter app use
exports.getHumors = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate HTTP method
            if (req.method !== "GET") {
                return res.status(405).json({ error: "Method not allowed. Use GET." });
            }

            const db = getFirestore();
            let humorQuery = db.collection("Humors");

            // Apply category filter if provided
            if (req.query.category) {
                humorQuery = humorQuery.where("category", "==", req.query.category);
            }

            // Apply date filter if provided
            if (req.query.date) {
                humorQuery = humorQuery.where("release_date", "==", req.query.date);
            }

            // Apply active filter if provided
            if (req.query.active) {
                const isActive = req.query.active.toLowerCase() === "true";
                humorQuery = humorQuery.where("active", "==", isActive);
            }

            // Add ordering
            humorQuery = humorQuery
                .orderBy("release_date", "desc")
                .orderBy("index", "asc");

            // Fetch documents
            const docsSnapshot = await humorQuery.get();

            // Transform documents into humor list
            const humorList = docsSnapshot.docs.map((doc) => {
                const humorData = doc.data();
                return {
                    ...humorData,
                    is_new: humorData.release_date === getDateInUTC(new Date()),
                };
            });

            // Send the humor list as a response
            return res.status(200).json({ humorList });
        } catch (error) {
            logger.error("Error fetching humors:", error);

            // Send a consistent error response
            return res.status(500).json({ error: "Internal server error. Could not fetch humors." });
        }
    });
});

// For flutter app use
exports.userSubmitDailyHumors = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate the request method
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed. Use POST." });
            }

            // Validate the payload
            const payload = req.body;
            const validationResult = validateUserSubmitBody(payload);
            if (validationResult.statusCode === 400) {
                return res.status(400).json({ error: validationResult.error });
            }

            // Initialize Firestore
            const db = getFirestore();

            // Reference to the document in the "User_Submit" collection
            const dateDocRef = db.collection("User_Submit").doc(payload.humor_uuid);

            // Add or overwrite the document with the payload and current date
            await dateDocRef.set({
                ...payload,
                date: getDateInUTC(new Date()),
            });

            // Respond with success
            return res.status(200).json({ message: "Humor submission successful." });
        } catch (error) {
            logger.error("Error adding user-submitted humor:", error);

            // Send a consistent error response
            return res.status(500).json({ error: "Internal server error. Please try again later." });
        }
    });
});

// For flutter app use
exports.resetAppState = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate the request method
            if (req.method !== "GET") {
                return res.status(405).json({ error: "Method not allowed. Use GET." });
            }

            const lastResetDate = req.query.lastResetDate; // string
            if (!lastResetDate) {
                logger.info("Missing 'lastResetDate' query parameter.");
                return res.status(400).json({ error: "Missing 'lastResetDate' query parameter." });
            }

            const todayString = getDateInUTC(new Date());

            // Check if the app state has already been reset today
            if (lastResetDate === todayString) {
                logger.info("App state already reset for today.");
                return res.status(400).json({ message: "Already reset for today." });
            }

            // Respond with the new reset date
            logger.info("App state successfully reset.");
            return res.status(200).json({ last_reset_date: todayString });
        } catch (error) {
            logger.error("Unexpected error while resetting app state:", error);

            // Respond with a consistent error message
            return res.status(500).json({ error: "Internal server error while resetting app state." });
        }
    });
});

// Scheduled function for notification
exports.dailyHumorNotification = onSchedule("0 0 * * *", async (event) => {
    try {
        const db = getFirestore();
        const todayDate = getDateInUTC(new Date());

        // Fetch today's humor from the "Humors" collection
        const snapshot = await db
            .collection("Humors")
            .where("category", "==", "DAD_JOKES")
            .where("release_date", "==", todayDate)
            .orderBy("index")
            .limit(1)
            .get();

        // Check if the snapshot is empty
        if (snapshot.empty) {
            logger.info("No humor found for today's notification.");
            return null;
        }

        // Prepare the notification payload
        const humorData = snapshot.docs[0].data();
        const message = {
            notification: {
                title: "New humors have just arrived!",
                body: humorData.context || "Check out today's humor now!",
            },
            topic: "daily_humor",
        };

        // Send the notification
        const response = await admin.messaging().send(message);
        logger.info("Successfully sent humor notification:", { response });

        return null;
    } catch (error) {
        logger.error("Error sending humor notification:", error);
        return null;
    }
});

// For admin app use
exports.getBundleList = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate HTTP method
            if (req.method !== "GET") {
                return res.status(405).json({ error: "Method not allowed. Use GET." });
            }

            const db = getFirestore();

            // Fetch all bundles
            const snapshot = await db.collection("Bundles").get();

            // Check if the collection is empty
            if (snapshot.empty) {
                logger.info("No bundles found in the collection.");
                return res.status(200).json({ bundleList: [] });
            }

            // Map documents to data
            const bundleList = snapshot.docs.map((doc) => doc.data());

            // Respond with the bundle list
            return res.status(200).json({ bundleList });
        } catch (error) {
            logger.error("Error fetching bundle list:", error);

            // Return consistent error response
            return res.status(500).json({ error: "Internal server error. Could not fetch bundle list." });
        }
    });
});

// For admin app use
exports.getBundleSetList = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate HTTP method
            if (req.method !== "GET") {
                logger.info("Invalid HTTP method used.", { method: req.method });
                return res.status(405).json({ error: "Method not allowed. Use GET." });
            }

            // Validate query parameters
            const isAdmin = req.query.isAdmin === "true"; // Ensure query parameter is parsed correctly

            const db = getFirestore();
            const collectionRef = db.collection("Bundles_Set");

            // Query based on admin status
            const query = isAdmin
                ? collectionRef.orderBy("index")
                : collectionRef.where("active", "==", true).orderBy("index");

            // Fetch data
            const snapshot = await query.get();

            // Check for empty results
            if (snapshot.empty) {
                logger.info(isAdmin ? "No bundle sets found." : "No active bundle sets found.");
                return res.status(200).json({ bundleSetList: [] });
            }

            // Map documents to data
            const bundleSetList = snapshot.docs.map((doc) => ({
                id: doc.id, // Include document ID if needed
                ...doc.data(),
            }));

            // Respond with data
            logger.info("Bundle set list fetched successfully.", { count: bundleSetList.length, isAdmin });
            return res.status(200).json({ bundleSetList });
        } catch (error) {
            // Log error details
            logger.error("Error fetching bundle set list.", { error: error.message, stack: error.stack });
            return res.status(500).json({ error: "Internal server error. Could not fetch bundle set list." });
        }
    });
});

// For admin app use
exports.getBundleDetail = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate HTTP method
            if (req.method !== "GET") {
                logger.info("Invalid HTTP method used:", { method: req.method });
                return res.status(405).json({ error: "Method not allowed. Use GET." });
            }

            // Extract and validate the `uuid` parameter
            const uuid = req.query.uuid;
            if (!uuid) {
                logger.info("Missing UUID parameter in request.");
                return res.status(400).json({ error: "UUID parameter is missing." });
            }

            const db = getFirestore();

            // Fetch the bundle document by UUID
            const bundleSnapshot = await db.collection("Bundles").doc(uuid).get();

            // Handle case where the bundle does not exist
            if (!bundleSnapshot.exists) {
                logger.info("Bundle not found for UUID:", { uuid });
                return res.status(404).json({ error: "Bundle not found." });
            }

            // Retrieve the bundle data
            const bundleDetail = bundleSnapshot.data()

            // Respond with the bundle details
            logger.info("Bundle detail fetched successfully.", { uuid });
            return res.status(200).json({ bundleDetail });
        } catch (error) {
            // Log error details
            logger.error("Error fetching bundle detail:", { error: error.message, stack: error.stack });
            return res.status(500).json({ error: "Internal server error. Could not fetch bundle detail." });
        }
    });
});

// For admin app use
exports.updateBundleCoverImages = onRequest(async (req, res) => {
    const fields = {}; // Object to store form fields (like uuid, method, index)
    const updateBundleInfo = async (uuid, method, index, publicPath) => {
        try {
            const bundleDoc = await getFirestore().collection("Bundles").doc(uuid).get();
            if (!bundleDoc.exists) {
                throw new Error("Bundle not found");
            }
            const coverImgList = bundleDoc.data().cover_img_list || [];

            if (method === "replace") {
                coverImgList[index] = publicPath;
            } else if (method === "add") {
                coverImgList.push(publicPath);
            }

            await getFirestore().collection("Bundles").doc(uuid).update({ cover_img_list: coverImgList });
        } catch (error) {
            console.error("Error updating bundle info:", error);
            throw error;
        }
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Capture the buffered body from req.rawBody
    if (!req.rawBody) {
        return res.status(400).json({ error: "Request body is missing" });
    }

    // Initialize Busboy with the headers
    const busboy = _busboy({ headers: req.headers });

    // Capture form fields
    busboy.on("field", (fieldname, value) => {
        fields[fieldname] = value; // Save field values to the fields object
    });

    // Capture file upload
    busboy.on("file", (fieldname, fileStream, file, encoding, mimetype) => {
        const fileExtension = path.extname(file.filename);
        const newFileName = `${uuidv4()}${fileExtension}`;
        const storagePath = `bundles/covers/${newFileName}`;
        const fileUpload = bucket.file(storagePath);

        const blobStream = fileUpload.createWriteStream({
            metadata: {
                contentType: mimetype,
            },
        });

        fileStream.pipe(blobStream);

        blobStream.on("error", (error) => {
            console.error("BlobStream error: ", error);
            return res.status(500).json({ error: "Upload failed", details: error });
        });

        blobStream.on("finish", async () => {
            try {
                const { uuid, method, index, passwordHash } = fields;
                if (!uuid || !["add", "delete", "replace"].includes(method)) { // Input validation
                    return res.status(400).json({ error: "Invalid input" });
                }
                if (!await verifyAdminPassword(passwordHash)) { // Password validation
                    return res.status(401).json("Wrong password!");
                }
                await fileUpload.makePublic();
                const publicPath = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

                await updateBundleInfo(uuid, method, parseInt(index, 10), publicPath);

                return res.status(200).json({
                    message: "File uploaded successfully",
                    imageUrl: publicPath,
                });
            } catch (error) {
                console.error("Upload process error: ", error)
                return res.status(500).json({ error: "Error processing file upload", details: error });
            }
        });
    });

    busboy.on("finish", () => {
        console.log("File upload completed");
    });

    busboy.on("error", (err) => {
        console.error("Busboy error:", err);
        return res.status(500).json({ error: "File upload failed", details: err });
    });

    // Instead of piping req, use busboy.end() and pass the buffered body
    busboy.end(req.rawBody);
});

// For admin app use
exports.removeBundleCoverImages = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const { uuid, index, passwordHash } = req.body;
            if (!await verifyAdminPassword(passwordHash)) { // Password validation
                return res.status(401).json("Wrong password!");
            }

            /** Add validation code here */
            const bundleDoc = await getFirestore().collection("Bundles").doc(uuid).get();
            if (!bundleDoc.exists) {
                throw new Error("Bundle not found");
            }
            const coverImgList = bundleDoc.data().cover_img_list;
            coverImgList.splice(index, 1);
            await getFirestore().collection("Bundles").doc(uuid).update({ cover_img_list: coverImgList });
            // Send a success response
            res.status(200).json({ message: "Cover image removed successfully." });
        } catch (error) {
            console.error("Error removing cover image:", error);
            res.status(500).json({ error: "Could not remove cover image." });
        }
    });
});

// For admin app use
exports.addHumorBundle = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate HTTP method
            if (req.method !== "POST") {
                logger.info("Invalid HTTP method used:", { method: req.method });
                return res.status(405).json({ error: "Method not allowed. Use POST." });
            }

            const { passwordHash, ...payload } = req.body;

            // Validate admin password
            if (!passwordHash || !(await verifyAdminPassword(passwordHash))) {
                logger.info("Invalid admin password provided.");
                return res.status(401).json({ error: "Unauthorized: Invalid password." });
            }

            // Validate required fields in the payload
            const requiredFields = [
                "active",
                "title",
                "description",
                "category",
                "release_date",
                "humor_count",
                "language_code",
                "product_id",
                "preview_count",
                "preview_show_punchline_yn",
                "uuid",
            ];

            const missingFields = requiredFields.filter((field) => !(field in payload));
            if (missingFields.length > 0) {
                logger.info("Missing required fields in the payload:", { missingFields });
                return res.status(400).json({
                    error: "Invalid request: Missing required fields.",
                    missingFields,
                });
            }

            const db = getFirestore();
            const docRef = db.collection("Bundles").doc(payload.uuid);

            // Save bundle data to Firestore
            await docRef.set({
                active: payload.active,
                title: payload.title,
                description: payload.description,
                category: payload.category,
                cover_img_list: [], // Empty list for initial cover images
                release_date: payload.release_date,
                humor_count: payload.humor_count,
                language_code: payload.language_code,
                product_id: payload.product_id,
                preview_count: payload.preview_count,
                preview_show_punchline_yn: payload.preview_show_punchline_yn,
                uuid: payload.uuid,
            });

            // Respond with success
            logger.info("Bundle added successfully:", { uuid: payload.uuid });
            return res.status(200).json({ message: "Bundle added successfully." });
        } catch (error) {
            logger.error("Error adding bundle:", { error: error.message, stack: error.stack });
            return res.status(500).json({ error: "Internal server error. Could not add the bundle." });
        }
    });
});

// For admin app use
exports.updateHumorBundle = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate HTTP method
            if (req.method !== "POST") {
                logger.info("Invalid HTTP method used:", { method: req.method });
                return res.status(405).json({ error: "Method not allowed. Use POST." });
            }

            const { passwordHash, ...payload } = req.body;

            // Validate admin password
            if (!passwordHash || !(await verifyAdminPassword(passwordHash))) {
                logger.info("Invalid admin password provided.");
                return res.status(401).json({ error: "Unauthorized: Invalid password." });
            }

            // Validate required fields
            const requiredFields = [
                "uuid",
                "active",
                "title",
                "description",
                "category",
                "release_date",
                "humor_count",
                "language_code",
                "product_id",
                "preview_count",
                "preview_show_punchline_yn",
            ];

            const missingFields = requiredFields.filter((field) => !(field in payload));
            if (missingFields.length > 0) {
                logger.info("Missing required fields in the payload:", { missingFields });
                return res.status(400).json({
                    error: "Invalid request: Missing required fields.",
                    missingFields,
                });
            }

            const db = getFirestore();
            const docRef = db.collection("Bundles").doc(payload.uuid);

            // Check if document exists
            const docSnapshot = await docRef.get();
            if (!docSnapshot.exists) {
                logger.info("Bundle document does not exist:", { uuid: payload.uuid });
                return res.status(404).json({ error: "Bundle document does not exist." });
            }

            // Update specific fields in the document
            await docRef.update({
                active: payload.active,
                title: payload.title,
                description: payload.description,
                category: payload.category,
                release_date: payload.release_date,
                humor_count: payload.humor_count,
                language_code: payload.language_code,
                product_id: payload.product_id,
                preview_count: payload.preview_count,
                preview_show_punchline_yn: payload.preview_show_punchline_yn,
            });

            // Respond with success
            logger.info("Bundle updated successfully:", { uuid: payload.uuid });
            return res.status(200).json({ message: "Bundle updated successfully." });
        } catch (error) {
            logger.error("Error updating bundle:", { error: error.message, stack: error.stack });
            return res.status(500).json({ error: "Internal server error. Could not update the bundle." });
        }
    });
});

// for flutter app use
exports.getBundleListInSet = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate HTTP method
            if (req.method !== "GET") {
                logger.info("Invalid HTTP method used:", { method: req.method });
                return res.status(405).json({ error: "Method not allowed. Use GET." });
            }

            // Validate UUID query parameter
            const setUuid = req.query.uuid;
            if (!setUuid) {
                logger.info("Missing required UUID parameter.");
                return res.status(400).json({ error: "Missing required UUID parameter." });
            }

            const db = getFirestore();

            // Fetch the bundle set document
            const bundleSetSnapshot = await db.collection("Bundles_Set").doc(setUuid).get();
            if (!bundleSetSnapshot.exists) {
                logger.info("Bundle set not found:", { setUuid });
                return res.status(404).json({ bundleList: [] });
            }

            const bundleUuidList = bundleSetSnapshot.data().bundle_list || [];
            if (bundleUuidList.length === 0) {
                logger.info("No bundles found in the set:", { setUuid });
                return res.status(200).json({ bundleList: [] });
            }

            // Fetch active bundles by UUID
            const bundleSnapshot = await db
                .collection("Bundles")
                .where("uuid", "in", bundleUuidList)
                .where("active", "==", true)
                .get();

            if (bundleSnapshot.empty) {
                logger.info("No active bundles found for the set:", { setUuid });
                return res.status(200).json({ bundleList: [] });
            }

            // Map and sort the fetched bundles
            const fetchedBundles = bundleSnapshot.docs.map((doc) => ({
                ...doc.data(),
                price: "$2.99", // Example price, adjust as needed
            }));

            // Sort bundles based on the original UUID list order
            const sortedBundleList = bundleUuidList
                .map((uuid) => fetchedBundles.find((bundle) => bundle.uuid === uuid))
                .filter(Boolean); // Filter out any null values

            logger.info("Fetched and sorted bundles successfully:", { setUuid, count: sortedBundleList.length });
            return res.status(200).json({ bundleList: sortedBundleList });
        } catch (error) {
            logger.error("Error fetching bundle list in set:", { error: error.message, stack: error.stack });
            return res.status(500).json({ error: "Internal server error. Could not fetch bundle list." });
        }
    });
});

// for flutter app use
exports.getBundleDetail = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate HTTP method
            if (req.method !== "GET") {
                logger.info("Invalid HTTP method used:", { method: req.method });
                return res.status(405).json({ error: "Method not allowed. Use GET." });
            }

            // Validate UUID parameter
            const uuid = req.query.uuid;
            if (!uuid) {
                logger.info("Missing UUID parameter in request.");
                return res.status(400).json({ error: "Missing UUID parameter." });
            }

            const db = getFirestore();

            // Fetch the bundle document
            const bundleSnapshot = await db.collection("Bundles").doc(uuid).get();

            // Check if the document exists
            if (!bundleSnapshot.exists) {
                logger.info("Bundle does not exist:", { uuid });
                return res.status(404).json({ error: "Bundle does not exist." });
            }

            // Prepare bundle data with additional pricing information
            const bundleData = bundleSnapshot.data();

            logger.info("Bundle fetched successfully:", { uuid });
            return res.status(200).json({ bundle: bundleData });
        } catch (error) {
            logger.error("Error fetching bundle detail:", { error: error.message, stack: error.stack });
            return res.status(500).json({ error: "Internal server error. Could not fetch bundle detail." });
        }
    });
});

// For flutter app use
exports.downloadHumorBundle = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate HTTP method
            if (req.method !== "GET") {
                logger.info("Invalid HTTP method used:", { method: req.method });
                return res.status(405).json({ error: "Method not allowed. Use GET." });
            }

            // Validate UUID parameter
            const uuid = req.query.uuid;
            if (!uuid) {
                logger.info("Missing UUID parameter in request.");
                return res.status(400).json({ error: "Missing UUID parameter." });
            }

            const db = getFirestore();

            // Fetch the bundle document
            const bundleSnapshot = await db.collection("Bundles").doc(uuid).get();

            // Check if the bundle exists
            if (!bundleSnapshot.exists) {
                logger.info("Bundle not found:", { uuid });
                return res.status(404).json({ error: "Bundle not found." });
            }

            // Fetch humor items associated with the bundle
            const humorSnapshot = await db
                .collection("Humors")
                .where("source", "==", uuid)
                .orderBy("index")
                .get();

            if (humorSnapshot.empty) {
                logger.info("No humors found for the bundle:", { uuid });
                return res.status(200).json({ humorList: [] });
            }

            // Map humor documents to data, adding index
            const humorList = humorSnapshot.docs.map((doc, index) => ({
                ...doc.data(),
                index: index + 1, // Assign a 1-based index
            }));

            logger.info("Humors fetched successfully for bundle:", { uuid, count: humorList.length });
            return res.status(200).json({ humorList });
        } catch (error) {
            logger.error("Error fetching humors in bundle:", { error: error.message, stack: error.stack });
            return res.status(500).json({ error: "Internal server error. Could not fetch humors in bundle." });
        }
    });
});

// For flutter app use
exports.previewHumorBundle = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate HTTP method
            if (req.method !== "GET") {
                logger.info("Invalid HTTP method used:", { method: req.method });
                return res.status(405).json({ error: "Method not allowed. Use GET." });
            }

            // Validate UUID parameter
            const uuid = req.query.uuid;
            if (!uuid) {
                logger.info("Missing UUID parameter in request.");
                return res.status(400).json({ error: "Missing UUID parameter." });
            }

            const db = getFirestore();

            // Fetch the bundle document
            const bundleSnapshot = await db.collection("Bundles").doc(uuid).get();

            // Check if the bundle exists
            if (!bundleSnapshot.exists) {
                logger.info("Bundle not found:", { uuid });
                return res.status(404).json({ error: "Bundle not found." });
            }

            const bundleData = bundleSnapshot.data();

            // Validate preview count
            if (!bundleData.preview_count || bundleData.preview_count <= 0) {
                logger.info("Invalid preview count for bundle:", { uuid });
                return res.status(400).json({ error: "Invalid preview count for bundle." });
            }

            // Determine the punchline placeholder
            let punchlinePlaceholder = "";
            switch (bundleData.category) {
                case "DAD_JOKES":
                case "KNOCK_KNOCK_JOKES":
                case "DARK_HUMORS":
                case "STORY_JOKES":
                    punchlinePlaceholder = "Purchase to view punchline! :)";
                    break;
                case "TRICKY_RIDDLES":
                case "TRIVIA_QUIZ":
                case "MYSTERY_PUZZLES":
                    punchlinePlaceholder = "Purchase to view the answer! :)";
                    break;
                default:
                    punchlinePlaceholder = "";
                    break;
            }

            // Fetch humor items for the preview
            const humorSnapshot = await db
                .collection("Humors")
                .where("source", "==", uuid)
                .orderBy("index")
                .limit(bundleData.preview_count)
                .get();

            if (humorSnapshot.empty) {
                logger.info("No humor items found for the preview:", { uuid });
                return res.status(200).json({ humorList: [] });
            }

            // Map humor documents to data
            const humorList = humorSnapshot.docs.map((doc, index) => ({
                ...doc.data(),
                index: index + 1, // Assign a 1-based index
                punchline: bundleData.preview_show_punchline_yn
                    ? doc.data().punchline
                    : punchlinePlaceholder,
            }));

            logger.info("Preview fetched successfully for bundle:", { uuid, count: humorList.length });
            return res.status(200).json({ humorList });
        } catch (error) {
            logger.error("Error fetching preview humors in bundle:", { error: error.message, stack: error.stack });
            return res.status(500).json({ error: "Internal server error. Could not fetch preview humors in bundle." });
        }
    });
});

// For flutter app use
exports.getAvailableSkuList = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const db = getFirestore();

            // Fetch active bundle sets
            const bundleSetSnapshot = await db
                .collection("Bundles_Set")
                .where("active", "==", true)
                .get();

            if (bundleSetSnapshot.empty) {
                logger.info("No active bundle sets found.");
                return res.status(200).json({ availableSkuList: [] });
            }

            // Extract unique bundle UUIDs from active bundle sets
            const bundleUuidList = new Set();
            bundleSetSnapshot.forEach((doc) => {
                const bundleSet = doc.data();
                if (Array.isArray(bundleSet.bundle_list)) {
                    bundleSet.bundle_list.forEach((uuid) => bundleUuidList.add(uuid));
                }
            });

            if (bundleUuidList.size === 0) {
                logger.info("No bundles found in active bundle sets.");
                return res.status(200).json({ availableSkuList: [] });
            }

            // Fetch bundles using the extracted UUIDs
            const bundleSnapshot = await db
                .collection("Bundles")
                .where("uuid", "in", Array.from(bundleUuidList))
                .where("active", "==", true)
                .get();

            if (bundleSnapshot.empty) {
                logger.info("No active bundles found for the extracted UUIDs.");
                return res.status(200).json({ availableSkuList: [] });
            }

            // Extract product IDs from the fetched bundles
            const availableSkuList = bundleSnapshot.docs
                .map(doc => {
                    const data = doc.data();
                    return data ? data.product_id : null;
                })
                .filter(productId => productId); // Ensure non-null product IDs

            logger.info("Available SKUs fetched successfully.", { count: availableSkuList.length });
            return res.status(200).json({ availableSkuList });
        } catch (error) {
            logger.error("Error fetching available SKU list:", { error: error.message, stack: error.stack });
            return res.status(500).json({ error: "Internal server error. Could not fetch available SKU list." });
        }
    });
});

// For admin app use
exports.getBundleTotalLikes = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Validate HTTP method
            if (req.method !== "GET") {
                logger.info("Invalid HTTP method used:", { method: req.method });
                return res.status(405).json({ error: "Method not allowed. Use GET." });
            }

            // Validate UUID parameter
            const uuid = req.query.uuid;
            if (!uuid) {
                logger.info("Missing UUID parameter in request.");
                return res.status(400).json({ error: "Missing UUID parameter." });
            }

            const db = getFirestore();

            // Fetch all humors associated with the given bundle UUID
            const humorSnapshot = await db
                .collection("Humors")
                .where("source", "==", uuid)
                .get();

            if (humorSnapshot.empty) {
                logger.info("No humors found for the given bundle UUID:", { uuid });
                return res.status(404).json({ error: "No humors found for the given bundle UUID." });
            }

            // Collect all humor UUIDs
            const humorUUIDs = humorSnapshot.docs.map((doc) => doc.data().uuid);

            if (humorUUIDs.length === 0) {
                logger.info("No humor UUIDs found for the given bundle UUID:", { uuid });
                return res.status(200).json({ totalLikes: 0 });
            }

            // Fetch all likes from Realtime Database
            const rtdb = getDatabase();
            const likesRef = rtdb.ref("likes");
            const likesSnapshot = await likesRef.once("value");
            const allLikes = likesSnapshot.val() || {};

            // Calculate total likes
            const totalLikes = humorUUIDs.reduce((sum, humorUUID) => {
                return sum + (allLikes[humorUUID] || 0);
            }, 0);

            logger.info("Total likes calculated successfully for bundle:", { uuid, totalLikes });
            return res.status(200).json({ totalLikes });
        } catch (error) {
            logger.error("Error fetching bundle total likes:", { error: error.message, stack: error.stack });
            return res.status(500).json({ error: "Internal server error. Could not fetch bundle total likes." });
        }
    });
});