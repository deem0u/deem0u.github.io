// Edit page secrets modal - loaded by edit/index.html
async function checkSecretsStatus() {
  if (!folder || !token) return;
  try {
    const r = await fetch(API + '/api/secrets/' + encodeURIComponent(folder), { headers: { 'Authorization': 'Bearer ' + token } });
    if (!r.ok) return;
    const d = await r.json();
    const hasAccountEmail = !!(d.accountEmail && d.accountEmail.includes('@'));
    const hasDob = !!(d.dob && d.dob.trim());
    const sq = Array.isArray(d.secretQuestions) ? d.secretQuestions : [];
    const hasSecretQuestions = sq.length === 3 && sq.every(function(q) { return q && q.questionId && (q.answer || '').trim().length >= 4; });
    const missing = [];
    if (!hasAccountEmail) missing.push('Email (For your account)');
    if (!hasDob) missing.push('DOB');
    if (!hasSecretQuestions) missing.push('3 Secret Questions');
    const banner = document.getElementById('secrets-banner');
    const list = document.getElementById('secrets-missing-list');
    if (!banner || !list) return;
    if (missing.length === 0) {
      banner.classList.add('hidden');
      banner.classList.remove('show');
      return;
    }
    list.innerHTML = missing.map(function(m) { return '<li>' + m + '</li>'; }).join('');
    banner.classList.remove('hidden');
    banner.classList.add('show');
  } catch (e) {}
}

function showEditSecretsModal() {
  var m = document.getElementById('edit-secrets-modal');
  if (!m) return;
  m.classList.remove('hidden');
  m.classList.add('show');
  document.getElementById('edit-secrets-error').classList.add('hidden');
  document.getElementById('edit-secrets-error').textContent = '';
  fetch(API + '/api/secrets/' + encodeURIComponent(folder), { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      document.getElementById('edit-secrets-account-email').value = d.accountEmail || '';
      document.getElementById('edit-secrets-dob').value = d.dob || '';
      var sq = Array.isArray(d.secretQuestions) ? d.secretQuestions : [];
      ['edit-sq1','edit-sq2','edit-sq3'].forEach(function(id, i) {
        var q = sq[i] || {};
        var sel = document.getElementById(id);
        var ans = document.getElementById(id + '-answer');
        var wrap = ans && ans.closest ? ans.closest('.secret-q-answer-wrap') : null;
        if (sel) sel.value = q.questionId || '';
        if (ans) ans.value = q.answer || '';
        if (wrap) { if (q.questionId) wrap.classList.remove('hidden'); else wrap.classList.add('hidden'); }
      });
      if (typeof syncEditSecretsSqOptions === 'function') syncEditSecretsSqOptions();
    })
    .catch(function() {});
}

function closeEditSecretsModal() {
  var m = document.getElementById('edit-secrets-modal');
  if (m) { m.classList.remove('show'); m.classList.add('hidden'); }
}

var EDIT_SQ_OPTIONS = [{v:'',t:'Select question'},{v:'1',t:'What is your mothers maiden name?'},{v:'2',t:'What is the name of the educational institution which you have obtained your highest level of qualification?'},{v:'3',t:'What is the name of your first pet?'},{v:'4',t:'What is the make and model of your first car?'},{v:'5',t:'What is a date that is most memorable to you?'},{v:'6',t:'What suburb were you born in?'},{v:'7',t:'What was the name of the business or company you first worked for?'},{v:'8',t:'Where was your first major travel destination?'},{v:'9',t:'What is your favourite sports team?'},{v:'10',t:'What is a word that Chris cannot correctly pronounce?'}];

function syncEditSecretsSqOptions() {
  var v1 = document.getElementById('edit-sq1').value, v2 = document.getElementById('edit-sq2').value, v3 = document.getElementById('edit-sq3').value;
  ['edit-sq1','edit-sq2','edit-sq3'].forEach(function(id) {
    var sel = document.getElementById(id);
    var ans = document.getElementById(id + '-answer');
    var wrap = ans && ans.closest ? ans.closest('.secret-q-answer-wrap') : null;
    var exclude = (id === 'edit-sq1' ? [v2,v3] : id === 'edit-sq2' ? [v1,v3] : [v1,v2]).filter(Boolean);
    var cur = sel.value;
    if (cur && exclude.indexOf(cur) >= 0) { cur = ''; if (ans) ans.value = ''; }
    if (wrap) {
      if (cur) { wrap.classList.remove('hidden'); } else { wrap.classList.add('hidden'); if (ans) ans.value = ''; var e = document.getElementById('error-' + id + '-answer'); if (e) e.textContent = ''; }
    }
    sel.innerHTML = EDIT_SQ_OPTIONS.map(function(o) {
      var dis = o.v && exclude.indexOf(o.v) >= 0 ? ' disabled' : '';
      var sel_ = o.v === cur ? ' selected' : '';
      return '<option value="'+o.v+'"'+dis+sel_+'>'+o.t+'</option>';
    }).join('');
  });
}

(function attachEditSqListeners() {
  ['edit-sq1','edit-sq2','edit-sq3'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', syncEditSecretsSqOptions);
  });
})();

async function saveEditSecrets() {
  var accountEmail = document.getElementById('edit-secrets-account-email').value.trim();
  var dob = document.getElementById('edit-secrets-dob').value.trim();
  var sq = [
    { questionId: parseInt(document.getElementById('edit-sq1').value, 10), answer: document.getElementById('edit-sq1-answer').value.trim() },
    { questionId: parseInt(document.getElementById('edit-sq2').value, 10), answer: document.getElementById('edit-sq2-answer').value.trim() },
    { questionId: parseInt(document.getElementById('edit-sq3').value, 10), answer: document.getElementById('edit-sq3-answer').value.trim() }
  ];
  var hasAllSq = sq[0].questionId && sq[1].questionId && sq[2].questionId && sq[0].answer.length >= 4 && sq[1].answer.length >= 4 && sq[2].answer.length >= 4;
  if (!accountEmail && !dob && !hasAllSq) {
    document.getElementById('edit-secrets-error').textContent = 'Please fill in at least Account Email, DOB, or 3 Secret Questions.';
    document.getElementById('edit-secrets-error').classList.remove('hidden');
    return;
  }
  if (accountEmail && !/^[^@]+@[^@]+\./.test(accountEmail)) {
    document.getElementById('edit-secrets-error').textContent = 'Please enter a valid email.';
    document.getElementById('edit-secrets-error').classList.remove('hidden');
    return;
  }
  if (dob && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dob.replace(/\s/g, ''))) {
    document.getElementById('edit-secrets-error').textContent = 'Date of birth must be dd/mm/yyyy.';
    document.getElementById('edit-secrets-error').classList.remove('hidden');
    return;
  }
  if (hasAllSq && (new Set(sq.map(function(q) { return q.questionId; })).size !== 3)) {
    document.getElementById('edit-secrets-error').textContent = 'Select 3 different questions with answers (4-30 chars each).';
    document.getElementById('edit-secrets-error').classList.remove('hidden');
    return;
  }
  document.getElementById('edit-secrets-save-btn').disabled = true;
  document.getElementById('edit-secrets-error').classList.add('hidden');
  try {
    var r = await fetch(API + '/api/secrets/' + encodeURIComponent(folder), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ accountEmail: accountEmail || '', dob: dob || '', secretQuestions: hasAllSq ? sq : [] })
    });
    var d = await r.json();
    if (r.ok) {
      closeEditSecretsModal();
      checkSecretsStatus();
      var alertEl = document.getElementById('editor-alert');
      if (alertEl) { alertEl.className = 'alert alert-success show'; alertEl.innerHTML = '<div class="alert-content">Secrets updated successfully.</div>'; }
    } else {
      document.getElementById('edit-secrets-error').textContent = d.error || 'Failed to save';
      document.getElementById('edit-secrets-error').classList.remove('hidden');
    }
  } catch (e) {
    document.getElementById('edit-secrets-error').textContent = 'Connection error. Please try again.';
    document.getElementById('edit-secrets-error').classList.remove('hidden');
  }
  document.getElementById('edit-secrets-save-btn').disabled = false;
}
