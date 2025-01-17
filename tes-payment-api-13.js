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

function sendErrorResponseCode(Header, errorCode, errorDesc) {
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
                Error_Desc: "Schema Validation Failure",
                Error_More_Desc: errorDesc
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

const validModes = ["FT", "RTGS", "IMPS"];

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

function validateRequestBody(requestBodyJson) 
{
    const { Single_Payment_Corp_Req } = requestBodyJson || {};

    if (!Single_Payment_Corp_Req) {
        sendErrorResponse(400, "Bad Request", "'Single_Payment_Corp_Req' tag missing in Request Body");
        return null;
    }

    const { Header, Body } = Single_Payment_Corp_Req;

    const requiredHeaderFieldsTra = ['TranID', 'Corp_ID'];
	const alphanumericRegex = /^[A-Za-z0-9]+$/;  // Regex to match only alphanumeric characters


    for (const field of requiredHeaderFieldsTra)
	{
        if (!Header?.[field]) 
		{
            sendErrorResponse(401, "Unauthorized", `Missing or invalid field: ${field}`);
            return null;
        }
	    if (Header[field].length > 16 || !alphanumericRegex.test(Header[field]))
		{
			sendErrorResponseCode(Header, "ER12", `${field} must be alphanumeric and no longer than 16 characters`);			
            return null;
        }
    }

    const requiredHeaderFields = ['Maker_ID', 'Checker_ID', 'Approver_ID'];

    for (const field of requiredHeaderFields) 
	{
        if (!Header?.[field]) {
            sendErrorResponse(400, "Bad Request", `Missing or invalid field: ${field}`);
            return null;
        }
	    
		if (Header[field].length > 16 || !alphanumericRegex.test(Header[field]))
		{
			sendErrorResponseCode(Header, "ER12", `${field} must be alphanumeric and no longer than 16 characters`);			
            return null;
        }
    }

    const debitAccount = Body?.Debit_Acct_No;
    if (debitAccounts[debitAccount].owner !== Header.Corp_ID) {
        sendErrorResponse(401, "Unauthorized", "LDAP to CORP Mismatch");
        return null;
    }
     
    if (!debitAccount || !debitAccounts[debitAccount]) {
        sendErrorResponseCode(Header, "ER002", "Invalid or unregistered Debit_Acct_No.");
        return null;
    }

    const amount = parseFloat(Body?.Amount);
    if (isNaN(amount) || amount <= 0) {
        sendErrorResponseCode(Header, "ER12", "Amount must be a positive number greater than zero.");
        return null;
    }

    if (amount > debitAccounts[debitAccount].balance) {
        sendErrorResponseCode(Header, "ER12", "Insufficient balance in the Debit Account.");
        return null;
    }

    const mode = Body?.Mode_of_Pay;
    if (!validModes.includes(mode)) {
        sendErrorResponseCode(Header, "ER002", "Invalid or missing Mode_of_Pay. Valid options are 'FT', 'RTGS', or 'IMPS'.");
        return null;
    }

    if (mode === "RTGS" && amount < 200000) {
        sendErrorResponseCode(Header, "ER002", "For RTGS, Amount must be ≥ Rs 2,00,000.");
        return null;
    }

    if ((mode === "FT" || mode === "IMPS") && amount >= 200000) {
        sendErrorResponseCode(Header, "ER002", "For FT and IMPS, Amount must be < Rs 2,00,000.");
        return null;
    }
    var authHeader = apim.getvariable("request.headers.authorization");
    if (!authHeader || !authHeader.startsWith("Basic ")) {
        sendErrorResponse(401, "Unauthorized", "Invalid LDAP Format", "LDAP ID or Password not found");
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
    var isAuthorized = authorizedUsers.some(user => user.username === username && user.password === password);
    if (!isAuthorized) {
        sendErrorResponse(401, "Unauthorized", "LDAP ID or Password is wrong");
        return;
    }

    if (Header.Corp_ID !== username) {
        sendErrorResponse(401, "Unauthorized", "LDAP to CORP Mismatched", "LDAP ID and CORP ID do not match");
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
        Single_Payment_Corp_Resp: {
            Header: {
                TranID: Header.TranID,
                Corp_ID: Header.Corp_ID,
                Maker_ID: Header.Maker_ID,
                Checker_ID: Header.Checker_ID,
                Approver_ID: Header.Approver_ID,
                Status: "success",
                Error_Cde: {},
                Error_Desc: {}
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
