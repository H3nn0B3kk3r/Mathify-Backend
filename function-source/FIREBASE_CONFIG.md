# Firebase Configuration Setup

## Setting Paystack Environment Variables

To configure your Paystack API keys securely, use Firebase's environment configuration:

### 1. Set the configuration values

```bash
# Set your Paystack secret key
firebase functions:config:set paystack.secret_key="YOUR_ACTUAL_SECRET_KEY"

# Set your Paystack webhook secret
firebase functions:config:set paystack.webhook_secret="YOUR_ACTUAL_WEBHOOK_SECRET"
```

### 2. Verify the configuration

```bash
firebase functions:config:get
```

### 3. Deploy your functions

```bash
firebase deploy --only functions
```

## Local Development

For local development, create a `.runtimeconfig.json` file in your functions directory:

```json
{
  "paystack": {
    "secret_key": "YOUR_TEST_SECRET_KEY",
    "webhook_secret": "YOUR_TEST_WEBHOOK_SECRET"
  }
}
```

**Note:** Never commit `.runtimeconfig.json` to version control - it should be in your `.gitignore`.

## Environment Variables Used

- `paystack.secret_key`: Your Paystack secret API key
- `paystack.webhook_secret`: Your Paystack webhook secret for signature verification

These are accessed in the code via:
- `functions.config().paystack.secret_key`
- `functions.config().paystack.webhook_secret`