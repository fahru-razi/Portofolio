(function () {
  "use strict";
  var KEY = "device_id";

  window.getDeviceId = function () {
    try {
      var id = localStorage.getItem(KEY);
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : _fallbackUUID());
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch (e) {
      // localStorage diblok/unavailable — tetap null, checkin tetap jalan
      return null;
    }
  };

  function _fallbackUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
})();