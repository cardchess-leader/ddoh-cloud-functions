/* eslint-disable require-jsdoc */
const HumorCategoryList = [
    "DAD_JOKES",
    "KNOCK_KNOCK_JOKES",
    "ONE_LINERS",
    "DARK_HUMORS",
    "TRICKY_RIDDLES",
    "OX_QUIZ",
    "FUNNY_QUOTES",
    "STORY_JOKES",
    "DETECTIVE_PUZZLES",
    "YOUR_HUMORS",
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

function validateRequestBody(requestBody) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (typeof requestBody.date !== "string" || !dateRegex.test(requestBody.date)) {
        return { statusCode: 400, error: "Invalid type for query date. Expected format 'yyyy-mm-dd'." };
    }
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

    // created_date is required
    // created_date should match the yyyy-mm-dd format
    if (typeof requestBody.created_date !== "string" || !dateRegex.test(requestBody.created_date)) {
        return { statusCode: 400, error: "Invalid type for created_date. Expected format 'yyyy-mm-dd'." };
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
    HumorCategoryList,
    getDateInUTC,
    addDaysToDate,
    validateRequestBody
};
