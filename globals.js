// connectedUsers.js
// This is where you define the connectedUsers array or object.
const connectedUsers = {};
const connectedSubs = {};
// Variable Declaration
let currentQuiz = null; // No active quiz by default
let quizResponses = {}; // To store user responses

module.exports = { connectedUsers, currentQuiz, quizResponses };
