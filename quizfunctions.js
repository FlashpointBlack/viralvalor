// const {connectedUsers} = require('./globals');
function calculateQuizResults(responses, quiz) {
    if (!quiz || !Array.isArray(quiz.options)) {
        return [];
    }

    // Initialize voteCounts with the number of options set to 0
    let voteCounts = quiz.options.map(() => 0);

    // Count votes for each option
    Object.values(responses).forEach(selectedOption => {
        if (selectedOption !== null && selectedOption < quiz.options.length) {
            voteCounts[selectedOption]++;
        }
    });

    // Calculate percentages
    let totalVotes = voteCounts.reduce((sum, count) => sum + count, 0);
    let results = voteCounts.map(count => totalVotes > 0 ? (count / totalVotes * 100).toFixed(2) : 0);

    return results;
}

// Helper function to format the results into a message
function formatResultsMessage(results) {
    let message = 'Quiz Results:\n';
    if (Array.isArray(results)) { // Ensure results is an array
        message += `Question 1:\n`; // Since there's only one question now
        results.forEach((percent, optionIndex) => {
            message += `Option ${optionIndex + 1}: ${percent}%\n`;
        });
    } else {
        // If results isn't an array, log an error or handle it appropriately
        console.error('Invalid results format:', results);
        message += 'Error: Results could not be formatted.';
    }
    return message;
}

module.exports = { calculateQuizResults, formatResultsMessage }