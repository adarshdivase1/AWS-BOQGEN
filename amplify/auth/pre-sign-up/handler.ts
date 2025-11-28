import type { PreSignUpTriggerHandler } from 'aws-lambda';

export const handler: PreSignUpTriggerHandler = async (event) => {
  const email = event.request.userAttributes['email'];
  
  // List of allowed domains
  const allowedDomains = ['allwaveav.com', 'allwavegs.com'];
  const domain = email.split('@')[1];

  if (!allowedDomains.includes(domain)) {
    throw new Error(`Access denied. Please use an email address from: ${allowedDomains.join(', ')}`);
  }

  return event;
};