const apim = require('apim');

const processedTranIDs = new Set();

function sendErrorResponse(Header, errorCode, errorDesc) {
    const errorResponse = {
        get_Single_Payment_Status_Corp_Res: {
            Header: {
                TranID: Header.TranID || "",
                Corp_ID: Header.Corp_ID || "",
                Maker_ID: Header.Maker_ID || "",
                Checker_ID: Header.Checker_ID || "",
                Approver_ID: Header.Approver_ID || "",
                Status: "FAILED",
                Error_Cde: errorCode,
                Error_Desc: errorDesc
            },
            Signature: {
                Signature: "Signature"
            }
        }
    };

    apim.setvariable('message.status.code', 200);
    apim.setvariable('message.body', JSON.stringify(errorResponse));
}

function sendErrorResponsecode(statusCode, statusReason, message, moreInfo = "") {
    const errorResponse = {
        httpCode: statusCode.toString(),
        httpMessage: statusReason,
        moreInformation: message
    };

    if (moreInfo) {
        errorResponse.moreDetails = moreInfo;
    }

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

function isCutoffTimeExceeded() {
    const currentTime = new Date();
    const cutoffTime = new Date();
    cutoffTime.setHours(17, 0, 0);
    return currentTime > cutoffTime;
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

const validModes = ["FT", "RTGS", "IMPS", "NEFT"];

function isValidAlphanumeric(value) {
    const regex = /^[A-Za-z0-9]+$/;
    return regex.test(value) && value.length <= 16;
}

function validateRequestBody(requestBodyJson) {
    const { Single_Payment_Corp_Req } = requestBodyJson || {};
    const { Header, Body } = Single_Payment_Corp_Req || {};
    const authHeader = apim.getvariable("request.headers.authorization");

    if (!authHeader || !authHeader.startsWith("Basic ")) {
        sendErrorResponse(Header, "ER003", "Invalid Authorization Header");
        return null;
    }

    const base64Credentials = authHeader.substring(6);
    let decodedCredentials;
    try {
        decodedCredentials = Buffer.from(base64Credentials, "base64").toString();
    } catch (err) {
        sendErrorResponse(Header, "ER004", "Invalid Base64 encoding in Authorization Header");
        return null;
    }

    const [username, password] = decodedCredentials.split(":");
    const isAuthorized = authorizedUsers.some(user => user.username === username && user.password === password);
    if (!isAuthorized) {
        sendErrorResponse(Header, "ER003", "LDAP ID or Password is wrong");
        return null;
    }

    if (processedTranIDs.has(Header.TranID)) {
        sendErrorResponse(Header, "ER013", "Duplicate Transaction ID");
        return null;
    }

    if (Body.Mode_of_Pay === "NEFT" && isCutoffTimeExceeded()) {
        sendErrorResponse(Header, "ER101", "Transaction on hold as cutoff time exceeded. Will be processed on the next working day.");
        return null;
    }

    processedTranIDs.add(Header.TranID);
    return { Header, Body };
}

try {
    const requestBodyJson = JSON.parse(apim.getvariable('message.body'));
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
                Status: "SUCCESS",
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
    sendErrorResponse({}, "ER006", "Timeout or unexpected error occurred");
}
