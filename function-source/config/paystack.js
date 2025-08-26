const axios = require('axios');
const functions = require('firebase-functions');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = functions.config().paystack?.secret_key || 'YOUR_PAYSTACK_SECRET_KEY_HERE';
const PAYSTACK_WEBHOOK_SECRET = functions.config().paystack?.webhook_secret || 'YOUR_PAYSTACK_WEBHOOK_SECRET_HERE';

const paystackAxios = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  headers: {
    'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
  }
});

const initializeTransaction = async (email, amount, planCode, metadata = {}) => {
  try {
    const payload = {
      email,
      amount,
      plan: planCode,
      metadata: {
        ...metadata,
        plan_code: planCode
      }
    };

    const response = await paystackAxios.post('/transaction/initialize', payload);
    return response.data;
  } catch (error) {
    console.error('Paystack initialization error:', error.response?.data || error.message);
    throw new Error('Payment initialization failed');
  }
};

const verifyTransaction = async (reference) => {
  try {
    const response = await paystackAxios.get(`/transaction/verify/${reference}`);
    return response.data;
  } catch (error) {
    console.error('Paystack verification error:', error.response?.data || error.message);
    throw new Error('Payment verification failed');
  }
};

const cancelSubscription = async (subscriptionCode, token = null) => {
  try {
    const payload = {
      code: subscriptionCode
    };
    
    if (token) {
      payload.token = token;
    }

    const response = await paystackAxios.post('/subscription/disable', payload);
    return response.data;
  } catch (error) {
    console.error('Paystack cancellation error:', error.response?.data || error.message);
    throw new Error('Subscription cancellation failed');
  }
};

const verifyWebhookSignature = (payload, signature) => {
  if (!PAYSTACK_WEBHOOK_SECRET) {
    console.warn('Webhook secret not configured');
    return true; // Allow in development
  }
  
  const crypto = require('crypto');
  const hash = crypto
    .createHmac('sha512', PAYSTACK_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return hash === signature;
};

module.exports = {
  initializeTransaction,
  verifyTransaction,
  cancelSubscription,
  verifyWebhookSignature
};