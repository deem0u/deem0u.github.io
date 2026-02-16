(function() {
  var hamburgerSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
  var closeSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
  function initNavDrawer() {
    var header = document.querySelector('.app-header');
    var toggle = document.getElementById('header-nav-toggle-btn');
    var backdrop = document.getElementById('header-drawer-backdrop');
    var actions = header ? header.querySelector('.app-header-actions') : null;
    if (!header || !toggle) return;
    function open() {
      header.classList.add('nav-drawer-open');
      document.body.classList.add('nav-drawer-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      toggle.innerHTML = closeSvg;
      if (backdrop) backdrop.setAttribute('aria-hidden', 'false');
    }
    function close() {
      header.classList.remove('nav-drawer-open');
      document.body.classList.remove('nav-drawer-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      toggle.innerHTML = hamburgerSvg;
      if (backdrop) backdrop.setAttribute('aria-hidden', 'true');
      var resourcesDropdown = header.querySelector('.nav-dropdown');
      if (resourcesDropdown) resourcesDropdown.classList.remove('open');
      var resourcesBtn = document.getElementById('nav-resources-btn');
      if (resourcesBtn) resourcesBtn.setAttribute('aria-expanded', 'false');
    }
    toggle.addEventListener('click', function() {
      if (header.classList.contains('nav-drawer-open')) close(); else open();
    });
    if (backdrop) backdrop.addEventListener('click', close);
    if (actions) {
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'header-drawer-close-btn';
      closeBtn.setAttribute('aria-label', 'Close menu');
      closeBtn.innerHTML = closeSvg;
      closeBtn.addEventListener('click', close);
      actions.insertBefore(closeBtn, actions.firstChild);
    }
    var resourcesBtn = document.getElementById('nav-resources-btn');
    if (resourcesBtn) {
      var resourcesDropdown = resourcesBtn.closest('.nav-dropdown');
      if (resourcesDropdown) {
        resourcesBtn.addEventListener('click', function(e) {
          if (!header.classList.contains('nav-drawer-open')) return;
          e.preventDefault();
          var isOpen = resourcesDropdown.classList.toggle('open');
          resourcesBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
      }
    }
    var drawerLinks = header.querySelectorAll('.app-header-actions a.tab, .app-header-actions .nav-dropdown-item');
    drawerLinks.forEach(function(link) {
      link.addEventListener('click', close);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavDrawer);
  } else {
    initNavDrawer();
  }
})();
