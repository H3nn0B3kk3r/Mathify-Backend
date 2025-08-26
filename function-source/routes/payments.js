const express = require('express');
const router = express.Router();
const { 
  validateInitializeSubscription, 
  validateVerifyPayment,
  validateCancelSubscription
} = require('../middleware/validation');
const { paymentRateLimiter } = require('../middleware/security');
const { 
  initializeTransaction, 
  verifyTransaction,
  cancelSubscription
} = require('../config/paystack');
const { 
  getPlanByName, 
  isValidPlan 
} = require('../config/subscriptionPlans');
const { updateUserSubscription } = require('../config/firebase');

router.post('/initialize-subscription', 
  paymentRateLimiter,
  validateInitializeSubscription,
  async (req, res) => {
    try {
      const { email, plan_name, user_id, customer_name } = req.body;
      
      const plan = getPlanByName(plan_name.toLowerCase());
      if (!plan) {
        return res.status(400).json({
          success: false,
          message: 'Invalid subscription plan'
        });
      }

      const metadata = {
        plan_code: plan.planCode,
        plan_name: plan.name,
        subscription_type: 'monthly',
        user_id: user_id,
        customer_name: customer_name || ''
      };

      const result = await initializeTransaction(
        email,
        plan.amount,
        plan.planCode,
        metadata
      );

      if (!result.status) {
        return res.status(400).json({
          success: false,
          message: 'Failed to initialize payment',
          error: result.message
        });
      }

      res.json({
        success: true,
        message: 'Payment initialized successfully',
        data: {
          authorization_url: result.data.authorization_url,
          access_code: result.data.access_code,
          reference: result.data.reference,
          plan: {
            name: plan.name,
            amount: plan.amount,
            features: plan.features
          }
        }
      });

    } catch (error) {
      console.error('Initialize subscription error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
);

router.post('/verify-payment',
  paymentRateLimiter,
  validateVerifyPayment,
  async (req, res) => {
    try {
      const { reference, user_id } = req.body;

      const result = await verifyTransaction(reference);

      if (!result.status) {
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed',
          error: result.message
        });
      }

      const { data } = result;
      
      if (data.status !== 'success') {
        return res.status(400).json({
          success: false,
          message: 'Payment was not successful',
          status: data.status
        });
      }

      const planCode = data.metadata?.plan_code;
      const planName = data.metadata?.plan_name;
      
      if (!planCode || !isValidPlan(planCode)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid plan in payment metadata'
        });
      }

      await updateUserSubscription(user_id, {
        subscription: planName,
        payment_reference: reference,
        additionalFields: {
          paystack_customer_code: data.customer?.customer_code,
          subscription_amount: data.amount,
          currency: data.currency
        }
      });

      res.json({
        success: true,
        message: 'Payment verified and subscription updated successfully',
        data: {
          reference: reference,
          amount: data.amount,
          currency: data.currency,
          subscription: planName,
          customer_code: data.customer?.customer_code
        }
      });

    } catch (error) {
      console.error('Verify payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
);

router.post('/cancel-subscription',
  paymentRateLimiter,
  validateCancelSubscription,
  async (req, res) => {
    try {
      const { user_id, subscription_code, token } = req.body;

      const result = await cancelSubscription(subscription_code, token);

      if (!result.status) {
        return res.status(400).json({
          success: false,
          message: 'Failed to cancel subscription',
          error: result.message
        });
      }

      await updateUserSubscription(user_id, {
        subscription: 'Free',
        payment_reference: subscription_code,
        additionalFields: {
          subscription_status: 'cancelled',
          cancellation_date: new Date().toISOString(),
          cancellation_method: 'manual'
        }
      });

      res.json({
        success: true,
        message: 'Subscription cancelled successfully',
        data: {
          subscription_code: subscription_code,
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Cancel subscription error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel subscription',
        error: error.message
      });
    }
  }
);

module.exports = router;