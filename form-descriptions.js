/**
 * Single source of truth for form labels and hints.
 * New Form (Add New User) is canonical; Edit form and user edit page use these.
 */
window.FORM_DESCRIPTIONS = {
  'folder': {
    label: 'User Name',
    hint: 'Will be used in the URL for your contact information page - Letters, numbers and hyphens only. Example: the User Name john-smith will have the URL deem0u.github.io/<strong>john-smith</strong>/'
  },
  'first-name': {
    label: 'Given Names',
    hint: 'Your first or given name(s) as on your ID. Include any other names (e.g. middle names) if applicable.'
  },
  'surname': {
    label: 'Family Name',
    hint: 'Your surname or last name as it appears on your ID.'
  },
  'email': {
    label: 'Email',
    hint: 'A valid email address where you can be contacted.'
  },
  'mobile': {
    label: 'Contact Number',
    hint: 'Include country code. e.g. Australian mobile +61 412 345 678, Victorian landline +61 3 9876 5432.'
  },
  'home-country': {
    label: 'Home Country',
    hint: 'Your country of residence. Shown on your contact page for identification.'
  },
  'dest-name': {
    label: 'Destination Name',
    hint: 'e.g. resort, hotel, building or Airbnb name where you are staying.'
  },
  'dest-address': { label: 'Destination Address' },
  'dest-phone': {
    label: 'Destination Contact Number',
    hint: 'Contact number for this location — e.g. front office, reception, or a person at this address.'
  },
  'dest-email': {
    label: 'Destination Email',
    hint: 'e.g. general, reception or front office address, or someone at this location.'
  },
  'additional-info': { label: 'Additional Information' },
  'destination-details': { label: 'Destination Details' }
};
