(function (root) {
  'use strict';

  class JsonStorage {
    #getStorage;

    constructor(getStorage) {
      this.#getStorage = getStorage;
    }

    read(key, fallback = null) {
      try {
        const raw = this.#getStorage().getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    }

    write(key, value) {
      try {
        const json = JSON.stringify(value);
        if (json === undefined) return false;
        this.#getStorage().setItem(key, json);
        return true;
      } catch {
        return false;
      }
    }

    remove(key) {
      try {
        this.#getStorage().removeItem(key);
        return true;
      } catch {
        return false;
      }
    }
  }

  JsonStorage.local = new JsonStorage(() => root.localStorage);

  if (typeof module === 'object' && module.exports) module.exports = JsonStorage;
  else root.JsonStorage = JsonStorage;
})(globalThis);
