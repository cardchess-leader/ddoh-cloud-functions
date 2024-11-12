const IS_PRODUCTION = true;

const HumorCategoryList = [
    "DAD_JOKES",
    "DIALOG_JOKES",
    "ONE_LINERS",
    "DARK_HUMORS",
    "TRICKY_RIDDLES",
    "TRIVIA_QUIZ",
    "FUNNY_QUOTES",
    "STORY_JOKES",
    "MYSTERY_PUZZLES",
    "KNOCK_KNOCK_JOKES",
    "YOUR_HUMORS",
    "MISC_PUNCHLINE",
    "MISC_NO_PUNCHLINE",
];

const CorsOriginList = [ // Comment out localhost:3000 in production mode
    IS_PRODUCTION ? "https://ddoh-admin-app--daily-dose-of-humors.us-central1.hosted.app" : "http://localhost:3000",
    "https://storage.googleapis.com/daily-dose-of-humors.appspot.com",
];

function getDateInUTC(date) {
    // Extract year, month, and day in UTC (GMT+0)
    const year = date.getUTCFullYear();         // Year in UTC
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");  // Month in UTC, adding 1 since it's zero-indexed
    const day = String(date.getUTCDate()).padStart(2, "0");         // Day in UTC

    // Combine them into the desired format 'yyyy-mm-dd'
    return `${year}-${month}-${day}`;
}

function addDaysToDate(date, numDaysToAdd) {
    return new Date(Date.now() + numDaysToAdd * 24 * 60 * 60 * 1000);
}

function validateUserSubmitBody(requestBody) {
    if (typeof requestBody.nickname !== "string" || requestBody.nickname.length > 50) {
        return { statusCode: 400, error: "Invalid nickname. Please check \"nickname\" field." };
    }

    if (typeof requestBody.context !== "string" || requestBody.context.length == 0 || requestBody.context.length > 500) {
        return { statusCode: 400, error: "Invalid context. Please check \"context\" field." };
    }

    if (typeof requestBody.punchline !== "string" || requestBody.punchline.length > 500) {
        return { statusCode: 400, error: "Invalid punchline. Please check \"punchline\" field." };
    }

    if (typeof requestBody.app_uuid !== "string" || requestBody.app_uuid.length != 36) {
        return { statusCode: 400, error: "Unexpected error. Please try again later." };
    }

    if (typeof requestBody.humor_uuid !== "string" || requestBody.humor_uuid.length != 36) {
        return { statusCode: 400, error: "Unexpected error. Please try again later." };
    }

    if (typeof requestBody.subscription_type !== "string" || requestBody.subscription_type.length > 10) {
        return { statusCode: 400, error: "Unexpected error. Please try again later." };
    }
    return { statusCode: 200 };
}

function validateRequestBody(requestBody) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    // author is not required
    if (typeof requestBody.author !== "string") {
        return { statusCode: 400, error: "Invalid type for author. Expected non-empty string." };
    }

    // category is required
    if (!HumorCategoryList.includes(requestBody.category)) {
        return { statusCode: 400, error: "Invalid type for category. Expected one of the HumorCategory values." };
    }

    // context is required
    if (typeof requestBody.context !== "string" || requestBody.context.trim() === "") {
        return { statusCode: 400, error: "Invalid type for context. Expected non-empty string." };
    }

    // context_list should be an array of strings
    if (!Array.isArray(requestBody.context_list) || !requestBody.context_list.every(item => typeof item === "string")) {
        return { statusCode: 400, error: "Invalid type for context_list. Expected an array of strings." };
    }

    // release_date is required
    // release_date should match the yyyy-mm-dd format
    if (typeof requestBody.release_date !== "string" || !dateRegex.test(requestBody.release_date)) {
        return { statusCode: 400, error: "Invalid type for release_date. Expected format 'yyyy-mm-dd'." };
    }

    // index is required
    if (typeof requestBody.index !== "number" || !Number.isInteger(requestBody.index)) {
        return { statusCode: 400, error: "Invalid type for index. Expected an integer." };
    }

    // punchline is not required
    if (typeof requestBody.punchline !== "string") {
        return { statusCode: 400, error: "Invalid type for punchline. Expected non-empty string." };
    }

    // sender is required
    if (typeof requestBody.sender !== "string" || requestBody.sender.trim() === "") {
        return { statusCode: 400, error: "Invalid type for sender. Expected non-empty string." };
    }

    // source is required
    if (typeof requestBody.source !== "string" || requestBody.source.trim() === "") {
        return { statusCode: 400, error: "Invalid type for source. Expected non-empty string." };
    }

    // uuid is required
    if (typeof requestBody.uuid !== "string" || requestBody.uuid.trim() === "") {
        return { statusCode: 400, error: "Invalid type for uuid. Expected non-empty string." };
    }
    return { statusCode: 200 };
}



// Export both functions and constants
module.exports = {
    IS_PRODUCTION,
    HumorCategoryList,
    CorsOriginList,
    getDateInUTC,
    addDaysToDate,
    validateRequestBody,
    validateUserSubmitBody,
};
