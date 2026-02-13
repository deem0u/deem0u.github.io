(function() {
  function initNavDrawer() {
    var header = document.querySelector('.app-header');
    var toggle = document.getElementById('header-nav-toggle-btn');
    var backdrop = document.getElementById('header-drawer-backdrop');
    if (!header || !toggle) return;
    function open() {
      header.classList.add('nav-drawer-open');
      document.body.classList.add('nav-drawer-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      if (backdrop) backdrop.setAttribute('aria-hidden', 'false');
    }
    function close() {
      header.classList.remove('nav-drawer-open');
      document.body.classList.remove('nav-drawer-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      if (backdrop) backdrop.setAttribute('aria-hidden', 'true');
    }
    toggle.addEventListener('click', function() {
      if (header.classList.contains('nav-drawer-open')) close(); else open();
    });
    if (backdrop) backdrop.addEventListener('click', close);
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
