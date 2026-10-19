// Applies the visitor's saved light/dark choice before first paint (avoids a flash).
// Kept as an external file so the Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    var pref = localStorage.getItem('ijt-theme-pref');
    if (pref === 'dark') document.documentElement.classList.add('dark');
  } catch (e) { /* storage unavailable: fall back to the site default */ }
})();
