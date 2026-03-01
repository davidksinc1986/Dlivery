CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE services (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE offers (
  id SERIAL PRIMARY KEY,
  service_id INTEGER REFERENCES services(id),
  description TEXT,
  price NUMERIC,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE deliveries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  service_id INTEGER REFERENCES services(id),
  offer_id INTEGER REFERENCES offers(id),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);
