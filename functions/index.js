const { logger } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getFirestore } = require("firebase-admin/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require("cors");
const Busboy = require('busboy');
const { IS_PRODUCTION, HumorCategoryList, CorsOriginList, getDateInUTC, addDaysToDate, validateRequestBody, validateUserSubmitBody } = require("./util/util");
initializeApp();
const bucket = admin.storage().bucket();

const varifyAdminPassword = async (passwordHash) => {
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

/** Helper functions */
function getStoragePathFromUrl(publicUrl) {
    // Regular expression to match the pattern 'bundles/covers/{filename}'
    const regex = /bundles\/covers\/([^?]+)/;
    const match = publicUrl.match(regex);

    if (match && match[0]) {
        return decodeURIComponent(match[0]);
    }

    return null; // Return null if no matching pattern is found
}

const removeImage = async (storagePath) => {
    try {
        const file = bucket.file(storagePath);
        await file.delete();
        console.log("Cover image deleted successfully.");
    } catch (error) {
        console.error("Error deleting cover image:", error);
    }
}
/** End of helper functions */

// For admin app use
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
            const docRef = db.collection("Humors").doc(payload.uuid);

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

// For admin app use
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
            const docRef = db.collection("Humors").doc(payload.uuid);

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

// For both admin & flutter app use
exports.getDailyHumors = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const requestedCate = req.query.category; // string
            // Category validation
            if (requestedCate && !HumorCategoryList.includes(requestedCate)) {
                logger.info("Invalid category.");
                return res.status(400).json({ error: "Invalid category" });
            }

            let docsSnapshotRef = getFirestore().collection("Humors").where("source", "=", "Daily Dose of Humors").where("index", ">=", 0);
            if (req.query.category) {
                docsSnapshotRef = docsSnapshotRef.where("category", "=", req.query.category);
            }
            if (req.query.date) {
                docsSnapshotRef = docsSnapshotRef.where("created_date", "=", req.query.date);
            } else {
                // Get today"s date in UTC format (yyyy-mm-dd)
                const todayDate = getDateInUTC(new Date());
                const sevenDaysAgoDate = getDateInUTC(addDaysToDate(new Date(), -7));
                docsSnapshotRef = docsSnapshotRef
                    .where("created_date", ">", sevenDaysAgoDate)  // Start date filter
                    .where("created_date", "<=", todayDate)    // End date filter
            }
            const docsSnapshot = await docsSnapshotRef
                .orderBy("created_date", "desc")
                .orderBy("index", "asc")
                .get();

            const dailyHumorList = docsSnapshot.docs.map(doc => ({
                ...doc.data(),
                is_new: doc.data().date === getDateInUTC(new Date()),
            }))
            res.json({ humorList: dailyHumorList });
        } catch (error) {
            logger.error("Error fetching daily humors:", error);
            res.status(500).json({ error: "Could not fetch humors..." });
        }
    });
});

// For flutter app use
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

            // Set the "date" field on the document, creating it if it doesn"t exist
            await dateDocRef.set({ ...payload, date: getDateInUTC(new Date()) });

            // Send a success response
            res.status(200).json({ message: "Humor submission successful." });
        } catch (error) {
            console.error("Error adding document:", error);
            res.status(500).json({ error: "Unexpected error. Please try again later." });
        }
    });
});

// For flutter app use
exports.resetAppState = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const lastResetDate = req.query.lastResetDate; // string
            const todayString = getDateInUTC(new Date());
            if (lastResetDate == todayString) {
                return res.status(400).json({ message: "Already reset for today" });
            } else {
                return res.status(200).json({ last_reset_date: todayString });
            }
        } catch (error) {
            console.error("Unexpected error while reseting app state.", error);
            res.status(500).json({ error: "Unexpected error while reseting app state." });
        }
    });
});

// Scheduled function for notification
exports.dailyHumorNotification = onSchedule("0 0 * * *", async (event) => {
    const db = getFirestore();
    const snapshot = await db.collection("Daily").doc(getDateInUTC(addDaysToDate(new Date(), 1 / 24))).collection("DAD_JOKES").where("index", "==", 0).limit(1).get();
    if (snapshot.empty) {
        return null;
    } else {
        const message = {
            notification: {
                title: "New humors just arrived!",
                body: snapshot.docs[0].data().context,
            },
            topic: "daily_humor",  // The topic name to send the notification to
        };
        try {
            // Send the notification to the topic
            const response = await admin.messaging().send(message);
            console.log("Successfully sent message:", response);
        } catch (error) {
            console.log("Error sending message:", error);
        }
    }
    return null;
});

// For admin app use
exports.getBundleList = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const snapshot = await getFirestore()
                .collection("Bundles")
                .where("active", "==", true)
                .get();

            if (snapshot.empty) {
                return res.json({ bundleList: [] }); // Early return for empty collection
            }

            const bundleList = snapshot.docs.map(doc => {
                const data = doc.data();
                return data.uuid; // Return UUID directly
            });

            res.json({ bundleList });

        } catch (error) {
            logger.error("Error fetching bundle list:", error);
            res.status(500).json({ error: "Could not fetch bundle list..." });
        }
    });
});

// For admin app use
exports.getBundleDetail = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const uuid = req.query.uuid; // string

            if (!uuid) {
                return res.status(400).json({ error: "UUID parameter is missing" });
            }

            const bundleSnapshot = await getFirestore()
                .collection("Bundles")
                .doc(uuid)
                .get();

            if (!bundleSnapshot.exists) {
                return res.status(404).json({ error: "Bundle not found" });
            }

            const bundleDetail = bundleSnapshot.data();
            res.json({ bundleDetail });

        } catch (error) {
            logger.error("Error fetching bundle detail:", error);
            res.status(500).json({ error: "Could not fetch bundle detail" });
        }
    });
});

// For admin app use
exports.updateBundleCoverImages = onRequest(async (req, res) => {
    const fields = {}; // Object to store form fields (like bundle_uuid, method, index)
    const updateBundleInfo = async (bundle_uuid, method, index, publicPath) => {
        try {
            const bundleDoc = await admin.firestore().collection("Bundles").doc(bundle_uuid).get();
            if (!bundleDoc.exists) {
                throw new Error("Bundle not found");
            }
            let coverImgList = bundleDoc.data().cover_img_list || [];

            if (method === "replace") {
                const storagePath = getStoragePathFromUrl(coverImgList[index]);
                await removeImage(storagePath);
                coverImgList[index] = publicPath;
            } else if (method === "add") {
                coverImgList.push(publicPath);
            }

            await admin.firestore().collection("Bundles").doc(bundle_uuid).update({ cover_img_list: coverImgList });
        } catch (error) {
            console.error("Error updating bundle info:", error);
            throw error;
        }
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Capture the buffered body from req.rawBody
    if (!req.rawBody) {
        return res.status(400).json({ error: 'Request body is missing' });
    }

    // Initialize Busboy with the headers
    const busboy = Busboy({ headers: req.headers });

    // Capture form fields
    busboy.on('field', (fieldname, value) => {
        console.log(`Field [${fieldname}]: value: ${value}`);
        fields[fieldname] = value; // Save field values to the fields object
    });

    // Capture file upload
    busboy.on('file', (fieldname, fileStream, file, encoding, mimetype) => {
        console.log("??");
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

        blobStream.on('error', (error) => {
            console.error("BlobStream error: ", error);
            return res.status(500).json({ error: 'Upload failed', details: error });
        });

        blobStream.on('finish', async () => {
            try {
                await fileUpload.makePublic();
                const publicPath = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
                const { bundle_uuid, method, index } = fields;

                if (!bundle_uuid || !["add", "delete", "replace"].includes(method)) {
                    return res.status(400).json({ error: 'Invalid input' });
                }

                await updateBundleInfo(bundle_uuid, method, parseInt(index, 10), publicPath);

                return res.status(200).json({
                    message: 'File uploaded successfully',
                    imageUrl: publicPath,
                });
            } catch (error) {
                console.error("Upload process error: ", error)
                return res.status(500).json({ error: 'Error processing file upload', details: error });
            }
        });
    });

    busboy.on('finish', () => {
        console.log('File upload completed');
    });

    busboy.on('error', (err) => {
        console.error('Busboy error:', err);
        return res.status(500).json({ error: 'File upload failed', details: err });
    });

    // Instead of piping req, use busboy.end() and pass the buffered body
    busboy.end(req.rawBody);
});

// For admin app use
exports.updateThumbnailImage = onRequest(async (req, res) => {
    const fields = {}; // Object to store form fields (like bundle_uuid, method, index)
    const updateBundleInfo = async (bundle_uuid, publicPath) => {
        try {
            const bundleDoc = await admin.firestore().collection("Bundles").doc(bundle_uuid).get();
            if (!bundleDoc.exists) {
                throw new Error("Bundle not found");
            }

            await admin.firestore().collection("Bundles").doc(bundle_uuid).update({ thumbnail_path: publicPath });
        } catch (error) {
            console.error("Error updating bundle info:", error);
            throw error;
        }
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Capture the buffered body from req.rawBody
    if (!req.rawBody) {
        return res.status(400).json({ error: 'Request body is missing' });
    }

    // Initialize Busboy with the headers
    const busboy = Busboy({ headers: req.headers });

    // Capture form fields
    busboy.on('field', (fieldname, value) => {
        fields[fieldname] = value; // Save field values to the fields object
    });

    // Capture file upload
    busboy.on('file', (fieldname, fileStream, file, encoding, mimetype) => {
        const fileExtension = path.extname(file.filename);
        const newFileName = `${uuidv4()}${fileExtension}`;
        const storagePath = `bundles/thumbnails/${newFileName}`;
        const fileUpload = bucket.file(storagePath);

        const blobStream = fileUpload.createWriteStream({
            metadata: {
                contentType: mimetype,
            },
        });

        fileStream.pipe(blobStream);

        blobStream.on('error', (error) => {
            console.error("BlobStream error: ", error);
            return res.status(500).json({ error: 'Upload failed', details: error });
        });

        blobStream.on('finish', async () => {
            try {
                await fileUpload.makePublic();
                const publicPath = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
                const { bundle_uuid, passwordHash } = fields;

                if (!bundle_uuid) {
                    return res.status(400).json({ error: 'Invalid input' });
                }

                if (!await varifyAdminPassword(passwordHash)) {
                    return res.status(401).json("Wrong password!");
                }

                await updateBundleInfo(bundle_uuid, publicPath);

                return res.status(200).json({
                    message: 'File uploaded successfully',
                    imageUrl: publicPath,
                });
            } catch (error) {
                console.error("Upload process error: ", error)
                return res.status(500).json({ error: 'Error processing file upload', details: error });
            }
        });
    });

    busboy.on('finish', () => {
        console.log('File upload completed');
    });

    busboy.on('error', (err) => {
        console.error('Busboy error:', err);
        return res.status(500).json({ error: 'File upload failed', details: err });
    });

    // Instead of piping req, use busboy.end() and pass the buffered body
    busboy.end(req.rawBody);
});

// For admin app use
exports.removeBundleCoverImages = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const { bundle_uuid, index, passwordHash } = req.body;
            if (!await varifyAdminPassword(passwordHash)) {
                return res.status(401).json("Wrong password!");
            }

            /** Add validation code here */
            const bundleDoc = await getFirestore().collection("Bundles").doc(bundle_uuid).get();
            if (!bundleDoc.exists) {
                throw new Error("Bundle not found");
            }
            let coverImgList = bundleDoc.data().cover_img_list;
            const storagePath = getStoragePathFromUrl(coverImgList[index]);
            await removeImage(storagePath);
            coverImgList.splice(index, 1);
            await admin.firestore().collection("Bundles").doc(bundle_uuid).update({ cover_img_list: coverImgList });
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
            const { passwordHash, ...payload } = req.body;
            if (!await varifyAdminPassword(passwordHash)) {
                return res.status(401).json("Wrong password!");
            }

            const db = getFirestore();
            const docRef = db.collection("Bundles").doc(payload.uuid);

            // Add or set the document in the subcollection
            await docRef.set({
                active: payload.active,
                bundle_name: payload.bundle_name,
                category: payload.category,
                cover_img_list: [],
                created_date: payload.created_date,
                humor_count: payload.humor_count,
                language_code: payload.language_code,
                set_list: payload.set_list,
                thumbnail_path: '',
                uuid: payload.uuid,
            });

            // Send a success response
            res.status(200).json({ message: "Bundle added successfully." });
        } catch (error) {
            console.error("Error adding bundle:", error);
            res.status(500).json({ error: "Could not add the bundle." });
        }
    });
});

// For admin app use
exports.updateHumorBundle = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const { passwordHash, ...payload } = req.body;
            if (!await varifyAdminPassword(passwordHash)) {
                return res.status(401).json("Wrong password!");
            }
            const db = getFirestore();
            const docRef = db.collection("Bundles").doc(payload.uuid);

            // Check if document exists
            const docSnapshot = await docRef.get();
            if (!docSnapshot.exists) {
                return res.status(404).json({ error: "Document does not exist." });
            }

            // Update specific fields in the document
            await docRef.update({
                active: payload.active,
                bundle_name: payload.bundle_name,
                category: payload.category,
                created_date: payload.created_date,
                humor_count: payload.humor_count,
                language_code: payload.language_code,
                set_list: payload.set_list,
            });

            // Send a success response
            res.status(200).json({ message: "Bundle updated successfully." });
        } catch (error) {
            console.error("Error updating bundle:", error);
            res.status(500).json({ error: "Could not bundle the document." });
        }
    });
});