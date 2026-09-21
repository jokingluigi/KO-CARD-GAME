import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const configuredCorsOrigins = new Set(
  (process.env["CORS_ORIGINS"] ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
configuredCorsOrigins.add("https://ko-card-game-vr69.onrender.com");

function isAllowedCorsOrigin(origin: string): boolean {
  if (configuredCorsOrigins.has(origin)) return true;
  if (process.env["NODE_ENV"] === "production") return false;
  return (
    /^https?:\/\/localhost(?::\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin) ||
    /^https:\/\/[^/]+\.replit\.dev$/.test(origin)
  );
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || isAllowedCorsOrigin(origin)) {
        callback(null, origin ?? true);
        return;
      }
      callback(null, false);
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get(
  ["/__test/login/user", "/__test/login/admin"],
  (_request, response) => {
    response.status(404).json({ message: "Not found" });
  },
);

app.use("/api", router);

export default app;
