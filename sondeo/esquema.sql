-- La D1 de sondeo101 (y la de staging). Se creó el 9-oct-2026 desde el chat
-- con el MCP de Cloudflare; aquí queda escrita para rehacerla igual.
CREATE TABLE IF NOT EXISTS respuestas (
  sondeo TEXT NOT NULL,
  item   TEXT NOT NULL,
  datos  TEXT NOT NULL,          -- JSON de lo marcado en ese renglón
  cuando TEXT NOT NULL,
  PRIMARY KEY (sondeo, item)
);
CREATE TABLE IF NOT EXISTS envios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sondeo     TEXT NOT NULL,
  cuando     TEXT NOT NULL,
  quien      TEXT,               -- la IP de quien picó «Enviar»
  comentario TEXT,
  foto       TEXT NOT NULL       -- JSON con todo lo marcado al enviar
);
