const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const updateUserSubscription = async (userId, subscriptionData) => {
  try {
    const userRef = db.collection("users").doc(userId);

    const updateData = {
      subscription: subscriptionData.subscription,
      subscription_date: admin.firestore.Timestamp.now(),
      payment_reference: subscriptionData.payment_reference,
      ...subscriptionData.additionalFields,
    };

    await userRef.update(updateData);
    console.log(`User ${userId} subscription updated successfully`);
    return true;
  } catch (error) {
    console.error(`Failed to update user ${userId} subscription:`, error);
    throw error;
  }
};

const getUserSubscription = async (userId) => {
  try {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    return userDoc.data();
  } catch (error) {
    console.error(`Failed to get user ${userId} subscription:`, error);
    throw error;
  }
};

module.exports = {
  updateUserSubscription,
  getUserSubscription,
};
