const axios = require("axios");
const forge = require("node-forge");
const crypto = require("crypto");
const express = require("express");
const qs = require("qs");
const cors = require("cors"); // Added to handle CORS for React frontend

// Configuration
const config = {
  partnerId: "",
  privateKey: `-----BEGIN PRIVATE KEY-----

-----END PRIVATE KEY-----`,
  paypayPublicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArL1akdPqJVYIGI4vGNiN
dvoxn7TWYOorLrNOBz3BP2yVSf31L6yPbQIs8hn59iOzbWy8raXAYWjYgM9Lh6h2
6XutwmEjZHqqoH5pLDYvZALMxEwunDpeTFrikuej0nWxjmpA9m4eicXcJbCMJowL
47a5Jw61VkF+wbIj5vxEcSN4SSddJ04zEye1iwkWi9myecU39Do1THBN62ZKiGtd
8jqAqKuDzLtch2mcEjMlgi51RM3IhxtYGY98JE6ICcVu+VDcsAX+OWwOXaWGyv75
5TQG6V8fnYO+Qd4R13jO+32V+EgizHQirhVayAFQGbTBSPIg85G8gVNU64SxbZ5J
XQIDAQAB
-----END PUBLIC KEY-----`,
  apiUrl: "", // Verify with PAYPAY support
  saleProductCode: "",
};

// Helper: Validate PEM key
function validatePemKey(key, type = "PUBLIC KEY") {
  try {
    if (
      !key.includes(`-----BEGIN ${type}-----`) ||
      !key.includes(`-----END ${type}-----`)
    ) {
      throw new Error(`Invalid ${type} format: Missing PEM headers`);
    }
    if (type === "PRIVATE KEY") {
      forge.pki.privateKeyFromPem(key);
    } else {
      forge.pki.publicKeyFromPem(key);
    }
    return true;
  } catch (error) {
    console.error(`Invalid ${type}:`, error.message);
    throw new Error(`Failed to parse ${type}`);
  }
}

// Helper: Generate unique request number
function generateRequestNo() {
  return crypto.randomBytes(16).toString("hex");
}

// Helper: Generate timestamp in GMT+1
function generateTimestamp() {
  const now = new Date();
  const offset = 1 * 60 * 60 * 1000; // GMT+1 offset in milliseconds
  const gmtPlus1 = new Date(now.getTime() + offset);
  return gmtPlus1.toISOString().replace("T", " ").substring(0, 19);
}

// Helper: Encrypt biz_content with private key
function encryptBizContentWithPrivateKey(bizContent, privateKey) {
  const buffer = Buffer.from(bizContent, "utf8");
  const chunkSize = 117;
  const encryptedChunks = [];

  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    const chunk = buffer.slice(offset, offset + chunkSize);
    const encrypted = crypto.privateEncrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      chunk
    );
    encryptedChunks.push(encrypted);
  }

  const encryptedBuffer = Buffer.concat(encryptedChunks);
  const encoded = encryptedBuffer.toString("base64");
  console.log(`Encrypted biz_content (base64): ${encoded}`);
  return encoded;
}

// Helper: Generate SHA1withRSA signature
function generateSignature(params, privateKey) {
  try {
    validatePemKey(privateKey, "PRIVATE KEY");
    const sortedKeys = Object.keys(params)
      .filter((key) => key !== "sign" && key !== "sign_type")
      .sort();
    const stringToSign = sortedKeys
      .map((key) => `${key}=${params[key]}`)
      .join("&");

    console.log(`String to sign: ${stringToSign}`);

    const privateKeyObj = forge.pki.privateKeyFromPem(privateKey);
    const md = forge.md.sha1.create();
    md.update(stringToSign, "utf8");
    const signature = privateKeyObj.sign(md);
    const encodedSignature = forge.util.encode64(signature);
    console.log(`Signature (base64): ${encodedSignature}`);
    return encodedSignature;
  } catch (error) {
    console.error(`Signature error: ${error.message}`);
    throw new Error("Failed to generate signature");
  }
}

// Main function to create MULTICAIXA Express payment
async function createMulticaixaPayment(orderDetails) {
  const { outTradeNo, amount, phoneNum, subject = "Purchase" } = orderDetails;

  const bizContent = {
    cashier_type: "SDK",
    payer_ip: "123.25.68.9", // Replace with actual buyer IP
    sale_product_code: config.saleProductCode,
    timeout_express: "15m",
    trade_info: {
      currency: "AOA",
      out_trade_no: outTradeNo,
      payee_identity: config.partnerId,
      payee_identity_type: "1",
      price: amount.toFixed(2),
      quantity: "1",
      subject,
      total_amount: amount.toFixed(2),
    },
    pay_method: {
      pay_product_code: "31",
      amount: amount.toFixed(2),
      bank_code: "MUL",
      phone_num: phoneNum,
    },
  };

  console.log("biz_content:", JSON.stringify(bizContent, null, 2));

  const encryptedBizContent = encryptBizContentWithPrivateKey(
    JSON.stringify(bizContent),
    config.privateKey
  );

  const params = {
    charset: "UTF-8",
    biz_content: encryptedBizContent,
    partner_id: config.partnerId,
    service: "instant_trade",
    request_no: generateRequestNo(),
    format: "JSON",
    sign_type: "RSA",
    version: "1.0",
    timestamp: generateTimestamp(),
    language: "pt",
  };

  params.sign = generateSignature(params, config.privateKey);

  const encodedParams = {};
  Object.keys(params)
    .sort((a, b) => a.localeCompare(b))
    .forEach((key) => {
      encodedParams[key] = encodeURIComponent(params[key]);
    });

  console.log("Encoded params:", encodedParams);

  try {
    const response = await axios.post(
      config.apiUrl,
      qs.stringify(encodedParams),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error(
        "API responded with error:",
        JSON.stringify(error.response.data, null, 2)
      );
    } else {
      console.error("API request failed:", error.message);
    }
    throw error;
  }
}

// Function to create PayPay App payment
async function createPayPayAppPayment(orderDetails, clientIp) {
  const { outTradeNo, amount, subject = "Purchase" } = orderDetails;

  const bizContent = {
    cashier_type: "SDK",
    payer_ip: "102.140.67.101", // Replace with actual buyer IP
    sale_product_code: config.saleProductCode,
    timeout_express: "15m",
    trade_info: {
      currency: "AOA",
      out_trade_no: outTradeNo,
      payee_identity: config.partnerId,
      payee_identity_type: "1",
      price: amount.toFixed(2),
      quantity: "1",
      subject,
      total_amount: amount.toFixed(2),
    },
  };

  console.log("biz_content:", JSON.stringify(bizContent, null, 2));

  const encryptedBizContent = encryptBizContentWithPrivateKey(
    JSON.stringify(bizContent),
    config.privateKey
  );

  const params = {
    charset: "UTF-8",
    biz_content: encryptedBizContent,
    partner_id: config.partnerId,
    service: "instant_trade",
    request_no: generateRequestNo(),
    format: "JSON",
    sign_type: "RSA",
    version: "1.0",
    timestamp: generateTimestamp(),
    language: "pt",
  };

  params.sign = generateSignature(params, config.privateKey);

  const encodedParams = {};
  Object.keys(params)
    .sort((a, b) => a.localeCompare(b))
    .forEach((key) => {
      encodedParams[key] = encodeURIComponent(params[key]);
    });

  console.log("Encoded params:", encodedParams);

  try {
    const response = await axios.post(
      config.apiUrl,
      qs.stringify(encodedParams),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error(
        "API responded with error:",
        JSON.stringify(error.response.data, null, 2)
      );
      throw new Error(error.response.data.sub_msg || "API error");
    } else {
      console.error("API request failed:", error.message);
      throw new Error("Failed to connect to PayPay API");
    }
  }
}

// Express server
const app = express();
app.use(express.json());
app.use(cors()); // Enable CORS for frontend requests

// POST /api/create route for MULTICAIXA Express payments
app.post("/api/create", async (req, res) => {
  try {
    const { total_amount, paymentMethod, phone_num } = req.body;

    if (paymentMethod !== "MULTICAIXA_EXPRESS") {
      return res.status(400).json({
        success: false,
        error: "This endpoint supports only MULTICAIXA_EXPRESS payments",
      });
    }

    if (!total_amount || !phone_num) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: total_amount and phone_num",
      });
    }

    const orderDetails = {
      outTradeNo: Date.now().toString(),
      amount: parseFloat(total_amount),
      phoneNum: phone_num,
      subject: "Purchase",
    };

    const result = await createMulticaixaPayment(orderDetails);

    if (result.code === "S0001" && result.biz_content.status === "P") {
      res.json({
        success: true,
        dynamic_link: result.biz_content.dynamic_link,
        trade_token: result.biz_content.trade_token,
        out_trade_no: result.biz_content.out_trade_no,
        inner_trade_no: result.biz_content.trade_no,
        total_amount: parseFloat(
          result.biz_content.total_amount || total_amount
        ),
        return_url: result.biz_content.dynamic_link,
      });
      console.log({
        success: true,
        dynamic_link: result.biz_content.dynamic_link,
        trade_token: result.biz_content.trade_token,
        out_trade_no: result.biz_content.out_trade_no,
        inner_trade_no: result.biz_content.trade_no,
        total_amount: parseFloat(
          result.biz_content.total_amount || total_amount
        ),
        return_url: result.biz_content.dynamic_link,
      });
    } else {
      res.json({
        success: false,
        error: result.sub_msg || "Falha ao iniciar pagamento.",
      });
    }
  } catch (err) {
    console.error("Error in /api/create:", err.message);
    res.json({ success: false, error: String(err) });
  }
});

// Notification endpoint
app.post("/paypay/notification", (req, res) => {
  const notification = req.body;
  console.log("Received notification:", notification);

  try {
    validatePemKey(config.paypayPublicKey, "PUBLIC KEY");
    const params = { ...notification };
    delete params.sign;
    delete params.sign_type;
    const sortedKeys = Object.keys(params).sort();
    const stringToSign = sortedKeys
      .map((key) => `${key}=${params[key]}`)
      .join("&");
    const publicKey = forge.pki.publicKeyFromPem(config.paypayPublicKey);
    const md = forge.md.sha1.create();
    md.update(stringToSign, "utf8");
    const signature = forge.util.decode64(notification.sign);
    const isValid = publicKey.verify(md.digest().bytes(), signature);

    if (isValid) {
      console.log("Notification signature verified");
      res.send("success");
    } else {
      console.error("Invalid notification signature");
      res.status(400).send("failure");
    }
  } catch (error) {
    console.error("Notification processing error:", error.message);
    res.status(500).send("failure");
  }
});

// POST /api/create-paypay-app route for PayPay App payments
app.post("/api/create-paypay-app", async (req, res) => {
  try {
    const { total_amount, subject } = req.body;

    if (!total_amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: total_amount",
      });
    }

    const orderDetails = {
      outTradeNo: Date.now().toString(),
      amount: parseFloat(total_amount),
      subject: subject || "Purchase",
    };

    const result = await createPayPayAppPayment(orderDetails, req.ip);
    console.log(result);
    if (result.code === "S0001" && result.biz_content.status === "P") {
      res.json({
        success: true,
        dynamic_link: result.biz_content.dynamic_link,
        trade_token: result.biz_content.trade_token,
        out_trade_no: result.biz_content.out_trade_no,
        inner_trade_no: result.biz_content.trade_no,
        total_amount: parseFloat(
          result.biz_content.total_amount || total_amount
        ),
        return_url: result.biz_content.dynamic_link,
      });
      console.log({
        success: true,
        dynamic_link: result.biz_content.dynamic_link,
        trade_token: result.biz_content.trade_token,
        out_trade_no: result.biz_content.out_trade_no,
        inner_trade_no: result.biz_content.trade_no,
        total_amount: parseFloat(
          result.biz_content.total_amount || total_amount
        ),
        return_url: result.biz_content.dynamic_link,
      });
    } else {
      res.json({
        success: false,
        error: result.sub_msg || "Falha ao iniciar pagamento.",
      });
    }
  } catch (err) {
    console.error("Error in /api/create-paypay-app:", err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
