const express = require('express');
const router = express.Router();
const { validateWebhook } = require('../middleware/validation');
const { webhookRateLimiter, verifyWebhookSignature } = require('../middleware/security');
const { updateUserSubscription } = require('../config/firebase');
const { getPlanByCode } = require('../config/subscriptionPlans');

const handleSubscriptionCreate = async (data) => {
  try {
    const { customer, plan, subscription_code } = data;
    const planDetails = getPlanByCode(plan.plan_code);
    
    if (!planDetails) {
      throw new Error(`Unknown plan code: ${plan.plan_code}`);
    }

    const userId = customer.metadata?.user_id;
    if (!userId) {
      throw new Error('User ID not found in customer metadata');
    }

    await updateUserSubscription(userId, {
      subscription: planDetails.name,
      payment_reference: subscription_code,
      additionalFields: {
        subscription_code: subscription_code,
        customer_code: customer.customer_code,
        plan_code: plan.plan_code,
        subscription_status: 'active'
      }
    });

    console.log(`Subscription created for user ${userId}: ${planDetails.name}`);
  } catch (error) {
    console.error('Handle subscription create error:', error);
    throw error;
  }
};

const handleSubscriptionDisable = async (data) => {
  try {
    const { customer, subscription_code } = data;
    const userId = customer.metadata?.user_id;
    
    if (!userId) {
      throw new Error('User ID not found in customer metadata');
    }

    await updateUserSubscription(userId, {
      subscription: 'Free',
      payment_reference: subscription_code,
      additionalFields: {
        subscription_status: 'cancelled',
        cancellation_date: new Date().toISOString()
      }
    });

    console.log(`Subscription disabled for user ${userId}`);
  } catch (error) {
    console.error('Handle subscription disable error:', error);
    throw error;
  }
};

const handleInvoicePaymentFailed = async (data) => {
  try {
    const { customer, subscription } = data;
    const userId = customer.metadata?.user_id;
    
    if (!userId) {
      throw new Error('User ID not found in customer metadata');
    }

    await updateUserSubscription(userId, {
      subscription: 'Free',
      payment_reference: subscription.subscription_code,
      additionalFields: {
        subscription_status: 'suspended',
        suspension_reason: 'payment_failed',
        suspension_date: new Date().toISOString()
      }
    });

    console.log(`Payment failed for user ${userId}, subscription suspended`);
  } catch (error) {
    console.error('Handle invoice payment failed error:', error);
    throw error;
  }
};

router.post('/',
  webhookRateLimiter,
  express.raw({ type: 'application/json' }),
  verifyWebhookSignature,
  validateWebhook,
  async (req, res) => {
    try {
      const { event, data } = req.body;
      
      console.log(`Webhook received: ${event}`);

      switch (event) {
        case 'subscription.create':
          await handleSubscriptionCreate(data);
          break;
          
        case 'subscription.disable':
          await handleSubscriptionDisable(data);
          break;
          
        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(data);
          break;
          
        default:
          console.log(`Unhandled webhook event: ${event}`);
      }

      res.json({
        success: true,
        message: 'Webhook processed successfully'
      });

    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({
        success: false,
        message: 'Webhook processing failed',
        error: error.message
      });
    }
  }
);

module.exports = router;