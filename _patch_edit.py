with open('myaccount/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

old = '''        <div id="recovery-step2" class="hidden">
          <form id="recovery-form-step2" onsubmit="return false;">'''

new = '''        <div id="recovery-step2" class="hidden">
          <div id="recovery-link-option" class="hidden">
            <p class="text-secondary mb-3">We can send a recovery link to your verified email. Click below to receive it.</p>
            <div id="recovery-link-alert" class="alert"></div>
            <button type="button" class="btn btn-primary btn-block btn-lg" id="recovery-send-link-btn" onclick="recoverySendLink()">Send recovery link to my email</button>
          </div>
          <form id="recovery-form-step2" onsubmit="return false;">'''

if old in content:
    content = content.replace(old, new)
    with open('myaccount/index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replaced successfully')
else:
    idx = content.find('recovery-step2')
    print('Old string not found. Context:', repr(content[max(0,idx-5):idx+150]))
