const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'db', 'castle-cafe.db'));

console.log(
  'tables',
  db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((row) => row.name)
);

try {
  console.log('messageCount', db.prepare('SELECT COUNT(*) AS c FROM customer_messages').get());
  console.log(
    'messages',
    db
      .prepare(
        'SELECT id, phone, status, channel, substr(message, 1, 100) AS preview FROM customer_messages ORDER BY id DESC LIMIT 5'
      )
      .all()
  );
} catch (err) {
  console.log('customer_messages error:', err.message);
}

console.log(
  'recentOrders',
  db
    .prepare(
      'SELECT id, service_type, substr(order_details_json, 1, 160) AS details FROM orders ORDER BY id DESC LIMIT 5'
    )
    .all()
);
