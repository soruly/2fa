import "dotenv/config.js";
import fs from "fs-extra";
import path from "path";
import express from "express";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { Fido2Lib } from "fido2-lib";

import csp from "./route/csp.js";
import logTraffic from "./route/log-traffic.js";
import getIpInfo from "./lib/get-ip-info.js";
import getRegister from "./route/get-register.js";
import postRegister from "./route/post-register.js";
import getLogin from "./route/get-login.js";
import postLogin from "./route/post-login.js";
import deleteRoot from "./route/delete-root.js";
import postRoot from "./route/post-root.js";
import getRoot from "./route/get-root.js";
import getReg from "./route/get-reg.js";

const {
  SERVER_ADDR = "0.0.0.0",
  SERVER_PORT = 3000,
  SERVER_NAME,
  BLACKLIST_UA,
  WHITELIST_COUNTRY,
  ENABLE_FIDO2,
} = process.env;

if (!fs.existsSync("data/latest.json")) fs.outputFileSync("data/latest.json", JSON.stringify([]));
fs.ensureDirSync("registered");
fs.ensureDirSync("session");

const app = express();

app.disable("x-powered-by");

app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.resolve("./view"));

app.locals.f2l =
  ENABLE_FIDO2 &&
  new Fido2Lib({
    timeout: 60000,
    rpId: SERVER_NAME,
    rpName: SERVER_NAME,
    rpIcon: `https://${SERVER_NAME}/favicon.png`,
    challengeSize: 128,
    attestation: "direct",
    cryptoParams: [-7, -35, -36, -257, -258, -259, -37, -38, -39, -8],
    // authenticatorAttachment: "cross-platform",
    authenticatorRequireResidentKey: false,
    authenticatorUserVerification: "discouraged",
  });

app.use((req, res, next) => {
  const { ASN, country } = getIpInfo(req.ip);
  res.locals.ASN = ASN;
  res.locals.country = country;
  next();
});

app.use(logTraffic);

app.use((req, res, next) => {
  if (BLACKLIST_UA && req.headers["user-agent"]?.match(new RegExp(`(${BLACKLIST_UA})`, "i")))
    return;
  if (WHITELIST_COUNTRY && !WHITELIST_COUNTRY.split("|").includes(res.locals.country.isoCode))
    return;
  next();
});

app.use(express.json());
app.use(cookieParser());

// 600 requests per minute per IP address (per node.js process)
app.use(rateLimit({ max: 600, windowMs: 60 * 1000 }));

app.get(/[^\/]+\.[^\/]+$/, express.static("./static", { maxAge: 1000 * 60 * 60 * 24 }));

app.get("/login", rateLimit({ max: 5, windowMs: 60 * 1000 }), getLogin);
app.post("/login", rateLimit({ max: 5, windowMs: 60 * 1000 }), postLogin);

app.get("/register", rateLimit({ max: 5, windowMs: 60 * 1000 }), getRegister);
app.post("/register", rateLimit({ max: 5, windowMs: 60 * 1000 }), postRegister);

app.get("/reg", csp, getReg);

app.delete("/", deleteRoot);
app.post("/", postRoot);
app.get("/", csp, getRoot);

app.listen(SERVER_PORT, SERVER_ADDR, () =>
  console.log(`Media server listening on ${SERVER_ADDR}:${SERVER_PORT}`)
);
