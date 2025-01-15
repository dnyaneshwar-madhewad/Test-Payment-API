var apim = require('apim');

// Helper function to send error response
function sendErrorResponse(statusCode, statusReason, message, moreInfo = "") {
    var errorResponse = {
        "httpCode": statusCode.toString(),
        "httpMessage": statusReason,
        "moreInformation": message
    };

    if (moreInfo) {
        errorResponse.moreDetails = moreInfo;
    }

    apim.setvariable('message.status.code', statusCode);
    apim.setvariable('message.status.reason', statusReason);
    apim.setvariable('message.headers.content-type', 'application/json');
    apim.setvariable('message.body', JSON.stringify(errorResponse));
    return;
}

try {
    // Step 1: Get the request body
    var requestBody = apim.getvariable('message.body');
    console.debug("Raw Request Body: ", requestBody);

    if (!requestBody) {
        sendErrorResponse(400, "Bad Request", "Request Body is missing or empty");
        return;
    }

    // Step 2: Properly parse the request body
    var requestBodyJson;
    try {
        requestBodyJson = apim.getvariable('message.body');
        console.debug("Parsed Request Body: ", requestBodyJson);
    } catch (err) {
        sendErrorResponse(400, "Bad Request", "Invalid JSON format in Request Body", err.message);
        return;
    }

    // Step 3: Validate the request body structure
    function validateRequestBody(requestBodyJson) {
        if (!requestBodyJson.Test_Payment_Req) {
            sendErrorResponse(400, "Bad Request", "'Test_Payment_Req' tag missing in Request Body");
            return false;
        }

        const { Header, Body } = requestBodyJson.Test_Payment_Req;

        if (!Header) {
            sendErrorResponse(400, "Bad Request", "Header is missing in Request Body");
            return false;
        }

        const requiredHeaderFields = ['TranID', 'ORG_ID', 'Maker_ID', 'Checker_ID', 'Approver_ID'];
        for (let field of requiredHeaderFields) {
            if (!Header[field]) {
                sendErrorResponse(400, "Bad Request", `Missing or invalid field: ${field}`);
                return false;
            }
        }

        if (!Body || !Body.Amount) {
            sendErrorResponse(400, "Bad Request", "Invalid or missing Amount in Request Body");
            return false;
        }

        const amount = parseFloat(Body.Amount);
        if (isNaN(amount) || amount <= 0) {
            sendErrorResponse(400, "Bad Request", "Amount must be a positive number greater than zero");
            return false;
        }
        if (amount >= 200000) {
            sendErrorResponse(400, "Bad Request", "Amount must be less than Rs 2,00,000");
            return false;
        }

        return { Header, Body };
    }

    var validationResult = validateRequestBody(requestBodyJson);
    if (!validationResult) {
        return;
    }

    var { Header, Body } = validationResult;

    // Step 5: Check Authorization Header
    var authHeader = apim.getvariable("request.headers.authorization");
    if (!authHeader || !authHeader.startsWith("Basic ")) {
        sendErrorResponse(401, "Unauthorized", "Invalid username Format", "username ID or Password not found");
        return;
    }

    var base64Credentials = authHeader.substring(6);
    let decodedCredentials;
    try {
        decodedCredentials = Buffer.from(base64Credentials, "base64").toString();
    } catch (err) {
        sendErrorResponse(400, "Bad Request", "Invalid Base64 encoding in Authorization Header", err.message);
        return;
    }

    if (!decodedCredentials.includes(":")) {
        sendErrorResponse(401, "Unauthorized", "Malformed Authorization Header");
        return;
    }

    var [username, password] = decodedCredentials.split(":");
    if (username !== "Test" || password !== "Welcome@123") {
        sendErrorResponse(401, "Unauthorized", "username ID or Password is wrong");
        return;
    }

    if (Header.ORG_ID !== username) {
        sendErrorResponse(401, "Unauthorized", "username to ORG Mismatched", "username ID and ORG ID do not match");
        return;
    }

    function getISTDateTime() {
        return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    }

    var response = {
        "Test_Payment_ORG_Resp": {
            "Header": {
                "TranID": Header.TranID,
                "ORG_ID": Header.ORG_ID,
                "Maker_ID": Header.Maker_ID,
                "Checker_ID": Header.Checker_ID,
                "Approver_ID": Header.Approver_ID,
                "Status": "Initiated",
                "Error_Cde": {},
                "Error_Desc": {}
            },
            "Body": {
                "RefNo": "TESTTECH01464",
                "UTRNo": "UTR25008694295",
                "PONum": "000284724062",
                "Amount": Body.Amount,
                "BenIFSC": Body.Ben_IFSC,
                "Txn_Time": getISTDateTime()
            },
            "Signature": {
                "Signature": "Signature"
            }
        }
    };

    apim.setvariable('message.status.code', 200);
    apim.setvariable('message.status.reason', 'OK');
    apim.setvariable('message.headers.content-type', 'application/json');
    apim.setvariable('message.body', JSON.stringify(response));

} catch (generalError) {
    sendErrorResponse(500, "Internal Server Error", "An unexpected error occurred", generalError.message);
}
