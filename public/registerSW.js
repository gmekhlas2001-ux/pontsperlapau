// Compatibility registration for HTML cached by releases that referenced
// /registerSW.js directly. Current releases register from the application.
(function registerLegacyClient() {
  if (!('serviceWorker' in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', function onControllerChange() {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  function register() {
    navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    }).then(function update(registration) {
      return registration.update();
    }).catch(function ignoreRegistrationFailure() {
      // A later open/online event will let the browser retry naturally.
    });
  }

  if (document.readyState === 'loading') {
    window.addEventListener('load', register, { once: true });
  } else {
    register();
  }
}());
