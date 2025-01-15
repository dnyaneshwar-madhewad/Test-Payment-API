const apim = require('apim');

function sendErrorResponse(statusCode, statusReason, message, moreInfo = "") {
    const errorResponse = {
        httpCode: statusCode.toString(),
        httpMessage: statusReason,
        moreInformation: message,
        ...(moreInfo && { moreDetails: moreInfo })
    };

    apim.setvariable('message.status.code', statusCode);
    apim.setvariable('message.status.reason', statusReason);
    apim.setvariable('message.headers.content-type', 'application/json');
    apim.setvariable('message.body', JSON.stringify(errorResponse));
}

function generateRandomString(prefix, length) {
    const characters = '0123456789';
    let result = prefix;

    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    return result;
}

function getISTDateTime() {
    return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

const authorizedUsers = [
    { username: "Test", password: "Welcome@123" },
    { username: "Admin", password: "Admin@123" },
    { username: "User1", password: "Password1" },
    { username: "Finance", password: "Fin@2023" }
];

const debitAccounts = {
    "123456789012": { balance: 500000, owner: "Finance", Corp_ID: "Finance" },
    "987654321098": { balance: 100000, owner: "User1", Corp_ID: "User1" },
    "456789123456": { balance: 750000, owner: "Admin", Corp_ID: "Admin" },
    "654321987654": { balance: 300000, owner: "Test", Corp_ID: "Test" }
};

const validModes = ["FT", "RTGS", "IMPS", "NEFT"];

function isValidAlphanumeric(value) {
    const regex = /^[A-Za-z0-9]+$/;
    return regex.test(value) && value.length <= 16;
}

function validateContentType() {
    const contentType = apim.getvariable('request.headers.content-type');

    if (!contentType || contentType.toLowerCase() !== 'application/json') {
        sendErrorResponse(415, "Unsupported Media Type", "Content-Type must be application/json");
        return false;
    }

    return true;
}

function parseRequestBody() {
    const requestBody = apim.getvariable('message.body');

    if (!requestBody) {
        sendErrorResponse(400, "Bad Request", "Request Body is missing or empty");
        return null;
    }

    try {
        return apim.getvariable('message.body');
    } catch (err) {
        sendErrorResponse(400, "Bad Request", "Invalid JSON format in Request Body", err.message);
        return null;
    }
}

function validateRequestBody(requestBodyJson) {
    const { Single_Payment_Corp_Req } = requestBodyJson || {};

    if (!Single_Payment_Corp_Req) {
        sendErrorResponse(400, "Bad Request", "'Single_Payment_Corp_Req' tag missing in Request Body");
        return null;
    }

    const { Header, Body } = Single_Payment_Corp_Req;
    const requiredHeaderFields = ['TranID', 'Corp_ID', 'Maker_ID', 'Checker_ID', 'Approver_ID'];

    // Validate that header fields are alphanumeric and no more than 16 characters
    for (const field of requiredHeaderFields) {
        if (!Header?.[field] || !isValidAlphanumeric(Header[field])) {
            sendErrorResponse(400, "Bad Request", `Invalid or missing field: ${field}`);
            return null;
        }
    }

    const debitAccount = Body?.Debit_Acct_No;
    if (!debitAccount || !debitAccounts[debitAccount]) {
        sendErrorResponse(400, "Bad Request", "Invalid or unregistered Debit_Acct_No.");
        return null;
    }

    // Validate the Corp_ID for the account
    if (debitAccounts[debitAccount].Corp_ID !== Header.Corp_ID) {
        sendErrorResponse(401, "Unauthorized", "LDAP to CORP Mismatch");
        return null;
    }

    const amount = parseFloat(Body?.Amount);
    if (isNaN(amount) || amount <= 0) {
        sendErrorResponse(400, "Bad Request", "Amount must be a positive number greater than zero.");
        return null;
    }

    if (amount > debitAccounts[debitAccount].balance) {
        sendErrorResponse(400, "Bad Request", "Insufficient balance in the Debit Account.");
        return null;
    }

    const mode = Body?.Mode_of_Pay;
    if (!validModes.includes(mode)) {
        sendErrorResponse(400, "Bad Request", "Invalid or missing Mode_of_Pay. Valid options are 'FT', 'RTGS', 'IMPS', or 'NEFT'.");
        return null;
    }

    // Add additional validation for NEFT mode
    if (mode === "NEFT") {
        if (amount < 1000 || amount > 500000) {
            sendErrorResponse(400, "Bad Request", "For NEFT, Amount must be between Rs 1,000 and Rs 5,00,000.");
            return null;
        }
    }

    if (mode === "RTGS" && amount < 200000) {
        sendErrorResponse(400, "Bad Request", "For RTGS, Amount must be ≥ Rs 2,00,000.");
        return null;
    }

    if ((mode === "FT" || mode === "IMPS") && amount >= 200000) {
        sendErrorResponse(400, "Bad Request", "For FT and IMPS, Amount must be < Rs 2,00,000.");
        return null;
    }

    return { Header, Body };
}

function validateAuthorizationHeader() {
    var authHeader = apim.getvariable("request.headers.authorization");
    if (!authHeader || !authHeader.startsWith("Basic ")) {
        sendErrorResponse(401, "Unauthorized", "Invalid LDAP Format", "LDAP ID or Password not found");
        return false;
    }

    var base64Credentials = authHeader.substring(6);
    let decodedCredentials;
    try {
        decodedCredentials = Buffer.from(base64Credentials, "base64").toString();
    } catch (err) {
        sendErrorResponse(400, "Bad Request", "Invalid Base64 encoding in Authorization Header", err.message);
        return false;
    }

    if (!decodedCredentials.includes(":")) {
        sendErrorResponse(401, "Unauthorized", "Malformed Authorization Header");
        return false;
    }

    var [username, password] = decodedCredentials.split(":");
    var isAuthorized = authorizedUsers.some(user => user.username === username && user.password === password);
    if (!isAuthorized) {
        sendErrorResponse(401, "Unauthorized", "LDAP ID or Password is wrong");
        return false;
    }

    return { username, password };
}

try {
    // Validate the authorization header
    const auth = validateAuthorizationHeader();
    if (!auth) return;

    if (!validateContentType()) return;

    const requestBodyJson = parseRequestBody();
    if (!requestBodyJson) return;

    const { Header, Body } = validateRequestBody(requestBodyJson) || {};
    if (!Header || !Body) return;

    debitAccounts[Body.Debit_Acct_No].balance -= parseFloat(Body.Amount);

    const response = {
        get_Single_Payment_Status_Corp_Res: {
            Header: {
                TranID: Header.TranID,
                Corp_ID: Header.Corp_ID,
                Maker_ID: Header.Maker_ID,
                Checker_ID: Header.Checker_ID,
                Approver_ID: Header.Approver_ID,
                Status: "Initiated", // This status will be updated to "FAILED" in case of error
                Error_Cde: "",
                Error_Desc: ""
            },
            Body: {
                RefNo: generateRandomString("REF", 12),
                UTRNo: generateRandomString("UTR", 14),
                PONum: generateRandomString("PO", 12),
                Debit_Acct_No: Body.Debit_Acct_No,
                Amount: Body.Amount,
                Remaining_Balance: debitAccounts[Body.Debit_Acct_No].balance,
                BenIFSC: Body.Ben_IFSC,
                Txn_Time: getISTDateTime(),
                Mode_of_Pay: Body.Mode_of_Pay
            },
            Signature: {
                Signature: "Signature"
            }
        }
    };

    apim.setvariable('message.status.code', 200);
    apim.setvariable('message.body', JSON.stringify(response));

} catch (error) {
    sendErrorResponse(500, "Internal Server Error", "An unexpected error occurred", error.message);
}
