const apim = require('apim');
// Unified Error Response Function
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
// Authorized Users List
const authorizedUsers = [
    { username: "Test", password: "Welcome@123", corpId: "TMW01" },
    { username: "Admin", password: "Admin@123", corpId: "TMW02" },
    { username: "User1", password: "Password1", corpId: "TMW03" },
    { username: "Finance", password: "Fin@2023", corpId: "TMW04" }
];
// Validate Authorization Header
function validateAuthorizationHeader() {
    const authHeader = apim.getvariable("request.headers.authorization");
    if (!authHeader || !authHeader.startsWith("Basic ")) {
        sendErrorResponse(401, "Unauthorized", "Invalid LDAP Format", "LDAP ID or Password not found");
        return false;
    }
    const base64Credentials = authHeader.substring(6);
    let decodedCredentials;
    try {
        decodedCredentials = Buffer.from(base64Credentials, "base64").toString();
    } catch (err) {
        sendErrorResponse(400, "Bad Request", "Invalid Base64 encoding in Authorization Header", err.message);
        return false;
    }
    if (!decodedCredentials.includes(":")) {
        sendErrorResponse(401, "Unauthorized", "Malformed Authorization Header", "Missing ':' separator between username and password");
        return false;
    }
    const [username, password] = decodedCredentials.split(":");
    const user = authorizedUsers.find(user => user.username === username && user.password === password);
    if (!user) {
        sendErrorResponse(401, "Unauthorized", "LDAP ID or Password is wrong");
        return false;
    }
    return user.corpId;
}
// Validate Content-Type
function validateContentType() {
    const contentType = apim.getvariable('request.headers.content-type');
    if (!contentType || contentType.toLowerCase() !== 'application/json') {
        sendErrorResponse(415, "Unsupported Media Type", "Content-Type must be application/json");
        return false;
    }
    return true;
}
// Parse Request Body
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
// Validate Request Body Structure
function validateRequestBody(requestBodyJson) {
    const { getListofAccountsfromCorpIDReq } = requestBodyJson || {};
    if (!getListofAccountsfromCorpIDReq) {
        sendErrorResponse(400, "Bad Request", "'getListofAccountsfromCorpIDReq' tag missing in Request Body");
        return null;
    }
    const { Header, Body } = getListofAccountsfromCorpIDReq;
    const requiredHeaderFields = ['TranID', 'Corp_ID', 'Maker_ID', 'Checker_ID', 'Approver_ID'];
    for (const field of requiredHeaderFields) {
        if (!Header?.[field]) {
            sendErrorResponse(400, "Bad Request", `Missing or invalid field: ${field}`);
            return null;
        }
    }
    return { Header, Body };
}
// Main Execution Flow
try {
    if (!validateContentType()) return;
    const corpId = validateAuthorizationHeader();
    if (!corpId) return;
    const requestBodyJson = parseRequestBody();
    if (!requestBodyJson) return;
    const { Header, Body } = validateRequestBody(requestBodyJson) || {};
    if (!Header || !Body) return;
    if (Header.Corp_ID !== corpId) {
        sendErrorResponse(401, "Unauthorized", "LDAP to CORP Mismatched", "LDAP ID and CORP ID do not match");
        return;
    }
    // Corporate Account Data
    const corpAccountData = {
        "TMW01": [
            { acctNumber: "1008810030000236", acctBalance: { amountValue: "63.649", currencyCode: "INR" }, acctType: "ODA" },
            { acctNumber: "809000441109", acctBalance: { amountValue: "-1873.69", currencyCode: "INR" }, acctType: "LAA" }
        ],
        "TMW02": [
            { acctNumber: "1008810030000456", acctBalance: { amountValue: "1000.00", currencyCode: "INR" }, acctType: "SAV" },
            { acctNumber: "809000441110", acctBalance: { amountValue: "2000.00", currencyCode: "INR" }, acctType: "SAV" }
        ]
    };
    const accounts = corpAccountData[Header.Corp_ID];
    if (!accounts) {
        sendErrorResponse(404, "Not Found", "No accounts found for the provided Corp_ID");
        return;
    }
    // Construct Response
    const response = {
        getListofAccountsfromCorpIDRes: {
            Header: {
                TranID: Header.TranID,
                Corp_ID: Header.Corp_ID,
                Maker_ID: Header.Maker_ID,
                Checker_ID: Header.Checker_ID,
                Approver_ID: Header.Approver_ID,
                Status: "Success",
                Error_Cde: null,
                Error_Desc: null
            },
            Body: {
                cifInfo: accounts.map(account => ({
                    acctBalance: account.acctBalance,
                    acctCurrCode: account.acctBalance.currencyCode,
                    acctNumber: account.acctNumber,
                    acctType: account.acctType
                }))
            },
            Signature: { Signature: "12345" }
        }
    };
    apim.setvariable('message.status.code', 200);
    apim.setvariable('message.body', JSON.stringify(response));
} catch (error) {
    sendErrorResponse(500, "Internal Server Error", "An unexpected error occurred", error.message);
}