/**
 * Single source of truth for form labels and hints.
 * New Form (Add New User) is canonical; Edit form and user edit page use these.
 * Keep this file UTF-8; do not re-save as other encodings.
 *
 * CONTACT PAGE context (keys first-name, surname, email):
 *   first-name -> givenName (Given Names, shown on contact page)
 *   surname -> familyName (Family Name, shown on contact page)
 *   email -> contactEmail (Contact Page Email, shown on contact page)
 * ACCOUNT context uses: accountEmail, firstName, lastName (not in this file).
 */
window.FORM_DESCRIPTIONS = {
  'folder': {
    label: 'User Name',
    hint: 'This will be used in the URL for your contact information page. Eg. The User Name john-smith will have the URL deem0u.github.io/<strong>john-smith</strong>/'
  },
  'first-name': {
    label: 'Given Names',
    hint: 'Your first name including any middle names (if applicable) as it appears on your ID. Shown on your contact page.'
  },
  'surname': {
    label: 'Family Name',
    hint: 'Your surname as it appears on your ID. Shown on your contact page.'
  },
  'email': {
    label: 'Email',
    hint: 'Email shown on your contact page. Distinct from Account Email used for sign-in and recovery.'
  },
  'mobile': {
    label: 'Contact Number',
    hint: 'A phone number that you can be contacted on including the country code. Eg. +61432123456'
  },
  'home-country': {
    label: 'Home Country',
    hint: 'Your main country of residence.'
  },
  'dest-name': { label: 'Destination Name' },
  'dest-address': { label: 'Destination Address' },
  'dest-phone': { label: 'Destination Contact Number' },
  'dest-email': { label: 'Destination Email' },
  'additional-info': {
    label: 'Additional Information',
    hint: 'Any additional notes that can help with identifying & contacting you in case of lost property and emergency.'
  },
  'destination-details': {
    label: 'Destination Details',
    hint: 'The name, street address, contact number and email of the place where you will mostly be staying (e.g. You may choose to put down the name and address of the hotel you\'re staying at and include their front-office phone number and email).'
  }
};
