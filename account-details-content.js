/**
 * Single source of truth for account details content.
 * Used by: Admin "Send via Email", Home "Email Myself a Copy", Edit recovery "Email Myself a Copy",
 * and the body section of success messages on Home and Edit pages.
 */
(function() {
  const PAGES_URL = 'https://deem0u.github.io/user/';
  const EDITOR_URL = 'https://deem0u.github.io/myaccount/';

  function getViewLink(username) {
    return PAGES_URL + (username || '') + '/';
  }

  window.ACCOUNT_DETAILS = {
    getSubject: function(username) {
      return 'Your Digital Contact Page - ' + (username || '') + ' - Account Details';
    },
    getBodyPlainText: function(username) {
      var viewLink = getViewLink(username);
      return 'Below are details related to your account you should keep handy.\n\n' +
        '\t• User Name: ' + (username || '') + '\n' +
        '\t• Your Digital Contact Page URL: ' + viewLink + '\n\n' +
        'HOW TO UPDATE YOUR DIGITAL CONTACT PAGE\n' +
        '\t1. Visit the My Account (' + EDITOR_URL + ') and sign in with your Account Email and Password\n' +
        '\t2. Make your changes in the My Account\n' +
        '\t3. Click "Save Changes" - Your updates will appear on your contact page within a few minutes\n\n' +
        'If at any point you wish to have your account/Digital Contact Page deleted, contact me at deem0u.github.io@gmail.com';
    },
    getBodyHtml: function(username) {
      var viewLink = getViewLink(username);
      return '<p>Below are details related to your account you should keep handy.</p>' +
        '<ul><li><strong>User Name:</strong> ' + (username || '') + '</li>' +
        '<li><strong>Your Digital Contact Page URL:</strong> <a href="' + viewLink + '" target="_blank" rel="noopener">' + viewLink + '</a></li></ul>' +
        '<p class="success-heading">HOW TO UPDATE YOUR DIGITAL CONTACT PAGE</p>' +
        '<ol><li>Visit the My Account (<a href="' + EDITOR_URL + '" target="_blank" rel="noopener">' + EDITOR_URL + '</a>) and sign in with your Account Email and Password</li>' +
        '<li>Make your changes in the My Account</li>' +
        '<li>Click "Save Changes" - Your updates will appear on your contact page within a few minutes</li></ol>' +
        '<p>If at any point you wish to have your account/Digital Contact Page deleted, contact me at <a href="mailto:deem0u.github.io@gmail.com">deem0u.github.io@gmail.com</a></p>';
    }
  };
})();
