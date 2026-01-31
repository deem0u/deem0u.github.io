/**
 * Single source of truth for account details content.
 * Used by: Admin "Send via Email", Home "Email Myself a Copy", Edit recovery "Email Myself a Copy",
 * and the body section of success messages on Home and Edit pages.
 */
(function() {
  const PAGES_URL = 'https://deem0u.github.io/';
  const EDITOR_URL = 'https://deem0u.github.io/edit/';

  function getViewLink(folder) {
    return PAGES_URL + (folder || '') + '/';
  }

  function getEditLink(folder, editKey) {
    return EDITOR_URL + '?folder=' + encodeURIComponent(folder || '') + '&key=' + encodeURIComponent(editKey || '');
  }

  window.ACCOUNT_DETAILS = {
    getSubject: function(folder) {
      return 'Your Digital Contact Page - ' + (folder || '') + ' - Account Details';
    },
    getBodyPlainText: function(folder, editKey) {
      var viewLink = getViewLink(folder);
      var editLink = getEditLink(folder, editKey);
      return 'Below are details related to your account you should keep handy.\n\n' +
        '\t• User Name: ' + (folder || '') + '\n' +
        '\t• Edit Key: ' + (editKey || '') + '\n' +
        '\t• Your Digital Contact Page URL: ' + viewLink + '\n' +
        '\t• Your personalised edit link: ' + editLink + '\n\n' +
        'IMPORTANT: This personalised edit link and Edit Key is unique to you and gives you access to edit your Digital Contact Page. Please keep it private and do not share it with anyone else.\n\n' +
        'HOW TO UPDATE YOUR DIGITAL CONTACT PAGE\n' +
        '\t1. Visit the Contact Editor (' + EDITOR_URL + ') and Sign In with your User Name and Edit Key or Click your personalised edit link above\n' +
        '\t2. Make your changes in the Contact Editor\n' +
        '\t3. Click "Save Changes" - Your updates will appear on your contact page within a few minutes\n\n' +
        'If at any point you wish to have your account/Digital Contact Page deleted, contact me at deem0u.github.io@gmail.com';
    },
    getBodyHtml: function(folder, editKey) {
      var viewLink = getViewLink(folder);
      var editLink = getEditLink(folder, editKey);
      return '<p>Below are details related to your account you should keep handy.</p>' +
        '<ul><li><strong>User Name:</strong> ' + (folder || '') + '</li>' +
        '<li><strong>Edit Key:</strong> ' + (editKey || '') + '</li>' +
        '<li><strong>Your Digital Contact Page URL:</strong> <a href="' + viewLink + '" target="_blank" rel="noopener">' + viewLink + '</a></li>' +
        '<li><strong>Your personalised edit link:</strong> <a href="' + editLink + '" target="_blank" rel="noopener">' + editLink + '</a></li></ul>' +
        '<p class="success-important">IMPORTANT: This personalised edit link and Edit Key is unique to you and gives you access to edit your Digital Contact Page. Please keep it private and do not share it with anyone else.</p>' +
        '<p class="success-heading">HOW TO UPDATE YOUR DIGITAL CONTACT PAGE</p>' +
        '<ol><li>Visit the Contact Editor (<a href="' + EDITOR_URL + '" target="_blank" rel="noopener">' + EDITOR_URL + '</a>) and Sign In with your User Name and Edit Key or Click your personalised edit link above</li>' +
        '<li>Make your changes in the Contact Editor</li>' +
        '<li>Click "Save Changes" - Your updates will appear on your contact page within a few minutes</li></ol>' +
        '<p>If at any point you wish to have your account/Digital Contact Page deleted, contact me at <a href="mailto:deem0u.github.io@gmail.com">deem0u.github.io@gmail.com</a></p>';
    }
  };
})();
