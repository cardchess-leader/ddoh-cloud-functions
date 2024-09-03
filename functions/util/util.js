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

/**
 * Gets today's date in UTC format as a string.
 *
 * This function returns the current date in the UTC time zone
 * formatted as 'yyyy-mm-dd'.
 *
 * @return {string} The current date in 'yyyy-mm-dd' format.
 */
function getDateInUTC(date) {
    // const today = new Date();

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



// Export both functions and constants
module.exports = {
    HumorCategoryList,
    getDateInUTC,
    addDaysToDate,
};
