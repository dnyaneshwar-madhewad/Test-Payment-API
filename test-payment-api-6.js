const apim = require('apim');

function sendErrorResponse(Header) {
    const errorResponse = {
        get_Single_Payment_Status_Corp_Res: {
            Header: {
                TranID: Header.TranID,
                Corp_ID: Header.Corp_ID,
                Maker_ID: Header.Maker_ID,
                Checker_ID: Header.Checker_ID,
                Approver_ID: Header.Approver_ID,
                Status: "FAILED",
                Error_Cde: "ER002",
                Error_Desc: "Schema Validation Failure"
            },
            Signature: {
                Signature: "Signature"
            }
        }
    };

    apim.setvariable('message.status.code', 200);
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
    "123456789012": { balance: 500000, owner: "Finance" },
    "987654321098": { balance: 100000, owner: "User1" },
    "456789123456": { balance: 750000, owner: "Admin" },
    "654321987654": { balance: 300000, owner: "Test" }
};

const validModes = ["FT", "RTGS", "IMPS", "NEFT"];  // Added NEFT to valid modes

// Validate if string is alphanumeric and less than or equal to 16 characters
function isValidAlphanumeric(value) {
    const regex = /^[A-Za-z0-9]+$/;
    return regex.test(value) && value.length <= 16;
}

function validateContentType() {
    const contentType = apim.getvariable('request.headers.content-type');

    if (!contentType || contentType.toLowerCase() !== 'application/json') {
        sendErrorResponse({});
        return false;
    }

    return true;
}

function parseRequestBody() {
    const requestBody = apim.getvariable('message.body');

    if (!requestBody) {
        sendErrorResponse({});
        return null;
    }

    try {
        return apim.getvariable('message.body');
    } catch (err) {
        sendErrorResponse({});
        return null;
    }
}

function validateRequestBody(requestBodyJson) {
    const { Single_Payment_Corp_Req } = requestBodyJson || {};

    if (!Single_Payment_Corp_Req) {
        sendErrorResponse({});
        return null;
    }

    const { Header, Body } = Single_Payment_Corp_Req;
    const requiredHeaderFields = ['TranID', 'Corp_ID', 'Maker_ID', 'Checker_ID', 'Approver_ID'];

    // Validate that header fields are alphanumeric and no more than 16 characters
    for (const field of requiredHeaderFields) {
        if (!Header?.[field] || !isValidAlphanumeric(Header[field])) {
            sendErrorResponse(Header);
            return null;
        }
    }

    const debitAccount = Body?.Debit_Acct_No;
    if (!debitAccount || !debitAccounts[debitAccount]) {
        sendErrorResponse({});
        return null;
    }

    if (debitAccounts[debitAccount].owner !== Header.Corp_ID) {
        sendErrorResponse({});
        return null;
    }

    const amount = parseFloat(Body?.Amount);
    if (isNaN(amount) || amount <= 0) {
        sendErrorResponse({});
        return null;
    }

    if (amount > debitAccounts[debitAccount].balance) {
        sendErrorResponse({});
        return null;
    }

    const mode = Body?.Mode_of_Pay;
    if (!validModes.includes(mode)) {
        sendErrorResponse({});
        return null;
    }

    // Add additional validation for NEFT mode
    if (mode === "NEFT") {
        if (amount < 1000 || amount > 500000) {
            sendErrorResponse(Header);
            return null;
        }
    }

    if (mode === "RTGS" && amount < 200000) {
        sendErrorResponse({});
        return null;
    }

    if ((mode === "FT" || mode === "IMPS") && amount >= 200000) {
        sendErrorResponse({});
        return null;
    }

    var authHeader = apim.getvariable("request.headers.authorization");
    if (!authHeader || !authHeader.startsWith("Basic ")) {
        sendErrorResponse({});
        return;
    }
    var base64Credentials = authHeader.substring(6);
    let decodedCredentials;
    try {
        decodedCredentials = Buffer.from(base64Credentials, "base64").toString();
    } catch (err) {
        sendErrorResponse({});
        return;
    }

    if (!decodedCredentials.includes(":")) {
        sendErrorResponse({});
        return;
    }

    var [username, password] = decodedCredentials.split(":");
    var isAuthorized = authorizedUsers.some(user => user.username === username && user.password === password);
    if (!isAuthorized) {
        sendErrorResponse({});
        return;
    }

    if (Header.Corp_ID !== username) {
        sendErrorResponse({});
        return;
    }

    return { Header, Body };
}

try {
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
                Status: "Initiated",
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
    sendErrorResponse({});
}
