import { defineAuth } from '@aws-amplify/backend';
import { preSignUp } from './pre-sign-up/resource';

export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: "CODE",
      verificationEmailSubject: "Welcome to GenBOQ! Verify your email",
      verificationEmailBody: (createCode) => `Use this code to verify your account: ${createCode()}`,
    },
  },
  triggers: {
    preSignUp, // Connect the lambda trigger to restrict domains
  },
  userAttributes: {
    "custom:company_id": {
      dataType: "String",
      mutable: true,
    }
  }
});