import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Project: a.model({
    name: a.string().required(),
    clientDetails: a.json(), // Stores the client info object
    rooms: a.json(),         // Stores the array of rooms
    branding: a.json(),      // Stores branding settings
    margin: a.float(),
    currency: a.string(),
    viewMode: a.string(),
  })
  .authorization(allow => [allow.owner()]), // Only the creator can CRUD their own projects
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});