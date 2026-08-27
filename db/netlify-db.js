/**
 * Unified DB for Netlify Functions.
 * - Uses MySQL when MYSQL_* / DATABASE_URL is set
 * - Otherwise uses SQLite in /tmp so login works without extra Netlify env setup
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

function hasMysqlEnv() {
  return Boolean(
    process.env.DATABASE_URL ||
      process.env.MYSQL_URL ||
      (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE)
  );
}

function wrapSync(fn) {
  return async (...args) => fn(...args);
}

function createSqliteAdapter() {
  const tmpDb = path.join(os.tmpdir(), 'delight-cafe-netlify.db');
  const bundledCandidates = [
    path.join(__dirname, 'castle-cafe.db'),
    path.join(process.cwd(), 'db', 'castle-cafe.db')
  ];

  if (!fs.existsSync(tmpDb)) {
    for (const bundled of bundledCandidates) {
      if (fs.existsSync(bundled)) {
        try {
          fs.copyFileSync(bundled, tmpDb);
          break;
        } catch (_) {
          /* continue */
        }
      }
    }
  }

  process.env.DATABASE_PATH = process.env.DATABASE_PATH || tmpDb;

  // Load after DATABASE_PATH is set
  const syncDb = require('./database');
  const { getMenuCategories } = require('./load-menu');

  return {
    engine: 'sqlite',
    hasMysqlEnv: () => false,
    describeMysqlEnv: () => ({
      mode: 'sqlite-fallback',
      databasePath: process.env.DATABASE_PATH
    }),
    formatMysqlError: (err) => err?.message || 'Database error',
    initMysql: async () => {
      try {
        syncDb.cleanupExpiredSessions();
      } catch (_) {
        /* ignore */
      }
      return { engine: 'sqlite' };
    },
    normalizeAuthEmail: syncDb.normalizeAuthEmail,
    normalizeAuthPhone: syncDb.normalizeAuthPhone,
    normalizeAuthIdentifier: syncDb.normalizeAuthIdentifier,
    findUserByCredentials: wrapSync(syncDb.findUserByCredentials),
    findUserByUsername: wrapSync(syncDb.findUserByUsername),
    findUserByEmail: wrapSync(syncDb.findUserByEmail),
    findUserByPhone: wrapSync(syncDb.findUserByPhone),
    createUser: wrapSync(syncDb.createUser),
    recordUserLogin: wrapSync(syncDb.recordUserLogin),
    getMenuItems: wrapSync(syncDb.getMenuItems),
    getMenuItemByName: wrapSync(syncDb.getMenuItemByName),
    getMenuCategories: (items) => getMenuCategories(items),
    getUserCart: wrapSync(syncDb.getUserCart),
    saveUserCart: wrapSync(syncDb.saveUserCart),
    clearUserCart: wrapSync(syncDb.clearUserCart),
    getSession: wrapSync(syncDb.getSession),
    setSession: wrapSync(syncDb.setSession),
    destroySession: wrapSync(syncDb.destroySession),
    touchSession: wrapSync(syncDb.touchSession),
    cleanupExpiredSessions: wrapSync(syncDb.cleanupExpiredSessions),
    createContactMessage: wrapSync(syncDb.createContactMessage),
    createOrder: wrapSync(syncDb.createOrder),
    getOrderById: wrapSync(syncDb.getOrderById),
    getOrdersByUserId: wrapSync(syncDb.getOrdersByUserId),
    ensureInvoiceToken: wrapSync(syncDb.ensureInvoiceToken),
    getAllUsers: wrapSync(syncDb.getAllUsers),
    getAllOrders: wrapSync(syncDb.getAllOrders),
    getActiveOrders: wrapSync(syncDb.getActiveOrders),
    getOrdersArchiveByDate: wrapSync(syncDb.getOrdersArchiveByDate),
    updateOrderStatus: wrapSync(syncDb.updateOrderStatus),
    getAdminStats: wrapSync(syncDb.getAdminStats),
    getAllContactMessages: wrapSync(syncDb.getAllContactMessages),
    getCustomerDetailsForAdmin: wrapSync(syncDb.getCustomerDetailsForAdmin),
    getCustomerMessagesByCategory: wrapSync(syncDb.getCustomerMessagesByCategory),
    markCustomerMessageSent: wrapSync(syncDb.markCustomerMessageSent),
    markCustomerMessageFailed: wrapSync(syncDb.markCustomerMessageFailed),
    createCustomerMessage: wrapSync(syncDb.createCustomerMessage),
    getSmsSettings: wrapSync(syncDb.getSmsSettings),
    saveSmsSettings: wrapSync(syncDb.saveSmsSettings)
  };
}

function createMysqlAdapter() {
  const mysql = require('./mysql');
  return {
    engine: 'mysql',
    hasMysqlEnv: mysql.hasMysqlEnv,
    describeMysqlEnv: mysql.describeMysqlEnv,
    formatMysqlError: mysql.formatMysqlError,
    initMysql: mysql.initMysql,
    normalizeAuthEmail: mysql.normalizeAuthEmail,
    normalizeAuthPhone: mysql.normalizeAuthPhone,
    normalizeAuthIdentifier: mysql.normalizeAuthIdentifier,
    findUserByCredentials: mysql.findUserByCredentials,
    findUserByUsername: mysql.findUserByUsername,
    findUserByEmail: mysql.findUserByEmail,
    findUserByPhone: mysql.findUserByPhone,
    createUser: mysql.createUser,
    recordUserLogin: mysql.recordUserLogin,
    getMenuItems: mysql.getMenuItems,
    getMenuItemByName: mysql.getMenuItemByName,
    getMenuCategories: mysql.getMenuCategories,
    getUserCart: mysql.getUserCart,
    saveUserCart: mysql.saveUserCart,
    clearUserCart: mysql.clearUserCart,
    getSession: mysql.getSession,
    setSession: mysql.setSession,
    destroySession: mysql.destroySession,
    touchSession: mysql.touchSession,
    cleanupExpiredSessions: mysql.cleanupExpiredSessions,
    createContactMessage: mysql.createContactMessage,
    createOrder: mysql.createOrder,
    getOrderById: mysql.getOrderById,
    getOrdersByUserId: mysql.getOrdersByUserId,
    ensureInvoiceToken: mysql.ensureInvoiceToken,
    getAllUsers: mysql.getAllUsers,
    getAllOrders: mysql.getAllOrders,
    getActiveOrders: mysql.getActiveOrders,
    getOrdersArchiveByDate: mysql.getOrdersArchiveByDate,
    updateOrderStatus: mysql.updateOrderStatus,
    getAdminStats: mysql.getAdminStats,
    getAllContactMessages: mysql.getAllContactMessages,
    getCustomerDetailsForAdmin: mysql.getCustomerDetailsForAdmin,
    getCustomerMessagesByCategory: mysql.getCustomerMessagesByCategory,
    markCustomerMessageSent: mysql.markCustomerMessageSent,
    markCustomerMessageFailed: mysql.markCustomerMessageFailed,
    createCustomerMessage: mysql.createCustomerMessage,
    getSmsSettings: mysql.getSmsSettings,
    saveSmsSettings: mysql.saveSmsSettings
  };
}

let adapter = null;

function getAdapter() {
  if (adapter) return adapter;
  adapter = hasMysqlEnv() ? createMysqlAdapter() : createSqliteAdapter();
  return adapter;
}

module.exports = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'hasMysqlEnv') return hasMysqlEnv;
      const db = getAdapter();
      const value = db[prop];
      return typeof value === 'function' ? value.bind(db) : value;
    }
  }
);
