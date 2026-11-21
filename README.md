<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/23b20a22-ce17-47fc-a01f-af41812f6f5d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Payment Integration

The booking checkout supports Chapa hosted checkout and Payo bank-transfer checkout. See [PAYMENT_INTEGRATION.md](PAYMENT_INTEGRATION.md) for provider account setup, environment variables, webhook URLs, security behavior, and end-to-end test steps.
