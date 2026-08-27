const { loadMenuFromFolder } = require('./load-menu');

// Bump when menu folder files change to refresh the database menu.
const MENU_VERSION = 94;

const DEFAULT_MENU = loadMenuFromFolder();

module.exports = { MENU_VERSION, DEFAULT_MENU };
